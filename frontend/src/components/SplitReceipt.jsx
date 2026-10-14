import { useEffect, useState } from 'react'

const EXAMPLES = [
  { course: 'Solidity from zero', tutor: 'Amara O.', price: 2 },
  { course: 'Conversational French', tutor: 'Léa M.', price: 1.5 },
  { course: 'Figma for founders', tutor: 'Kenji T.', price: 3 },
]

const fmt = (n) => n.toFixed(2)

/** Hero illustration: one payment splitting between tutor and platform and settling on Arc. */
export default function SplitReceipt() {
  const [reduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState(reduced ? 2 : 0) // 0 paying, 1 split, 2 settled

  useEffect(() => {
    if (reduced) return
    const timers = [setTimeout(() => setPhase(1), 700), setTimeout(() => setPhase(2), 1500), setTimeout(() => {
      setPhase(0)
      setI((x) => (x + 1) % EXAMPLES.length)
    }, 5200)]
    return () => timers.forEach(clearTimeout)
  }, [i, reduced])

  const ex = EXAMPLES[i]
  const tutorCut = ex.price * 0.9
  const fee = ex.price * 0.1

  return (
    <figure className={`receipt phase-${phase}`} aria-label={`Example: a ${fmt(ex.price)} USDC payment splits ${fmt(tutorCut)} to the tutor and ${fmt(fee)} to SkillPay, settled on Arc`}>
      <div className="receipt-head">
        <span>Enrollment</span>
        <span className="receipt-chain">Arc</span>
      </div>
      <p className="receipt-course">{ex.course}</p>
      <p className="receipt-amount">
        {fmt(ex.price)} <span>USDC</span>
      </p>

      <div className="split-bar" aria-hidden="true">
        <span className="split-tutor" />
        <span className="split-fee" />
      </div>

      <dl className="receipt-lines">
        <div>
          <dt>
            <i className="swatch swatch-tutor" /> To {ex.tutor}
          </dt>
          <dd>{fmt(tutorCut)}</dd>
        </div>
        <div>
          <dt>
            <i className="swatch swatch-fee" /> SkillPay fee
          </dt>
          <dd>{fmt(fee)}</dd>
        </div>
      </dl>

      <div className="receipt-status">
        <span className="status-dot" />
        <span className="status-text">{phase < 2 ? 'Settling…' : 'Settled in 0.6 s. Final.'}</span>
      </div>
      <div className="receipt-tear" aria-hidden="true" />
    </figure>
  )
}
