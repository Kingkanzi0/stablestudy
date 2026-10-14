import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, SignInGate, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'

export default function CoursePlayer() {
  return (
    <div className="page">
      <SignInGate why="to open your course">
        <Player />
      </SignInGate>
    </div>
  )
}

function Player() {
  const { id } = useParams()
  const course = useApi(`/courses/${id}`, { auth: 'optional' })
  const content = useApi(`/courses/${id}/content`, { auth: true })
  const [current, setCurrent] = useState(0)

  if (course.isLoading || content.isLoading) return <Spinner label="Opening course" />
  if (course.error) return <ErrorState error={course.error} />
  if (content.error) {
    return (
      <div className="gate">
        <h2>{content.error.status === 403 ? 'This course is locked' : 'Couldn’t open this course'}</h2>
        <p>{content.error.message}</p>
        <Link to={`/courses/${id}`} className="btn btn-primary">
          Go to course page
        </Link>
      </div>
    )
  }

  const lessons = content.data.lessons
  const lesson = lessons[current]

  return (
    <div className="player">
      <aside className="player-nav">
        <Link to={`/courses/${id}`} className="player-back">
          {course.data.course.title}
        </Link>
        <ol>
          {lessons.map((l, i) => (
            <li key={l.position}>
              <button className={i === current ? 'on' : ''} onClick={() => setCurrent(i)} aria-current={i === current}>
                <span className="lesson-num">{i + 1}</span>
                {l.title}
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <article className="player-body">
        <p className="lesson-count">
          Lesson {current + 1} of {lessons.length}
        </p>
        <h1>{lesson.title}</h1>
        {lesson.videoUrl && <VideoBlock url={lesson.videoUrl} />}
        <div className="prose">
          {lesson.content.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {lesson.resourceUrl && (
          <a className="resource" href={lesson.resourceUrl} target="_blank" rel="noreferrer">
            Open lesson resources
          </a>
        )}
        <div className="player-pager">
          <button className="btn btn-ghost" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
            Previous lesson
          </button>
          <button
            className="btn btn-primary"
            disabled={current === lessons.length - 1}
            onClick={() => setCurrent((c) => c + 1)}
          >
            Next lesson
          </button>
        </div>
      </article>
    </div>
  )
}

/** Embeds YouTube/Vimeo links; anything else becomes a plain link. */
function VideoBlock({ url }) {
  let embed = null
  try {
    const u = new URL(url)
    if (/youtube\.com$/.test(u.hostname.replace('www.', '')) && u.searchParams.get('v')) {
      embed = `https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}`
    } else if (u.hostname === 'youtu.be') {
      embed = `https://www.youtube-nocookie.com/embed${u.pathname}`
    } else if (/vimeo\.com$/.test(u.hostname) && /^\/\d+/.test(u.pathname)) {
      embed = `https://player.vimeo.com/video${u.pathname}`
    }
  } catch {
    /* invalid URL */
  }
  if (!embed) {
    return (
      <a className="resource" href={url} target="_blank" rel="noreferrer">
        Watch the lesson video
      </a>
    )
  }
  return (
    <div className="video">
      <iframe src={embed} title="Lesson video" allow="encrypted-media; picture-in-picture" allowFullScreen />
    </div>
  )
}
