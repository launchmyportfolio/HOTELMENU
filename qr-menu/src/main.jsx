import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CustomerSessionProvider } from './context/CustomerSessionContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CustomerSessionProvider>
      <App />
    </CustomerSessionProvider>
  </StrictMode>,
)
