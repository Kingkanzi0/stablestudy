import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AccountGate, EmptyState, ErrorState, Spinner } from '../components/common'
import CampaignLogo from '../components/CampaignLogo'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { COST_LABEL, TYPE_LABEL } from '../lib/campaigns'

export default function AdminCampaigns() {
  return (
    <div className="page">
      <AccountGate why="to review campaigns">
        <Queue />
      </AccountGate>
    </div>
  )
}

function Queue() {
  const { data, isLoading, error, refetch } = useApi('/campaigns/review', { auth: true })
  if (isLoading) return <Spinner label="Loading the review queue" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  return (
    <>
      <header className="page-head">
        <h1>Campaign reviews</h1>
        <p>Check each listing is a real project, the links go where they say, and nothing asks for recovery phrases.</p>
      </header>
      {data.campaigns.length === 0 ? (
        <EmptyState title="Nothing to review">New campaigns appear here when projects submit them.</EmptyState>
      ) : (
        <ul className="review-list">
          {data.campaigns.map((c) => (
            <ReviewItem key={c.id} c={c} />
          ))}
        </ul>
      )}
    </>
  )
}

function ReviewItem({ c }) {
  const { token } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [featured, setFeatured] = useState(false)
  const [busy, setBusy] = useState(false)

  async function decide(approve) {
    setBusy(true)
    try {
      await api(`/campaigns/${c.id}/review`, { method: 'POST', token, body: { approve, note: note || undefined, featured } })
      toast.success(approve ? 'Approved: it’s live' : 'Rejected')
      qc.invalidateQueries({ queryKey: ['api'] })
    } catch (e) {
      toast.error('Couldn’t save the decision', { body: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="form-card review-item">
      <div className="campaign-project">
        <CampaignLogo campaign={c} />
        <span>
          <strong>{c.projectName}</strong>
          <span className="muted">
            {c.title} · {TYPE_LABEL[c.type]} · {COST_LABEL[c.cost]} · {c.chain}
          </span>
        </span>
      </div>
      <p>{c.summary}</p>
      <p className="muted small">
        Reward: {c.reward} · <a href={c.websiteUrl} target="_blank" rel="noreferrer nofollow">{c.websiteUrl}</a> ·{' '}
        <Link to={`/campaigns/${c.id}`}>Preview the full page</Link>
      </p>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the project (optional, shown to them)" maxLength={500} />
      <label className="check">
        <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Feature at the top of Campaigns
      </label>
      <div className="form-actions">
        <button className="btn btn-ghost" disabled={busy} onClick={() => decide(false)}>
          Reject
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>
          Approve
        </button>
      </div>
    </li>
  )
}
