import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, Field, SignInGate, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'

const FALLBACK_CATEGORIES = ['Web3 Development', 'Smart Contracts', 'Payments & Stablecoins', 'DeFi', 'Design', 'Data & AI', 'Business', 'Languages', 'Other']
const FALLBACK_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels']

const emptyLesson = () => ({ title: '', content: '', videoUrl: '', resourceUrl: '' })

export default function CourseEditor() {
  return (
    <div className="page">
      <SignInGate why="to edit courses">
        <EditorLoader />
      </SignInGate>
    </div>
  )
}

function EditorLoader() {
  const { id } = useParams()
  const isNew = !id
  const meta = useApi('/courses/meta')
  const existing = useApi(isNew ? null : `/courses/${id}`, { auth: true })
  const content = useApi(isNew ? null : `/courses/${id}/content`, { auth: true })

  if (meta.isLoading || (!isNew && (existing.isLoading || content.isLoading))) return <Spinner label="Loading editor" />
  if (!isNew && (existing.error || content.error)) return <ErrorState error={existing.error || content.error} />

  const initial = isNew
    ? null
    : {
        ...existing.data.course,
        lessons: content.data.lessons.map((l) => ({
          title: l.title,
          content: l.content,
          videoUrl: l.videoUrl || '',
          resourceUrl: l.resourceUrl || '',
        })),
      }
  return (
    <Editor
      initial={initial}
      categories={meta.data?.categories || FALLBACK_CATEGORIES}
      levels={meta.data?.levels || FALLBACK_LEVELS}
    />
  )
}

function Editor({ initial, categories, levels }) {
  const { token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [form, setForm] = useState({
    title: initial?.title || '',
    summary: initial?.summary || '',
    description: initial?.description || '',
    category: initial?.category || categories[0],
    level: initial?.level || levels[0],
    durationMinutes: initial?.durationMinutes || '',
    lessons: initial?.lessons?.length ? initial.lessons : [emptyLesson()],
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setLesson = (i, k) => (e) =>
    setForm((f) => ({ ...f, lessons: f.lessons.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)) }))
  const addLesson = () => setForm((f) => ({ ...f, lessons: [...f.lessons, emptyLesson()] }))
  const removeLesson = (i) => setForm((f) => ({ ...f, lessons: f.lessons.filter((_, j) => j !== i) }))
  const moveLesson = (i, dir) =>
    setForm((f) => {
      const lessons = [...f.lessons]
      const j = i + dir
      if (j < 0 || j >= lessons.length) return f
      ;[lessons[i], lessons[j]] = [lessons[j], lessons[i]]
      return { ...f, lessons }
    })

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    const body = { ...form, durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined }
    try {
      if (initial) {
        await api(`/courses/${initial.id}`, { method: 'PUT', body, token })
        toast.success('Course saved')
      } else {
        await api('/courses', { method: 'POST', body, token })
        toast.success('Draft saved', { body: 'Set a price and publish it from your dashboard.' })
      }
      navigate('/teach')
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])))
      toast.error('Couldn’t save the course', { body: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="editor" onSubmit={submit}>
      <header className="page-head">
        <Link to="/teach" className="player-back">
          Dashboard
        </Link>
        <h1>{initial ? 'Edit course' : 'New course'}</h1>
        <p>
          {initial?.status === 'PUBLISHED'
            ? 'Changes to the text and lessons go live as soon as you save. Change the price from your dashboard.'
            : 'Write your course first. You’ll set the price when you publish it from your dashboard.'}
        </p>
      </header>

      <section className="form-card">
        <h2>Course details</h2>
        <Field label="Title" error={errors.title}>
          <input value={form.title} onChange={set('title')} required minLength={4} maxLength={90} placeholder="Build your first USDC payment app" />
        </Field>
        <Field label="Short summary" hint="Shown on course cards. One or two sentences." error={errors.summary}>
          <input value={form.summary} onChange={set('summary')} required minLength={10} maxLength={200} />
        </Field>
        <Field label="Full description" hint="What students will learn and who it’s for. Separate paragraphs with a blank line." error={errors.description}>
          <textarea value={form.description} onChange={set('description')} required minLength={20} rows={6} maxLength={5000} />
        </Field>
        <div className="field-row">
          <Field label="Category" error={errors.category}>
            <select value={form.category} onChange={set('category')}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Level" error={errors.level}>
            <select value={form.level} onChange={set('level')}>
              {levels.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Total length (minutes)" error={errors.durationMinutes}>
            <input type="number" min={5} max={10000} value={form.durationMinutes} onChange={set('durationMinutes')} placeholder="90" />
          </Field>
        </div>
      </section>

      <section className="form-card">
        <h2>Lessons</h2>
        <p className="muted">Only students who’ve paid can see lesson content. Everyone can see the titles.</p>
        {form.lessons.map((l, i) => (
          <fieldset key={i} className="lesson-edit">
            <legend>Lesson {i + 1}</legend>
            <div className="lesson-tools">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveLesson(i, -1)} disabled={i === 0} aria-label={`Move lesson ${i + 1} up`}>
                Move up
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveLesson(i, 1)} disabled={i === form.lessons.length - 1} aria-label={`Move lesson ${i + 1} down`}>
                Move down
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLesson(i)} disabled={form.lessons.length === 1}>
                Remove
              </button>
            </div>
            <Field label="Lesson title" error={errors[`lessons.${i}.title`]}>
              <input value={l.title} onChange={setLesson(i, 'title')} required minLength={2} maxLength={120} />
            </Field>
            <Field label="Lesson content" error={errors[`lessons.${i}.content`]}>
              <textarea value={l.content} onChange={setLesson(i, 'content')} required rows={6} maxLength={20000} />
            </Field>
            <div className="field-row">
              <Field label="Video link" hint="YouTube or Vimeo, optional" error={errors[`lessons.${i}.videoUrl`]}>
                <input type="url" value={l.videoUrl} onChange={setLesson(i, 'videoUrl')} placeholder="https://" />
              </Field>
              <Field label="Resources link" hint="Slides, repo or doc, optional" error={errors[`lessons.${i}.resourceUrl`]}>
                <input type="url" value={l.resourceUrl} onChange={setLesson(i, 'resourceUrl')} placeholder="https://" />
              </Field>
            </div>
          </fieldset>
        ))}
        <button type="button" className="btn btn-ghost" onClick={addLesson} disabled={form.lessons.length >= 50}>
          Add lesson
        </button>
      </section>

      <div className="form-actions sticky-actions">
        <Link to="/teach" className="btn btn-ghost">
          Cancel
        </Link>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Save draft'}
        </button>
      </div>
    </form>
  )
}
