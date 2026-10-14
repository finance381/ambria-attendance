import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/useAuth'
import App from './App'
import { LanguageProvider } from './lib/i18n'
import './index.css'

// Block pinch-zoom. iOS ignores user-scalable=no in the viewport tag, and a
// pinch-out shrank the whole app into a small box on the dark background.
// gesture* are Safari's pinch events; the touchmove guard covers the rest.
;['gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
  document.addEventListener(name, function (e) { e.preventDefault() }, { passive: false })
})
document.addEventListener('touchmove', function (e) {
  if (e.touches.length > 1) e.preventDefault()
}, { passive: false })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/ambria-attendance">
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/ambria-attendance/sw.js')
  })
}