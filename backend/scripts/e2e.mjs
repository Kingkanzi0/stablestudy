// End-to-end test of the escrow flow against a local Anvil chain + this API + the verifier agent.
// Run by CI (.github/workflows/ci.yml, job "e2e"). Env: API_URL, RPC_URL, USDC, ESCROW, AGENT_DIR,
// AGENT_API_KEY, CLIENT_PK, PROVIDER_PK, AGENT_PK.
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, defineChain, erc20Abi, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'
import { readFileSync } from 'node:fs'

const env = process.env
const API = env.API_URL
const escrowAbi = JSON.parse(readFileSync(new URL('../src/contracts/escrowAbi.json', import.meta.url), 'utf8'))
const chain = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [env.RPC_URL] } },
})
const pub = createPublicClient({ chain, transport: http() })
const step = (msg) => console.log(`\n▶ ${msg}`)

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = res.status === 204 ? null : await res.json()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`)
  return data
}

function actor(pk) {
  const account = privateKeyToAccount(pk)
  const wallet = createWalletClient({ account, chain, transport: http() })
  return {
    address: account.address,
    async signIn() {
      const { nonce } = await call('/auth/nonce')
      const message = createSiweMessage({
        domain: 'localhost:5173',
        address: account.address,
        statement: 'Sign in to SkillPay.',
        uri: 'http://localhost:5173',
        version: '1',
        chainId: chain.id,
        nonce,
        issuedAt: new Date(),
      })
      const signature = await account.signMessage({ message })
      const { token } = await call('/auth/verify', { method: 'POST', body: { message, signature } })
      this.token = token
    },
    async write(address, abi, functionName, args) {
      const hash = await wallet.writeContract({ address, abi, functionName, args })
      const receipt = await pub.waitForTransactionReceipt({ hash })
      assert.equal(receipt.status, 'success', `${functionName} reverted`)
      await call('/sync', { method: 'POST', body: { txHash: hash } })
      return hash
    },
  }
}

const balance = (who) => pub.readContract({ address: env.USDC, abi: erc20Abi, functionName: 'balanceOf', args: [who] })

function runAgent() {
  const r = spawnSync('node', ['src/index.js', '--once'], {
    cwd: env.AGENT_DIR,
    encoding: 'utf8',
    env: {
      ...process.env,
      SKILLPAY_API_URL: API,
      AGENT_API_KEY: env.AGENT_API_KEY,
      ARC_NETWORK: 'local',
      RPC_URL: env.RPC_URL,
      ESCROW_ADDRESS: env.ESCROW,
      SIGNER: 'key',
      AGENT_PRIVATE_KEY: env.AGENT_PK,
      JUDGE: 'mock',
      POLL_INTERVAL_MS: '5000',
    },
  })
  console.log(r.stdout, r.stderr)
  assert.equal(r.status, 0, 'agent exited with an error')
}

async function orderStatus(id, token) {
  return (await call(`/orders/${id}`, { token })).order.status
}

const client = actor(env.CLIENT_PK)
const provider = actor(env.PROVIDER_PK)

step('client and provider sign in with their wallets')
await client.signIn()
await provider.signIn()

step('client writes the agreement')
const meta = await call('/orders/meta')
assert.equal(meta.enabled, true)
const { order } = await call('/orders', {
  method: 'POST',
  token: client.token,
  body: {
    provider: provider.address,
    title: 'Landing page for a bakery',
    description: 'One page with the menu, opening hours and a contact form.',
    criteria: ['Shows the bakery name', 'Has a contact form'],
    category: 'Web development',
    amount: '50',
    deadline: new Date(Date.now() + 3 * 86400_000).toISOString(),
  },
})
assert.equal(order.status, 'DRAFT')
assert.match(order.specHash, /^0x[0-9a-f]{64}$/)

step('client locks 50 USDC in escrow')
const before = await balance(provider.address)
await client.write(env.USDC, erc20Abi, 'approve', [env.ESCROW, BigInt(order.amountUnits)])
await client.write(env.ESCROW, escrowAbi, 'createOrder', [order.provider, BigInt(order.amountUnits), BigInt(order.deadlineUnix), order.specHash])
const funded = (await call(`/orders/${order.id}`, { token: client.token })).order
assert.equal(funded.status, 'FUNDED')
assert.equal(funded.onchainId, 1)
assert.equal(await balance(env.ESCROW), 50_000_000n)

step('provider sees the order and accepts it')
const mine = await call('/orders/mine', { token: provider.token })
assert.ok(mine.orders.some((o) => o.id === order.id && o.role === 'provider'))
await provider.write(env.ESCROW, escrowAbi, 'accept', [1n])
assert.equal(await orderStatus(order.id, provider.token), 'ACCEPTED')

step('a stranger cannot see the order')
await assert.rejects(call(`/orders/${order.id}`), /401/)

step('provider delivers work the mock judge will reject')
let { delivery } = await call(`/orders/${order.id}/deliveries`, {
  method: 'POST',
  token: provider.token,
  body: { url: `${API}/health`, notes: 'First draft. REJECT expected by the mock judge.' },
})
await provider.write(env.ESCROW, escrowAbi, 'submitDelivery', [1n, delivery.deliveryHash])
assert.equal(await orderStatus(order.id, client.token), 'DELIVERED')

step('agent reviews and rejects on-chain')
runAgent()
let detail = await call(`/orders/${order.id}`, { token: client.token })
assert.equal(detail.order.status, 'REJECTED')
assert.equal(detail.verdicts.length, 1)
assert.equal(detail.verdicts[0].approved, false)
assert.ok(detail.verdicts[0].onchain, 'rejection should be signed on-chain')

step('provider sends a revision; agent approves and the escrow pays out')
;({ delivery } = await call(`/orders/${order.id}/deliveries`, {
  method: 'POST',
  token: provider.token,
  body: { url: `${API}/health`, notes: 'Revision with the contact form fixed.' },
}))
await provider.write(env.ESCROW, escrowAbi, 'submitDelivery', [1n, delivery.deliveryHash])
runAgent()
detail = await call(`/orders/${order.id}`, { token: client.token })
assert.equal(detail.order.status, 'RELEASED')
assert.equal(detail.verdicts.filter((v) => v.approved && v.onchain).length, 1)
assert.equal((await balance(provider.address)) - before, 45_000_000n, 'provider gets 90%')
assert.equal(await balance(env.ESCROW), 0n, 'escrow is empty')
assert.ok(detail.events.some((e) => e.type === 'OrderReleased'))

step('agent queue is empty and the agent key is required')
assert.equal((await fetch(`${API}/agent/queue`)).status, 401)
const q = await call('/agent/queue', { token: env.AGENT_API_KEY })
assert.equal(q.items.length, 0)

console.log('\n✅ Escrow end-to-end test passed')
