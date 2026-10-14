import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { formatPay, timeAgo } from '../lib/format'

export default function Jobs() {
  const { isSignedIn } = useAuth()
  const [params, setParams] = useSearchParams()
  const type = params.get('type') || 'All'
  const category = params.get('category') || 'All'
  const remote = params.get('remote') === 'true'
  const search = params.get('q') || ''
  const [draft, setDraft] = useState(search)

  useEffect(() => {
    const t = setTimeout(() => update({ q: draft.trim() || null }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  function update(next) {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }

  const query = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(type !== 'All' ? { type } : {}),
    ...(category !== 'All' ? { category } : {}),
    ...(remote ? { remote: 'true' } : {}),
  })
  const { data, isLoading, error, refetch } = useApi(`/jobs?${query}`)

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Web3 jobs</h1>
          <p>Roles, contracts and bounties from teams building on Arc and beyond. Many pay in USDC.</p>
        </div>
        <div className="dash-actions">
          {isSignedIn && (
            <Link to="/jobs/mine" className="btn btn-ghost">
              Your posts
            </Link>
          )}
          <Link to="/jobs/new" className="btn btn-primary">
            Post a job
          </Link>
        </div>
      </header>

      <div className="filters">
        <label className="search">
          <span className="sr-only">Search jobs</span>
          <input
            type="search"
            placeholder="Search by role, company or skill"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <label className="select">
          <span className="sr-only">Job type</span>
          <select value={type} onChange={(e) => update({ type: e.target.value === 'All' ? null : e.target.value })}>
            <option value="All">All types</option>
            {(data?.types || []).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={remote} onChange={(e) => update({ remote: e.target.checked ? 'true' : null })} />
          Remote only
        </label>
      </div>
      <div className="chips" role="group" aria-label="Filter by category">
        {['All', ...(data?.categories || [])].map((c) => (
          <button
            key={c}
            className={`chip ${c === category ? 'chip-on' : ''}`}
            aria-pressed={c === category}
            onClick={() => update({ category: c === 'All' ? null : c })}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner label="Loading jobs" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.jobs.length === 0 ? (
        <EmptyState
          title={search || type !== 'All' || category !== 'All' || remote ? 'No jobs match yet' : 'No jobs posted yet'}
          action={
            <Link to="/jobs/new" className="btn btn-primary">
              Post the first job
            </Link>
          }
        >
          Hiring for a Web3 role? Post it free and reach learners and tutors on SkillPay.
        </EmptyState>
      ) : (
        <ul className="job-list">
          {data.jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function JobRow({ job }) {
  const pay = formatPay(job)
  return (
    <li>
      <Link to={`/jobs/${job.id}`} className="job-row">
        <span className="job-logo" aria-hidden="true">
          {job.company.charAt(0).toUpperCase()}
        </span>
        <span className="job-main">
          <strong>{job.title}</strong>
          <span className="job-meta">
            {job.company}, {job.location}
          </span>
          {job.tags.length > 0 && (
            <span className="job-tags">
              {job.tags.slice(0, 4).map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="job-side">
          {pay && <span className="job-pay">{pay}</span>}
          <span className="job-type">{job.type}</span>
          <span className="muted small">{timeAgo(job.createdAt)}</span>
        </span>
      </Link>
    </li>
  )
}
