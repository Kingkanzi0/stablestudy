import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, Field, SignInGate, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'

const FALLBACK = {
  types: ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Bounty'],
  categories: ['Engineering', 'Smart Contracts', 'Design', 'Product', 'Marketing & Growth', 'Community', 'Content & Education', 'Research', 'Operations', 'Other'],
  payUnits: ['hour', 'month', 'year', 'project'],
}

export default function JobEditor() {
  return (
    <div className="page">
      <SignInGate why="to post a job">
        <Loader />
      </SignInGate>
    </div>
  )
}

function Loader() {
  const { id } = useParams()
  const meta = useApi('/jobs/meta')
  const existing = useApi(id ? `/jobs/${id}` : null, { auth: true })
  if (meta.isLoading || (id && existing.isLoading)) return <Spinner label="Loading" />
  if (id && existing.error) return <ErrorState error={existing.error} />
  return <Editor initial={id ? existing.data.job : null} meta={meta.data || FALLBACK} />
}

function Editor({ initial, meta }) {
  const { token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [form, setForm] = useState({
    title: initial?.title || '',
    company: initial?.company || '',
    companyUrl: initial?.companyUrl || '',
    location: initial?.location || 'Remote',
    type: initial?.type || meta.types[0],
    category: initial?.category || meta.categories[0],
    payMin: initial?.payMin ?? '',
    payMax: initial?.payMax ?? '',
    payUnit: initial?.payUnit || 'month',
    description: initial?.description || '',
    applyUrl: initial?.applyUrl?.replace(/^mailto:/, '') || '',
    tags: (initial?.tags || []).join(', '),
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    const hasPay = form.payMin !== '' || form.payMax !== ''
    const body = {
      ...form,
      payMin: form.payMin === '' ? undefined : Number(form.payMin),
      payMax: form.payMax === '' ? undefined : Number(form.payMax),
      payUnit: hasPay ? form.payUnit : undefined,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
    }
    try {
      const { job } = initial
        ? await api(`/jobs/${initial.id}`, { method: 'PUT', body, token })
        : await api('/jobs', { method: 'POST', body, token })
      toast.success(initial ? 'Job updated' : 'Job posted')
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])))
      toast.error('Couldn’t save the job', { body: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="editor" onSubmit={submit}>
      <header className="page-head">
        <Link to="/jobs" className="player-back">
          Jobs
        </Link>
        <h1>{initial ? 'Edit job' : 'Post a Web3 job'}</h1>
        <p>Free to post. Your listing stays up until you close it.</p>
      </header>

      <section className="form-card">
        <h2>The role</h2>
        <Field label="Job title" error={errors.title}>
          <input value={form.title} onChange={set('title')} required minLength={4} maxLength={100} placeholder="Senior Solidity engineer" />
        </Field>
        <div className="field-row">
          <Field label="Type" error={errors.type}>
            <select value={form.type} onChange={set('type')}>
              {meta.types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Category" error={errors.category}>
            <select value={form.category} onChange={set('category')}>
              {meta.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Location" hint="e.g. Remote, Lagos, Remote (EU)" error={errors.location}>
            <input value={form.location} onChange={set('location')} required minLength={2} maxLength={80} />
          </Field>
        </div>
        <Field
          label="Description"
          hint="What the person will do, what you’re looking for, and how you work. Separate paragraphs with a blank line."
          error={errors.description}
        >
          <textarea value={form.description} onChange={set('description')} required minLength={40} maxLength={8000} rows={8} />
        </Field>
        <Field label="Skills" hint="Comma separated, up to 8" error={errors.tags}>
          <input value={form.tags} onChange={set('tags')} placeholder="Solidity, viem, React" />
        </Field>
      </section>

      <section className="form-card">
        <h2>Pay</h2>
        <p className="muted">Optional, but jobs with pay listed get more applicants.</p>
        <div className="field-row">
          <Field label="From (USDC)" error={errors.payMin}>
            <input type="number" min={0} inputMode="numeric" value={form.payMin} onChange={set('payMin')} placeholder="3000" />
          </Field>
          <Field label="To (USDC)" error={errors.payMax}>
            <input type="number" min={0} inputMode="numeric" value={form.payMax} onChange={set('payMax')} placeholder="5000" />
          </Field>
          <Field label="Per" error={errors.payUnit}>
            <select value={form.payUnit} onChange={set('payUnit')}>
              {meta.payUnits.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="form-card">
        <h2>Company and applying</h2>
        <div className="field-row">
          <Field label="Company or project" error={errors.company}>
            <input value={form.company} onChange={set('company')} required minLength={2} maxLength={80} />
          </Field>
          <Field label="Company website" hint="Optional" error={errors.companyUrl}>
            <input type="url" value={form.companyUrl} onChange={set('companyUrl')} placeholder="https://" />
          </Field>
        </div>
        <Field label="How to apply" hint="An application link or an email address" error={errors.applyUrl}>
          <input value={form.applyUrl} onChange={set('applyUrl')} required placeholder="https://jobs.example.com/123 or hiring@example.com" />
        </Field>
      </section>

      <div className="form-actions sticky-actions">
        <Link to="/jobs" className="btn btn-ghost">
          Cancel
        </Link>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Post job'}
        </button>
      </div>
    </form>
  )
}
