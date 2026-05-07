import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import FatFIREOptimizer from './FatFIREOptimizer'

function App(){
  return <FatFIREOptimizer />
}

createRoot(document.getElementById('root')).render(<App />)
