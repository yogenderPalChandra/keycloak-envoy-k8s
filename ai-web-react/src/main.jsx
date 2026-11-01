
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import keycloak from './keycloak.js'

const root = createRoot(document.getElementById('root'))

async function startApp() {
  try {
    const authenticated = await keycloak.init({
      onLoad: 'login-required',
      pkceMethod: 'S256',
    })

    if (authenticated) {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      )
    }
  } catch (error) {
    console.error('Keycloak initialization failed:', error)

    root.render(
      <div style={{ padding: '2rem' }}>
        Login initialization failed. Check the browser console.
      </div>,
    )
  }
}

startApp()
