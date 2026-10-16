import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { AccountGate, Avatar, ErrorState, Field, Spinner } from '../components/common'
import ConnectButton from '../components/ConnectButton'
import Socials from '../components/Socials'
import { SOCIAL_FIELDS } from '../lib/socials'
import { useAuth } from '../hooks/useAuth'
import { useMe } from '../hooks/useProfile'
import { useApi } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { squareImage } from '../lib/images'
import { friendlyError, shortAddress } from '../lib/format'
import { EmailForm } from './SignIn'

export default function Profile() {
  return (
    <div className="page">
      <AccountGate why="to see your profile">
        <ProfileBody />
      </AccountGate>
    </div>
  )
}

function ProfileBody() {
  const me = useMe()
  if (me.isLoading) return <Spinner label="Loading your profile" />
  if (me.error) return <ErrorState error={me.error} onRetry={me.refetch} />
  if (!me.data) return <Spinner label="Loading your profile" />
  return <ProfileView profile={me.data.profile} />
}

function ProfileView({ profile }) {
  const { signOut } = useAuth()
  return (
    <div className="profile-page">
      <header className="profile-top">
        <AvatarEditor profile={profile} />
        <div>
          <h1>{profile.displayName || 'Your profile'}</h1>
          <p className="muted">{profile.email || shortAddress(profile.wallet)}</p>
          <Socials socials={profile.socials} />
        </div>
      </header>

      <div className="profile-grid">
        <div className="profile-main">
          <ProfileForm profile={profile} />
          <MyCampaigns />
        </div>
        <aside className="profile-side">
          <AccountMethods profile={profile} />
          <nav className="profile-links" aria-label="Your iSabi">
            <Link to="/learn">My learning</Link>
            <Link to="/teach">Teach</Link>
            <Link to="/escrow">Escrow orders</Link>
            <Link to="/jobs/mine">My job posts</Link>
            <Link to="/campaigns/new">List a campaign</Link>
            {profile.isAdmin && <Link to="/admin/campaigns">Review campaigns (admin)</Link>}
            <button className="link-button" onClick={signOut}>
              Sign out
            </button>
          </nav>
        </aside>
      </div>
    </div>
  )
}

function useRefreshMe() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['api', '/me'] })
}

function AvatarEditor({ profile }) {
  const { token } = useAuth()
  const toast = useToast()
  const refresh = useRefreshMe()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)

  async function choose(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const image = await squareImage(file, 256)
      await api('/me/avatar', { method: 'POST', token, body: { image } })
      await refresh()
      toast.success('Profile picture updated')
    } catch (err) {
      toast.error('Couldn’t upload the picture', { body: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api('/me/avatar', { method: 'DELETE', token })
      await refresh()
    } catch (err) {
      toast.error('Couldn’t remove the picture', { body: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="avatar-editor">
      <button type="button" className="avatar-button" onClick={() => input.current?.click()} disabled={busy} aria-label="Change profile picture">
        <Avatar person={profile} size={96} />
        <span className="avatar-badge" aria-hidden="true">
          {busy ? '…' : '✎'}
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={choose} />
      {profile.avatarUrl && (
        <button type="button" className="link-button small" onClick={remove} disabled={busy}>
          Remove picture
        </button>
      )}
    </div>
  )
}

function ProfileForm({ profile }) {
  const { token } = useAuth()
  const toast = useToast()
  const refresh = useRefreshMe()
  const [form, setForm] = useState(() => ({
    displayName: profile.displayName || '',
    bio: profile.bio || '',
    socials: Object.fromEntries(SOCIAL_FIELDS.map((f) => [f.key, profile.socials?.[f.key] || ''])),
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const setSocial = (k) => (e) => setForm((f) => ({ ...f, socials: { ...f.socials, [k]: e.target.value } }))

  async function save(e) {
    e.preventDefault()
    setErrors({})
    setBusy(true)
    try {
      await api('/me', { method: 'PUT', token, body: form })
      await refresh()
      toast.success('Profile saved')
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])))
      toast.error('Couldn’t save', { body: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-card" onSubmit={save}>
      <h2>About you</h2>
      <Field label="Display name" hint="Shown next to your courses, jobs, orders and campaigns" error={errors.displayName}>
        <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} maxLength={60} />
      </Field>
      <Field label="Short bio" error={errors.bio}>
        <textarea rows={3} maxLength={500} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
      </Field>
      <h3>Social links</h3>
      <div className="social-fields">
        {SOCIAL_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} error={errors[`socials.${f.key}`]}>
            <input value={form.socials[f.key]} onChange={setSocial(f.key)} placeholder={f.placeholder} autoCapitalize="off" spellCheck={false} />
          </Field>
        ))}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}

function AccountMethods({ profile }) {
  const { isConnected } = useAccount()
  const { signIn, signingIn } = useAuth()
  const toast = useToast()
  const [addingEmail, setAddingEmail] = useState(false)

  return (
    <section className="form-card account-methods">
      <h2>Sign-in methods</h2>
      <div className="method">
        <span className="method-label">Email</span>
        {profile.email ? (
          <span className="method-value">{profile.email}</span>
        ) : addingEmail ? (
          <EmailForm cta="Send code" onDone={() => setAddingEmail(false)} />
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => setAddingEmail(true)}>
            Add email
          </button>
        )}
      </div>
      <div className="method">
        <span className="method-label">Wallet</span>
        {profile.wallet ? (
          <span className="method-value mono">{shortAddress(profile.wallet)}</span>
        ) : isConnected ? (
          <button
            className="btn btn-ghost btn-sm"
            disabled={signingIn}
            onClick={() => signIn().then(() => toast.success('Wallet linked')).catch((e) => toast.error('Couldn’t link the wallet', { body: friendlyError(e) }))}
          >
            {signingIn ? 'Check your wallet…' : 'Link connected wallet'}
          </button>
        ) : (
          <ConnectButton />
        )}
      </div>
      <p className="muted small">Both sign you in to the same account. A wallet is needed to pay or get paid on Arc.</p>
    </section>
  )
}

const STATUS_TEXT = { PENDING: 'Waiting for review', APPROVED: 'Live', REJECTED: 'Not approved' }

function MyCampaigns() {
  const { data } = useApi('/campaigns/mine', { auth: true })
  const list = data?.campaigns || []
  if (!list.length) return null
  return (
    <section className="form-card">
      <h2>Your campaigns</h2>
      <ul className="mini-list">
        {list.map((c) => (
          <li key={c.id}>
            <Link to={`/campaigns/${c.id}`}>{c.title}</Link>
            <span className={`status status-${c.status === 'APPROVED' ? 'done' : c.status === 'REJECTED' ? 'warn' : 'waiting'}`}>{STATUS_TEXT[c.status]}</span>
            {c.reviewNote && <span className="muted small">“{c.reviewNote}”</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
