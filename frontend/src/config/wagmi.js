import { createConfig, fallback, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { network } from './network'

// Chain reads go through the iSabi API first (works even when a browser or
// privacy shield blocks public RPC endpoints), then fall back to Arc's RPC directly.
// Transactions are always signed and sent by the user's wallet, not these transports.
const transport = fallback([
  http(`${network.apiUrl}/rpc`, { batch: { batchSize: 20 }, retryCount: 1, timeout: 20_000 }),
  http(network.chain.rpcUrls.default.http[0], { retryCount: 1 }),
])

// Browser wallets (MetaMask, Rabby, OKX, Coinbase Wallet, Brave…) are discovered
// automatically through EIP-6963, so one injected connector covers them all.
export const wagmiConfig = createConfig({
  chains: [network.chain],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [network.chain.id]: transport },
  multiInjectedProviderDiscovery: true,
})
