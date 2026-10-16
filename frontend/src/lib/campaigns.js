export const TYPE_LABEL = {
  AIRDROP: 'Airdrop',
  TESTNET: 'Testnet',
  QUEST: 'Quest',
  INCENTIVE: 'Incentive',
  POINTS: 'Points',
  OTHER: 'Other',
}
export const COST_LABEL = { FREE: 'Free', GAS: 'Gas only', DEPOSIT: 'Deposit needed' }
export const PHASE_LABEL = { LIVE: 'Live', UPCOMING: 'Upcoming', ENDED: 'Ended' }
export const PHASE_TONE = { LIVE: 'done', UPCOMING: 'waiting', ENDED: 'draft' }

/** "Ends in 3 days", "Starts 12 Nov", "Ended 2 Oct", or "No end date". */
export function campaignWhen(c, now = Date.now()) {
  const fmt = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  if (c.phase === 'UPCOMING' && c.startsAt) return `Starts ${fmt(c.startsAt)}`
  if (c.phase === 'ENDED' && c.endsAt) return `Ended ${fmt(c.endsAt)}`
  if (!c.endsAt) return 'No end date'
  const days = Math.ceil((new Date(c.endsAt).getTime() - now) / 86400_000)
  if (days <= 1) return 'Ends today'
  if (days < 30) return `Ends in ${days} days`
  return `Ends ${fmt(c.endsAt)}`
}
