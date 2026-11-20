import { useEffect, useState } from 'react'
import { loadContent, type Content } from './lib/content'
import { initStore } from './lib/store'
import Practice from './screens/Practice'
import Stats from './screens/Stats'
import Verbs from './screens/Verbs'
import Words from './screens/Words'

type Tab = 'practice' | 'verbs' | 'stats' | 'words'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'practice', label: 'Εξάσκηση', icon: 'M4 6.500A2.500 2.500 0 0 1 6.500 4h11A2.500 2.500 0 0 1 20 6.500v7a2.500 2.500 0 0 1-2.500 2.500H12l-4.500 4v-4h-1A2.500 2.500 0 0 1 4 13.500v-7Z' },
  { id: 'verbs', label: 'Ρήματα', icon: 'M12 7v5l3.500 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { id: 'stats', label: 'Στατιστικά', icon: 'M5 20v-7m7 7V4m7 16v-11' },
  { id: 'words', label: 'Λέξεις', icon: 'M5 5.500A1.500 1.500 0 0 1 6.500 4H19v13H6.500A1.500 1.500 0 0 0 5 18.500v-13Zm0 13A1.500 1.500 0 0 0 6.500 20H19' },
]

export default function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('practice')

  useEffect(() => {
    Promise.all([loadContent(), initStore()])
      .then(([c]) => setContent(c))
      .catch((e) => {
        console.error(e)
        setError(true)
      })
  }, [])

  if (error) return <div className="splash">Κάτι πήγε στραβά. Δοκίμασε ξανά.</div>
  if (!content) return <div className="splash">Ελληνικά…</div>

  return (
    <div className="app">
      <main>
        {/* Quiz screens stay mounted so a card in progress survives switching tabs. */}
        <div hidden={tab !== 'practice'} className="screen">
          <Practice content={content} />
        </div>
        <div hidden={tab !== 'verbs'} className="screen">
          <Verbs content={content} />
        </div>
        {tab === 'stats' && (
          <div className="screen scroll">
            <Stats content={content} />
          </div>
        )}
        {tab === 'words' && (
          <div className="screen scroll">
            <Words content={content} />
          </div>
        )}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
              <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
