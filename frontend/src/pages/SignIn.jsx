import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Field } from '../components/common'
import ConnectButton from '../components/ConnectButton'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { friendlyError } from '../lib/format'

/** Sign in or create an account with an email code or a wallet. Linking happens on the profile page. */
export default function SignIn() {
  const [params] = useSearchParams()
  const next = /^\/[^/]/.test(params.get('next') || '') ? params.get('next') : '/profile'
  const navigate = useNavigate()
  const { isSignedIn, user } = useAuth()
  const [tab, setTab] = useState('email')

  if (isSignedIn) {
    return (
      <div className="page auth-page">
        <div className="auth-card">
          <h1>You’re signed in</h1>
          <p className="muted">{user.email || 'With your wallet'}</p>
          <button className="btn btn-primary btn-block" onClick={() => navigate(next)}>
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page auth-page">
      <div className="auth-card">
        <h1>Welcome to iSabi</h1>
        <p className="muted">Sign in or create an account. Same steps either way.</p>
        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'email'} className={tab === 'email' ? 'on' : ''} onClick={() => setTab('email')}>
            Email
          </button>
          <button role="tab" aria-selected={tab === 'wallet'} className={tab === 'wallet' ? 'on' : ''} onClick={() => setTab('wallet')}>
            Wallet
          </button>
        </div>
        {tab === 'email' ? <EmailForm onDone={() => navigate(next)} /> : <WalletForm onDone={() => navigate(next)} />}
        <p className="auth-fine">
          You can add the other one later from your profile, so one account works with both. Paying for courses
          and escrow always needs a wallet, because payments happen on Arc.
        </p>
      </div>
    </div>
  )
}

export function EmailForm({ onDone, cta = 'Send me a code' }) {
  const { startEmail, verifyEmail } = useAuth()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function send(e) {
    e?.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const r = await startEmail(email.trim())
      setSent(true)
      if (r.devCode) setCode(r.devCode) // local development only
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await verifyEmail(email.trim(), code.trim())
      toast.success('Signed in')
      onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!sent) {
    return (
      <form className="auth-form" onSubmit={send}>
        <Field label="Email" error={error}>
          <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Sending…' : cta}
        </button>
      </form>
    )
  }
  return (
    <form className="auth-form" onSubmit={verify}>
      <p>
        We sent a 6-digit code to <strong>{email}</strong>. It can take a minute, and may land in spam.
      </p>
      <Field label="Code" error={error}>
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
        />
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
        {busy ? 'Checking…' : 'Continue'}
      </button>
      <div className="auth-links">
        <button type="button" className="link-button small" onClick={() => setSent(false)}>
          Use a different email
        </button>
        <button type="button" className="link-button small" onClick={send} disabled={busy}>
          Send a new code
        </button>
      </div>
    </form>
  )
}

export function WalletForm({ onDone }) {
  const { isConnected } = useAccount()
  const { signIn, signingIn } = useAuth()
  const toast = useToast()
  if (!isConnected) {
    return (
      <div className="auth-form">
        <p>Connect a wallet such as OKX Wallet or MetaMask. On a phone, you’ll be offered to open iSabi in your wallet app.</p>
        <div className="auth-connect">
          <ConnectButton />
        </div>
      </div>
    )
  }
  return (
    <div className="auth-form">
      <p>Sign a message to prove the wallet is yours. It’s free and doesn’t send a transaction.</p>
      <button
        className="btn btn-primary btn-block"
        disabled={signingIn}
        onClick={() =>
          signIn()
            .then(() => {
              toast.success('Signed in')
              onDone?.()
            })
            .catch((e) => toast.error('Sign-in failed', { body: friendlyError(e) }))
        }
      >
        {signingIn ? 'Check your wallet…' : 'Sign in with wallet'}
      </button>
    </div>
  )
}

export function SignInLink() {
  return (
    <Link to="/signin" className="btn btn-ghost btn-signin">
      Sign in
    </Link>
  )
}
