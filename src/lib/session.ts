import type { ItemState } from './srs'

/** Per-screen, in-memory queue state. Not persisted. */
export interface Session {
  /** number of cards answered in this session */
  count: number
  /** keys of the most recent cards, newest last */
  recent: string[]
  /** items answered wrong, to be repeated a few cards later */
  relearn: { key: string; at: number }[]
}

export const newSession = (): Session => ({ count: 0, recent: [], relearn: [] })

const RELEARN_GAP = 3
const RECENT_WINDOW = 4
/** Every Nth card is a new item even when reviews are waiting. */
const NEW_EVERY = 4

export type PickKind = 'relearn' | 'review' | 'new' | 'extra'

/**
 * Chooses the next item.
 * Priority: wrong answers from this session (after a short gap) → due reviews mixed with new
 * items in introduction order → extra practice of the least recently seen items.
 */
export function pickNext(
  order: readonly string[],
  items: Readonly<Record<string, ItemState>>,
  today: number,
  session: Session,
  rnd: () => number = Math.random,
): { key: string; kind: PickKind } | null {
  if (order.length === 0) return null
  const recent = new Set(session.recent.slice(-RECENT_WINDOW))
  const inOrder = new Set(order)

  const ready = session.relearn.find((r) => session.count - r.at >= RELEARN_GAP && inOrder.has(r.key))
  if (ready) return { key: ready.key, kind: 'relearn' }

  const waiting = new Set(session.relearn.map((r) => r.key))
  const due: string[] = []
  let firstNew: string | undefined
  for (const key of order) {
    const s = items[key]
    if (!s) {
      if (firstNew === undefined && !recent.has(key)) firstNew = key
    } else if (s.due <= today && !recent.has(key) && !waiting.has(key)) {
      due.push(key)
    }
  }

  const wantNew = firstNew !== undefined && (due.length === 0 || session.count % NEW_EVERY === NEW_EVERY - 1)
  if (wantNew) return { key: firstNew!, kind: 'new' }
  if (due.length) {
    due.sort((a, b) => items[a].due - items[b].due || items[a].last - items[b].last)
    const pool = due.slice(0, 6)
    return { key: pool[Math.floor(rnd() * pool.length)], kind: 'review' }
  }

  const pending = session.relearn.find((r) => inOrder.has(r.key) && !recent.has(r.key))
  if (pending) return { key: pending.key, kind: 'relearn' }

  // Nothing new and nothing due: practise the least recently seen items, so extra practice rotates through the deck.
  const rest = order.filter((k) => !recent.has(k))
  const candidates = rest.length ? rest : [...order]
  candidates.sort((a, b) => (items[a]?.last ?? 0) - (items[b]?.last ?? 0) || (items[a]?.due ?? 0) - (items[b]?.due ?? 0))
  const pool = candidates.slice(0, 8)
  return { key: pool[Math.floor(rnd() * pool.length)], kind: 'extra' }
}

export function recordAnswer(session: Session, key: string, correct: boolean): Session {
  const relearn = session.relearn.filter((r) => r.key !== key)
  const count = session.count + 1
  if (!correct) relearn.push({ key, at: count })
  return { count, recent: [...session.recent.slice(-8), key], relearn }
}

export function shuffle<T>(arr: readonly T[], rnd: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
