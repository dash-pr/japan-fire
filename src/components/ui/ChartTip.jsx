import React from 'react'
import { yenM } from '../../lib/format'

export default function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded shadow-lg p-3 text-xs space-y-1 max-w-xs">
      <p className="font-semibold text-gray-700 mb-1">Age {label}</p>
      {payload.map((e,i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{color:e.color ?? e.fill}}>{e.name}</span>
          <span className="font-medium">{yenM(e.value)}</span>
        </div>
      ))}
    </div>
  )
}
