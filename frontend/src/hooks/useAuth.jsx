import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { createSiweMessage } from 'viem/siwe'
import { api, loadSession, saveSession } from '../lib/api'
import { network } from '../config/network'

const AuthContext = createContext(null)
const SESSION_MS = 23 * 60 * 60 * 1000 // API tokens last 24h

export function AuthProvider({ children }) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [session, setSession] = useState(loadSession)
  const [signingIn, setSigningIn] = useState(false)

  // A session only counts for the wallet that created it.
  const active = session && address && session.address === address.toLowerCase() ? session : null

  const signIn = useCallback(async () => {
    if (!address) throw new Error('Connect your wallet first')
    setSigningIn(true)
    try {
      const { nonce } = await api('/auth/nonce')
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to iSabi. This is free and does not send a transaction.',
        uri: window.location.origin,
        version: '1',
        chainId: network.chain.id,
        nonce,
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + 10 * 60 * 1000),
      })
      const signature = await signMessageAsync({ message })
      const { token } = await api('/auth/verify', { method: 'POST', body: { message, signature } })
      const next = { token, address: address.toLowerCase(), expiresAt: Date.now() + SESSION_MS }
      saveSession(next)
      setSession(next)
      return next
    } finally {
      setSigningIn(false)
    }
  }, [address, signMessageAsync])

  const signOut = useCallback(() => {
    saveSession(null)
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({ token: active?.token ?? null, isSignedIn: Boolean(active), signIn, signOut, signingIn }),
    [active, signIn, signOut, signingIn],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
