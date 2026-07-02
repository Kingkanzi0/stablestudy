import { createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { metaMask, walletConnect, injected } from 'wagmi/connectors'

// Arc Testnet Configuration
export const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc-testnet.arc.io'],
    },
    public: {
      http: ['https://rpc-testnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://explorer-testnet.arc.io',
    },
  },
}

export const config = createConfig({
  chains: [arcTestnet, mainnet, sepolia],
  connectors: [
    metaMask(),
    walletConnect({ projectId: 'YOUR_PROJECT_ID' }),
    injected(),
  ],
  transports: {
    [arcTestnet.id]: http('https://rpc-testnet.arc.io'),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})
