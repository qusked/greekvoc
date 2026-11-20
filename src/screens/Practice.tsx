import { useCallback, useState } from 'react'
import { Actions, DayBar, Empty, KindBadge, Options, Panel, Verdict } from '../components/Quiz'
import { buildWordCard, type Content, type Phrase, type WordCard } from '../lib/content'
import { getProgress, setKnown } from '../lib/store'
import { useDeck } from '../lib/useDeck'

export const POS_LABEL: Record<string, string> = {
  noun: 'ουσιαστικό',
  verb: 'ρήμα',
  adj: 'επίθετο',
  adv: 'επίρρημα',
  pron: 'αντωνυμία',
  prep: 'πρόθεση',
  conj: 'σύνδεσμος',
  num: 'αριθμητικό',
  phrase: 'έκφραση',
}

/** Greek sentence with the gap either open or filled with the answer. */
export function Sentence({ phrase, filled, tone }: { phrase: Phrase; filled: boolean; tone?: 'ok' | 'bad' }) {
  const [before, after] = phrase.el.split('___')
  return (
    <>
      {before}
      {filled ? <mark className={`gap filled ${tone ?? ''}`}>{phrase.answer}</mark> : <span className="gap" aria-label="κενό" />}
      {after}
    </>
  )
}

export default function Practice({ content }: { content: Content }) {
  const build = useCallback((key: string): WordCard => buildWordCard(content, key, getProgress().settings.reverseShare), [content])
  const deck = useDeck(content.wordOrder, build)
  const { card, picked, correct } = deck
  const answered = picked !== null
  // Tied to the card's serial, so it clears by itself whenever the card changes.
  const [revealedFor, setRevealedFor] = useState(-1)
  const revealed = revealedFor === deck.serial

  // A wrong answer shows the explanation straight away; after a right one it is opt-in.
  const shown = answered && (!correct || revealed)
  const next = deck.next

  if (!card) return <Empty>Δεν υπάρχουν λέξεις.</Empty>
  const tone = correct ? 'ok' : 'bad'

  return (
    <section className="quiz">
      <DayBar />
      <div className="quiz-body" key={deck.serial}>
        <KindBadge kind={deck.kind} extra={POS_LABEL[card.word.pos]} />
        {card.type === 'gap' ? (
          <p className="prompt" lang="el">
            <Sentence phrase={card.phrase} filled={answered} tone={tone} />
          </p>
        ) : (
          <div className="prompt-reverse">
            <span className="prompt-label">Πώς λέγεται στα ελληνικά;</span>
            <p className="prompt" lang="ru">
              {card.word.ru}
            </p>
          </div>
        )}
        <Verdict answered={answered} correct={correct} />
        {shown && (
          <Panel>
            {card.type === 'reverse' && (
              <p className="panel-el" lang="el">
                <Sentence phrase={card.phrase} filled />
              </p>
            )}
            <p className="panel-ru" lang="ru">
              {card.phrase.ru}
            </p>
            <p className="panel-word">
              <b lang="el">{card.word.el}</b> — <span lang="ru">{card.word.ru}</span>
            </p>
          </Panel>
        )}
      </div>
      <div className="quiz-foot">
        <Options options={card.options} picked={picked} onPick={deck.choose} key={deck.serial} />
      </div>
      <Actions
        answered={answered}
        correct={correct}
        revealLabel="Μετάφραση"
        revealed={shown}
        onReveal={() => setRevealedFor(revealed ? -1 : deck.serial)}
        onKnown={() => {
          setKnown(card.key, true)
          next()
        }}
        onNext={next}
      />
    </section>
  )
}
