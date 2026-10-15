import { useEffect, useRef, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain } from 'wagmi'
import { network, explorerAddress } from '../config/network'
import { usdc } from '../contracts'
import { formatUsdc, shortAddress, friendlyError } from '../lib/format'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'

export default function ConnectButton() {
  const { address, isConnected, chainId } = useAccount()
  const { connectors, connectAsync, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync } = useSwitchChain()
  const { signOut } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const { data: balance } = useReadContract({
    ...usdc,
    functionName: 'balanceOf',
    args: [address],
    query: { enabled: Boolean(address && usdc.address), refetchInterval: 15_000 },
  })

  useEffect(() => {
    if (!open) return
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  // EIP-6963 wallets have their own entries; hide the generic one when real wallets exist.
  const named = connectors.filter((c) => c.id !== 'injected')
  const wallets = named.length ? named : connectors

  async function connect(connector) {
    try {
      await connectAsync({ connector, chainId: network.chain.id })
      setOpen(false)
    } catch (e) {
      toast.error('Couldn’t connect', { body: friendlyError(e) })
    }
  }

  if (!isConnected) {
    const noWallet = wallets.length === 0
    return (
      <div className="connect" ref={ref}>
        <button className="btn btn-primary" onClick={() => setOpen((o) => !o)} disabled={isPending} aria-expanded={open}>
          {isPending ? 'Connecting…' : 'Connect wallet'}
        </button>
        {open && (
          <div className="menu" role="menu">
            {noWallet ? (
              <OpenInWallet />
            ) : (
              wallets.map((c) => (
                <button key={c.uid} className="menu-item" role="menuitem" onClick={() => connect(c)}>
                  {c.icon ? <img src={c.icon} alt="" width="20" height="20" /> : <span className="wallet-dot" />}
                  {c.name === 'Injected' ? 'Browser wallet' : c.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    )
  }

  if (chainId !== network.chain.id) {
    return (
      <button
        className="btn btn-warn"
        onClick={() => switchChainAsync({ chainId: network.chain.id }).catch((e) => toast.error('Couldn’t switch network', { body: friendlyError(e) }))}
      >
        Switch to {network.chain.name}
      </button>
    )
  }

  return (
    <div className="connect" ref={ref}>
      <button className="btn btn-wallet" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="wallet-balance">{balance !== undefined ? `${formatUsdc(balance)} USDC` : '…'}</span>
        <span className="wallet-address">{shortAddress(address)}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <p className="menu-note">
            Connected to <strong>{network.chain.name}</strong>
          </p>
          {explorerAddress(address) && (
            <a className="menu-item" href={explorerAddress(address)} target="_blank" rel="noreferrer">
              View wallet on explorer
            </a>
          )}
          {network.faucet && (
            <a className="menu-item" href={network.faucet} target="_blank" rel="noreferrer">
              Get test USDC
            </a>
          )}
          <button
            className="menu-item"
            onClick={() => {
              signOut()
              disconnect()
              setOpen(false)
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Phones have no wallet extension, so offer to reopen this page inside a wallet app's own browser,
 * where the wallet is available to the site.
 */
function OpenInWallet() {
  const url = typeof window !== 'undefined' ? window.location.href : ''
  const isPhone = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (!isPhone) {
    return (
      <p className="menu-note">
        No browser wallet found. Install <a href="https://www.okx.com/web3" target="_blank" rel="noreferrer">OKX Wallet</a>,{' '}
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a> or{' '}
        <a href="https://rabby.io" target="_blank" rel="noreferrer">Rabby</a>, then reload this page.
      </p>
    )
  }
  const okx = `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`
  const metamask = `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`
  return (
    <>
      <p className="menu-note">On a phone, open iSabi inside your wallet app:</p>
      <a className="menu-item" href={okx}>
        <span className="wallet-dot" /> Open in OKX Wallet
      </a>
      <a className="menu-item" href={metamask}>
        <span className="wallet-dot" /> Open in MetaMask
      </a>
    </>
  )
}
