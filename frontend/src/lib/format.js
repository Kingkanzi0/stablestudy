import { formatUnits, parseUnits } from 'viem'
import { USDC_DECIMALS } from '../config/network'

/** 1500000n -> "1.50" */
export function formatUsdc(units, { minDecimals = 2 } = {}) {
  if (units === null || units === undefined) return '—'
  const s = formatUnits(BigInt(units), USDC_DECIMALS)
  const [whole, frac = ''] = s.split('.')
  const trimmed = frac.replace(/0+$/, '')
  const padded = trimmed.length < minDecimals ? trimmed.padEnd(minDecimals, '0') : trimmed
  return `${Number(whole).toLocaleString('en-US')}.${padded}`
}

/** "1.5" -> 1500000n. Throws on invalid input. */
export function parseUsdc(value) {
  const clean = String(value).trim()
  if (!/^\d+(\.\d{1,6})?$/.test(clean)) throw new Error('Enter an amount like 2 or 2.50')
  return parseUnits(clean, USDC_DECIMALS)
}

export const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export function formatDuration(minutes) {
  if (!minutes) return null
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function timeAgo(date) {
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Turns wallet/RPC errors into one plain sentence. */
export function friendlyError(err) {
  const msg = err?.shortMessage || err?.message || String(err)
  if (/user rejected|denied|rejected the request/i.test(msg)) return 'You cancelled the request in your wallet.'
  if (/insufficient funds/i.test(msg)) return 'Not enough USDC to cover the network fee.'
  if (/PriceChanged/.test(msg)) return 'The tutor changed the price. Review the new price and try again.'
  if (/AlreadyEnrolled/.test(msg)) return 'You are already enrolled in this course.'
  if (/CourseInactive/.test(msg)) return 'This course is not taking new students right now.'
  if (/TutorIsSuspended/.test(msg)) return 'This tutor is not taking new students right now.'
  if (/AlreadyRegistered/.test(msg)) return 'This wallet is already registered as a tutor.'
  if (/NotRegisteredTutor/.test(msg)) return 'Register as a tutor first.'
  if (/InvalidPrice/.test(msg)) return 'Price must be between 0.01 and 10,000 USDC.'
  if (/EnforcedPause/.test(msg)) return 'SkillPay is paused for maintenance. Try again soon.'
  return msg.split('\n')[0].slice(0, 200)
}
