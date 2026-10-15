import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, SignInGate, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'
import { shortAddress, timeAgo } from '../lib/format'
import { OPEN_STATUSES, STATUS_LABEL, STATUS_TONE } from '../lib/escrow'

export default function EscrowList() {
  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Escrow orders</h1>
          <p>Hire anyone for a job and pay in USDC. The money stays locked until the work is verified.</p>
        </div>
        <Link to="/escrow/new" className="btn btn-primary">
          Hire with escrow
        </Link>
      </header>
      <SignInGate why="to see your orders">
        <Orders />
      </SignInGate>
    </div>
  )
}

function Orders() {
  const { data, isLoading, error, refetch } = useApi('/orders/mine', { auth: true })
  if (isLoading) return <Spinner label="Loading your orders" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const orders = data.orders
  if (!orders.length) {
    return (
      <EmptyState
        title="No escrow orders yet"
        action={
          <Link to="/escrow/new" className="btn btn-primary">
            Hire with escrow
          </Link>
        }
      >
        Orders you create, and jobs others hire you for, show up here.
      </EmptyState>
    )
  }
  const open = orders.filter((o) => OPEN_STATUSES.has(o.status) || o.status === 'DRAFT')
  const closed = orders.filter((o) => !open.includes(o))
  return (
    <>
      <OrderList title="Active" orders={open} empty="Nothing active right now." />
      {closed.length > 0 && <OrderList title="Finished" orders={closed} />}
    </>
  )
}

function OrderList({ title, orders, empty }) {
  return (
    <section className="order-section">
      <h2>{title}</h2>
      {orders.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="job-list">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to={`/escrow/${o.id}`} className="job-row">
                <span className={`role-badge role-${o.role}`}>{o.role === 'client' ? 'You hired' : 'Hired you'}</span>
                <span className="job-main">
                  <strong>{o.title}</strong>
                  <span className="job-meta">
                    {o.role === 'client' ? `Provider ${shortAddress(o.provider)}` : `Client ${shortAddress(o.client)}`}, updated{' '}
                    {timeAgo(o.updatedAt)}
                  </span>
                </span>
                <span className="job-side">
                  <span className="job-pay">{o.amount} USDC</span>
                  <span className={`status status-${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
