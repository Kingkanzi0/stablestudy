import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { network } from './network'

// Browser wallets (MetaMask, Rabby, Coinbase Wallet, Brave, OKX…) are discovered
// automatically through EIP-6963, so one injected connector covers them all.
export const wagmiConfig = createConfig({
  chains: [network.chain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [network.chain.id]: http(network.chain.rpcUrls.default.http[0]),
  },
  multiInjectedProviderDiscovery: true,
})
