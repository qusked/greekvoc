import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import type { Option } from '../lib/content'
import type { PickKind } from '../lib/session'
import { streak, todayLog, useProgress } from '../lib/store'

/** Thin daily-goal bar shown above both quiz screens. */
export function DayBar() {
  const p = useProgress()
  const { n } = todayLog(p)
  const goal = p.settings.goal
  const done = n >= goal
  return (
    <header className="daybar">
      <div className="daybar-track" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(n, goal)}>
        <div className={`daybar-fill${done ? ' done' : ''}`} style={{ width: `${Math.min(100, (n / goal) * 100)}%` }} />
      </div>
      <span className="daybar-count">
        {n}
        <small> / {goal}</small>
      </span>
      <span className="daybar-streak" aria-label="Σερί ημερών">
        <FlameIcon /> {streak(p)}
      </span>
    </header>
  )
}

const KIND_LABEL: Record<PickKind, string> = {
  new: 'Νέο',
  review: 'Επανάληψη',
  relearn: 'Ξανά',
  extra: 'Εξτρά εξάσκηση',
}

export function KindBadge({ kind, extra }: { kind: PickKind; extra?: string }) {
  return (
    <div className="badges">
      <span className={`badge badge-${kind}`}>{KIND_LABEL[kind]}</span>
      {extra && <span className="badge">{extra}</span>}
    </div>
  )
}

export function Options({ options, picked, onPick, grid }: { options: Option[]; picked: number | null; onPick: (i: number) => void; grid?: boolean }) {
  return (
    <div className={`options${grid ? ' grid2' : ''}`}>
      {options.map((o, i) => {
        let cls = 'option'
        if (picked !== null) {
          if (o.correct) cls += picked === i ? ' right pop' : ' right'
          else if (picked === i) cls += ' wrong shake'
          else cls += ' dim'
        }
        return (
          <button key={i} className={cls} disabled={picked !== null} onClick={() => onPick(i)} lang="el">
            <span>{o.text}</span>
            {picked === i && o.correct && <Burst />}
          </button>
        )
      })}
    </div>
  )
}

/** Confetti burst for a correct answer. */
function Burst() {
  const bits = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4
        const dist = 46 + Math.random() * 54
        return {
          dx: `${Math.cos(angle) * dist}px`,
          dy: `${Math.sin(angle) * dist * 0.8}px`,
          hue: ['var(--success)', 'var(--gold)', 'var(--primary)', 'var(--error)'][i % 4],
          delay: `${Math.random() * 60}ms`,
        }
      }),
    [],
  )
  return (
    <span className="burst" aria-hidden>
      {bits.map((b, i) => (
        <i key={i} style={{ '--dx': b.dx, '--dy': b.dy, background: b.hue, animationDelay: b.delay } as CSSProperties} />
      ))}
    </span>
  )
}

interface ActionsProps {
  answered: boolean
  correct: boolean
  revealLabel: string
  revealed: boolean
  onReveal: () => void
  onKnown: () => void
  onNext: () => void
}

/** Buttons under the options. Wrong answer: only "continue". Right answer: reveal, "I know this", continue. */
export function Actions({ answered, correct, revealLabel, revealed, onReveal, onKnown, onNext }: ActionsProps) {
  if (!answered) return <div className="actions" aria-hidden />
  return (
    <div className="actions show">
      {correct && (
        <div className="actions-row">
          <button className="btn ghost" onClick={onReveal} aria-pressed={revealed}>
            {revealLabel}
          </button>
          <button className="btn ghost" onClick={onKnown}>
            <CheckIcon /> Το ξέρω
          </button>
        </div>
      )}
      <button className="btn primary" onClick={onNext}>
        Συνέχεια
      </button>
    </div>
  )
}

export function Verdict({ answered, correct }: { answered: boolean; correct: boolean }) {
  if (!answered) return <div className="verdict" aria-hidden />
  return (
    <div className={`verdict show ${correct ? 'ok' : 'bad'}`} role="status">
      {correct ? 'Σωστά!' : 'Λάθος'}
    </div>
  )
}

export function Panel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  // On short screens the panel can open below the fold of the scrollable card area.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  return (
    <div className="panel" ref={ref}>
      {children}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export const FlameIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
    <path
      fill="currentColor"
      d="M12 2c.6 3.2-1 5-2.6 6.800C7.900 10.500 6.500 12.200 6.500 15a5.500 5.500 0 0 0 11 0c0-2.200-.9-3.900-1.900-5.200-.3 1.300-1 2.200-2 2.700.4-3.600-.5-7.300-1.600-10.500Z"
    />
  </svg>
)

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <path fill="none" stroke="currentColor" strokeWidth="2.600" strokeLinecap="round" strokeLinejoin="round" d="m5 12.500 4.500 4.500L19 7.500" />
  </svg>
)
