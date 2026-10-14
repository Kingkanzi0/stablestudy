import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState, ErrorState, SignInGate, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { formatPay, timeAgo } from '../lib/format'

export default function MyJobs() {
  return (
    <div className="page">
      <SignInGate why="to manage your job posts">
        <List />
      </SignInGate>
    </div>
  )
}

function List() {
  const { token } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useApi('/jobs/mine', { auth: true })
  const [busy, setBusy] = useState(null)

  async function setStatus(job, status) {
    setBusy(job.id)
    try {
      await api(`/jobs/${job.id}/status`, { method: 'PATCH', body: { status }, token })
      toast.success(status === 'CLOSED' ? 'Job closed' : 'Job reopened')
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error('Couldn’t update the job', { body: e.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <header className="page-head page-head-row">
        <div>
          <Link to="/jobs" className="player-back">
            Jobs
          </Link>
          <h1>Your job posts</h1>
          <p>Close a job when you’ve hired, so applicants don’t waste their time.</p>
        </div>
        <Link to="/jobs/new" className="btn btn-primary">
          Post a job
        </Link>
      </header>

      {isLoading ? (
        <Spinner label="Loading your posts" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.jobs.length === 0 ? (
        <EmptyState
          title="You haven’t posted a job yet"
          action={
            <Link to="/jobs/new" className="btn btn-primary">
              Post a job
            </Link>
          }
        />
      ) : (
        <ul className="manage-list">
          {data.jobs.map((j) => (
            <li key={j.id} className="manage-item">
              <span className="job-logo" aria-hidden="true">
                {j.company.charAt(0).toUpperCase()}
              </span>
              <div className="manage-body">
                <h3>
                  {j.title}{' '}
                  <span className={`status ${j.status === 'OPEN' ? 'status-live' : 'status-draft'}`}>
                    {j.status === 'OPEN' ? 'Open' : 'Closed'}
                  </span>
                </h3>
                <p className="muted">
                  {j.company}, {j.type}
                  {formatPay(j) ? `, ${formatPay(j)}` : ''}. Posted {timeAgo(j.createdAt)}.
                </p>
              </div>
              <div className="manage-actions">
                <Link to={`/jobs/${j.id}`} className="btn btn-ghost">
                  View
                </Link>
                <Link to={`/jobs/${j.id}/edit`} className="btn btn-ghost">
                  Edit
                </Link>
                <button
                  className="btn btn-ghost"
                  disabled={busy === j.id}
                  onClick={() => setStatus(j, j.status === 'OPEN' ? 'CLOSED' : 'OPEN')}
                >
                  {busy === j.id ? 'Saving…' : j.status === 'OPEN' ? 'Close' : 'Reopen'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
