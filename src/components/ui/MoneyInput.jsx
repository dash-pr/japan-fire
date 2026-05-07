import React, { useState, useEffect } from 'react'

export default function MoneyInput({ label, value, onChange, annual=false, helpText }) {
  const id = React.useId()
  const [rawVal, setRaw] = useState(String(value))
  useEffect(() => setRaw(String(value)), [value])
  const commit = () => { const n = Number(rawVal.replace(/,/g,'')); if (!isNaN(n) && n >= 0) onChange(n) }
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <label htmlFor={id}>{label}</label>
        {annual && <span className="text-gray-400">annual</span>}
        {helpText && <span className="text-gray-400 cursor-help" title={helpText}>ⓘ</span>}
      </div>
      <div className="flex items-center border rounded px-2 py-1 bg-white focus-within:ring-1 focus-within:ring-teal-400">
        <span className="text-gray-400 text-xs mr-1">¥</span>
        <input id={id} type="text" value={rawVal}
          onChange={e=>setRaw(e.target.value)}
          onBlur={commit} onKeyDown={e=>e.key==='Enter' && commit()}
          className="w-full outline-none text-xs" />
        <div className="flex flex-col ml-1">
          <button type="button" className="text-gray-400 hover:text-gray-600 leading-none text-[10px]"
            onClick={()=>onChange(value + (annual?10000:1000))}>▲</button>
          <button type="button" className="text-gray-400 hover:text-gray-600 leading-none text-[10px]"
            onClick={()=>onChange(Math.max(0, value - (annual?10000:1000)))}>▼</button>
        </div>
      </div>
    </div>
  )
}
