import React from 'react'

export default function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <button type="button" role="switch" aria-checked={checked}
        onClick={()=>onChange(!checked)}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked) } }}
        className={`relative w-8 h-4 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-1 ${checked ? 'bg-teal-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-gray-700">{label}</span>
    </label>
  )
}
