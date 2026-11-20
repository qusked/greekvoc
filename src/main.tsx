import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { flush } from './lib/store'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // When a new version takes over a page that was running the old one, reload once to pick it up.
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    flush()
    location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        // A home-screen app is resumed, not reloaded, so check for updates whenever it comes back.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        })
      })
      .catch((e) => console.error('service worker', e))
  })
}
