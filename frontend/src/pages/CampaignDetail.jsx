import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, ErrorState, Spinner } from '../components/common'
import CampaignLogo from '../components/CampaignLogo'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { COST_LABEL, PHASE_LABEL, PHASE_TONE, TYPE_LABEL, campaignWhen } from '../lib/campaigns'

const STATUS_TEXT = { PENDING: 'Waiting for review: only you and iSabi admins can see this page.', REJECTED: 'Not approved.' }

export default function CampaignDetail() {
  const { id } = useParams()
  const { token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useApi(`/campaigns/${id}`, { auth: 'optional' })

  if (isLoading) return <Spinner label="Loading campaign" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const c = data.campaign
  const links = [
    ['Website', c.websiteUrl],
    ['X', c.xUrl],
    ['Discord', c.discordUrl],
    ['Telegram', c.telegramUrl],
  ].filter(([, u]) => u)

  async function remove() {
    try {
      await api(`/campaigns/${c.id}`, { method: 'DELETE', token })
      toast.success('Campaign deleted')
      navigate('/profile')
    } catch (e) {
      toast.error('Couldn’t delete it', { body: e.message })
    }
  }

  return (
    <div className="page campaign-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/campaigns">Campaigns</Link>
        <span aria-hidden="true">/</span>
        <span>{c.projectName}</span>
      </nav>

      {c.canManage && c.status !== 'APPROVED' && (
        <p className={`notice ${c.status === 'REJECTED' ? 'notice-warn' : ''}`}>
          {STATUS_TEXT[c.status]} {c.reviewNote && <>Reviewer’s note: “{c.reviewNote}”</>}
        </p>
      )}

      <header className="campaign-hero">
        <CampaignLogo campaign={c} size={72} />
        <div className="campaign-hero-text">
          <p className="campaign-kicker">
            {c.projectName} · {TYPE_LABEL[c.type]} · {c.chain}
          </p>
          <h1>{c.title}</h1>
          <p className="lede">{c.summary}</p>
          <div className="campaign-badges">
            <span className={`status status-${PHASE_TONE[c.phase]}`}>{PHASE_LABEL[c.phase]}</span>
            <span className="muted">{campaignWhen(c)}</span>
            <span className={`campaign-cost cost-${c.cost.toLowerCase()}`}>{COST_LABEL[c.cost]}</span>
          </div>
        </div>
      </header>

      <div className="course-layout">
        <div className="course-main">
          <section>
            <h2>How to take part</h2>
            <ol className="campaign-steps">
              {c.steps.map((s, i) => (
                <li key={i}>
                  <span className="step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <strong>{s.title}</strong>
                    {s.details && <p>{s.details}</p>}
                    {s.url && (
                      <a className="btn btn-ghost btn-sm" href={s.url} target="_blank" rel="noreferrer nofollow">
                        Open {new URL(s.url).hostname.replace(/^www\./, '')} ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h2>About this campaign</h2>
            <div className="prose">
              {c.description.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {c.tags.length > 0 && (
              <p className="job-tags">
                {c.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </p>
            )}
          </section>
        </div>

        <aside className="course-side">
          <div className="pay-panel campaign-panel">
            <p className="muted small">Reward</p>
            <p className="campaign-reward-big">{c.reward}</p>
            <a className="btn btn-primary btn-block" href={c.steps.find((s) => s.url)?.url || c.websiteUrl} target="_blank" rel="noreferrer nofollow">
              Start the campaign ↗
            </a>
            <ul className="campaign-links">
              {links.map(([label, url]) => (
                <li key={label}>
                  <a href={url} target="_blank" rel="noreferrer nofollow">
                    {label} ↗
                  </a>
                </li>
              ))}
            </ul>
            {c.postedBy && (
              <p className="posted-by">
                <Avatar person={c.postedBy} size={28} />
                <span>Listed by {c.postedBy.displayName || 'a project member'}</span>
              </p>
            )}
            <p className="muted small">{c.views} views</p>
          </div>
          <p className="fine-print">
            The project runs this campaign and decides the rewards. iSabi checks listings before they go live but can’t
            guarantee payouts. Never share your recovery phrase{c.cost === 'DEPOSIT' ? ', and only deposit what you can afford to lose' : ''}.
          </p>
          {c.canManage && (
            <div className="form-actions">
              <Link to={`/campaigns/${c.id}/edit`} className="btn btn-ghost">
                Edit
              </Link>
              <button className="btn btn-ghost" onClick={remove}>
                Delete
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
