import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { createSiweMessage } from 'viem/siwe'
import { useQueryClient } from '@tanstack/react-query'
import { api, loadSession, saveSession } from '../lib/api'
import { network } from '../config/network'

const AuthContext = createContext(null)
const SESSION_MS = 23 * 60 * 60 * 1000 // API tokens last 24h

/** Sessions saved before accounts existed only had { token, address }. */
function normalise(s) {
  if (!s) return null
  if (s.user) return s
  return { ...s, user: { id: null, email: null, wallet: s.address || null } }
}

export function AuthProvider({ children }) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const queryClient = useQueryClient()
  const [session, setSession] = useState(() => normalise(loadSession()))
  const [signingIn, setSigningIn] = useState(false)

  const store = useCallback(
    (data) => {
      const next = { token: data.token, user: data.user, address: data.user.wallet, expiresAt: Date.now() + SESSION_MS }
      saveSession(next)
      setSession(next)
      queryClient.invalidateQueries({ queryKey: ['api', '/me'] })
      return next
    },
    [queryClient],
  )

  const user = session?.user ?? null
  const connected = address?.toLowerCase() ?? null
  // Wallet-only accounts follow the connected wallet: switching wallets in the extension
  // means signing in again. Accounts with an email stay signed in either way.
  const signedIn = Boolean(session && (user?.email || !user?.wallet || user.wallet === connected))
  // Payments and other on-chain actions need the connected wallet to be the one on the account.
  const walletReady = Boolean(signedIn && user?.wallet && user.wallet === connected)

  /** Sign-In with Ethereum. When already signed in by email, this links the wallet to that account. */
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
      const data = await api('/auth/verify', {
        method: 'POST',
        token: signedIn ? session.token : undefined,
        body: { message, signature },
      })
      return store(data)
    } finally {
      setSigningIn(false)
    }
  }, [address, signMessageAsync, signedIn, session, store])

  const startEmail = useCallback((email) => api('/auth/email/start', { method: 'POST', body: { email } }), [])

  /** Signs in with an email code, or adds the email to the signed-in account. */
  const verifyEmail = useCallback(
    async (email, code) => {
      const data = await api('/auth/email/verify', {
        method: 'POST',
        token: signedIn ? session.token : undefined,
        body: { email, code },
      })
      return store(data)
    },
    [signedIn, session, store],
  )

  const signOut = useCallback(() => {
    saveSession(null)
    setSession(null)
    queryClient.removeQueries({ queryKey: ['api', '/me'] })
  }, [queryClient])

  const value = useMemo(
    () => ({
      token: signedIn ? session.token : null,
      user: signedIn ? user : null,
      isSignedIn: signedIn,
      walletReady,
      signIn,
      startEmail,
      verifyEmail,
      signOut,
      signingIn,
    }),
    [signedIn, session, user, walletReady, signIn, startEmail, verifyEmail, signOut, signingIn],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
