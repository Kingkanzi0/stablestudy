import { Link, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { friendlyError, formatDuration, formatUsdc, shortAddress } from '../lib/format'
import { explorerTx } from '../config/network'

const CATEGORY_COLORS = {
  'Web3 Development': '#2775CA',
  'Smart Contracts': '#0E2A47',
  'Payments & Stablecoins': '#1F9D6B',
  DeFi: '#6B4FD8',
  Design: '#D9467A',
  'Data & AI': '#0F8A9D',
  Business: '#B7791F',
  Languages: '#C2410C',
  Other: '#4B5563',
}

const CATEGORY_GLYPHS = {
  'Web3 Development': 'M8 12l-4 4 4 4M24 12l4 4-4 4M18 9l-4 14',
  'Smart Contracts': 'M9 5h10l5 5v17H9zM19 5v5h5M13 16h7M13 21h7',
  'Payments & Stablecoins': 'M16 5v22M21 9.5c-1.3-1.4-3-2-5-2-3 0-5 1.5-5 3.8 0 5.4 10 2.8 10 8.4 0 2.4-2.2 4-5.2 4-2.3 0-4.3-.8-5.8-2.3',
  DeFi: 'M6 22l7-7 5 5 8-10M20 10h6v6',
  Design: 'M6 26l4-1 15-15-3-3L7 22zM19 10l3 3',
  'Data & AI': 'M6 26V16M12 26V9M18 26v-7M24 26V5',
  Business: 'M5 12h22v13H5zM12 12V8h8v4M5 18h22',
  Languages: 'M5 8h12M11 5v3M7 8c1 5 4 8 8 10M15 8c-1 5-4 9-9 11M17 26l5-12 5 12M19 22h6',
  Other: 'M16 5l3.3 6.8 7.4 1-5.4 5.2 1.3 7.4-6.6-3.5-6.6 3.5 1.3-7.4-5.4-5.2 7.4-1z',
}

const categoryColor = (cat, fallback) => fallback || CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other

export function CourseCover({ course, size = 'md' }) {
  const color = categoryColor(course.category, course.coverColor)
  return (
    <div className={`cover cover-${size}`} style={{ '--cover': color }} aria-hidden="true">
      <svg viewBox="0 0 32 32" className="cover-glyph">
        <path d={CATEGORY_GLYPHS[course.category] || CATEGORY_GLYPHS.Other} />
      </svg>
      <span className="cover-cat">{course.category}</span>
    </div>
  )
}

export function CourseCard({ course }) {
  const meta = [course.level, formatDuration(course.durationMinutes), course.lessonCount && `${course.lessonCount} lessons`]
    .filter(Boolean)
  return (
    <Link to={`/courses/${course.id}`} className="course-card">
      <CourseCover course={course} />
      <div className="course-card-body">
        <h3>{course.title}</h3>
        <p className="course-card-summary">{course.summary}</p>
        <p className="course-card-meta">{meta.join(', ')}</p>
        <div className="course-card-foot">
          <span className="tutor-chip">
            <Avatar tutor={course.tutor} size={22} />
            {course.tutor?.displayName || shortAddress(course.tutor?.address)}
          </span>
          <span className="price">{course.priceUnits ? `${formatUsdc(course.priceUnits)} USDC` : 'Draft'}</span>
        </div>
      </div>
    </Link>
  )
}

export function Avatar({ tutor: tutorProp, person, size = 40 }) {
  const tutor = person || tutorProp
  const name = tutor?.displayName || tutor?.address || tutor?.email || '?'
  if (tutor?.avatarUrl) {
    return <img className="avatar" src={tutor.avatarUrl} alt="" width={size} height={size} style={{ width: size, height: size }} />
  }
  // Deterministic colour from the address so each tutor is recognisable.
  const seed = parseInt((tutor?.address || tutor?.id || '0x0').replace(/[^0-9a-f]/gi, '').slice(0, 6), 16) || 0
  const hue = seed % 360
  return (
    <span
      className="avatar avatar-initial"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 55% 42%)` }}
      aria-hidden="true"
    >
      {name.replace(/^0x/, '').charAt(0).toUpperCase()}
    </span>
  )
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <p>{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <button className="btn btn-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="state state-empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function TxLink({ hash, children }) {
  const href = explorerTx(hash)
  if (!href) return <code>{shortAddress(hash)}</code>
  return (
    <a href={href} target="_blank" rel="noreferrer" className="tx-link">
      {children || shortAddress(hash)}
    </a>
  )
}

/**
 * For on-chain actions: needs the connected wallet to be signed in (and on the account).
 * Email-only accounts are asked to connect and link a wallet.
 */
export function SignInGate({ children, why = 'to continue' }) {
  const { isConnected } = useAccount()
  const { isSignedIn, walletReady, user, signIn, signingIn } = useAuth()
  const toast = useToast()

  if (walletReady) return children
  const linking = isSignedIn && user?.email && !user?.wallet

  if (!isConnected) {
    return (
      <div className="gate">
        <h2>{linking ? 'Add a wallet to your account' : 'Connect your wallet'}</h2>
        <p>
          {linking
            ? `Payments on iSabi happen on Arc, so you need a wallet ${why}. Connect one with the button at the top; it will be linked to ${user.email}.`
            : `Connect a wallet ${why}. Use the button at the top of the page.`}
        </p>
      </div>
    )
  }
  const otherWallet = isSignedIn && user?.wallet && !linking
  return (
    <div className="gate">
      <h2>{linking ? 'Link this wallet' : otherWallet ? 'Sign in with this wallet' : 'Sign in with your wallet'}</h2>
      <p>
        {linking
          ? `Sign a message to prove this wallet is yours and add it to ${user.email}. It’s free and doesn’t send a transaction.`
          : otherWallet
            ? 'Your account uses a different wallet. Switch back to it in your wallet app, or sign in with this one.'
            : 'Signing a message proves this wallet is yours. It’s free and doesn’t send a transaction.'}
      </p>
      <button
        className="btn btn-primary"
        disabled={signingIn}
        onClick={() => signIn().catch((e) => toast.error('Sign-in failed', { body: friendlyError(e) }))}
      >
        {signingIn ? 'Check your wallet…' : linking ? 'Link wallet' : 'Sign in'}
      </button>
    </div>
  )
}

/** For things that only need an account (profile, campaigns): email or wallet. */
export function AccountGate({ children, why = 'to continue' }) {
  const { isSignedIn } = useAuth()
  const location = useLocation()
  if (isSignedIn) return children
  return (
    <div className="gate">
      <h2>Sign in {why}</h2>
      <p>Use your email or a wallet. It takes a few seconds.</p>
      <Link className="btn btn-primary" to={`/signin?next=${encodeURIComponent(location.pathname)}`}>
        Sign in
      </Link>
    </div>
  )
}

export function Field({ label, hint, error, children }) {
  return (
    <label className={`field ${error ? 'field-has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {hint && <span className="field-hint">{hint}</span>}
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}
