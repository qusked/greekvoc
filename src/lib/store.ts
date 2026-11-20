import { useSyncExternalStore } from 'react'
import { applyAnswer, dayKey, dayNumber, markKnown, MAX_BOX, unmarkKnown, type ItemState } from './srs'
import type { Tense } from './content'

export interface DayLog {
  /** answers given */
  n: number
  /** correct answers */
  ok: number
}

export interface Settings {
  goal: number
  tenses: Tense[]
  /** share of word cards asked as Russian → Greek */
  reverseShare: number
}

export interface Progress {
  v: 1
  /** increases with every change; the copy with the higher revision is the newer one */
  rev: number
  items: Record<string, ItemState>
  days: Record<string, DayLog>
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = { goal: 60, tenses: ['pres', 'aor', 'fut'], reverseShare: 0.25 }

const empty = (): Progress => ({ v: 1, rev: 0, items: {}, days: {}, settings: { ...DEFAULT_SETTINGS } })

// ───────────── IndexedDB (single key-value record) ─────────────

const DB = 'greek-learner'
const STORE = 'kv'
const KEY = 'progress'
const LS_KEY = 'greek-learner-progress'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(): Promise<unknown> {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

async function idbSet(value: Progress): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      // Quota and storage-pressure failures abort without an error event; settle so the save queue keeps going.
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  } finally {
    db.close()
  }
}

// ───────────── validation ─────────────

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Accepts anything (stored record or imported file) and returns a clean Progress, or null if unusable. */
export function sanitize(raw: unknown): Progress | null {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.items) || !isObj(raw.days)) return null
  const out = empty()
  out.rev = isNum(raw.rev) && raw.rev >= 0 ? Math.round(raw.rev) : 0
  const count = (x: unknown) => (isNum(x) && x > 0 ? Math.round(x) : 0)
  for (const [k, s] of Object.entries(raw.items)) {
    if (k === '__proto__' || !isObj(s) || !isNum(s.box) || !isNum(s.due)) continue
    out.items[k] = {
      box: Math.min(MAX_BOX, Math.max(0, Math.round(s.box))),
      due: Math.round(s.due),
      right: count(s.right),
      wrong: count(s.wrong),
      last: isNum(s.last) ? s.last : 0,
      ...(s.known === true ? { known: true } : {}),
    }
  }
  for (const [k, d] of Object.entries(raw.days)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(d) && isNum(d.n) && isNum(d.ok) && d.n >= 0 && d.ok >= 0) {
      const n = Math.round(d.n)
      out.days[k] = { n, ok: Math.min(n, Math.round(d.ok)) }
    }
  }
  if (isObj(raw.settings)) {
    const s = raw.settings
    if (isNum(s.goal) && s.goal >= 1) out.settings.goal = Math.round(s.goal)
    if (Array.isArray(s.tenses)) {
      const t = s.tenses.filter((x): x is Tense => ['pres', 'aor', 'fut', 'impf', 'futc'].includes(x as string))
      if (t.length) out.settings.tenses = t
    }
    if (isNum(s.reverseShare)) out.settings.reverseShare = Math.min(1, Math.max(0, s.reverseShare))
  }
  return out
}

// ───────────── store ─────────────

let state: Progress = empty()
let loaded = false
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined
let saving: Promise<void> = Promise.resolve()
/** the localStorage text this instance last read or wrote; anything else there came from another tab or window */
let lastLs: string | null = null
let seenDay = dayNumber()

const notify = () => listeners.forEach((l) => l())

function persist() {
  const snapshot = state
  // localStorage is a synchronous safety net in case the tab is closed mid-write.
  try {
    const json = JSON.stringify(snapshot)
    localStorage.setItem(LS_KEY, json)
    lastLs = json
  } catch {
    /* quota or private mode: IndexedDB remains the source of truth */
  }
  saving = saving.then(() => idbSet(snapshot)).catch((e) => console.error('save failed', e))
}

/** Takes over progress saved by another open tab or window, so a stale copy never overwrites newer answers. */
function adopt(raw: string | null) {
  if (!loaded || raw === null || raw === lastLs) return
  let next: Progress | null = null
  try {
    next = sanitize(JSON.parse(raw))
  } catch {
    return
  }
  if (!next || next.rev < state.rev) return
  clearTimeout(saveTimer)
  saveTimer = undefined
  lastLs = raw
  state = next
  notify()
}

function resync() {
  try {
    adopt(localStorage.getItem(LS_KEY))
  } catch {
    /* storage unavailable */
  }
  // After midnight the day counter, streak and due counts must refresh even without a new answer.
  const d = dayNumber()
  if (d !== seenDay) {
    seenDay = d
    state = { ...state }
    notify()
  }
}

function commit(next: Progress) {
  state = { ...next, rev: state.rev + 1 }
  notify()
  if (!loaded) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    persist()
  }, 150)
}

export function flush() {
  if (!loaded || saveTimer === undefined) return
  clearTimeout(saveTimer)
  saveTimer = undefined
  persist()
}

let initPromise: Promise<void> | undefined

/** Loads saved progress once; safe to call repeatedly. */
export function initStore(): Promise<void> {
  return (initPromise ??= load())
}

async function load(): Promise<void> {
  let fromIdb: Progress | null = null
  try {
    fromIdb = sanitize(await idbGet())
  } catch (e) {
    console.error('load failed', e)
  }
  let fromLs: Progress | null = null
  try {
    fromLs = sanitize(JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'))
  } catch {
    /* ignore */
  }
  // The two copies only differ if a write was interrupted: take the newer revision, then the one with more answers.
  const total = (p: Progress | null) => (p ? Object.values(p.days).reduce((a, d) => a + d.n, 0) : -1)
  const rev = (p: Progress | null) => (p ? p.rev : -1)
  const lsNewer = rev(fromLs) !== rev(fromIdb) ? rev(fromLs) > rev(fromIdb) : total(fromLs) > total(fromIdb)
  state = (lsNewer ? fromLs : fromIdb) ?? fromLs ?? empty()
  try {
    lastLs = localStorage.getItem(LS_KEY)
  } catch {
    /* ignore */
  }
  loaded = true
  notify()
  navigator.storage?.persist?.().catch(() => {})
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? flush() : resync()))
  window.addEventListener('pagehide', flush)
  window.addEventListener('pageshow', resync)
  window.addEventListener('storage', (e) => e.key === LS_KEY && adopt(e.newValue))
  setInterval(resync, 60_000)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useProgress = () => useSyncExternalStore(subscribe, () => state)
export const getProgress = () => state

export function answer(key: string, correct: boolean) {
  const today = dayNumber()
  const dk = dayKey(today)
  const day = state.days[dk] ?? { n: 0, ok: 0 }
  commit({
    ...state,
    items: { ...state.items, [key]: applyAnswer(state.items[key], correct, today) },
    days: { ...state.days, [dk]: { n: day.n + 1, ok: day.ok + (correct ? 1 : 0) } },
  })
}

export function setKnown(key: string, known: boolean) {
  const today = dayNumber()
  const prev = state.items[key]
  if (!known && !prev) return
  commit({ ...state, items: { ...state.items, [key]: known ? markKnown(prev, today) : unmarkKnown(prev, today) } })
}

export function resetItem(key: string) {
  const items = { ...state.items }
  delete items[key]
  commit({ ...state, items })
}

export function updateSettings(patch: Partial<Settings>) {
  commit({ ...state, settings: { ...state.settings, ...patch } })
}

export function replaceAll(next: Progress) {
  commit(next)
  flush()
}

export function resetAll() {
  commit({ ...empty(), settings: state.settings })
  flush()
}

/**
 * True when the browser may delete saved progress on its own: the app runs in a normal browser tab
 * (not installed to the home screen) and the browser has not granted persistent storage.
 */
export async function storageAtRisk(): Promise<boolean> {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  if (standalone) return false
  try {
    return !(await navigator.storage.persisted())
  } catch {
    return true
  }
}

// ───────────── derived ─────────────

export function todayLog(p: Progress): DayLog {
  return p.days[dayKey(dayNumber())] ?? { n: 0, ok: 0 }
}

/** Consecutive practice days ending today (or yesterday, if today has not started yet). */
export function streak(p: Progress, today = dayNumber()): number {
  const has = (d: number) => (p.days[dayKey(d)]?.n ?? 0) > 0
  let d = has(today) ? today : today - 1
  let n = 0
  while (has(d)) {
    n++
    d--
  }
  return n
}
