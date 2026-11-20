/** Spaced-repetition engine. Pure functions, no I/O. Days are local-calendar day numbers. */

export interface ItemState {
  /** 0 = just failed / relearning, 1..MAX_BOX = consecutive successful reviews */
  box: number
  /** day number when the item is due for review */
  due: number
  right: number
  wrong: number
  /** set when the learner tapped "I know this" */
  known?: boolean
  /** ms timestamp of the last answer */
  last: number
}

export type Status = 'new' | 'learning' | 'known'

/** Days until the next review after reaching each box. */
export const INTERVALS = [0, 1, 3, 7, 16, 35, 70, 140]
export const MAX_BOX = INTERVALS.length - 1
/** An item counts as remembered from this box on (4 correct reviews spread over ~11 days). */
export const REMEMBERED_BOX = 4
/** Box given by "I know this": remembered, checked again in 35 days. */
export const KNOWN_BOX = 5

export function dayNumber(date: Date = new Date()): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000)
}

export function dayKey(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10)
}

export function statusOf(s: ItemState | undefined): Status {
  if (!s) return 'new'
  return s.box >= REMEMBERED_BOX ? 'known' : 'learning'
}

export function isDue(s: ItemState | undefined, today: number): boolean {
  return !!s && s.due <= today
}

export function applyAnswer(prev: ItemState | undefined, correct: boolean, today: number, now = Date.now()): ItemState {
  const s: ItemState = prev ? { ...prev } : { box: 0, due: today, right: 0, wrong: 0, last: now }
  s.last = now
  if (!correct) {
    s.wrong++
    s.box = 0
    s.due = today
    delete s.known
    return s
  }
  s.right++
  // Answering before the due day is extra practice: it must not shortcut the schedule.
  const early = !!prev && prev.due > today
  if (!early) {
    s.box = Math.min(s.box + 1, MAX_BOX)
    s.due = today + (INTERVALS[s.box] ?? 0)
  }
  return s
}

export function markKnown(prev: ItemState | undefined, today: number, now = Date.now()): ItemState {
  const s: ItemState = prev ? { ...prev } : { box: 0, due: today, right: 0, wrong: 0, last: now }
  if (s.box < KNOWN_BOX) {
    s.box = KNOWN_BOX
    s.due = today + INTERVALS[KNOWN_BOX]
  }
  s.known = true
  s.last = now
  return s
}

/** Sends a known item back to the learning queue (used from the word list). */
export function unmarkKnown(prev: ItemState, today: number): ItemState {
  const s = { ...prev, box: 1, due: today }
  delete s.known
  return s
}
