import { useEffect, useMemo, useRef, useState } from 'react'
import { FlameIcon } from '../components/Quiz'
import { TENSE_LABEL, verbOrder, type Content } from '../lib/content'
import { dayKey, dayNumber, isDue, statusOf, type ItemState } from '../lib/srs'
import { replaceAll, resetAll, sanitize, storageAtRisk, streak, todayLog, updateSettings, useProgress, type Progress } from '../lib/store'

interface Tally {
  known: number
  learning: number
  fresh: number
  due: number
  total: number
}

function tally(keys: readonly string[], items: Record<string, ItemState>, today: number): Tally {
  const t: Tally = { known: 0, learning: 0, fresh: 0, due: 0, total: keys.length }
  for (const k of keys) {
    const s = items[k]
    const st = statusOf(s)
    if (st === 'known') t.known++
    else if (st === 'learning') t.learning++
    else t.fresh++
    if (isDue(s, today)) t.due++
  }
  return t
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

function Stack({ t }: { t: Tally }) {
  return (
    <div className="stack" aria-hidden>
      <i className="s-known" style={{ flexGrow: t.known }} />
      <i className="s-learning" style={{ flexGrow: t.learning }} />
      <i className="s-new" style={{ flexGrow: t.fresh }} />
    </div>
  )
}

function Legend({ t }: { t: Tally }) {
  return (
    <ul className="legend">
      <li>
        <i className="s-known" /> Γνωστές <b>{t.known}</b>
      </li>
      <li>
        <i className="s-learning" /> Μαθαίνω <b>{t.learning}</b>
      </li>
      <li>
        <i className="s-new" /> Νέες <b>{t.fresh}</b>
      </li>
    </ul>
  )
}

function Ring({ value, max }: { value: number; max: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const frac = Math.min(1, max ? value / max : 0)
  return (
    <svg className={`ring${frac >= 1 ? ' done' : ''}`} viewBox="0 0 120 120" role="img" aria-label={`Σήμερα ${value} από ${max}`}>
      <circle cx="60" cy="60" r={r} className="ring-track" />
      <circle cx="60" cy="60" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 60 60)" />
      <text x="60" y="58" textAnchor="middle" className="ring-num">
        {value}
      </text>
      <text x="60" y="78" textAnchor="middle" className="ring-sub">
        από {max}
      </text>
    </svg>
  )
}

const WEEKS = 14
const WEEKDAYS = ['Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ', 'Κ']

function Calendar({ p, today }: { p: Progress; today: number }) {
  // Columns are weeks (Monday first); the last column is the current week.
  const dow = (new Date(today * 86_400_000).getUTCDay() + 6) % 7
  const start = today - dow - (WEEKS - 1) * 7
  const cells = []
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const day = start + w * 7 + d
      const n = p.days[dayKey(day)]?.n ?? 0
      const level = day > today ? -1 : n === 0 ? 0 : n >= p.settings.goal ? 3 : n >= p.settings.goal / 2 ? 2 : 1
      cells.push(<i key={day} className={`cal-cell l${level}${day === today ? ' today' : ''}`} style={{ gridColumn: w + 2, gridRow: d + 1 }} title={`${dayKey(day)}: ${n}`} />)
    }
  }
  return (
    <div className="cal" aria-label="Δραστηριότητα">
      {WEEKDAYS.map((l, i) => (
        <span key={i} className="cal-day" style={{ gridColumn: 1, gridRow: i + 1 }}>
          {i % 2 === 0 ? l : ''}
        </span>
      ))}
      {cells}
    </div>
  )
}

export default function Stats({ content }: { content: Content }) {
  const p = useProgress()
  const today = dayNumber()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [atRisk, setAtRisk] = useState(false)

  useEffect(() => {
    storageAtRisk().then(setAtRisk)
  }, [])

  const s = useMemo(() => {
    const words = tally(content.wordOrder, p.items, today)
    const levels = (['A1', 'A2', 'B1'] as const).map((lv) => ({
      lv,
      t: tally(content.words.filter((w) => w.level === lv).map((w) => `w:${w.el}`), p.items, today),
    }))
    const verbs = tally(verbOrder(content.verbs, p.settings.tenses), p.items, today)
    const all = Object.values(p.days).reduce((a, d) => ({ n: a.n + d.n, ok: a.ok + d.ok }), { n: 0, ok: 0 })
    return { words, levels, verbs, all, days: Object.values(p.days).filter((d) => d.n > 0).length }
  }, [content, p, today])

  const log = todayLog(p)

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(p)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ellinika-${dayKey(today)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    setMessage('Το αρχείο αποθηκεύτηκε.')
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const next = sanitize(JSON.parse(await file.text()))
      if (!next) throw new Error('bad file')
      replaceAll(next)
      setMessage('Η πρόοδος φορτώθηκε.')
    } catch {
      setMessage('Το αρχείο δεν είναι έγκυρο.')
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <section className="page">
      <h1>Στατιστικά</h1>

      <div className="card hero">
        <Ring value={log.n} max={p.settings.goal} />
        <dl className="hero-facts">
          <div>
            <dt>Σερί ημερών</dt>
            <dd className="flame">
              <FlameIcon /> {streak(p, today)}
            </dd>
          </div>
          <div>
            <dt>Σωστά σήμερα</dt>
            <dd>{log.n ? `${pct(log.ok, log.n)}%` : '—'}</dd>
          </div>
          <div>
            <dt>Για επανάληψη</dt>
            <dd>{s.words.due + s.verbs.due}</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h2>Λέξεις</h2>
        <p className="big">
          {s.words.known}
          <small> / {s.words.total} γνωστές</small>
        </p>
        <Stack t={s.words} />
        <Legend t={s.words} />
        <div className="levels">
          {s.levels.map(({ lv, t }) => (
            <div key={lv} className="level">
              <span className="level-name">{lv}</span>
              <Stack t={t} />
              <span className="level-num">
                {t.known}/{t.total}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Ρήματα</h2>
        <p className="big">
          {s.verbs.known}
          <small> / {s.verbs.total} τύποι</small>
        </p>
        <Stack t={s.verbs} />
        <Legend t={s.verbs} />
        <p className="note">{p.settings.tenses.map((t) => TENSE_LABEL[t]).join(' · ')}</p>
      </div>

      <div className="card">
        <h2>Δραστηριότητα</h2>
        <Calendar p={p} today={today} />
        <dl className="totals">
          <div>
            <dt>Απαντήσεις</dt>
            <dd>{s.all.n}</dd>
          </div>
          <div>
            <dt>Σωστές</dt>
            <dd>{s.all.n ? `${pct(s.all.ok, s.all.n)}%` : '—'}</dd>
          </div>
          <div>
            <dt>Μέρες</dt>
            <dd>{s.days}</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h2>Ρυθμίσεις</h2>
        <div className="setting">
          <span>Στόχος ημέρας</span>
          <div className="stepper">
            <button aria-label="Λιγότερα" onClick={() => updateSettings({ goal: Math.max(10, p.settings.goal - 10) })}>
              −
            </button>
            <b>{p.settings.goal}</b>
            <button aria-label="Περισσότερα" onClick={() => updateSettings({ goal: Math.min(500, p.settings.goal + 10) })}>
              +
            </button>
          </div>
        </div>
        <div className="setting">
          <span>
            Ρωσικά → ελληνικά
            <small>πόσο συχνά</small>
          </span>
          <div className="stepper">
            <button aria-label="Λιγότερο" onClick={() => updateSettings({ reverseShare: Math.max(0, Math.round(p.settings.reverseShare * 20 - 1) / 20) })}>
              −
            </button>
            <b>{Math.round(p.settings.reverseShare * 100)}%</b>
            <button aria-label="Περισσότερο" onClick={() => updateSettings({ reverseShare: Math.min(1, Math.round(p.settings.reverseShare * 20 + 1) / 20) })}>
              +
            </button>
          </div>
        </div>
        {atRisk && (
          <p className="warn" role="note">
            Η πρόοδος αποθηκεύεται μόνο σε αυτόν τον browser και μπορεί να σβηστεί αν δεν ανοίξεις τη σελίδα για μέρες. Πρόσθεσε την εφαρμογή στην αρχική οθόνη και
            κράτα αντίγραφο με την «Εξαγωγή προόδου».
          </p>
        )}
        <div className="setting-buttons">
          <button className="btn ghost" onClick={exportFile}>
            Εξαγωγή προόδου
          </button>
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>
            Εισαγωγή προόδου
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          {confirmReset ? (
            <div className="confirm">
              <span>Να σβηστεί όλη η πρόοδος;</span>
              <button
                className="btn danger"
                onClick={() => {
                  resetAll()
                  setConfirmReset(false)
                  setMessage('Η πρόοδος σβήστηκε.')
                }}
              >
                Ναι, σβήσε
              </button>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>
                Άκυρο
              </button>
            </div>
          ) : (
            <button className="btn ghost danger-text" onClick={() => setConfirmReset(true)}>
              Διαγραφή προόδου
            </button>
          )}
        </div>
        {message && (
          <p className="note" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  )
}
