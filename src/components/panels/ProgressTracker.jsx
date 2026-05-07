import React from 'react'
import Toggle from '../ui/Toggle'
import { yenM } from '../../lib/format'

export default function ProgressTracker({ simData, params, tracker, setTracker }) {
  const baseRow = tracker.enabled
    ? simData.base.find(r => r.age === tracker.currentAge) ?? simData.base[0]
    : null
  const baseFireTarget = simData.base.find(r => r.fireCrossed)?.fatFireTarget ?? 0
  const rawProgress = baseFireTarget > 0 ? (tracker.value / baseFireTarget) * 100 : 0
  const progress = isNaN(rawProgress) || !isFinite(rawProgress) ? 0 : Math.min(100, Math.round(rawProgress))
  const aheadBehind = baseRow ? tracker.value - baseRow.totalPortfolio : 0

  return (
    <div className="bg-white border-b px-6 py-2 flex items-center gap-6 flex-wrap text-xs">
      <div className="flex items-center gap-2">
        <Toggle label="Track progress" checked={tracker.enabled} onChange={v=>setTracker(t=>({...t,enabled:v}))} />
      </div>
      {tracker.enabled && <>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Current age:</span>
          <input type="number" value={tracker.currentAge} min={params.startAge} max={89}
            onChange={e=>setTracker(t=>({...t,currentAge:Number(e.target.value)}))}
            className="w-14 border rounded px-1.5 py-0.5 text-center text-xs" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Actual portfolio:</span>
          <span className="text-gray-400">¥</span>
          <input type="number" value={tracker.value}
            onChange={e=>setTracker(t=>({...t,value:Number(e.target.value)}))}
            className="w-32 border rounded px-1.5 py-0.5 text-xs" />
        </div>
        <div className="flex-1 min-w-32">
          <div className="flex justify-between mb-0.5">
            <span className="text-gray-500">FatFIRE progress</span>
            <span className="font-bold text-teal-700">{progress}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all" style={{width:`${progress}%`}} />
          </div>
        </div>
        {aheadBehind !== 0 && (
          <span className={`font-semibold ${aheadBehind > 0 ? 'text-teal-600' : 'text-red-500'}`}>
            {aheadBehind > 0 ? '▲' : '▼'} {yenM(Math.abs(aheadBehind))} {aheadBehind > 0 ? 'ahead' : 'behind'} plan
          </span>
        )}
      </>}
    </div>
  )
}
