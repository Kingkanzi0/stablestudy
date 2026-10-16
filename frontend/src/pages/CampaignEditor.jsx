import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AccountGate, ErrorState, Field, Spinner } from '../components/common'
import CampaignLogo from '../components/CampaignLogo'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { squareImage } from '../lib/images'
import { COST_LABEL, TYPE_LABEL } from '../lib/campaigns'
import { toLocalInput } from '../lib/escrow'
import { friendlyError } from '../lib/format'

export default function CampaignEditor() {
  return (
    <div className="page">
      <AccountGate why="to list a campaign">
        <Loader />
      </AccountGate>
    </div>
  )
}

function Loader() {
  const { id } = useParams()
  const existing = useApi(id ? `/campaigns/${id}` : null, { auth: true, enabled: Boolean(id) })
  if (id && existing.isLoading) return <Spinner label="Loading campaign" />
  if (id && existing.error) return <ErrorState error={existing.error} onRetry={existing.refetch} />
  return <Form key={id || 'new'} initial={existing.data?.campaign} />
}

const blankStep = () => ({ title: '', details: '', url: '' })

function Form({ initial }) {
  const { token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const [form, setForm] = useState(() => ({
    projectName: initial?.projectName || '',
    title: initial?.title || '',
    logoId: initial?.logoId || '',
    logoUrl: initial?.logoUrl || null,
    summary: initial?.summary || '',
    description: initial?.description || '',
    type: initial?.type || 'AIRDROP',
    reward: initial?.reward || '',
    cost: initial?.cost || 'FREE',
    chain: initial?.chain || 'Arc',
    startsAt: initial?.startsAt ? toLocalInput(new Date(initial.startsAt)) : '',
    endsAt: initial?.endsAt ? toLocalInput(new Date(initial.endsAt)) : '',
    websiteUrl: initial?.websiteUrl || '',
    xUrl: initial?.xUrl || '',
    discordUrl: initial?.discordUrl || '',
    telegramUrl: initial?.telegramUrl || '',
    steps: initial?.steps?.length ? initial.steps.map((s) => ({ ...blankStep(), ...s, url: s.url || '' })) : [blankStep(), blankStep()],
    tags: (initial?.tags || []).join(', '),
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setStep = (i, k) => (e) => setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, [k]: e.target.value } : s)) }))

  async function uploadLogo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const image = await squareImage(file, 256)
      const { id, url } = await api('/images', { method: 'POST', token, body: { image } })
      setForm((f) => ({ ...f, logoId: id, logoUrl: url }))
    } catch (err) {
      toast.error('Couldn’t upload the logo', { body: friendlyError(err) })
    } finally {
      setUploading(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setErrors({})
    setBusy(true)
    const body = {
      ...form,
      logoUrl: undefined,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '',
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '',
      steps: form.steps.filter((s) => s.title.trim() || s.details.trim() || s.url.trim()),
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6),
    }
    try {
      const { campaign } = initial
        ? await api(`/campaigns/${initial.id}`, { method: 'PUT', token, body })
        : await api('/campaigns', { method: 'POST', token, body })
      toast.success(campaign.status === 'APPROVED' ? 'Campaign is live' : 'Sent for review', {
        body: campaign.status === 'APPROVED' ? undefined : 'You’ll see it go live once an iSabi admin approves it.',
      })
      navigate(`/campaigns/${campaign.id}`)
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field.replace(/^steps\.(\d+)\..*/, 'steps'), d.message])))
      toast.error('Check the form', { body: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="editor" onSubmit={submit}>
      <header className="page-head">
        <Link to="/campaigns" className="player-back">
          Campaigns
        </Link>
        <h1>{initial ? 'Edit campaign' : 'List a campaign'}</h1>
        <p>
          Share an airdrop, testnet, quest or incentive programme with people on iSabi. Listings are free and go live after
          a quick review{initial ? '; edits are reviewed again' : ''}.
        </p>
      </header>

      <section className="form-card">
        <h2>The project</h2>
        <div className="logo-field">
          <button type="button" className="avatar-button" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label="Upload project logo">
            <CampaignLogo campaign={{ projectName: form.projectName || '?', logoUrl: form.logoUrl }} size={72} />
            <span className="avatar-badge" aria-hidden="true">
              {uploading ? '…' : '✎'}
            </span>
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={uploadLogo} />
          <span className="field-hint">Square logo works best. We resize it for you.</span>
        </div>
        <div className="field-row">
          <Field label="Project name" error={errors.projectName}>
            <input value={form.projectName} onChange={set('projectName')} required minLength={2} maxLength={60} />
          </Field>
          <Field label="Chain" error={errors.chain}>
            <select value={form.chain} onChange={set('chain')}>
              <option>Arc</option>
              <option>Multi-chain</option>
              <option>Other EVM</option>
            </select>
          </Field>
        </div>
        <div className="field-row">
          <Field label="Website" error={errors.websiteUrl}>
            <input type="url" value={form.websiteUrl} onChange={set('websiteUrl')} required placeholder="https://" />
          </Field>
          <Field label="X (optional)" error={errors.xUrl}>
            <input type="url" value={form.xUrl} onChange={set('xUrl')} placeholder="https://x.com/…" />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Discord (optional)" error={errors.discordUrl}>
            <input type="url" value={form.discordUrl} onChange={set('discordUrl')} placeholder="https://discord.gg/…" />
          </Field>
          <Field label="Telegram (optional)" error={errors.telegramUrl}>
            <input type="url" value={form.telegramUrl} onChange={set('telegramUrl')} placeholder="https://t.me/…" />
          </Field>
        </div>
      </section>

      <section className="form-card">
        <h2>The campaign</h2>
        <Field label="Title" error={errors.title}>
          <input value={form.title} onChange={set('title')} required minLength={4} maxLength={100} placeholder="Testnet season 1" />
        </Field>
        <Field label="One-line summary" hint="Shown in the list" error={errors.summary}>
          <input value={form.summary} onChange={set('summary')} required minLength={10} maxLength={200} />
        </Field>
        <div className="field-row">
          <Field label="Type" error={errors.type}>
            <select value={form.type} onChange={set('type')}>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cost to take part" error={errors.cost}>
            <select value={form.cost} onChange={set('cost')}>
              {Object.entries(COST_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Reward" hint="E.g. “50,000 USDC pool”, “Points toward the airdrop”, “NFT + whitelist”" error={errors.reward}>
          <input value={form.reward} onChange={set('reward')} required minLength={2} maxLength={120} />
        </Field>
        <div className="field-row">
          <Field label="Starts (optional)" hint="Your local time" error={errors.startsAt}>
            <input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
          </Field>
          <Field label="Ends (optional)" error={errors.endsAt}>
            <input type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
          </Field>
        </div>
        <Field label="Description" hint="What the campaign is, who it’s for and how rewards are decided" error={errors.description}>
          <textarea rows={6} value={form.description} onChange={set('description')} required minLength={20} maxLength={6000} />
        </Field>
        <Field label="Tags (optional)" hint="Comma separated, up to 6" error={errors.tags}>
          <input value={form.tags} onChange={set('tags')} placeholder="defi, testnet, nft" />
        </Field>
      </section>

      <section className="form-card">
        <h2>How to take part</h2>
        <p className="field-hint">The step-by-step guide people follow. Add a link to each step where they need to go.</p>
        {errors.steps && <span className="field-error">{errors.steps}</span>}
        <ol className="steps-edit">
          {form.steps.map((s, i) => (
            <li key={i} className="step-edit">
              <div className="step-edit-head">
                <span className="criterion-num">{i + 1}</span>
                <input value={s.title} onChange={setStep(i, 'title')} required={i === 0} maxLength={120} placeholder="E.g. Get test USDC from the faucet" aria-label={`Step ${i + 1} title`} />
              </div>
              <textarea rows={2} value={s.details} onChange={setStep(i, 'details')} maxLength={1000} placeholder="Details (optional)" aria-label={`Step ${i + 1} details`} />
              <div className="step-edit-foot">
                <input type="url" value={s.url} onChange={setStep(i, 'url')} placeholder="https:// link (optional)" aria-label={`Step ${i + 1} link`} />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={form.steps.length === 1}
                  onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-ghost btn-sm" disabled={form.steps.length >= 15} onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, blankStep()] }))}>
          Add step
        </button>
      </section>

      <div className="form-actions sticky-actions">
        <Link to="/campaigns" className="btn btn-ghost">
          Cancel
        </Link>
        <button className="btn btn-primary" disabled={busy || uploading}>
          {busy ? 'Sending…' : initial ? 'Save changes' : 'Submit for review'}
        </button>
      </div>
    </form>
  )
}
