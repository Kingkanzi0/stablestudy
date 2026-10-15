const NETWORKS = {
  mainnet: { id: 5042, rpc: 'https://rpc.mainnet.arc.io', circleChain: 'ARC', explorer: 'https://explorer.arc.io' },
  testnet: { id: 5042002, rpc: 'https://rpc.testnet.arc.io', circleChain: 'ARC-TESTNET', explorer: 'https://explorer.testnet.arc.io' },
  local: { id: 31337, rpc: 'http://127.0.0.1:8545', circleChain: null, explorer: '' },
}

const isAddress = (v) => /^0x[0-9a-fA-F]{40}$/.test(v || '')

/** Reads and checks the agent's settings. Throws a readable error listing every problem. */
export function loadConfig(env = process.env) {
  const problems = []
  const network = NETWORKS[env.ARC_NETWORK || 'testnet']
  if (!network) problems.push(`ARC_NETWORK must be mainnet, testnet or local (got "${env.ARC_NETWORK}")`)

  const signer = env.SIGNER || 'circle'
  const judge = env.JUDGE || 'claude'
  const cfg = {
    apiUrl: (env.SKILLPAY_API_URL || '').replace(/\/$/, ''),
    apiKey: env.AGENT_API_KEY || '',
    network: network || NETWORKS.testnet,
    networkKey: env.ARC_NETWORK || 'testnet',
    rpcUrl: env.RPC_URL || network?.rpc,
    escrow: env.ESCROW_ADDRESS || '',
    signer,
    agentAddress: env.AGENT_ADDRESS || '',
    privateKey: env.AGENT_PRIVATE_KEY || '',
    circleBin: env.CIRCLE_BIN || 'circle',
    judge,
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    pollMs: Number(env.POLL_INTERVAL_MS || 30_000),
    dryRun: env.DRY_RUN === 'true',
  }

  if (!/^https?:\/\//.test(cfg.apiUrl)) problems.push('SKILLPAY_API_URL must be the API base URL, e.g. https://…/api')
  if (cfg.apiKey.length < 24) problems.push('AGENT_API_KEY is missing or too short')
  if (!isAddress(cfg.escrow)) problems.push('ESCROW_ADDRESS must be the SkillPayEscrow contract address')
  if (!['circle', 'key'].includes(signer)) problems.push('SIGNER must be circle or key')
  if (signer === 'circle' && !isAddress(cfg.agentAddress)) problems.push('AGENT_ADDRESS must be your Circle agent wallet address')
  if (signer === 'circle' && !cfg.network.circleChain) problems.push('SIGNER=circle does not work on the local network; use SIGNER=key')
  if (signer === 'key' && !/^0x[0-9a-fA-F]{64}$/.test(cfg.privateKey)) problems.push('AGENT_PRIVATE_KEY must be a 0x… private key for SIGNER=key')
  if (!['claude', 'mock'].includes(judge)) problems.push('JUDGE must be claude or mock')
  if (judge === 'claude' && !cfg.anthropicKey) problems.push('ANTHROPIC_API_KEY is required for JUDGE=claude')
  if (judge === 'mock' && cfg.networkKey === 'mainnet') problems.push('JUDGE=mock is for testing only and is not allowed on mainnet')
  if (!(cfg.pollMs >= 5_000)) problems.push('POLL_INTERVAL_MS must be at least 5000')

  if (problems.length) {
    const err = new Error(`Agent settings need attention:\n  - ${problems.join('\n  - ')}\nSee agent/.env.example`)
    err.problems = problems
    throw err
  }
  return cfg
}
