import { loadConfig } from './config.js'
import { fetchDelivery } from './fetchDelivery.js'
import { judgeMock, judgeWithClaude } from './judge.js'
import { agentAddress, readOrder, signVerdict } from './signer.js'

const log = (...a) => console.log(new Date().toISOString(), ...a)

async function api(cfg, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90_000), // the free backend can take ~60s to wake up
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data.error || 'request failed'}`)
  return data
}

/** Reviews one queued delivery end to end. Returns what happened, for logging and tests. */
export async function processItem(cfg, me, item) {
  const tag = `order #${item.onchainId} delivery ${item.delivery.number}`

  // 1. Check the chain: still waiting for review, assigned to us, and the delivery we're about to judge.
  const onchain = await readOrder(cfg, item.onchainId)
  if (onchain.status !== 'Delivered') return { skipped: `on-chain status is ${onchain.status}` }
  if (onchain.verifier !== me) return { skipped: 'assigned to a different verifier' }
  if (onchain.deliveryHash !== item.delivery.deliveryHash.toLowerCase()) return { skipped: 'delivery changed on-chain' }

  // 2. Judge (or reuse a report saved earlier whose transaction never landed).
  let reasonHash
  let approved
  if (item.pendingReport) {
    ;({ reasonHash, approved } = item.pendingReport)
    log(`${tag}: resending saved report (${approved ? 'approve' : 'reject'})`)
  } else {
    log(`${tag}: reading ${item.delivery.url}`)
    const content = await fetchDelivery(item.delivery.url)
    const verdict = cfg.judge === 'mock' ? judgeMock(item, content) : await judgeWithClaude(item, content, cfg)
    log(`${tag}: ${verdict.approved ? 'APPROVE' : 'REJECT'}: ${verdict.summary}`)
    const saved = await api(cfg, `/agent/orders/${item.orderId}/verdict`, {
      method: 'POST',
      body: { deliveryNumber: item.delivery.number, agent: me, ...verdict },
    })
    reasonHash = saved.reasonHash
    approved = saved.approved
  }

  if (cfg.dryRun) return { dryRun: true, approved, reasonHash }

  // 3. Sign on-chain from the agent wallet, then let the backend index it right away.
  const txHash = await signVerdict(cfg, item.onchainId, approved, reasonHash)
  log(`${tag}: signed on-chain${txHash ? ` (${cfg.network.explorer}/tx/${txHash})` : ''}`)
  if (txHash) await api(cfg, '/sync', { method: 'POST', body: { txHash } }).catch(() => {})
  return { approved, reasonHash, txHash }
}

export async function runOnce(cfg, me) {
  const { items } = await api(cfg, `/agent/queue?agent=${me}`)
  if (!items.length) return []
  const results = []
  for (const item of items) {
    try {
      results.push({ orderId: item.orderId, ...(await processItem(cfg, me, item)) })
    } catch (err) {
      log(`order #${item.onchainId}: failed: ${err.message}`)
      results.push({ orderId: item.orderId, error: err.message })
    }
  }
  return results
}

async function main() {
  const cfg = loadConfig()
  const me = await agentAddress(cfg)
  log(`SkillPay verifier agent ${me} on Arc ${cfg.networkKey}; judge=${cfg.judge}; signer=${cfg.signer}${cfg.dryRun ? '; DRY RUN' : ''}`)
  const once = process.argv.includes('--once')
  do {
    try {
      const results = await runOnce(cfg, me)
      if (results.length) log(`reviewed ${results.length} item(s)`)
    } catch (err) {
      log(`queue error: ${err.message}`)
    }
    if (!once) await new Promise((r) => setTimeout(r, cfg.pollMs))
  } while (!once)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
