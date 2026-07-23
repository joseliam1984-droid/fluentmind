import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Limpieza PWA (respaldo del self-destruct de /sw.js, lado página): desaloja
// cualquier Service Worker / Cache Storage obsoleto para garantizar que la app
// nunca ejecute un bundle antiguo. No registra ningún SW nuevo.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length > 0) {
      Promise.all(regs.map((reg) => reg.unregister())).then(() => {
        if (typeof caches !== 'undefined') {
          caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        }
        console.log('[PWA] Old Service Worker removed. Cache cleared. Running latest bundle.')
      })
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
