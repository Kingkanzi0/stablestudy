const express = require('express');
const { z } = require('zod');
const { verifyMessage } = require('viem');
const { parseSiweMessage, validateSiweMessage, generateSiweNonce } = require('viem/siwe');
const { prisma } = require('../db');
const { network, allowedOrigins } = require('../config');
const { signToken } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../utils');

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

    res.json({ token: signToken(fields.address), address: fields.address.toLowerCase() });
  }),
);

module.exports = router;
