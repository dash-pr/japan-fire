import React from 'react'
import { SCENARIO_COLORS } from '../../simulation.js'

export default function ScenarioPicker({ value, onChange, scenarios }) {
  return (
    <div className="flex gap-1">
      {scenarios.map(k => (
        <button key={k} onClick={() => onChange(k)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${value === k ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          style={value === k ? { background: SCENARIO_COLORS[k] } : undefined}>
          {k.charAt(0).toUpperCase() + k.slice(1)}
        </button>
      ))}
    </div>
  )
}
