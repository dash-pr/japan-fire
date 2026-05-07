import React from 'react'

export default function SliderRow({ label, value, min, max, step, unit='', onChange, decimals=1, helpText }) {
  const id = React.useId()
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <label htmlFor={id} className="text-gray-600">{label}{helpText && <span className="ml-1 text-gray-400 cursor-help" title={helpText}>ⓘ</span>}</label>
        <span className="font-medium text-gray-900">{typeof value==='number' ? value.toFixed(decimals) : value}{unit}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))} className="w-full h-1.5 accent-teal-600" />
    </div>
  )
}
