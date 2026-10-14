import { Link, useParams } from 'react-router-dom'
import PaymentPanel from '../components/PaymentPanel'
import { Avatar, CourseCover, ErrorState, Spinner, TxLink } from '../components/common'
import { useApi } from '../hooks/useApi'
import { formatDuration, shortAddress } from '../lib/format'

export default function CourseDetail() {
  const { id } = useParams()
  const { data, isLoading, error, refetch } = useApi(`/courses/${id}`, { auth: 'optional' })

  if (isLoading) return <Spinner label="Loading course" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const c = data.course
  const facts = [
    c.level,
    formatDuration(c.durationMinutes),
    `${c.lessons.length} ${c.lessons.length === 1 ? 'lesson' : 'lessons'}`,
    `${c.enrollmentCount} ${c.enrollmentCount === 1 ? 'student' : 'students'}`,
  ].filter(Boolean)

  return (
    <div className="page course-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/courses">Courses</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/courses?category=${encodeURIComponent(c.category)}`}>{c.category}</Link>
      </nav>

      <div className="course-layout">
        <article className="course-main">
          <CourseCover course={c} size="lg" />
          <h1>{c.title}</h1>
          <p className="course-summary">{c.summary}</p>
          <ul className="fact-list">
            {facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>

          <Link to={`/tutors/${c.tutor.address}`} className="tutor-row">
            <Avatar tutor={c.tutor} size={44} />
            <span>
              <strong>{c.tutor.displayName}</strong>
              <span>{c.tutor.headline || shortAddress(c.tutor.address)}</span>
            </span>
          </Link>

          <h2>About this course</h2>
          <div className="prose">
            {c.description.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          <h2>What’s inside</h2>
          <ol className="outline">
            {c.lessons.map((l) => (
              <li key={l.position}>
                <span>{l.title}</span>
                {l.hasVideo && <span className="tag">Video</span>}
              </li>
            ))}
          </ol>

          {c.createdTx && (
            <p className="onchain-note">
              Published on-chain as course #{c.onchainId}. <TxLink hash={c.createdTx}>View transaction</TxLink>
            </p>
          )}
        </article>

        {c.onchainId ? (
          <PaymentPanel course={c} />
        ) : (
          <aside className="pay-panel">
            <p className="pay-hint">This course is a draft and hasn’t been published yet.</p>
          </aside>
        )}
      </div>
    </div>
  )
}
