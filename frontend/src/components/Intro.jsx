import { useEffect, useState } from 'react'

const KEY = 'isabi.intro'

function shouldPlay() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  try {
    if (sessionStorage.getItem(KEY)) return false
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* storage blocked: play it, it's short */
  }
  return true
}

// Decided once when the app loads (not during render), so it plays on the first page only.
const PLAY_ON_LOAD = shouldPlay()

/** Opening animation, once per visit: the gold "i" blinks, "Sabi" slides in, then the tagline. Tap to skip. */
export default function Intro() {
  const [show, setShow] = useState(PLAY_ON_LOAD)
  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), 3000)
    return () => clearTimeout(t)
  }, [show])
  if (!show) return null
  return (
    <div className="intro" aria-hidden="true" onClick={() => setShow(false)}>
      <div className="intro-mark">
        <span className="intro-i">i</span>
        <span className="intro-sabi">Sabi</span>
      </div>
      <p className="intro-tag">Learn it. Do it. Get paid.</p>
    </div>
  )
}
