import { shuffle } from './session'

export interface Phrase {
  el: string
  answer: string
  distractors: string[]
  ru: string
}

export interface Word {
  el: string
  ru: string
  pos: string
  level: 'A1' | 'A2' | 'B1'
  topic: string
  phrases: Phrase[]
}

export interface Verb {
  lemma: string
  ru: string
  voice: 'active' | 'passive'
  present: string[]
  aorist: string[]
  imperfect: string[]
  subj: string[]
}

export interface Content {
  words: Word[]
  verbs: Verb[]
  wordByKey: Map<string, Word>
  verbByLemma: Map<string, Verb>
  /** word item keys in introduction order */
  wordOrder: string[]
}

export const wordKey = (w: Word) => `w:${w.el}`

export async function loadContent(): Promise<Content> {
  const [w, v] = await Promise.all([import('../data/words.json'), import('../data/verbs.json')])
  const words = w.default as Word[]
  const verbs = v.default as Verb[]
  return {
    words,
    verbs,
    wordByKey: new Map(words.map((x) => [wordKey(x), x])),
    verbByLemma: new Map(verbs.map((x) => [x.lemma, x])),
    wordOrder: words.map(wordKey),
  }
}

// ───────────── tenses ─────────────

export const TENSES = ['pres', 'aor', 'fut', 'impf', 'futc'] as const
export type Tense = (typeof TENSES)[number]

export const TENSE_LABEL: Record<Tense, string> = {
  pres: 'Ενεστώτας',
  aor: 'Αόριστος',
  fut: 'Απλός μέλλοντας',
  impf: 'Παρατατικός',
  futc: 'Συνεχής μέλλοντας',
}

/** When the tense is used. Deliberately has no example form: an example would give away answers. */
export const TENSE_HINT: Record<Tense, string> = {
  pres: 'τώρα',
  aor: 'χθες, μία φορά',
  fut: 'αύριο, μία φορά',
  impf: 'παλιά, κάθε μέρα',
  futc: 'στο μέλλον, κάθε μέρα',
}

export const PERSONS = ['εγώ', 'εσύ', 'αυτός / αυτή', 'εμείς', 'εσείς', 'αυτοί / αυτές']

export function tenseForms(v: Verb, t: Tense): string[] {
  switch (t) {
    case 'pres':
      return v.present
    case 'aor':
      return v.aorist
    case 'impf':
      return v.imperfect
    case 'fut':
      return v.subj.map((f) => `θα ${f}`)
    case 'futc':
      return v.present.map((f) => `θα ${f}`)
  }
}

const same = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i])

/** Tenses that are worth drilling for this verb: drops ones identical to an earlier enabled tense (e.g. είμαι). */
export function distinctTenses(v: Verb, enabled: readonly Tense[]): Tense[] {
  const out: Tense[] = []
  for (const t of TENSES) {
    if (!enabled.includes(t)) continue
    const forms = tenseForms(v, t)
    if (!out.some((p) => same(tenseForms(v, p), forms))) out.push(t)
  }
  return out
}

export const verbKey = (lemma: string, t: Tense) => `v:${lemma}:${t}`

export function parseVerbKey(key: string): { lemma: string; tense: Tense } {
  const i = key.lastIndexOf(':')
  return { lemma: key.slice(2, i), tense: key.slice(i + 1) as Tense }
}

export function verbOrder(verbs: readonly Verb[], enabled: readonly Tense[]): string[] {
  return verbs.flatMap((v) => distinctTenses(v, enabled).map((t) => verbKey(v.lemma, t)))
}

// ───────────── cards ─────────────

export interface Option {
  text: string
  correct: boolean
}

export interface WordCard {
  type: 'gap' | 'reverse'
  key: string
  word: Word
  /** the phrase with the gap (gap mode) or an example shown after answering (reverse mode) */
  phrase: Phrase
  options: Option[]
}

export interface VerbCard {
  key: string
  verb: Verb
  tense: Tense
  person: number
  forms: string[]
  options: Option[]
}

const norm = (s: string) => s.trim().toLocaleLowerCase('el')

function uniqueOptions(answer: string, wrong: string[], rnd: () => number): Option[] {
  const seen = new Set([norm(answer)])
  const picked: Option[] = [{ text: answer, correct: true }]
  for (const w of wrong) {
    if (picked.length === 4) break
    if (!w || seen.has(norm(w))) continue
    seen.add(norm(w))
    picked.push({ text: w, correct: false })
  }
  return shuffle(picked, rnd)
}

export function buildWordCard(content: Content, key: string, reverseShare: number, rnd: () => number = Math.random): WordCard {
  const word = content.wordByKey.get(key)!
  const phrase = word.phrases[Math.floor(rnd() * word.phrases.length)]
  if (rnd() < reverseShare) {
    // Russian → Greek: distractors are other dictionary forms, same part of speech, same topic first.
    const others = shuffle(
      content.words.filter((w) => w !== word && w.pos === word.pos && norm(w.ru) !== norm(word.ru)),
      rnd,
    )
    const ranked = [...others.filter((w) => w.topic === word.topic), ...others.filter((w) => w.topic !== word.topic)]
    const fallback = shuffle(content.words.filter((w) => w !== word && w.pos !== word.pos), rnd)
    const options = uniqueOptions(word.el, [...ranked, ...fallback].slice(0, 12).map((w) => w.el), rnd)
    if (options.length === 4) return { type: 'reverse', key, word, phrase, options }
  }
  return { type: 'gap', key, word, phrase, options: uniqueOptions(phrase.answer, phrase.distractors, rnd) }
}

export function buildVerbCard(content: Content, key: string, rnd: () => number = Math.random): VerbCard {
  const { lemma, tense } = parseVerbKey(key)
  const verb = content.verbByLemma.get(lemma)!
  const forms = tenseForms(verb, tense)
  const person = Math.floor(rnd() * 6)
  // Tempting mistakes first: the same person in other tenses, then other persons of this tense.
  const otherTenses = shuffle(TENSES.filter((t) => t !== tense).map((t) => tenseForms(verb, t)[person]), rnd)
  const otherPersons = shuffle(forms.filter((_, i) => i !== person), rnd)
  const wrong = [...otherTenses.slice(0, 2), otherPersons[0], ...otherTenses.slice(2), ...otherPersons.slice(1)]
  return { key, verb, tense, person, forms, options: uniqueOptions(forms[person], wrong, rnd) }
}

/** Accent- and case-insensitive form used by the search box. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('el')
    .replace(/ς/g, 'σ')
}
