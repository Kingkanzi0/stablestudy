import { Link, useParams } from 'react-router-dom'
import { ErrorState, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'
import { formatPay, shortAddress, timeAgo } from '../lib/format'
import { explorerAddress } from '../config/network'

export default function JobDetail() {
  const { id } = useParams()
  const { data, isLoading, error, refetch } = useApi(`/jobs/${id}`, { auth: 'optional' })

  if (isLoading) return <Spinner label="Loading job" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const j = data.job
  const pay = formatPay(j)
  const isEmail = j.applyUrl.startsWith('mailto:')
  const learnQuery = encodeURIComponent(j.tags[0] || j.category)

  return (
    <div className="page course-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/jobs">Jobs</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/jobs?category=${encodeURIComponent(j.category)}`}>{j.category}</Link>
      </nav>

      <div className="course-layout">
        <article className="course-main">
          {j.status !== 'OPEN' && <p className="pay-hint pay-hint-warn">This job is closed and hidden from the jobs board.</p>}
          <h1>{j.title}</h1>
          <p className="course-summary">
            {j.companyUrl ? (
              <a href={j.companyUrl} target="_blank" rel="noreferrer nofollow">
                {j.company}
              </a>
            ) : (
              j.company
            )}
          </p>
          <ul className="fact-list">
            <li>{j.type}</li>
            <li>{j.location}</li>
            <li>{j.category}</li>
            <li>Posted {timeAgo(j.createdAt)}</li>
          </ul>

          <h2>About the role</h2>
          <div className="prose">
            {j.description.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          {j.tags.length > 0 && (
            <>
              <h2>Skills</h2>
              <div className="job-tags">
                {j.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}

          <p className="onchain-note">
            Posted by wallet{' '}
            {explorerAddress(j.poster) ? (
              <a href={explorerAddress(j.poster)} target="_blank" rel="noreferrer">
                {shortAddress(j.poster)}
              </a>
            ) : (
              shortAddress(j.poster)
            )}
            . iSabi doesn’t verify employers, so never pay to apply.
          </p>
        </article>

        <aside className="pay-panel">
          <p className="pay-price job-panel-pay">{pay || 'Pay not listed'}</p>
          <p className="pay-sub">{j.type}, {j.location}</p>
          {j.status === 'OPEN' && (
            <a className="btn btn-primary btn-block" href={j.applyUrl} target="_blank" rel="noreferrer nofollow">
              {isEmail ? 'Apply by email' : 'Apply for this job'}
            </a>
          )}
          {j.isOwner && (
            <Link to={`/jobs/${j.id}/edit`} className="btn btn-ghost btn-block job-edit-btn">
              Edit your post
            </Link>
          )}
          <div className="job-learn">
            <strong>Build the skills for this role</strong>
            <p>Find courses on iSabi taught by people already doing this work.</p>
            <Link to={`/courses?q=${learnQuery}`} className="link-strong">
              Browse related courses
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
