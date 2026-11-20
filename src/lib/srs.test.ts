import { describe, expect, it } from 'vitest'
import { buildVerbCard, buildWordCard, distinctTenses, fold, tenseForms, verbOrder, type Content, type Verb, type Word } from './content'
import { newSession, pickNext, recordAnswer } from './session'
import { applyAnswer, dayKey, dayNumber, INTERVALS, markKnown, REMEMBERED_BOX, statusOf, unmarkKnown, type ItemState } from './srs'
import { sanitize, streak } from './store'

const T = 20_000

describe('srs', () => {
  it('walks a new item through the intervals until it is remembered', () => {
    let s = applyAnswer(undefined, true, T)
    expect(s).toMatchObject({ box: 1, due: T + 1, right: 1, wrong: 0 })
    expect(statusOf(s)).toBe('learning')
    let day = T
    for (let box = 2; box <= REMEMBERED_BOX; box++) {
      day = s.due
      s = applyAnswer(s, true, day)
      expect(s.box).toBe(box)
      expect(s.due).toBe(day + INTERVALS[box])
    }
    expect(statusOf(s)).toBe('known')
    expect(day - T).toBe(1 + 3 + 7)
  })

  it('does not advance when practised before the due day', () => {
    const s = applyAnswer(undefined, true, T)
    const again = applyAnswer(s, true, T)
    expect(again.box).toBe(1)
    expect(again.due).toBe(T + 1)
    expect(again.right).toBe(2)
  })

  it('resets on a wrong answer, even for a known item', () => {
    const known = markKnown(undefined, T)
    expect(statusOf(known)).toBe('known')
    expect(known.due).toBe(T + 35)
    const failed = applyAnswer(known, false, T + 3)
    expect(failed).toMatchObject({ box: 0, due: T + 3, wrong: 1 })
    expect(failed.known).toBeUndefined()
    expect(statusOf(failed)).toBe('learning')
    expect(applyAnswer(failed, true, T + 3).box).toBe(1)
  })

  it('markKnown never lowers a higher box; unmarkKnown returns the item to learning', () => {
    const high: ItemState = { box: 6, due: T + 50, right: 6, wrong: 0, last: 0 }
    expect(markKnown(high, T)).toMatchObject({ box: 6, due: T + 50, known: true })
    const back = unmarkKnown(markKnown(undefined, T), T)
    expect(back).toMatchObject({ box: 1, due: T })
    expect(statusOf(back)).toBe('learning')
  })

  it('caps the box at the last interval', () => {
    let s: ItemState | undefined
    let day = T
    for (let i = 0; i < 20; i++) {
      s = applyAnswer(s, true, day)
      day = s.due
    }
    expect(s!.box).toBe(INTERVALS.length - 1)
  })

  it('uses local calendar days', () => {
    const d = new Date(2026, 10, 20, 23, 30)
    expect(dayKey(dayNumber(d))).toBe('2026-11-20')
    expect(dayNumber(new Date(2026, 10, 21, 0, 10)) - dayNumber(d)).toBe(1)
  })
})

describe('session', () => {
  const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const seen = (due: number, last = 0): ItemState => ({ box: 1, due, right: 1, wrong: 0, last })

  it('introduces new items in order when nothing is due', () => {
    expect(pickNext(order, {}, T, newSession())).toEqual({ key: 'a', kind: 'new' })
    expect(pickNext(order, { a: seen(T + 1) }, T, newSession())).toEqual({ key: 'b', kind: 'new' })
  })

  it('prefers due reviews but mixes in a new item every fourth card', () => {
    const items = { a: seen(T), b: seen(T - 1) }
    const s = newSession()
    expect(pickNext(order, items, T, s, () => 0)).toEqual({ key: 'b', kind: 'review' })
    expect(pickNext(order, items, T, { ...s, count: 3 }, () => 0)).toEqual({ key: 'c', kind: 'new' })
  })

  it('repeats a wrong answer after three other cards, not immediately', () => {
    let s = recordAnswer(newSession(), 'a', false)
    const items = { a: { ...seen(T), box: 0 } }
    expect(pickNext(order, items, T, s)?.key).toBe('b')
    s = recordAnswer(s, 'b', true)
    s = recordAnswer(s, 'c', true)
    expect(pickNext(order, items, T, s)?.key).not.toBe('a')
    s = recordAnswer(s, 'd', true)
    expect(pickNext(order, items, T, s)).toEqual({ key: 'a', kind: 'relearn' })
    s = recordAnswer(s, 'a', true)
    expect(s.relearn).toEqual([])
  })

  it('rotates extra practice through the deck instead of repeating the same few items', () => {
    const items = Object.fromEntries(order.map((k, i) => [k, seen(T + 1 + i, k === 'b' ? 50 : 10)]))
    const pick = pickNext(order, items, T, { ...newSession(), recent: ['a'] }, () => 0)
    expect(pick).toEqual({ key: 'c', kind: 'extra' })
  })

  it('falls back to extra practice when everything is learned and not due', () => {
    const items = Object.fromEntries(order.map((k, i) => [k, seen(T + 1 + i)]))
    const pick = pickNext(order, items, T, { ...newSession(), recent: ['a'] }, () => 0)
    expect(pick).toEqual({ key: 'b', kind: 'extra' })
  })

  it('never returns the card that was just shown while others exist', () => {
    const items = { a: seen(T), b: seen(T) }
    for (let i = 0; i < 20; i++) expect(pickNext(['a', 'b'], items, T, { ...newSession(), recent: ['a'] })?.key).toBe('b')
  })

  it('still returns a card when the deck has a single item', () => {
    expect(pickNext(['a'], { a: seen(T + 5) }, T, { ...newSession(), recent: ['a'] })?.key).toBe('a')
    expect(pickNext([], {}, T, newSession())).toBeNull()
  })
})

describe('content', () => {
  const grafo: Verb = {
    lemma: 'γράφω',
    ru: 'писать',
    voice: 'active',
    present: ['γράφω', 'γράφεις', 'γράφει', 'γράφουμε', 'γράφετε', 'γράφουν'],
    aorist: ['έγραψα', 'έγραψες', 'έγραψε', 'γράψαμε', 'γράψατε', 'έγραψαν'],
    imperfect: ['έγραφα', 'έγραφες', 'έγραφε', 'γράφαμε', 'γράφατε', 'έγραφαν'],
    subj: ['γράψω', 'γράψεις', 'γράψει', 'γράψουμε', 'γράψετε', 'γράψουν'],
  }
  const eimai: Verb = {
    lemma: 'είμαι',
    ru: 'быть',
    voice: 'passive',
    present: ['είμαι', 'είσαι', 'είναι', 'είμαστε', 'είστε', 'είναι'],
    aorist: ['ήμουν', 'ήσουν', 'ήταν', 'ήμασταν', 'ήσασταν', 'ήταν'],
    imperfect: ['ήμουν', 'ήσουν', 'ήταν', 'ήμασταν', 'ήσασταν', 'ήταν'],
    subj: ['είμαι', 'είσαι', 'είναι', 'είμαστε', 'είστε', 'είναι'],
  }
  const mk = (el: string, ru: string, pos = 'noun', topic = 't'): Word => ({
    el,
    ru,
    pos,
    level: 'A1',
    topic,
    phrases: [{ el: `Έχω ___ εδώ.`, answer: el, distractors: ['ένα', 'δύο', 'τρία'], ru: 'пример' }],
  })
  const words = [mk('το σπίτι', 'дом'), mk('το βιβλίο', 'книга'), mk('το νερό', 'вода'), mk('το παιδί', 'ребёнок'), mk('τρέχω', 'бежать', 'verb')]
  const content: Content = {
    words,
    verbs: [grafo, eimai],
    wordByKey: new Map(words.map((w) => [`w:${w.el}`, w])),
    verbByLemma: new Map([grafo, eimai].map((v) => [v.lemma, v])),
    wordOrder: words.map((w) => `w:${w.el}`),
  }

  it('builds the future tenses with θα', () => {
    expect(tenseForms(grafo, 'fut')[3]).toBe('θα γράψουμε')
    expect(tenseForms(grafo, 'futc')[0]).toBe('θα γράφω')
  })

  it('skips tenses that duplicate another tense of the same verb', () => {
    const all = ['pres', 'aor', 'fut', 'impf', 'futc'] as const
    expect(distinctTenses(grafo, all)).toEqual([...all])
    expect(distinctTenses(eimai, all)).toEqual(['pres', 'aor', 'fut'])
    expect(verbOrder([grafo, eimai], ['aor', 'impf'])).toEqual(['v:γράφω:aor', 'v:γράφω:impf', 'v:είμαι:aor'])
    // a tense is only a duplicate of another ENABLED tense
    expect(distinctTenses(eimai, ['pres', 'impf'])).toEqual(['pres', 'impf'])
    expect(distinctTenses(eimai, ['futc'])).toEqual(['futc'])
  })

  it('makes verb cards with four distinct options and exactly one correct', () => {
    for (const key of verbOrder([grafo, eimai], ['pres', 'aor', 'fut', 'impf', 'futc'])) {
      for (let i = 0; i < 30; i++) {
        const card = buildVerbCard(content, key)
        expect(card.options).toHaveLength(4)
        expect(new Set(card.options.map((o) => o.text)).size).toBe(4)
        expect(card.options.filter((o) => o.correct).map((o) => o.text)).toEqual([card.forms[card.person]])
      }
    }
  })

  it('makes gap and reverse word cards with one correct option', () => {
    const gap = buildWordCard(content, 'w:το σπίτι', 0)
    expect(gap.type).toBe('gap')
    expect(gap.options.filter((o) => o.correct).map((o) => o.text)).toEqual(['το σπίτι'])
    const rev = buildWordCard(content, 'w:το σπίτι', 1)
    expect(rev.type).toBe('reverse')
    expect(rev.options).toHaveLength(4)
    expect(rev.options.filter((o) => o.correct).map((o) => o.text)).toEqual(['το σπίτι'])
    // same part of speech is preferred for the wrong options
    expect(rev.options.some((o) => o.text === 'τρέχω')).toBe(false)
  })

  it('folds accents and final sigma for search', () => {
    expect(fold('Άνθρωπος')).toBe('ανθρωποσ')
    expect(fold('σπίτι')).toBe(fold('ΣΠΙΤΙ'))
  })
})

describe('store helpers', () => {
  it('rejects junk and cleans a valid file', () => {
    expect(sanitize(null)).toBeNull()
    expect(sanitize({ v: 2, items: {}, days: {} })).toBeNull()
    const p = sanitize({
      v: 1,
      items: { 'w:α': { box: 2, due: 5, right: 2, wrong: 1, last: 9, known: true }, bad: { box: 'x' } },
      days: { '2026-11-20': { n: 5, ok: 4 }, nope: { n: 1, ok: 1 } },
      settings: { goal: 80, tenses: ['aor', 'zzz'], reverseShare: 7 },
    })!
    expect(Object.keys(p.items)).toEqual(['w:α'])
    expect(Object.keys(p.days)).toEqual(['2026-11-20'])
    expect(p.settings).toEqual({ goal: 80, tenses: ['aor'], reverseShare: 1 })
    expect(p.rev).toBe(0)
  })

  it('clamps damaged item values so scheduling never breaks', () => {
    const p = sanitize({ v: 1, rev: 7, items: { a: { box: -2, due: 5.4 }, b: { box: 2.5, due: 9 }, c: { box: 99, due: 1, right: -3 } }, days: { '2026-01-01': { n: 2, ok: 9 }, '2026-01-02': { n: -1, ok: 0 } } })!
    expect(p.rev).toBe(7)
    expect(p.items.a).toMatchObject({ box: 0, due: 5 })
    expect(p.items.b.box).toBe(3)
    expect(p.items.c).toMatchObject({ box: INTERVALS.length - 1, right: 0 })
    expect(p.days).toEqual({ '2026-01-01': { n: 2, ok: 2 } })
    expect(Number.isFinite(applyAnswer(p.items.b, true, 100).due)).toBe(true)
  })

  it('counts the streak up to today or yesterday', () => {
    const p = sanitize({ v: 1, items: {}, days: {} })!
    const d = (n: number) => dayKey(T - n)
    p.days = { [d(1)]: { n: 3, ok: 3 }, [d(2)]: { n: 1, ok: 0 }, [d(4)]: { n: 9, ok: 9 } }
    expect(streak(p, T)).toBe(2)
    p.days[d(0)] = { n: 1, ok: 1 }
    expect(streak(p, T)).toBe(3)
    expect(streak(p, T + 2)).toBe(0)
  })
})
