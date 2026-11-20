import { useCallback, useEffect, useRef, useState } from 'react'
import type { Option } from './content'
import { newSession, pickNext, recordAnswer, type PickKind } from './session'
import { dayNumber } from './srs'
import { answer, getProgress } from './store'

interface Card {
  key: string
  options: Option[]
}

export interface Deck<C extends Card> {
  card: C | null
  kind: PickKind
  /** index of the option the learner tapped, or null while the question is open */
  picked: number | null
  correct: boolean
  /** increases with every card; used as an animation key */
  serial: number
  choose: (i: number) => void
  next: () => void
}

/** Drives one quiz screen: picks items by spaced repetition, records answers. */
export function useDeck<C extends Card>(order: readonly string[], build: (key: string) => C): Deck<C> {
  const session = useRef(newSession())
  // The first card is picked synchronously so the screen never flashes an empty state.
  const [state, setState] = useState<{ card: C | null; kind: PickKind; picked: number | null; serial: number }>(() => {
    const pick = pickNext(order, getProgress().items, dayNumber(), session.current)
    return { card: pick ? build(pick.key) : null, kind: pick?.kind ?? 'new', picked: null, serial: 0 }
  })

  const next = useCallback(() => {
    const pick = pickNext(order, getProgress().items, dayNumber(), session.current)
    setState((s) => ({ card: pick ? build(pick.key) : null, kind: pick?.kind ?? 'new', picked: null, serial: s.serial + 1 }))
  }, [order, build])

  // A fresh card whenever the current one no longer belongs to the deck (e.g. its tense was switched off).
  const currentKey = state.card?.key
  useEffect(() => {
    if (currentKey === undefined || !order.includes(currentKey)) next()
  }, [order, currentKey, next])

  const choose = useCallback(
    (i: number) => {
      const { card, picked } = state
      if (!card || picked !== null) return
      const correct = card.options[i].correct
      answer(card.key, correct)
      session.current = recordAnswer(session.current, card.key, correct)
      navigator.vibrate?.(correct ? 12 : [30, 50, 30])
      setState((s) => ({ ...s, picked: i }))
    },
    [state],
  )

  const { card, kind, picked, serial } = state
  return { card, kind, picked, serial, correct: picked !== null && !!card?.options[picked].correct, choose, next }
}
