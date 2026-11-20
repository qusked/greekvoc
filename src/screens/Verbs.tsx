import { useCallback, useMemo, useState } from 'react'
import { Actions, DayBar, Empty, KindBadge, Options, Panel, Verdict } from '../components/Quiz'
import { buildVerbCard, PERSONS, TENSE_HINT, TENSE_LABEL, TENSES, verbOrder, type Content, type Tense, type VerbCard } from '../lib/content'
import { setKnown, updateSettings, useProgress } from '../lib/store'
import { useDeck } from '../lib/useDeck'

export default function Verbs({ content }: { content: Content }) {
  const enabled = useProgress().settings.tenses
  const tensesKey = enabled.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const order = useMemo(() => verbOrder(content.verbs, enabled), [content, tensesKey])
  const build = useCallback((key: string): VerbCard => buildVerbCard(content, key), [content])
  const deck = useDeck(order, build)
  const { card, picked, correct } = deck
  const answered = picked !== null
  // Tied to the card's serial, so it clears by itself whenever the card changes.
  const [revealedFor, setRevealedFor] = useState(-1)
  const revealed = revealedFor === deck.serial

  // A wrong answer shows the explanation straight away; after a right one it is opt-in.
  const shown = answered && (!correct || revealed)
  const next = deck.next

  const toggle = (t: Tense) => {
    const picked = enabled.includes(t) ? enabled.filter((x) => x !== t) : TENSES.filter((x) => x === t || enabled.includes(x))
    if (picked.length) updateSettings({ tenses: picked })
  }

  return (
    <section className="quiz">
      <DayBar />
      <div className="chips" role="group" aria-label="Χρόνοι">
        {TENSES.map((t) => (
          <button key={t} className={`chip${enabled.includes(t) ? ' on' : ''}`} aria-pressed={enabled.includes(t)} onClick={() => toggle(t)}>
            {TENSE_LABEL[t]}
          </button>
        ))}
      </div>
      {!card ? (
        <Empty>Δεν υπάρχουν ρήματα.</Empty>
      ) : (
        <>
          <div className="quiz-body" key={deck.serial}>
            <KindBadge kind={deck.kind} />
            <div className="verb-head">
              <p className="verb-lemma" lang="el">
                {card.verb.lemma}
              </p>
              <p className="verb-ru" lang="ru">
                {card.verb.ru}
              </p>
            </div>
            <div className="verb-task">
              <span className="tense">
                {TENSE_LABEL[card.tense]}
                <small>{TENSE_HINT[card.tense]}</small>
              </span>
              <p className="prompt" lang="el">
                {PERSONS[card.person]}{' '}
                {answered ? <mark className={`gap filled ${correct ? 'ok' : 'bad'}`}>{card.forms[card.person]}</mark> : <span className="gap" aria-label="κενό" />}
              </p>
            </div>
            <Verdict answered={answered} correct={correct} />
            {shown && (
              <Panel>
                <table className="conj" lang="el">
                  <caption>
                    {card.verb.lemma} · {TENSE_LABEL[card.tense]}
                  </caption>
                  <tbody>
                    {card.forms.map((f, i) => (
                      <tr key={i} className={i === card.person ? 'hit' : ''}>
                        <th scope="row">{PERSONS[i]}</th>
                        <td>{f}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
          <div className="quiz-foot">
            <Options grid options={card.options} picked={picked} onPick={deck.choose} key={deck.serial} />
          </div>
          <Actions
            answered={answered}
            correct={correct}
            revealLabel="Κλίση"
            revealed={shown}
            onReveal={() => setRevealedFor(revealed ? -1 : deck.serial)}
            onKnown={() => {
              setKnown(card.key, true)
              next()
            }}
            onNext={next}
          />
        </>
      )}
    </section>
  )
}
