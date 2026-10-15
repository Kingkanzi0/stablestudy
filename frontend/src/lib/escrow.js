// Mirrors SkillPayEscrow.Status (on-chain enum order).
export const ONCHAIN_STATUS = ['NONE', 'FUNDED', 'ACCEPTED', 'DELIVERED', 'REJECTED', 'DISPUTED', 'RELEASED', 'REFUNDED', 'CANCELLED', 'RESOLVED']

export const STATUS_LABEL = {
  DRAFT: 'Not funded',
  FUNDED: 'Waiting for provider',
  ACCEPTED: 'In progress',
  DELIVERED: 'In review',
  REJECTED: 'Changes needed',
  DISPUTED: 'In dispute',
  RELEASED: 'Paid',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
  RESOLVED: 'Settled by arbiter',
}

export const STATUS_TONE = {
  DRAFT: 'draft',
  FUNDED: 'waiting',
  ACCEPTED: 'live',
  DELIVERED: 'waiting',
  REJECTED: 'warn',
  DISPUTED: 'warn',
  RELEASED: 'done',
  REFUNDED: 'draft',
  CANCELLED: 'draft',
  RESOLVED: 'done',
}

export const OPEN_STATUSES = new Set(['FUNDED', 'ACCEPTED', 'DELIVERED', 'REJECTED', 'DISPUTED'])

/** The five stages shown on an order; returns the index of the current one. */
export const STAGES = ['Funds locked', 'Accepted', 'Delivered', 'Verified', 'Paid']
export function stageIndex(status) {
  return (
    {
      DRAFT: -1,
      FUNDED: 0,
      ACCEPTED: 1,
      REJECTED: 2,
      DELIVERED: 2,
      DISPUTED: 3,
      RELEASED: 4,
      RESOLVED: 4,
    }[status] ?? 0
  )
}

export const EVENT_LABEL = {
  OrderCreated: 'Client locked the payment in escrow',
  OrderAccepted: 'Provider accepted the job',
  OrderCancelled: 'Order cancelled and refunded',
  DeliverySubmitted: 'Provider submitted a delivery',
  DeliveryVerified: 'Verifier agent recorded its decision',
  OrderReleased: 'Payment released to the provider',
  OrderRefunded: 'Payment refunded to the client',
  OrderDisputed: 'Order sent to the arbiter',
  DisputeResolved: 'Arbiter settled the dispute',
}

/** "2026-10-20T12:00" in the browser's local time, for datetime-local inputs. */
export function toLocalInput(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function timeLeft(date) {
  const ms = new Date(date).getTime() - Date.now()
  if (ms <= 0) return 'passed'
  const h = Math.floor(ms / 3600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min left`
  if (h < 48) return `${h} h left`
  return `${Math.floor(h / 24)} days left`
}

/** Current time. Kept in a helper so components stay free of impure calls during render. */
export const nowMs = () => Date.now()

/** Default deadline for a new order: a week from now, in datetime-local format. */
export const defaultDeadline = () => toLocalInput(new Date(Date.now() + 7 * 86400_000))
