import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { CourseCover, EmptyState, ErrorState, Spinner, TxLink } from '../components/common'
import { useApi } from '../hooks/useApi'
import { timeAgo } from '../lib/format'

export default function Learn() {
  const { address, isConnected } = useAccount()
  const { data, isLoading, error, refetch } = useApi(
    address ? `/students/${address.toLowerCase()}/enrollments` : null,
  )

  return (
    <div className="page">
      <header className="page-head">
        <h1>My learning</h1>
        <p>Courses you’ve paid for with this wallet. Your access is recorded on-chain, so it can’t be lost.</p>
      </header>

      {!isConnected ? (
        <EmptyState title="Connect your wallet to see your courses">
          Use the Connect wallet button at the top of the page.
        </EmptyState>
      ) : isLoading ? (
        <Spinner label="Loading your courses" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.enrollments.length === 0 ? (
        <EmptyState
          title="You haven’t enrolled in a course yet"
          action={
            <Link to="/courses" className="btn btn-primary">
              Explore courses
            </Link>
          }
        />
      ) : (
        <ul className="enrolled-list">
          {data.enrollments.map((e) => (
            <li key={e.id} className="enrolled-item">
              <CourseCover course={e.course} size="sm" />
              <div className="enrolled-body">
                <h3>{e.course.title}</h3>
                <p>
                  {e.course.tutor?.displayName}. Paid {e.price} USDC {timeAgo(e.createdAt)}.{' '}
                  <TxLink hash={e.txHash}>Receipt</TxLink>
                </p>
              </div>
              <Link to={`/learn/${e.course.id}`} className="btn btn-primary">
                Continue
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
