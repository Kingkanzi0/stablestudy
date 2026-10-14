import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CourseCard, EmptyState, ErrorState, Spinner } from '../components/common'
import { useApi } from '../hooks/useApi'

const SORTS = [
  ['popular', 'Most popular'],
  ['newest', 'Newest'],
  ['price_low', 'Price: low to high'],
  ['price_high', 'Price: high to low'],
]

export default function Explore() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') || 'All'
  const sort = params.get('sort') || 'popular'
  const search = params.get('q') || ''
  const [draft, setDraft] = useState(search)

  // Debounce typing into the URL so the list doesn't refetch on every key.
  useEffect(() => {
    const t = setTimeout(() => update({ q: draft.trim() || null }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  function update(next) {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }

  const query = new URLSearchParams({ sort, ...(search ? { search } : {}), ...(category !== 'All' ? { category } : {}) })
  const { data, isLoading, error, refetch } = useApi(`/courses?${query}`)
  const categories = ['All', ...(data?.categories || [])]

  return (
    <div className="page">
      <header className="page-head">
        <h1>Explore courses</h1>
        <p>Every course is priced in USDC and paid straight to its tutor.</p>
      </header>

      <div className="filters">
        <label className="search">
          <span className="sr-only">Search courses</span>
          <input
            type="search"
            placeholder="Search by topic or skill"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <label className="select">
          <span className="sr-only">Sort by</span>
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="chips" role="group" aria-label="Filter by category">
        {categories.map((c) => (
          <button
            key={c}
            className={`chip ${c === category ? 'chip-on' : ''}`}
            aria-pressed={c === category}
            onClick={() => update({ category: c === 'All' ? null : c })}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner label="Loading courses" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.courses.length === 0 ? (
        <EmptyState title="No courses match yet">
          Try a different search or category, or check back soon as new tutors join.
        </EmptyState>
      ) : (
        <div className="course-grid">
          {data.courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  )
}
