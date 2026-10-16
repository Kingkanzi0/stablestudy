const express = require('express');
const { z } = require('zod');
const { verifyMessage } = require('viem');
const { parseSiweMessage, validateSiweMessage, generateSiweNonce } = require('viem/siwe');
const { prisma } = require('../db');
const { network, allowedOrigins } = require('../config');
const crypto = require('crypto');
const { signSession, readSession, userForSession } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../utils');
const { env } = require('../config');
const { emailProvider, sendCodeEmail } = require('../services/email');

const router = express.Router();
const NONCE_TTL_MS = 10 * 60 * 1000;

const allowedDomains = new Set(
  allowedOrigins
    .map((origin) => {
      try {
        return new URL(origin).host;
      } catch {
        return null;
      }
    })
    .filter(Boolean),
);

// Issue a one-time nonce for Sign-In with Ethereum (EIP-4361).
router.get(
  '/nonce',
  asyncHandler(async (_req, res) => {
    const nonce = generateSiweNonce();
    await prisma.authNonce.create({
      data: { nonce, expiresAt: new Date(Date.now() + NONCE_TTL_MS) },
    });
    // Opportunistic cleanup of expired nonces
    prisma.authNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
    res.json({ nonce });
  }),
);

const verifyBody = z.object({
  message: z.string().min(1).max(2000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

// Verify a signed SIWE message and return a session token.
router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const { message, signature } = verifyBody.parse(req.body);
    const fields = parseSiweMessage(message);

    if (!fields.address || !fields.nonce || !fields.domain) {
      throw new HttpError(400, 'Malformed sign-in message');
    }
    if (!allowedDomains.has(fields.domain)) {
      throw new HttpError(400, `Sign-in domain ${fields.domain} is not allowed`);
    }
    if (fields.chainId !== network.id) {
      throw new HttpError(400, `Please sign in on ${network.name}`);
    }

    const stored = await prisma.authNonce.findUnique({ where: { nonce: fields.nonce } });
    if (!stored || stored.used || stored.expiresAt < new Date()) {
      throw new HttpError(401, 'Sign-in request expired, please try again');
    }

    const valid = validateSiweMessage({ message: fields, nonce: fields.nonce, time: new Date() });
    if (!valid) throw new HttpError(401, 'Sign-in message is not valid');

    const signatureOk = await verifyMessage({ address: fields.address, message, signature });
    if (!signatureOk) throw new HttpError(401, 'Signature does not match wallet');

    // Mark the nonce used (single-use) atomically.
    const { count } = await prisma.authNonce.updateMany({
      where: { nonce: fields.nonce, used: false },
      data: { used: true },
    });
    if (count !== 1) throw new HttpError(401, 'Sign-in request already used');

    const wallet = fields.address.toLowerCase();
    const user = await linkOrFind({ current: await userForSession(readSession(req)), field: 'wallet', value: wallet });
    res.json(sessionResponse(user));
  }),
);

// ───────────────────────────── Accounts ─────────────────────────────

function sessionResponse(user) {
  return {
    token: signSession({ userId: user.id, wallet: user.wallet, email: user.email }),
    user: { id: user.id, email: user.email, wallet: user.wallet },
    // Kept for older clients
    address: user.wallet,
  };
}

/** Moves everything owned by `drop` onto `keep`, fills keep's empty profile fields, then deletes `drop`. */
async function mergeAccounts(tx, keep, drop) {
  await tx.campaign.updateMany({ where: { ownerId: drop.id }, data: { ownerId: keep.id } });
  await tx.image.updateMany({ where: { ownerId: drop.id }, data: { ownerId: keep.id } });
  await tx.user.delete({ where: { id: drop.id } });
  return tx.user.update({
    where: { id: keep.id },
    data: {
      email: keep.email || drop.email,
      wallet: keep.wallet || drop.wallet,
      displayName: keep.displayName || drop.displayName,
      bio: keep.bio || drop.bio,
      avatarId: keep.avatarId || drop.avatarId,
      socials: keep.socials ?? drop.socials ?? undefined,
    },
  });
}

/**
 * Signs in with a proven email or wallet. If someone is already signed in and their account lacks
 * that field, it's linked to their account (merging a separate account that only had this field).
 */
async function linkOrFind({ current, field, value }) {
  const other = field === 'wallet' ? 'email' : 'wallet';
  return prisma.$transaction(async (tx) => {
    const owner = await tx.user.findUnique({ where: { [field]: value } });
    if (current && !current[field]) {
      if (!owner) return tx.user.update({ where: { id: current.id }, data: { [field]: value } });
      if (owner.id === current.id) return owner;
      if (owner[other] && owner[other] !== current[other]) {
        throw new HttpError(
          409,
          field === 'wallet'
            ? 'This wallet already belongs to another iSabi account with a different email.'
            : 'This email already belongs to another iSabi account with a different wallet.',
        );
      }
      // The other account only had this email/wallet: fold it into the signed-in one,
      // so the session in use stays valid.
      const fresh = await tx.user.findUnique({ where: { id: current.id } });
      return mergeAccounts(tx, fresh, owner);
    }
    if (owner) return owner;
    return tx.user.create({ data: { [field]: value } });
  });
}

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const emailInput = z.string().trim().toLowerCase().email().max(200);
const hashCode = (email, code) => crypto.createHmac('sha256', env.JWT_SECRET).update(`${email}:${code}`).digest('hex');

// POST /api/auth/email/start { email } — emails a 6-digit code
router.post(
  '/email/start',
  asyncHandler(async (req, res) => {
    const email = emailInput.parse(req.body?.email);
    const provider = emailProvider();
    if (!provider && env.NODE_ENV === 'production') {
      throw new HttpError(503, 'Email sign-in isn’t switched on yet. Use a wallet for now.');
    }
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await prisma.emailCode.findMany({ where: { email, createdAt: { gt: since } }, orderBy: { createdAt: 'desc' } });
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < 45_000) {
      throw new HttpError(429, 'We just sent a code. Wait a minute before asking for another.');
    }
    if (recent.length >= 6) throw new HttpError(429, 'Too many codes requested. Try again in an hour.');

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await prisma.emailCode.create({ data: { email, codeHash: hashCode(email, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
    prisma.emailCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600_000) } } }).catch(() => {});

    if (provider) {
      try {
        await sendCodeEmail(email, code);
      } catch (e) {
        console.error('[email]', e.message);
        throw new HttpError(502, 'We couldn’t send the email. Try again in a minute.');
      }
      return res.json({ sent: true });
    }
    // Local development and CI only: no email service, so hand the code back.
    console.log(`[email] sign-in code for ${email}: ${code}`);
    res.json({ sent: false, devCode: code });
  }),
);

// POST /api/auth/email/verify { email, code } — signs in (or links the email to the signed-in account)
router.post(
  '/email/verify',
  asyncHandler(async (req, res) => {
    const email = emailInput.parse(req.body?.email);
    const code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code').parse(req.body?.code);
    const entry = await prisma.emailCode.findFirst({
      where: { email, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!entry) throw new HttpError(401, 'That code has expired. Ask for a new one.');
    if (entry.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong codes. Ask for a new one.');
    const a = Buffer.from(entry.codeHash, 'hex');
    const b = Buffer.from(hashCode(email, code), 'hex');
    if (!crypto.timingSafeEqual(a, b)) {
      await prisma.emailCode.update({ where: { id: entry.id }, data: { attempts: { increment: 1 } } });
      throw new HttpError(401, 'That code isn’t right. Check the email and try again.');
    }
    const { count } = await prisma.emailCode.updateMany({ where: { id: entry.id, used: false }, data: { used: true } });
    if (count !== 1) throw new HttpError(401, 'That code was already used. Ask for a new one.');

    const user = await linkOrFind({ current: await userForSession(readSession(req)), field: 'email', value: email });
    res.json(sessionResponse(user));
  }),
);

module.exports = router;
