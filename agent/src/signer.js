import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'

const run = promisify(execFile)
const escrowAbi = JSON.parse(readFileSync(new URL('./contracts/escrowAbi.json', import.meta.url), 'utf8'))

// Must match SkillPayEscrow.Status
export const STATUS = ['None', 'Funded', 'Accepted', 'Delivered', 'Rejected', 'Disputed', 'Released', 'Refunded', 'Cancelled', 'Resolved']

async function viem() {
  const [core, accounts] = await Promise.all([import('viem'), import('viem/accounts')])
  return { ...core, ...accounts }
}

function chainFor(cfg, defineChain) {
  return defineChain({
    id: cfg.network.id,
    name: `Arc ${cfg.networkKey}`,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  })
}

/** Reads the order straight from the contract, so the agent never signs for a stale queue entry. */
export async function readOrder(cfg, onchainId) {
  const { createPublicClient, http, defineChain } = await viem()
  const client = createPublicClient({ chain: chainFor(cfg, defineChain), transport: http(cfg.rpcUrl) })
  const o = await client.readContract({ address: cfg.escrow, abi: escrowAbi, functionName: 'getOrder', args: [BigInt(onchainId)] })
  return { status: STATUS[Number(o.status)], verifier: o.verifier.toLowerCase(), deliveries: Number(o.deliveries), deliveryHash: o.deliveryHash.toLowerCase() }
}

export async function agentAddress(cfg) {
  if (cfg.signer === 'circle') return cfg.agentAddress.toLowerCase()
  const { privateKeyToAccount } = await viem()
  return privateKeyToAccount(cfg.privateKey).address.toLowerCase()
}

/** Pulls the transaction hash out of the Circle CLI's output (ignoring the reason hash we passed in). */
export function parseTxHash(output, exclude = []) {
  const skip = new Set(exclude.map((h) => h.toLowerCase()))
  const hashes = (output.match(/0x[0-9a-fA-F]{64}/g) || []).map((h) => h.toLowerCase()).filter((h) => !skip.has(h))
  return hashes[0] || null
}

/** Circle CLI command for the escrow's verify(orderId, approved, reasonHash). */
export function circleArgs(cfg, onchainId, approved, reasonHash) {
  return [
    'wallet',
    'execute',
    'verify(uint256,bool,bytes32)',
    String(onchainId),
    approved ? 'true' : 'false',
    reasonHash,
    '--contract',
    cfg.escrow,
    '--address',
    cfg.agentAddress,
    '--chain',
    cfg.network.circleChain,
  ]
}

/**
 * On Windows the npm-installed `circle` command is a .cmd script, which Node can only start through the shell.
 * Every argument is plain hex, numbers or a fixed signature, so quoting each one is enough.
 */
export function circleCommand(cfg, args, platform = process.platform) {
  if (platform !== 'win32') return { file: cfg.circleBin, args, shell: false }
  return { file: `"${cfg.circleBin}"`, args: args.map((a) => `"${a}"`), shell: true }
}

async function signWithCircle(cfg, onchainId, approved, reasonHash) {
  const cmd = circleCommand(cfg, circleArgs(cfg, onchainId, approved, reasonHash))
  const { stdout, stderr } = await run(cmd.file, cmd.args, {
    shell: cmd.shell,
    timeout: 180_000,
    maxBuffer: 1_000_000,
  })
  return parseTxHash(`${stdout}\n${stderr}`, [reasonHash, cfg.escrow.padEnd(66, '0')])
}

async function signWithKey(cfg, onchainId, approved, reasonHash) {
  const { createWalletClient, createPublicClient, http, defineChain, privateKeyToAccount } = await viem()
  const chain = chainFor(cfg, defineChain)
  const account = privateKeyToAccount(cfg.privateKey)
  const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) })
  const pub = createPublicClient({ chain, transport: http(cfg.rpcUrl) })
  const hash = await wallet.writeContract({
    address: cfg.escrow,
    abi: escrowAbi,
    functionName: 'verify',
    args: [BigInt(onchainId), approved, reasonHash],
  })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`verify transaction ${hash} reverted`)
  return hash
}

/** Signs the decision on-chain from the agent's wallet. Returns the transaction hash (or null if the CLI didn't print one). */
export async function signVerdict(cfg, onchainId, approved, reasonHash) {
  return cfg.signer === 'circle'
    ? signWithCircle(cfg, onchainId, approved, reasonHash)
    : signWithKey(cfg, onchainId, approved, reasonHash)
}
