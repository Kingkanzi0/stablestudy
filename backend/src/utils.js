const { USDC_DECIMALS } = require('./config');

/** Thrown inside route handlers to return a clean JSON error. */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wraps an async Express handler so rejected promises reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const lower = (addr) => (addr ? String(addr).toLowerCase() : addr);

/** "1500000" (base units) -> "1.50" */
function formatUsdc(units) {
  if (units === null || units === undefined) return null;
  const v = BigInt(units);
  const base = 10n ** BigInt(USDC_DECIMALS);
  const whole = v / base;
  const frac = (v % base).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${frac}`;
}

/** Converts BigInt values so objects can be sent with res.json. */
function toJsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

module.exports = { HttpError, asyncHandler, lower, formatUsdc, toJsonSafe };
