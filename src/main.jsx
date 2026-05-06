import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import FatFIREOptimizer from './FatFIREOptimizer'

function App(){
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <FatFIREOptimizer />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
