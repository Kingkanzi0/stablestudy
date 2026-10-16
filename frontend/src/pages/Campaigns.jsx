import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, Spinner } from '../components/common'
import CampaignLogo from '../components/CampaignLogo'
import { useApi } from '../hooks/useApi'
import { COST_LABEL, PHASE_LABEL, PHASE_TONE, TYPE_LABEL, campaignWhen } from '../lib/campaigns'

export default function Campaigns() {
  const [params, setParams] = useSearchParams()
  const type = params.get('type') || ''
  const phase = params.get('phase') ?? 'LIVE'
  const chain = params.get('chain') || ''
  const search = params.get('q') || ''
  const [draft, setDraft] = useState(search)

  useEffect(() => {
    const t = setTimeout(() => update({ q: draft.trim() || null }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  function update(next) {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v || v === '' ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }

  const query = new URLSearchParams({
    ...(type ? { type } : {}),
    ...(phase ? { phase } : {}),
    ...(chain ? { chain } : {}),
    ...(search ? { q: search } : {}),
  })
  const { data, isLoading, error, refetch } = useApi(`/campaigns?${query}`)
  const featured = (data?.campaigns || []).filter((c) => c.featured && c.phase === 'LIVE').slice(0, 3)

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Campaigns</h1>
          <p>Airdrops, testnets, quests and incentive programmes from projects on Arc and beyond. Follow each guide to take part.</p>
        </div>
        <div className="dash-actions">
          <Link to="/campaigns/new" className="btn btn-primary">
            List a campaign
          </Link>
        </div>
      </header>

      {featured.length > 0 && !type && !search && (
        <section className="campaign-featured" aria-label="Featured campaigns">
          {featured.map((c) => (
            <Link key={c.id} to={`/campaigns/${c.id}`} className="featured-card">
              <CampaignLogo campaign={c} size={48} />
              <span className="featured-text">
                <span className="featured-kicker">Featured · {TYPE_LABEL[c.type]}</span>
                <strong>{c.projectName}</strong>
                <span>{c.reward}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      <div className="filters">
        <label className="search">
          <span className="sr-only">Search campaigns</span>
          <input type="search" placeholder="Search by project or tag" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <label className="select">
          <span className="sr-only">Status</span>
          <select value={phase} onChange={(e) => update({ phase: e.target.value })}>
            <option value="LIVE">Live now</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="ENDED">Ended</option>
            <option value="">All</option>
          </select>
        </label>
        <label className="select">
          <span className="sr-only">Chain</span>
          <select value={chain} onChange={(e) => update({ chain: e.target.value || null })}>
            <option value="">All chains</option>
            {(data?.chains || ['Arc']).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="chips" role="group" aria-label="Filter by type">
        {['', ...Object.keys(TYPE_LABEL)].map((t) => (
          <button key={t || 'all'} className={`chip ${t === type ? 'chip-on' : ''}`} aria-pressed={t === type} onClick={() => update({ type: t || null })}>
            {t ? TYPE_LABEL[t] : 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner label="Loading campaigns" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.campaigns.length === 0 ? (
        <EmptyState
          title={search || type || chain || phase !== 'LIVE' ? 'No campaigns match' : 'No live campaigns yet'}
          action={
            <Link to="/campaigns/new" className="btn btn-primary">
              List your campaign
            </Link>
          }
        >
          Running an airdrop, testnet or incentive programme? List it free and reach people learning and working on Arc.
        </EmptyState>
      ) : (
        <div className="campaign-table" role="table" aria-label="Campaigns">
          <div className="campaign-row campaign-head" role="row">
            <span role="columnheader">Project</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Reward</span>
            <span role="columnheader">Cost</span>
            <span role="columnheader">Status</span>
          </div>
          {data.campaigns.map((c) => (
            <CampaignRow key={c.id} c={c} />
          ))}
        </div>
      )}

      <p className="fine-print">
        Projects run their own campaigns and rewards. iSabi reviews listings but can’t guarantee payouts. Never share your
        recovery phrase, and be careful with any campaign that asks for a deposit.
      </p>
    </div>
  )
}

function CampaignRow({ c }) {
  return (
    <Link to={`/campaigns/${c.id}`} className="campaign-row" role="row">
      <span className="campaign-project" role="cell">
        <CampaignLogo campaign={c} />
        <span>
          <strong>{c.projectName}</strong>
          <span className="muted">{c.title}</span>
        </span>
      </span>
      <span role="cell" className="campaign-type">
        <span className="tag">{TYPE_LABEL[c.type]}</span>
        {c.chain !== 'Arc' && <span className="muted small">{c.chain}</span>}
      </span>
      <span role="cell" className="campaign-reward">
        {c.reward}
      </span>
      <span role="cell" className={`campaign-cost cost-${c.cost.toLowerCase()}`}>
        {COST_LABEL[c.cost]}
      </span>
      <span role="cell" className="campaign-when">
        <span className={`status status-${PHASE_TONE[c.phase]}`}>{PHASE_LABEL[c.phase]}</span>
        <span className="muted small">{campaignWhen(c)}</span>
      </span>
    </Link>
  )
}
