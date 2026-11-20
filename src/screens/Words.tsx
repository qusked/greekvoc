import { useEffect, useMemo, useRef, useState } from 'react'
import { fold, wordKey, type Content, type Word } from '../lib/content'
import { dayNumber, statusOf, type ItemState, type Status } from '../lib/srs'
import { resetItem, setKnown, useProgress } from '../lib/store'
import { POS_LABEL, Sentence } from './Practice'

type Filter = 'all' | Status

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Όλες' },
  { id: 'new', label: 'Νέες' },
  { id: 'learning', label: 'Μαθαίνω' },
  { id: 'known', label: 'Γνωστές' },
]

const PAGE = 60

function dueText(s: ItemState | undefined, today: number): string {
  if (!s) return 'Δεν την έχεις δει ακόμα.'
  const d = s.due - today
  const when = d <= 0 ? 'σήμερα' : d === 1 ? 'αύριο' : `σε ${d} μέρες`
  return `Επανάληψη ${when} · σωστά ${s.right}, λάθος ${s.wrong}`
}

function Row({ word, state, today }: { word: Word; state: ItemState | undefined; today: number }) {
  const [open, setOpen] = useState(false)
  const status = statusOf(state)
  const key = wordKey(word)
  return (
    <li className={`word${open ? ' open' : ''}`}>
      <button className="word-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <i className={`dot s-${status}`} aria-hidden />
        <span className="word-el" lang="el">
          {word.el}
        </span>
        <span className="word-ru" lang="ru">
          {word.ru}
        </span>
      </button>
      {open && (
        <div className="word-body">
          <p className="note">
            {POS_LABEL[word.pos] ?? word.pos} · {word.level} · {dueText(state, today)}
          </p>
          {word.phrases.map((ph, i) => (
            <div key={i} className="example">
              <p lang="el">
                <Sentence phrase={ph} filled />
              </p>
              <p className="panel-ru" lang="ru">
                {ph.ru}
              </p>
            </div>
          ))}
          <div className="actions-row">
            {status === 'known' ? (
              <button className="btn ghost" onClick={() => setKnown(key, false)}>
                Δεν το ξέρω καλά
              </button>
            ) : (
              <button className="btn ghost" onClick={() => setKnown(key, true)}>
                Το ξέρω
              </button>
            )}
            {state && (
              <button className="btn ghost" onClick={() => resetItem(key)}>
                Από την αρχή
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export default function Words({ content }: { content: Content }) {
  const { items } = useProgress()
  const today = dayNumber()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  const index = useMemo(() => content.words.map((w) => ({ w, hay: fold(`${w.el} ${w.ru}`) })), [content])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: content.words.length, new: 0, learning: 0, known: 0 }
    for (const w of content.words) c[statusOf(items[wordKey(w)])]++
    return c
  }, [content, items])

  const list = useMemo(() => {
    const q = fold(query.trim())
    return index.filter(({ w, hay }) => (filter === 'all' || statusOf(items[wordKey(w)]) === filter) && (!q || hay.includes(q))).map((x) => x.w)
    // Statuses are read when the filter or query changes, so a row does not vanish while it is being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, query, filter])

  useEffect(() => setLimit(PAGE), [query, filter])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setLimit((l) => l + PAGE), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [list])

  return (
    <section className="page">
      <h1>Λέξεις</h1>
      <div className="search-wrap">
        <input className="search" type="search" placeholder="Αναζήτηση: ελληνικά ή ρωσικά" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
        <div className="chips" role="group" aria-label="Φίλτρο">
          {FILTERS.map((f) => (
            <button key={f.id} className={`chip${filter === f.id ? ' on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <small>{counts[f.id]}</small>
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="empty">Δεν βρέθηκαν λέξεις.</p>
      ) : (
        <ul className="words">
          {list.slice(0, limit).map((w) => (
            <Row key={w.el} word={w} state={items[wordKey(w)]} today={today} />
          ))}
        </ul>
      )}
      {limit < list.length && <div ref={sentinel} className="sentinel" />}
    </section>
  )
}
