import { createConfig, fallback, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
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
// Optional: WalletConnect lets phone browsers connect to a wallet app with a QR code or app switch.
// It needs a free project id from https://cloud.reown.com set as VITE_WALLETCONNECT_PROJECT_ID.
const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
const connectors = [injected({ shimDisconnect: true })]
if (wcProjectId) {
  connectors.push(
    walletConnect({
      projectId: wcProjectId,
      showQrModal: true,
      metadata: {
        name: 'iSabi',
        description: 'Learn skills, get hired and get paid in USDC on Arc.',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://isabi-arc.vercel.app',
        icons: ['https://isabi-arc.vercel.app/icon-192.png'],
      },
    }),
  )
}

export const wagmiConfig = createConfig({
  chains: [network.chain],
  connectors,
  transports: { [network.chain.id]: transport },
  multiInjectedProviderDiscovery: true,
})
