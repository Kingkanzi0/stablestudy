const jwt = require('jsonwebtoken');
const { env } = require('../config');
const { HttpError } = require('../utils');

const TOKEN_TTL = '24h';

function signToken(address) {
  return jwt.sign({ sub: address.toLowerCase() }, env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Requires a valid wallet session. Sets req.wallet to the lower-case address. */
function requireAuth(req, _res, next) {
  const wallet = readToken(req);
  if (!wallet) return next(new HttpError(401, 'Sign in with your wallet to continue'));
  req.wallet = wallet;
  next();
}

/** Sets req.wallet when a valid token is present, but does not require one. */
function optionalAuth(req, _res, next) {
  req.wallet = readToken(req);
  next();
}

module.exports = { signToken, requireAuth, optionalAuth };
