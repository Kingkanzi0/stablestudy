import { Link, useParams } from 'react-router-dom'
import { Avatar, CourseCard, EmptyState, ErrorState, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'
import { useProfile } from '../hooks/useProfile'
import Socials from '../components/Socials'
import { explorerAddress } from '../config/network'
import { shortAddress } from '../lib/format'

export default function TutorProfile() {
  const { address } = useParams()
  const { data, isLoading, error, refetch } = useApi(`/tutors/${address}`)
  const profile = useProfile(address)

  if (isLoading) return <Spinner label="Loading tutor" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const { tutor, courses, stats } = data

  return (
    <div className="page">
      <header className="profile-head">
        <Avatar tutor={{ ...tutor, avatarUrl: tutor.avatarUrl || profile?.avatarUrl }} size={88} />
        <div>
          <h1>{tutor.displayName}</h1>
          {tutor.headline && <p className="profile-headline">{tutor.headline}</p>}
          <p className="muted">
            {explorerAddress(tutor.address) ? (
              <a href={explorerAddress(tutor.address)} target="_blank" rel="noreferrer">
                {shortAddress(tutor.address)}
              </a>
            ) : (
              shortAddress(tutor.address)
            )}
            {tutor.website && (
              <>
                {', '}
                <a href={tutor.website} target="_blank" rel="noreferrer nofollow">
                  website
                </a>
              </>
            )}
          </p>
          <Socials socials={profile?.socials} />
        </div>
        <Link to={`/escrow/new?provider=${tutor.address}`} className="btn btn-primary profile-hire">
          Hire with escrow
        </Link>
        <dl className="profile-stats">
          <div>
            <dt>Students</dt>
            <dd>{stats.uniqueStudents}</dd>
          </div>
          <div>
            <dt>Earned on iSabi</dt>
            <dd>{stats.totalEarned} USDC</dd>
          </div>
        </dl>
      </header>

      {tutor.bio && (
        <div className="prose profile-bio">
          {tutor.bio.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      <h2>Courses by {tutor.displayName}</h2>
      {courses.length ? (
        <div className="course-grid">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      ) : (
        <EmptyState title="No live courses yet" action={<Link to="/courses" className="btn btn-ghost">Explore other courses</Link>} />
      )}
    </div>
  )
}
