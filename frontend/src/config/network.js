import { defineChain } from 'viem'

// Arc network details: https://docs.arc.io/arc/references/connect-to-arc
const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://explorer.arc.io' } },
})

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
})

const localAnvil = defineChain({
  id: 31337,
  name: 'Local (Anvil)',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
})

// USDC ERC-20 interface on Arc (6 decimals). Same address on mainnet and testnet.
const ARC_USDC = '0x3600000000000000000000000000000000000000'

const NETWORKS = {
  mainnet: { chain: arcMainnet, usdc: ARC_USDC, faucet: null },
  testnet: { chain: arcTestnet, usdc: ARC_USDC, faucet: 'https://faucet.circle.com' },
  local: { chain: localAnvil, usdc: import.meta.env.VITE_LOCAL_USDC_ADDRESS, faucet: null },
}

const key = import.meta.env.VITE_ARC_NETWORK || 'testnet'
if (!NETWORKS[key]) throw new Error(`Unknown VITE_ARC_NETWORK "${key}"`)

const base = NETWORKS[key]
const rpcOverride = import.meta.env.VITE_RPC_URL

export const network = {
  key,
  isMainnet: key === 'mainnet',
  chain: rpcOverride
    ? { ...base.chain, rpcUrls: { default: { http: [rpcOverride] } } }
    : base.chain,
  usdcAddress: base.usdc,
  faucet: base.faucet,
  skillPayAddress: import.meta.env.VITE_SKILLPAY_ADDRESS,
  escrowAddress: /^0x[0-9a-fA-F]{40}$/.test(import.meta.env.VITE_ESCROW_ADDRESS || '') ? import.meta.env.VITE_ESCROW_ADDRESS : null,
  apiUrl: (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace(/\/$/, ''),
}

export const USDC_DECIMALS = 6

export const isConfigured =
  /^0x[0-9a-fA-F]{40}$/.test(network.skillPayAddress || '') &&
  !/^0x0{40}$/.test(network.skillPayAddress) &&
  /^0x[0-9a-fA-F]{40}$/.test(network.usdcAddress || '')

const explorer = network.chain.blockExplorers?.default?.url
export const explorerTx = (hash) => (explorer ? `${explorer}/tx/${hash}` : null)
export const explorerAddress = (addr) => (explorer ? `${explorer}/address/${addr}` : null)
