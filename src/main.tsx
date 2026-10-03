import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (
  import.meta.env.DEV &&
  import.meta.env.VITE_KITCHEN_HUB_LAN_MONITOR === '1'
) {
  void import('./lanMonitor').then(({ startLanMonitor }) => startLanMonitor())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
