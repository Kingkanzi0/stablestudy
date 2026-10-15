import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useReadContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorState, Field, SignInGate, Spinner, TxLink } from '../components/common'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useChainTx } from '../hooks/useChainTx'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { escrow, usdc } from '../contracts'
import { explorerAddress, explorerTx } from '../config/network'
import { friendlyError, shortAddress, timeAgo } from '../lib/format'
import {
  EVENT_LABEL,
  ONCHAIN_STATUS,
  STAGES,
  STATUS_LABEL,
  STATUS_TONE,
  formatDateTime,
  nowMs,
  stageIndex,
  timeLeft,
} from '../lib/escrow'

const AMOUNT_NOTE = {
  DRAFT: 'not locked yet',
  RELEASED: 'paid to the provider',
  RESOLVED: 'settled by the arbiter',
  REFUNDED: 'refunded to the client',
  CANCELLED: 'refunded to the client',
}

export default function EscrowOrder() {
  return (
    <div className="page">
      <SignInGate why="to open this order">
        <Order />
      </SignInGate>
    </div>
  )
}

function Order() {
  const { id } = useParams()
  const detail = useApi(`/orders/${id}`, { auth: true })
  const onchainId = detail.data?.order.onchainId
  const chain = useReadContract({
    ...escrow,
    functionName: 'getOrder',
    args: [BigInt(onchainId ?? 0)],
    query: { enabled: Boolean(escrow.address && onchainId), refetchInterval: 15_000 },
  })

  if (detail.isLoading) return <Spinner label="Loading order" />
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.refetch} />

  const { order, deliveries, verdicts, events } = detail.data
  // The contract is the source of truth for status and timings; the API adds the human-readable parts.
  const c = chain.data
  const status = c ? ONCHAIN_STATUS[Number(c.status)] : order.status
  const reviewEnds = c && Number(c.reviewEnds) ? new Date(Number(c.reviewEnds) * 1000) : order.reviewEnds && new Date(order.reviewEnds)
  const deliveryCount = c ? Number(c.deliveries) : deliveries.filter((d) => d.submitted).length
  const deadline = new Date(order.deadline)
  const view = { ...order, status, reviewEnds, deliveryCount, deadline }
  const refresh = () => {
    detail.refetch()
    chain.refetch()
  }

  return (
    <div className="order-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/escrow">Escrow orders</Link>
        <span aria-hidden="true">/</span>
        <span>{order.onchainId ? `Order #${order.onchainId}` : 'Draft'}</span>
      </nav>

      <header className="order-head">
        <div>
          <span className={`status status-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
          <h1>{order.title}</h1>
          <p className="muted">
            {order.role === 'client' ? 'You hired ' : 'You were hired by '}
            <AddressLink address={order.role === 'client' ? order.provider : order.client} />. {order.category}.
          </p>
        </div>
        <div className="order-amount">
          <span className="pay-price">
            {order.amount} <span>USDC</span>
          </span>
          <span className="muted small">{AMOUNT_NOTE[status] || 'locked in escrow'}</span>
        </div>
      </header>

      <Stages status={status} />

      <div className="course-layout">
        <div className="course-main">
          <ActionPanel view={view} deliveries={deliveries} onDone={refresh} />

          {verdicts.length > 0 && (
            <section>
              <h2>Verifier agent’s reports</h2>
              {verdicts.map((v) => (
                <Report key={v.id} verdict={v} />
              ))}
            </section>
          )}

          <section>
            <h2>The agreement</h2>
            <div className="prose">
              {order.description.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <h3>Acceptance criteria</h3>
            <ol className="outline">
              {order.criteria.map((c) => (
                <li key={c}>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
            <p className="onchain-note">
              Spec fingerprint <code className="hash">{order.specHash}</code>. This hash is recorded in the escrow contract,
              so neither side can change the agreement after funding.
            </p>
          </section>

          {deliveries.length > 0 && (
            <section>
              <h2>Deliveries</h2>
              <ul className="delivery-list">
                {deliveries.map((d) => (
                  <li key={d.id}>
                    <strong>{d.submitted ? `Delivery ${d.number}` : 'Delivery (not submitted on-chain)'}</strong>{' '}
                    <span className="muted small">{timeAgo(d.createdAt)}</span>
                    <p>
                      <a href={d.url} target="_blank" rel="noreferrer nofollow">
                        {d.url}
                      </a>
                    </p>
                    <p className="delivery-notes">{d.notes}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="pay-panel order-side">
          <dl className="pay-breakdown">
            <div>
              <dt>Client</dt>
              <dd>
                <AddressLink address={order.client} />
              </dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>
                <AddressLink address={order.provider} />
              </dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>
                {formatDateTime(deadline)} <span className="muted small">({timeLeft(deadline)})</span>
              </dd>
            </div>
            {reviewEnds && status === 'DELIVERED' && (
              <div>
                <dt>Review ends</dt>
                <dd>
                  {formatDateTime(reviewEnds)} <span className="muted small">({timeLeft(reviewEnds)})</span>
                </dd>
              </div>
            )}
            <div>
              <dt>Deliveries used</dt>
              <dd>{deliveryCount} of 3</dd>
            </div>
            {order.verifier && (
              <div>
                <dt>Verifier agent</dt>
                <dd>
                  <AddressLink address={order.verifier} />
                </dd>
              </div>
            )}
          </dl>
          <h3 className="timeline-title">Timeline</h3>
          {events.length === 0 ? (
            <p className="muted small">Nothing on-chain yet.</p>
          ) : (
            <ol className="timeline">
              {events.map((e) => (
                <li key={`${e.txHash}-${e.type}`}>
                  <span>{EVENT_LABEL[e.type] || e.type}</span>
                  <TxLink hash={e.txHash}>{timeAgo(e.at)}</TxLink>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  )
}

function AddressLink({ address }) {
  const href = explorerAddress(address)
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {shortAddress(address)}
    </a>
  ) : (
    shortAddress(address)
  )
}

function Stages({ status }) {
  if (['CANCELLED', 'REFUNDED'].includes(status)) return null
  const current = stageIndex(status)
  return (
    <ol className="stages" aria-label="Order progress">
      {STAGES.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="stage-dot" aria-hidden="true" />
          {s}
        </li>
      ))}
    </ol>
  )
}

function Report({ verdict }) {
  return (
    <article className={`report ${verdict.approved ? 'report-pass' : 'report-fail'}`}>
      <header>
        <strong>
          Delivery {verdict.deliveryNumber}: {verdict.approved ? 'approved' : 'changes needed'}
        </strong>
        <span className="muted small">
          {verdict.model ? `${verdict.model}, ` : ''}
          {timeAgo(verdict.createdAt)}
        </span>
      </header>
      <p>{verdict.summary}</p>
      <ul className="checks">
        {verdict.checks.map((c, i) => (
          <li key={i} className={c.met ? 'met' : 'unmet'}>
            <span className="check-mark" aria-label={c.met ? 'Met' : 'Not met'}>
              {c.met ? '✓' : '✕'}
            </span>
            <span>
              <strong>{c.criterion}</strong>
              <span className="check-note">{c.note}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        {verdict.onchain ? (
          <>
            Signed on Arc by the agent. <TxLink hash={verdict.txHash}>View transaction</TxLink>
          </>
        ) : (
          'Waiting for the agent to sign this on-chain.'
        )}
      </p>
    </article>
  )
}

function ActionPanel({ view, deliveries, onDone }) {
  const { token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { send, pending } = useChainTx()
  const [delivery, setDelivery] = useState({ url: '', notes: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(null)
  const [confirmDispute, setConfirmDispute] = useState(false)
  const now = nowMs()
  const isClient = view.role === 'client'
  const isProvider = view.role === 'provider'
  const id = view.onchainId ? BigInt(view.onchainId) : null
  const pastDeadline = now > view.deadline.getTime()
  const reviewOver = view.reviewEnds && now > view.reviewEnds.getTime()

  async function tx(request, success, label) {
    try {
      const { hash } = await send(request, label)
      toast.success(success, { href: explorerTx(hash) })
      await queryClient.invalidateQueries()
      onDone()
    } catch (e) {
      toast.error('Transaction didn’t go through', { body: friendlyError(e) })
    }
  }

  async function fund() {
    try {
      const amount = BigInt(view.amountUnits)
      await send({ ...usdc, functionName: 'approve', args: [escrow.address, amount] }, 'Approve USDC in your wallet')
      await tx(
        { ...escrow, functionName: 'createOrder', args: [view.provider, amount, BigInt(view.deadlineUnix), view.specHash] },
        'Payment locked in escrow',
        'Confirm the escrow payment',
      )
    } catch (e) {
      toast.error('Payment wasn’t locked', { body: friendlyError(e) })
    }
  }

  async function deleteDraft() {
    try {
      await api(`/orders/${view.id}`, { method: 'DELETE', token })
      toast.success('Draft deleted')
      navigate('/escrow')
    } catch (e) {
      toast.error('Couldn’t delete the draft', { body: e.message })
    }
  }

  async function submitDelivery(e) {
    e.preventDefault()
    setErrors({})
    setBusy('Saving your delivery')
    try {
      const { delivery: d } = await api(`/orders/${view.id}/deliveries`, { method: 'POST', token, body: delivery })
      setBusy(null)
      await tx(
        { ...escrow, functionName: 'submitDelivery', args: [id, d.deliveryHash] },
        'Delivery submitted. The verifier agent will review it.',
        'Confirm the delivery in your wallet',
      )
      setDelivery({ url: '', notes: '' })
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((x) => [x.field, x.message])))
      toast.error('Couldn’t save the delivery', { body: err.message })
    } finally {
      setBusy(null)
    }
  }

  const disabled = Boolean(pending || busy)
  const s = view.status
  const actions = []
  let message = null

  if (s === 'DRAFT' && isClient) {
    message = 'This agreement is saved but the payment isn’t locked yet.'
    actions.push(
      <button key="fund" className="btn btn-primary" onClick={fund} disabled={disabled}>
        {pending || `Lock ${view.amount} USDC in escrow`}
      </button>,
      <button key="del" className="btn btn-ghost" onClick={deleteDraft} disabled={disabled}>
        Delete draft
      </button>,
    )
  }
  if (s === 'FUNDED') {
    if (isProvider && !pastDeadline) {
      message = 'The client has locked the payment. Accept to start, or decline to refund them.'
      actions.push(
        <button key="acc" className="btn btn-primary" disabled={disabled} onClick={() => tx({ ...escrow, functionName: 'accept', args: [id] }, 'Job accepted')}>
          {pending || 'Accept the job'}
        </button>,
        <button key="dec" className="btn btn-ghost" disabled={disabled} onClick={() => tx({ ...escrow, functionName: 'decline', args: [id] }, 'Job declined; client refunded')}>
          Decline
        </button>,
      )
    }
    if (isClient) {
      message = 'Waiting for the provider to accept. You can cancel for a full refund until they do.'
      actions.push(
        <button key="can" className="btn btn-ghost" disabled={disabled} onClick={() => tx({ ...escrow, functionName: 'cancel', args: [id] }, 'Order cancelled and refunded')}>
          {pending || 'Cancel and refund'}
        </button>,
      )
    }
  }
  if (s === 'ACCEPTED' && isClient) message = 'The provider is working on it. You’ll see their delivery here.'
  if (s === 'DELIVERED') {
    message = isClient
      ? 'The verifier agent is reviewing the delivery against your criteria. You can also approve it yourself.'
      : 'The verifier agent is reviewing your delivery.'
    if (isClient) {
      actions.push(
        <button key="app" className="btn btn-primary" disabled={disabled} onClick={() => tx({ ...escrow, functionName: 'approve', args: [id] }, 'Payment released to the provider')}>
          {pending || 'Approve and release payment'}
        </button>,
      )
    }
    if (isProvider && reviewOver) {
      message = 'Nobody reviewed your delivery in time, so you can claim the payment.'
      actions.push(
        <button key="claim" className="btn btn-primary" disabled={disabled} onClick={() => tx({ ...escrow, functionName: 'claimAfterReview', args: [id] }, 'Payment claimed')}>
          {pending || 'Claim payment'}
        </button>,
      )
    }
  }
  if (s === 'REJECTED') {
    message = isClient
      ? 'The agent found criteria that aren’t met yet. The provider can send a revision, or you can approve anyway.'
      : 'The agent found criteria that aren’t met yet. Read its report, then send a revision.'
    if (isClient) {
      actions.push(
        <button key="app" className="btn btn-primary" disabled={disabled} onClick={() => tx({ ...escrow, functionName: 'approve', args: [id] }, 'Payment released to the provider')}>
          {pending || 'Approve anyway'}
        </button>,
      )
    }
  }
  // Disputes freeze the order until a human arbiter steps in, so they take a deliberate second click.
  const canDispute = (s === 'DELIVERED' || s === 'REJECTED') && (isClient || isProvider)
  if (isClient && pastDeadline && ['FUNDED', 'ACCEPTED', 'REJECTED'].includes(s)) {
    message = 'The deadline passed without an approved delivery. You can take your payment back.'
    actions.unshift(
      <button key="ref" className="btn btn-primary" disabled={disabled} onClick={() => tx({ ...escrow, functionName: 'refundExpired', args: [id] }, 'Payment refunded')}>
        {pending || 'Refund my payment'}
      </button>,
    )
  }
  if (s === 'DISPUTED') message = 'A SkillPay arbiter will review both sides and split the payment fairly. Funds stay locked until then.'
  if (s === 'RELEASED') message = 'Done. The provider has been paid.'
  if (s === 'REFUNDED' || s === 'CANCELLED') message = 'This order is closed and the client has been refunded.'
  if (s === 'RESOLVED') message = 'The arbiter settled this order.'

  const canDeliver = isProvider && (s === 'ACCEPTED' || s === 'REJECTED') && !pastDeadline && view.deliveryCount < 3
  const lastDraft = deliveries.find((d) => !d.submitted)

  return (
    <section className="action-panel">
      {message && <p className="action-message">{message}</p>}
      {actions.length > 0 && <div className="action-buttons">{actions}</div>}
      {canDeliver && (
        <form className="delivery-form" onSubmit={submitDelivery}>
          <h3>{view.deliveryCount === 0 ? 'Submit your delivery' : `Submit revision ${view.deliveryCount + 1} of 3`}</h3>
          <Field label="Link to the work" hint="A live site, repo, document or file link the agent can open without logging in" error={errors.url}>
            <input type="url" required value={delivery.url} onChange={(e) => setDelivery((d) => ({ ...d, url: e.target.value }))} placeholder="https://" />
          </Field>
          <Field label="Notes for the reviewer" hint="Explain how the work meets each criterion" error={errors.notes}>
            <textarea required minLength={10} rows={4} value={delivery.notes} onChange={(e) => setDelivery((d) => ({ ...d, notes: e.target.value }))} />
          </Field>
          {lastDraft && <p className="muted small">An earlier delivery was saved but not submitted on-chain; submitting again replaces it.</p>}
          <button className="btn btn-primary" disabled={disabled}>
            {busy || pending || 'Submit delivery'}
          </button>
        </form>
      )}
      {canDispute && (
        <div className="dispute-zone">
          {confirmDispute ? (
            <>
              <p className="muted small">
                A dispute stops the escrow until a SkillPay arbiter decides how to split the payment. No more revisions or
                approvals can happen in the meantime. Only do this if you can’t agree.
              </p>
              <div className="action-buttons">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={disabled}
                  onClick={() => tx({ ...escrow, functionName: 'dispute', args: [id] }, 'Sent to the arbiter')}
                >
                  {pending || 'Yes, open a dispute'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDispute(false)} disabled={disabled}>
                  Keep working on it
                </button>
              </div>
            </>
          ) : (
            <button className="link-button small" onClick={() => setConfirmDispute(true)} disabled={disabled}>
              Can’t agree? Ask an arbiter to decide
            </button>
          )}
        </div>
      )}
    </section>
  )
}
