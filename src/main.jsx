import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import FatFIREOptimizer from './FatFIREOptimizer'

function getSharedPlanId() {
  const match = window.location.pathname.match(/^\/p\/([A-Za-z0-9_-]{10})$/)
  return match ? match[1] : null
}

function App() {
  return <FatFIREOptimizer sharedPlanId={getSharedPlanId()} />
}

createRoot(document.getElementById('root')).render(<App />)
