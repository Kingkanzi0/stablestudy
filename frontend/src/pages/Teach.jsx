import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { skillPay } from '../contracts'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useChainTx } from '../hooks/useChainTx'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { explorerTx } from '../config/network'
import { formatUsdc, friendlyError, parseUsdc, timeAgo, shortAddress } from '../lib/format'
import { CourseCover, EmptyState, ErrorState, Field, SignInGate, Spinner, TxLink } from '../components/common'

export default function Teach() {
  const { isConnected } = useAccount()
  return (
    <div className="page">
      {isConnected ? (
        <SignInGate why="to manage your courses">
          <TutorDashboard />
        </SignInGate>
      ) : (
        <TeachPitch />
      )}
    </div>
  )
}

function TeachPitch() {
  return (
    <section className="teach-pitch">
      <h1>Teach what you know. Get paid the second someone enrolls.</h1>
      <p>
        Publish a course, set your price in USDC, and keep 90% of every sale. Payments go straight from the student’s
        wallet to yours through the SkillPay contract on Arc, so there’s nothing to withdraw and no payout schedule.
      </p>
      <ul className="pitch-points">
        <li>Free to register as a tutor</li>
        <li>Prices from 0.01 to 10,000 USDC</li>
        <li>Every sale is a public, verifiable on-chain receipt</li>
      </ul>
      <p className="pay-hint">Connect your wallet at the top of the page to get started.</p>
    </section>
  )
}

function TutorDashboard() {
  const { address } = useAccount()
  const dash = useApi('/tutors/me/dashboard', { auth: true })
  const onchain = useReadContract({ ...skillPay, functionName: 'getTutor', args: [address] })
  const [editingProfile, setEditingProfile] = useState(false)

  if (dash.isLoading || onchain.isLoading) return <Spinner label="Loading your dashboard" />
  if (dash.error) return <ErrorState error={dash.error} onRetry={dash.refetch} />

  const profile = dash.data.tutor
  const chainTutor = onchain.data

  if (!profile || editingProfile) {
    return (
      <ProfileForm
        initial={profile}
        onSaved={() => {
          setEditingProfile(false)
          dash.refetch()
        }}
        onCancel={profile ? () => setEditingProfile(false) : null}
      />
    )
  }

  if (!chainTutor?.registered) {
    return <RegisterStep metadataURI={dash.data.metadataURI} onDone={() => onchain.refetch()} />
  }

  const { courses, recentSales } = dash.data
  return (
    <div className="dashboard">
      <header className="dash-head">
        <div>
          <h1>Hi, {profile.displayName}</h1>
          <p>
            {chainTutor.suspended
              ? 'Your tutor account is suspended. Contact SkillPay support.'
              : 'Here’s how your courses are doing.'}
          </p>
        </div>
        <div className="dash-actions">
          <button className="btn btn-ghost" onClick={() => setEditingProfile(true)}>
            Edit profile
          </button>
          <Link to="/teach/courses/new" className="btn btn-primary">
            New course
          </Link>
        </div>
      </header>

      <section className="dash-stats" aria-label="Your earnings">
        <div className="dash-stat dash-stat-earn">
          <span className="dash-stat-value">{formatUsdc(chainTutor.totalEarned)} USDC</span>
          <span className="dash-stat-label">earned, already in your wallet</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-value">{chainTutor.totalStudents}</span>
          <span className="dash-stat-label">enrollments</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-value">{chainTutor.courseCount}</span>
          <span className="dash-stat-label">courses published</span>
        </div>
      </section>

      <section>
        <h2>Your courses</h2>
        {courses.length === 0 ? (
          <EmptyState
            title="You haven’t created a course yet"
            action={
              <Link to="/teach/courses/new" className="btn btn-primary">
                Create your first course
              </Link>
            }
          >
            Write your lessons first. You’ll set the price when you publish.
          </EmptyState>
        ) : (
          <ul className="manage-list">
            {courses.map((c) => (
              <CourseRow key={c.id} course={c} onChange={dash.refetch} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Recent sales</h2>
        {recentSales.length === 0 ? (
          <p className="muted">Sales show up here the moment a student pays.</p>
        ) : (
          <table className="sales">
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Student</th>
                <th scope="col">You received</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((s) => (
                <tr key={s.id}>
                  <td>{s.course.title}</td>
                  <td>{shortAddress(s.student)}</td>
                  <td>
                    <TxLink hash={s.txHash}>{s.tutorAmount} USDC</TxLink>
                  </td>
                  <td>{timeAgo(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function ProfileForm({ initial, onSaved, onCancel }) {
  const { token } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({
    displayName: initial?.displayName && !initial.displayName.includes('…') ? initial.displayName : '',
    headline: initial?.headline || '',
    bio: initial?.bio || '',
    avatarUrl: initial?.avatarUrl || '',
    website: initial?.website || '',
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      await api('/tutors/me', { method: 'PUT', body: form, token })
      toast.success('Profile saved')
      onSaved()
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])))
      toast.error('Couldn’t save your profile', { body: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <h1>{initial ? 'Edit your profile' : 'Set up your tutor profile'}</h1>
      <p className="muted">Students see this on your courses. You can change it any time.</p>
      <Field label="Display name" error={errors.displayName}>
        <input value={form.displayName} onChange={set('displayName')} required minLength={2} maxLength={60} />
      </Field>
      <Field label="Headline" hint="One line about what you teach" error={errors.headline}>
        <input value={form.headline} onChange={set('headline')} maxLength={120} placeholder="Smart contract engineer, 5 years with Solidity" />
      </Field>
      <Field label="About you" error={errors.bio}>
        <textarea value={form.bio} onChange={set('bio')} rows={4} maxLength={2000} />
      </Field>
      <Field label="Photo URL" hint="Optional link to a square image" error={errors.avatarUrl}>
        <input type="url" value={form.avatarUrl} onChange={set('avatarUrl')} placeholder="https://" />
      </Field>
      <Field label="Website or social link" error={errors.website}>
        <input type="url" value={form.website} onChange={set('website')} placeholder="https://" />
      </Field>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save profile' : 'Save and continue'}
        </button>
      </div>
    </form>
  )
}

function RegisterStep({ metadataURI, onDone }) {
  const { send, pending } = useChainTx()
  const toast = useToast()

  async function register() {
    try {
      const { hash } = await send({ ...skillPay, functionName: 'registerTutor', args: [metadataURI] }, 'Confirm in your wallet')
      toast.success('You’re registered as a tutor', { href: explorerTx(hash) })
      onDone()
    } catch (e) {
      toast.error('Registration didn’t go through', { body: friendlyError(e) })
    }
  }

  return (
    <div className="gate">
      <h2>Register your wallet as a tutor</h2>
      <p>
        This records your wallet as a tutor in the SkillPay contract, so students’ payments can reach you. It’s free
        apart from a network fee of well under a cent.
      </p>
      <button className="btn btn-primary" onClick={register} disabled={Boolean(pending)}>
        {pending || 'Register as a tutor'}
      </button>
    </div>
  )
}

function CourseRow({ course, onChange }) {
  const { send, pending } = useChainTx()
  const toast = useToast()
  const [mode, setMode] = useState(null) // 'publish' | 'price'
  const [price, setPrice] = useState(course.price || '')
  const [priceError, setPriceError] = useState(null)
  const isDraft = course.status === 'DRAFT'

  async function run(request, success) {
    try {
      const { hash } = await send(request)
      toast.success(success, { href: explorerTx(hash) })
      setMode(null)
      onChange()
    } catch (e) {
      toast.error('Transaction didn’t go through', { body: friendlyError(e) })
    }
  }

  function submitPrice(e) {
    e.preventDefault()
    let units
    try {
      units = parseUsdc(price)
      if (units < 10_000n || units > 10_000_000_000n) throw new Error('Price must be between 0.01 and 10,000 USDC')
    } catch (err) {
      setPriceError(err.message)
      return
    }
    setPriceError(null)
    if (isDraft) {
      run({ ...skillPay, functionName: 'createCourse', args: [units, course.metadataURI] }, 'Course published')
    } else {
      run(
        { ...skillPay, functionName: 'updateCourse', args: [BigInt(course.onchainId), units, course.active, course.metadataURI] },
        'Price updated',
      )
    }
  }

  function toggleVisibility() {
    run(
      {
        ...skillPay,
        functionName: 'updateCourse',
        args: [BigInt(course.onchainId), BigInt(course.priceUnits), !course.active, course.metadataURI],
      },
      course.active ? 'Course hidden from new students' : 'Course is live again',
    )
  }

  const status = isDraft ? 'Draft' : course.active ? 'Live' : 'Hidden'

  return (
    <li className="manage-item">
      <CourseCover course={course} size="sm" />
      <div className="manage-body">
        <h3>
          {course.title} <span className={`status status-${status.toLowerCase()}`}>{status}</span>
        </h3>
        <p className="muted">
          {isDraft
            ? `${course.lessonCount} lessons, not published yet`
            : `${course.price} USDC, ${course.enrollmentCount} ${course.enrollmentCount === 1 ? 'student' : 'students'}`}
        </p>

        {mode && (
          <form className="price-form" onSubmit={submitPrice}>
            <label>
              <span>Price in USDC</span>
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="2.50"
                autoFocus
                aria-invalid={Boolean(priceError)}
              />
            </label>
            <button className="btn btn-primary" disabled={Boolean(pending)}>
              {pending || (isDraft ? 'Publish on Arc' : 'Save price')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode(null)} disabled={Boolean(pending)}>
              Cancel
            </button>
            {priceError && <p className="field-error">{priceError}</p>}
            {isDraft && !priceError && (
              <p className="muted small">You’ll receive 90% of this price for every enrollment.</p>
            )}
          </form>
        )}
      </div>
      {!mode && (
        <div className="manage-actions">
          {isDraft ? (
            <button className="btn btn-primary" onClick={() => setMode('publish')}>
              Publish
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setMode('price')} disabled={Boolean(pending)}>
                Change price
              </button>
              <button className="btn btn-ghost" onClick={toggleVisibility} disabled={Boolean(pending)}>
                {pending || (course.active ? 'Hide' : 'Show')}
              </button>
            </>
          )}
          <Link to={`/teach/courses/${course.id}/edit`} className="btn btn-ghost">
            Edit lessons
          </Link>
          {!isDraft && (
            <Link to={`/courses/${course.id}`} className="btn btn-ghost">
              View
            </Link>
          )}
        </div>
      )}
    </li>
  )
}
