const jwt = require('jsonwebtoken');
const { env, adminWallets, adminEmails } = require('../config');
const { prisma } = require('../db');
const { HttpError } = require('../utils');

const TOKEN_TTL = '24h';

/**
 * Session tokens carry the account id and, when one has been proven with a signature, the wallet.
 * Older tokens (before accounts existed) only had `sub` = wallet; they still work.
 */
function signSession({ userId, wallet, email }) {
  return jwt.sign(
    { uid: userId, wallet: wallet ? wallet.toLowerCase() : null, email: email || null },
    env.JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );
}

/** Kept for the wallet-only flow and tests. */
function signToken(address) {
  return jwt.sign({ sub: address.toLowerCase(), wallet: address.toLowerCase() }, env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function readSession(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const p = jwt.verify(token, env.JWT_SECRET);
    const wallet = typeof p.wallet === 'string' ? p.wallet : typeof p.sub === 'string' ? p.sub : null;
    return { userId: typeof p.uid === 'string' ? p.uid : null, wallet, email: typeof p.email === 'string' ? p.email : null };
  } catch {
    return null;
  }
}

/** Requires a session with a proven wallet (payments, tutoring, escrow, jobs). Sets req.wallet. */
function requireAuth(req, _res, next) {
  const s = readSession(req);
  if (!s?.wallet) return next(new HttpError(401, 'Sign in with your wallet to continue'));
  req.wallet = s.wallet;
  req.session = s;
  next();
}

/** Sets req.wallet when a wallet session is present, but does not require one. */
function optionalAuth(req, _res, next) {
  const s = readSession(req);
  req.wallet = s?.wallet || null;
  req.session = s;
  next();
}

/** Finds the account for a session, creating one for wallet sessions from before accounts existed. */
async function userForSession(s) {
  if (!s) return null;
  if (s.userId) {
    const u = await prisma.user.findUnique({ where: { id: s.userId } });
    if (u) return u;
  }
  if (s.wallet) {
    return prisma.user.upsert({ where: { wallet: s.wallet }, update: {}, create: { wallet: s.wallet } });
  }
  return null;
}

/** Requires any signed-in account, by email or wallet. Sets req.user (and req.wallet when proven). */
async function requireUser(req, _res, next) {
  try {
    const s = readSession(req);
    const user = await userForSession(s);
    if (!user) return next(new HttpError(401, 'Sign in to continue'));
    req.session = s;
    req.user = user;
    req.wallet = user.wallet || null;
    next();
  } catch (e) {
    next(e);
  }
}

function isAdmin(user) {
  if (!user) return false;
  return Boolean((user.wallet && adminWallets.has(user.wallet)) || (user.email && adminEmails.has(user.email)));
}

function requireAdmin(req, _res, next) {
  if (!isAdmin(req.user)) return next(new HttpError(403, 'Only iSabi admins can do this'));
  next();
}

module.exports = { signToken, signSession, readSession, requireAuth, optionalAuth, requireUser, requireAdmin, isAdmin, userForSession };
