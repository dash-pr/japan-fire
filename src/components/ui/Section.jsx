import React from 'react'

export default function Section({ title, children, defaultOpen=false, badge }) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex items-center justify-between cursor-pointer py-2 text-sm font-semibold text-gray-700 border-b border-gray-100 select-none">
        <span className="flex items-center gap-2">{title}{badge && <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">{badge}</span>}</span>
        <span className="text-gray-400 group-open:rotate-180 transition-transform text-xs">▾</span>
      </summary>
      <div className="pt-3 pb-1 space-y-3">{children}</div>
    </details>
  )
}
