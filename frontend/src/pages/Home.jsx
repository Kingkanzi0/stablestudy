import { Link } from 'react-router-dom'
import SplitReceipt from '../components/SplitReceipt'
import { CourseCard, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'
import { JobRow } from './Jobs'

export default function Home() {
  const { data: stats } = useApi('/stats')
  const { data: courseData, isLoading } = useApi('/courses?sort=popular')
  const featured = courseData?.courses?.slice(0, 6) || []
  const { data: jobData } = useApi('/jobs')
  const latestJobs = jobData?.jobs?.slice(0, 4) || []
  const hasActivity = stats && stats.enrollments > 0

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Learn from anyone. Pay them in seconds.</h1>
          <p className="hero-lede">
            iSabi is where you learn a skill, find work and get paid, all in USDC on Arc. Tutors keep 90% the moment you
            enroll, and paid jobs sit in escrow until an AI agent checks the work.
          </p>
          <div className="hero-actions">
            <Link to="/courses" className="btn btn-primary btn-lg">
              Explore courses
            </Link>
            <Link to="/teach" className="btn btn-ghost btn-lg">
              Start teaching
            </Link>
          </div>
        </div>
        <SplitReceipt />
      </section>

      <section className="facts" aria-label="iSabi in numbers">
        {hasActivity ? (
          <>
            <Fact value={`${stats.paidToTutors} USDC`} label="paid to tutors" />
            <Fact value={stats.learners} label="learners enrolled" />
            <Fact value={stats.courses} label="live courses" />
            <Fact value={stats.tutors} label="registered tutors" />
          </>
        ) : (
          <>
            <Fact value="90%" label="of every payment goes to the tutor" />
            <Fact value="< 1 s" label="to settle on Arc, with no confirmations to wait for" />
            <Fact value="0" label="funds held by iSabi. Money moves through open contracts" />
          </>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Popular courses</h2>
          <Link to="/courses" className="link-strong">
            See all courses
          </Link>
        </div>
        {isLoading ? (
          <Spinner label="Loading courses" />
        ) : featured.length ? (
          <div className="course-grid">
            {featured.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        ) : (
          <div className="first-course">
            <h3>Be the first tutor on iSabi</h3>
            <p>No courses are live yet. Publish one in a few minutes and get paid the second a student enrolls.</p>
            <Link to="/teach" className="btn btn-primary">
              Create a course
            </Link>
          </div>
        )}
      </section>

      <section className="section escrow-band">
        <div>
          <h2>Hire anyone. Pay only for work that meets the brief.</h2>
          <p>
            Lock USDC in escrow, list what “done” means, and iSabi’s verifier agent on Arc checks the delivery against
            each point before the money moves. You can always approve it yourself, and missed deadlines refund you.
          </p>
        </div>
        <Link to="/escrow/new" className="btn btn-marigold btn-lg">
          Hire with escrow
        </Link>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Latest Web3 jobs</h2>
          <Link to="/jobs" className="link-strong">
            See all jobs
          </Link>
        </div>
        {latestJobs.length ? (
          <ul className="job-list">
            {latestJobs.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </ul>
        ) : (
          <div className="jobs-cta">
            <p>
              <strong>Hiring for a Web3 role?</strong> Post it free and reach people learning on iSabi.
            </p>
            <Link to="/jobs/new" className="btn btn-ghost">
              Post a job
            </Link>
          </div>
        )}
      </section>

      <section className="section how">
        <div className="how-col">
          <h2>For learners</h2>
          <ol className="steps">
            <li>
              <strong>Connect a wallet</strong>
              <span>MetaMask, Rabby or any browser wallet on Arc.</span>
            </li>
            <li>
              <strong>Pick a course</strong>
              <span>See the full lesson outline and exact price before you pay.</span>
            </li>
            <li>
              <strong>Pay in USDC and start</strong>
              <span>Lessons unlock as soon as the payment settles, usually under a second.</span>
            </li>
          </ol>
        </div>
        <div className="how-col how-col-teach">
          <h2>For tutors</h2>
          <ol className="steps">
            <li>
              <strong>Create your profile</strong>
              <span>Register your wallet as a tutor. It’s free.</span>
            </li>
            <li>
              <strong>Publish a course</strong>
              <span>Write your lessons, set a price in USDC, and publish it on-chain.</span>
            </li>
            <li>
              <strong>Get paid instantly</strong>
              <span>Every enrollment sends 90% straight to your wallet. Nothing to withdraw.</span>
            </li>
          </ol>
          <Link to="/teach" className="btn btn-marigold">
            Start teaching
          </Link>
        </div>
      </section>
    </>
  )
}

function Fact({ value, label }) {
  return (
    <div className="fact">
      <span className="fact-value">{value}</span>
      <span className="fact-label">{label}</span>
    </div>
  )
}
