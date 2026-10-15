import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { Field, SignInGate, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useChainTx } from '../hooks/useChainTx'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { escrow, usdc } from '../contracts'
import { network } from '../config/network'
import { formatUsdc, friendlyError, parseUsdc } from '../lib/format'
import { defaultDeadline } from '../lib/escrow'

export default function EscrowNew() {
  return (
    <div className="page">
      <SignInGate why="to hire with escrow">
        <Form />
      </SignInGate>
    </div>
  )
}

function Form() {
  const [params] = useSearchParams()
  const { address } = useAccount()
  const { token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { send, pending } = useChainTx()
  const meta = useApi('/orders/meta')
  const { data: feeBps } = useReadContract({ ...escrow, functionName: 'feeBps', query: { enabled: Boolean(escrow.address) } })
  const { data: balance } = useReadContract({ ...usdc, functionName: 'balanceOf', args: [address], query: { enabled: Boolean(address) } })

  const [form, setForm] = useState(() => ({
    provider: params.get('provider') || '',
    title: params.get('title') || '',
    category: 'Web development',
    description: '',
    criteria: ['', ''],
    amount: '',
    deadline: defaultDeadline(),
  }))
  const [errors, setErrors] = useState({})
  const [step, setStep] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setCriterion = (i) => (e) => setForm((f) => ({ ...f, criteria: f.criteria.map((c, j) => (j === i ? e.target.value : c)) }))

  if (meta.isLoading) return <Spinner label="Loading" />
  if (!escrow.address || !meta.data?.enabled) {
    return (
      <div className="gate">
        <h2>Escrow isn’t switched on yet</h2>
        <p>The escrow contract hasn’t been connected to this site. Check back soon.</p>
      </div>
    )
  }

  const units = safeParseUsdc(form.amount)
  const fee = units !== null && feeBps !== undefined ? (units * BigInt(feeBps)) / 10_000n : null
  const lowBalance = units !== null && balance !== undefined && balance < units

  async function submit(e) {
    e.preventDefault()
    setErrors({})
    const criteria = form.criteria.map((c) => c.trim()).filter(Boolean)
    let created
    try {
      setStep('Saving the agreement')
      created = await api('/orders', {
        method: 'POST',
        token,
        body: { ...form, criteria, deadline: new Date(form.deadline).toISOString() },
      })
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field.replace(/\.\d+$/, ''), d.message])))
      toast.error('Check the form', { body: err.message })
      setStep(null)
      return
    }
    const o = created.order
    try {
      const amount = BigInt(o.amountUnits)
      setStep('Approve the USDC in your wallet')
      await send({ ...usdc, functionName: 'approve', args: [escrow.address, amount] }, 'Approve USDC in your wallet')
      setStep('Confirm the escrow payment in your wallet')
      await send(
        { ...escrow, functionName: 'createOrder', args: [o.provider, amount, BigInt(o.deadlineUnix), o.specHash] },
        'Confirm the escrow payment',
      )
      toast.success('Payment locked in escrow', { body: 'The provider can now accept the job.' })
      navigate(`/escrow/${o.id}`)
    } catch (err) {
      toast.error('Payment wasn’t locked', { body: `${friendlyError(err)} Your agreement is saved; you can fund it from the order page.` })
      navigate(`/escrow/${o.id}`)
    } finally {
      setStep(null)
    }
  }

  const busy = Boolean(step || pending)

  return (
    <form className="editor escrow-form" onSubmit={submit}>
      <header className="page-head">
        <Link to="/escrow" className="player-back">
          Escrow orders
        </Link>
        <h1>Hire with escrow</h1>
        <p>
          Your USDC is locked in a smart contract, not sent to the provider. It’s released when SkillPay’s verifier agent
          confirms the work meets every criterion below, or when you approve it yourself.
        </p>
      </header>

      <ol className="escrow-explainer">
        <li>
          <strong>You lock the payment</strong>
          <span>Nobody can touch it, including SkillPay.</span>
        </li>
        <li>
          <strong>They deliver</strong>
          <span>The provider submits a link to the finished work.</span>
        </li>
        <li>
          <strong>The agent checks it</strong>
          <span>An AI agent on Arc compares the work to your criteria and pays out, or asks for changes.</span>
        </li>
      </ol>

      <section className="form-card">
        <h2>Who you’re hiring</h2>
        <Field label="Provider’s wallet address" hint="Ask them for their Arc wallet address (starts with 0x)" error={errors.provider}>
          <input value={form.provider} onChange={set('provider')} required pattern="^0x[a-fA-F0-9]{40}$" placeholder="0x…" spellCheck={false} />
        </Field>
      </section>

      <section className="form-card">
        <h2>The work</h2>
        <div className="field-row">
          <Field label="Title" error={errors.title}>
            <input value={form.title} onChange={set('title')} required minLength={4} maxLength={100} placeholder="Landing page for my bakery" />
          </Field>
          <Field label="Category" error={errors.category}>
            <select value={form.category} onChange={set('category')}>
              {meta.data.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description" hint="What you need and any context the provider should know." error={errors.description}>
          <textarea value={form.description} onChange={set('description')} required minLength={20} maxLength={6000} rows={5} />
        </Field>
        <fieldset className="criteria-edit">
          <legend>Acceptance criteria</legend>
          <p className="field-hint">
            The agent pays out only when every one of these is met, so make each one specific and checkable from a link,
            e.g. “The page has a contact form” rather than “It looks good”.
          </p>
          {form.criteria.map((c, i) => (
            <div key={i} className="criterion-row">
              <span className="criterion-num">{i + 1}</span>
              <input value={c} onChange={setCriterion(i)} required={i === 0} maxLength={300} aria-label={`Criterion ${i + 1}`} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setForm((f) => ({ ...f, criteria: f.criteria.filter((_, j) => j !== i) }))}
                disabled={form.criteria.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
          {errors.criteria && <span className="field-error">{errors.criteria}</span>}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setForm((f) => ({ ...f, criteria: [...f.criteria, ''] }))}
            disabled={form.criteria.length >= 12}
          >
            Add criterion
          </button>
        </fieldset>
      </section>

      <section className="form-card">
        <h2>Payment and deadline</h2>
        <div className="field-row">
          <Field label="Amount (USDC)" error={errors.amount}>
            <input inputMode="decimal" value={form.amount} onChange={set('amount')} required placeholder="50" />
          </Field>
          <Field label="Delivery deadline" hint="Your local time" error={errors.deadline}>
            <input type="datetime-local" value={form.deadline} onChange={set('deadline')} required />
          </Field>
        </div>
        {units !== null && fee !== null && (
          <p className="muted">
            The provider receives {formatUsdc(units - fee)} USDC when the work is approved; {formatUsdc(fee)} USDC goes to
            SkillPay. If they don’t deliver by the deadline, you get the full {formatUsdc(units)} USDC back.
          </p>
        )}
        {lowBalance && (
          <p className="pay-hint pay-hint-warn">
            Your wallet has {formatUsdc(balance)} USDC.{' '}
            {network.faucet ? (
              <a href={network.faucet} target="_blank" rel="noreferrer">
                Get test USDC
              </a>
            ) : (
              'Add USDC on Arc first.'
            )}
          </p>
        )}
      </section>

      <div className="form-actions sticky-actions">
        <Link to="/escrow" className="btn btn-ghost">
          Cancel
        </Link>
        <button className="btn btn-primary" disabled={busy || lowBalance}>
          {step || pending || (units ? `Lock ${formatUsdc(units)} USDC in escrow` : 'Lock payment in escrow')}
        </button>
      </div>
    </form>
  )
}

/** "12.5" -> 12500000n; empty or invalid input -> null */
function safeParseUsdc(value) {
  if (!value) return null
  try {
    return parseUsdc(value)
  } catch {
    return null
  }
}
