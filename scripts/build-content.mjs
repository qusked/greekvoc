// Merges the verified files in content/raw into src/data/words.json and src/data/verbs.json.
// Validates structure, drops broken or duplicate entries and reports everything it dropped.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(root, 'content/raw')
const OUT = join(root, 'src/data')
mkdirSync(OUT, { recursive: true })

const POS = new Set(['noun', 'verb', 'adj', 'adv', 'pron', 'prep', 'conj', 'num', 'phrase'])
const LEVELS = ['A1', 'A2', 'B1']
const GREEK = /^[Ͱ-Ͽἀ-῿\s.,;!?·«»"'()\-–—:0-9/€%+…]+$/
const CYRILLIC = /[а-яё]/i
// A token that mixes Greek and Latin letters is almost always a look-alike typo (e.g. Latin "o" inside a Greek word).
const MIXED = /(?=\S*[a-zA-Z])(?=\S*[\u0370-\u03ff])\S+/
const LATIN_LOOKALIKE = { test: (s) => MIXED.test(s) }
const norm = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim()
const lower = (s) => norm(s).toLocaleLowerCase('el')
const problems = []
const note = (where, msg) => problems.push(`${where}: ${msg}`)

const files = existsSync(RAW) ? readdirSync(RAW).filter((f) => f.endsWith('.json')).sort() : []
const read = (f) => {
  try {
    const data = JSON.parse(readFileSync(join(RAW, f), 'utf8'))
    if (!Array.isArray(data)) throw new Error('not an array')
    return data
  } catch (e) {
    note(f, `unreadable (${e.message})`)
    return []
  }
}

// ───────────── words ─────────────

function checkPhrase(p, where) {
  if (!p || typeof p.el !== 'string' || typeof p.answer !== 'string' || typeof p.ru !== 'string' || !Array.isArray(p.distractors)) return 'bad shape'
  p.el = norm(p.el.replace(/_{2,}/g, '___'))
  p.answer = norm(p.answer)
  p.ru = norm(p.ru)
  p.distractors = p.distractors.filter((d) => typeof d === 'string').map(norm)
  if (p.el.split('___').length !== 2) return 'needs exactly one gap'
  if (p.el.startsWith('___')) return 'gap at sentence start'
  if (!p.answer || !p.ru) return 'empty answer or translation'
  if (!CYRILLIC.test(p.ru)) return 'translation is not Russian'
  const greekParts = [p.el.replace('___', ''), p.answer, ...p.distractors]
  if (greekParts.some((s) => LATIN_LOOKALIKE.test(s))) return `latin letters in Greek text`
  if (!GREEK.test(p.el.replace('___', ' ') + p.answer)) note(where, `unusual characters in "${p.el}"`)
  const seen = new Set([lower(p.answer)])
  p.distractors = p.distractors.filter((d) => d && !seen.has(lower(d)) && seen.add(lower(d)))
  if (p.distractors.length < 3) return 'fewer than 3 distinct distractors'
  p.distractors = p.distractors.slice(0, 3)
  return null
}

const byTopic = new Map()
const seenWords = new Map()
let rawCount = 0

for (const f of files.filter((f) => f.startsWith('words-'))) {
  const topic = f.match(/^words-(.+?)-\d+\.json$/)?.[1] ?? 'misc'
  for (const w of read(f)) {
    rawCount++
    const where = `${f} «${w?.el}»`
    if (!w || typeof w.el !== 'string' || typeof w.ru !== 'string' || !Array.isArray(w.phrases)) {
      note(where, 'dropped: bad shape')
      continue
    }
    const el = norm(w.el)
    if (LATIN_LOOKALIKE.test(el)) {
      note(where, 'dropped: latin letters in the word')
      continue
    }
    const id = lower(el)
    if (seenWords.has(id)) {
      note(where, `dropped: duplicate of ${seenWords.get(id)}`)
      continue
    }
    const phrases = []
    for (const p of w.phrases) {
      const err = checkPhrase(p, where)
      if (err) note(where, `phrase dropped: ${err}`)
      else phrases.push({ el: p.el, answer: p.answer, distractors: p.distractors, ru: p.ru })
    }
    if (!phrases.length) {
      note(where, 'dropped: no valid phrases')
      continue
    }
    seenWords.set(id, f)
    const word = {
      el,
      ru: norm(w.ru),
      pos: POS.has(w.pos) ? w.pos : 'phrase',
      level: LEVELS.includes(w.level) ? w.level : 'A2',
      topic,
      phrases,
    }
    if (!byTopic.has(topic)) byTopic.set(topic, [])
    byTopic.get(topic).push(word)
  }
}

// Introduction order: A1 before A2 before B1; inside a level, round-robin across topics so that
// every session mixes themes while keeping each author's "most useful first" order.
const words = []
for (const level of LEVELS) {
  const queues = [...byTopic.values()].map((list) => list.filter((w) => w.level === level))
  for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) words.push(q[i])
}

// ───────────── verbs ─────────────

const TENSE_KEYS = ['present', 'aorist', 'imperfect', 'subj']
const verbBatches = files.filter((f) => f.startsWith('verbs-')).map((f) => {
  const out = []
  for (const v of read(f)) {
    const where = `${f} «${v?.lemma}»`
    const ok =
      v && typeof v.lemma === 'string' && typeof v.ru === 'string' &&
      TENSE_KEYS.every((k) => Array.isArray(v[k]) && v[k].length === 6 && v[k].every((x) => typeof x === 'string' && x.trim() && !LATIN_LOOKALIKE.test(x)))
    if (!ok) {
      note(where, 'dropped: bad shape')
      continue
    }
    const verb = { lemma: norm(v.lemma), ru: norm(v.ru), voice: v.lemma.trim().endsWith('μαι') ? 'passive' : 'active' }
    for (const k of TENSE_KEYS) verb[k] = v[k].map((x) => norm(x).replace(/^(θα|να)\s+/, ''))
    if (lower(verb.present[0]) !== lower(verb.lemma)) note(where, `present[0] "${verb.present[0]}" differs from lemma`)
    out.push(verb)
  }
  return out
})
// Interleave the batches (regular, irregular, -μαι) so the drill mixes verb types from the start.
const verbs = []
const seenVerbs = new Set()
for (let i = 0; verbBatches.some((b) => i < b.length); i++) {
  for (const b of verbBatches) {
    if (i >= b.length || seenVerbs.has(b[i].lemma)) continue
    seenVerbs.add(b[i].lemma)
    verbs.push(b[i])
  }
}

writeFileSync(join(OUT, 'words.json'), JSON.stringify(words))
writeFileSync(join(OUT, 'verbs.json'), JSON.stringify(verbs))
writeFileSync(join(root, 'content/build-report.txt'), problems.join('\n') + '\n')

const count = (arr, key) => Object.entries(arr.reduce((a, x) => ((a[x[key]] = (a[x[key]] ?? 0) + 1), a), {})).map(([k, n]) => `${k} ${n}`).join(', ')
console.log(`words: ${words.length} kept of ${rawCount} raw, ${words.reduce((a, w) => a + w.phrases.length, 0)} phrases`)
console.log(`  levels: ${count(words, 'level')}`)
console.log(`  topics: ${count(words, 'topic')}`)
console.log(`  pos:    ${count(words, 'pos')}`)
console.log(`verbs: ${verbs.length}`)
console.log(`${problems.length} notes written to content/build-report.txt`)
if (words.length < 100 || verbs.length < 10) {
  console.error('content looks incomplete, refusing to build')
  process.exit(1)
}
