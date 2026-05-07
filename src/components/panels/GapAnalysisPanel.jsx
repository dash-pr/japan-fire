import React, { useState, useMemo } from 'react'
import { formatJPY } from '../../lib/format'
import { runSimulation } from '../../simulation.js'
import { generateSuggestions, computeGapMetrics, EXPENSE_CATEGORIES, TIER_ICONS } from '../../gapAnalysis.js'

export default function GapAnalysisPanel({ simData, params, lifeEvents, bridgePhase, appliedCuts, setAppliedCuts }) {
  const [expanded, setExpanded] = useState(false)
  const [targetAge, setTargetAge] = useState(65)
  const [gapScenario, setGapScenario] = useState('base')

  const series = simData[gapScenario] ?? simData.base
  const gap = useMemo(() => computeGapMetrics(series, targetAge), [series, targetAge])
  const suggestions = useMemo(
    () => !gap.reached ? generateSuggestions(
      { ...params, ...appliedCuts },
      gapScenario,
      { lifeEvents, bridgePhase, targetAge }
    ) : [],
    [params, appliedCuts, gapScenario, lifeEvents, bridgePhase, targetAge, gap.reached]
  )

  // Compute running tally
  const appliedTotal = Object.values(appliedCuts).reduce((s, v) => {
    // each cut override maps param key -> new value; diff from original
    return s
  }, 0)

  // Find applied cuts impact
  const cutFireAge = useMemo(() => {
    if (!Object.keys(appliedCuts).length) return null
    const cutSeries = runSimulation({ ...params, ...appliedCuts }, gapScenario, { lifeEvents, bridgePhase })
    return cutSeries.find(r => r.fireCrossed)?.age ?? null
  }, [params, appliedCuts, gapScenario, lifeEvents, bridgePhase])

  const baseFireAge = series.find(r => r.fireCrossed)?.age ?? null

  // Monthly savings from applied cuts
  const cutMonthlySaving = useMemo(() => {
    let total = 0
    for (const [key, newVal] of Object.entries(appliedCuts)) {
      const cat = EXPENSE_CATEGORIES.find(c => c.key === key)
      if (!cat) continue
      const orig = cat.annual ? params[key] / 12 : params[key]
      const cur = cat.annual ? newVal / 12 : newVal
      total += orig - cur
    }
    return Math.round(total)
  }, [appliedCuts, params])

  if (gap.reached) return null

  const tierOrder = { painless: 0, consider: 1, major: 2 }
  const grouped = { painless: [], consider: [], major: [] }
  for (const s of suggestions.slice(0, 12)) {
    if (grouped[s.tier]) grouped[s.tier].push(s)
  }

  const isApplied = (s) => appliedCuts[s.overrideKey] !== undefined &&
    appliedCuts[s.overrideKey] === s.overrideValue

  const toggleCut = (s) => {
    setAppliedCuts(prev => {
      const next = { ...prev }
      if (isApplied(s)) delete next[s.overrideKey]
      else next[s.overrideKey] = s.overrideValue
      return next
    })
  }

  const tierMeta = {
    painless: { label: 'Painless', icon: TIER_ICONS.painless, color: 'bg-green-50 border-green-200', headColor: 'text-green-700', badgeColor: 'bg-green-100 text-green-700' },
    consider:  { label: 'Consider',  icon: TIER_ICONS.consider,  color: 'bg-amber-50 border-amber-200',  headColor: 'text-amber-700',  badgeColor: 'bg-amber-100 text-amber-700' },
    major:     { label: 'Major Change', icon: TIER_ICONS.major,  color: 'bg-red-50 border-red-200',    headColor: 'text-red-700',    badgeColor: 'bg-red-100 text-red-700' },
  }

  return (
    <div className="border border-amber-300 rounded-lg bg-amber-50 overflow-hidden">
      {/* Banner */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-100">
        <div className="flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-900 text-sm">
              FatFIRE not reached by age {targetAge} ({gapScenario} scenario)
            </p>
            <p className="text-xs text-amber-700">
              {gap.yearsGap > 0 ? `~${gap.yearsGap} years beyond target` : 'Portfolio grows but misses target'}
              {gap.shortfall > 0 && ` · ¥${formatJPY(gap.shortfall)}/mo additional savings needed`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-700">Scenario:</span>
            {['base','bear',...(params.customScenario?.enabled ? ['custom'] : [])].map(k => (
              <button key={k} onClick={()=>setGapScenario(k)}
                className={`px-2 py-0.5 rounded text-xs font-medium ${gapScenario===k ? 'bg-amber-700 text-white' : 'bg-white text-amber-700'}`}>
                {k.charAt(0).toUpperCase()+k.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-amber-700">Target age:</span>
            <input type="number" value={targetAge} min={50} max={89}
              onChange={e=>setTargetAge(Number(e.target.value))}
              className="w-12 border rounded px-1 py-0.5 text-center text-xs bg-white" />
          </div>
          <button onClick={()=>setExpanded(!expanded)}
            className="px-3 py-1.5 bg-amber-700 text-white rounded text-xs font-medium hover:bg-amber-800">
            {expanded ? 'Hide suggestions' : 'How to close the gap ▾'}
          </button>
        </div>
      </div>

      {/* Applied cuts tally */}
      {Object.keys(appliedCuts).length > 0 && (
        <div className={`px-4 py-2 text-xs flex items-center gap-4 ${cutFireAge ? 'bg-green-50 border-t border-green-200' : 'bg-amber-50 border-t border-amber-200'}`}>
          <span className="text-gray-600">
            Applied cuts: <strong>¥{formatJPY(cutMonthlySaving)}/mo</strong>
          </span>
          {baseFireAge && cutFireAge && cutFireAge < baseFireAge && (
            <span className="text-green-700 font-semibold">
              ✓ FatFIRE moved from age {baseFireAge} → age {cutFireAge} ({baseFireAge - cutFireAge} years earlier)
            </span>
          )}
          {cutFireAge && cutFireAge <= targetAge && (
            <span className="font-bold text-green-700">🎉 FatFIRE now achievable at age {cutFireAge}!</span>
          )}
          <button onClick={()=>setAppliedCuts({})} className="ml-auto text-red-500 hover:text-red-700 underline text-xs">
            Clear all cuts
          </button>
        </div>
      )}

      {/* Suggestions */}
      {expanded && (
        <div className="p-4 space-y-4">
          {Object.entries(tierMeta).map(([tier, meta]) => {
            const items = grouped[tier]
            if (!items?.length) return null
            return (
              <div key={tier}>
                <div className={`flex items-center gap-2 mb-2 text-sm font-semibold ${meta.headColor}`}>
                  <span>{meta.icon}</span> {meta.label}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {items.map((s, idx) => (
                    <div key={idx} className={`flex items-start gap-3 p-3 border rounded-lg ${meta.color}`}>
                      <input type="checkbox" checked={isApplied(s)} onChange={()=>toggleCut(s)}
                        className="mt-0.5 accent-teal-600" />
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-lg leading-none">{s.icon}</span>
                          <span className="font-medium text-gray-800">{s.label}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${meta.badgeColor}`}>{s.descLabel}</span>
                        </div>
                        <p className="text-gray-600 mt-0.5">
                          Save <strong>¥{formatJPY(s.cutMonthly)}/mo</strong>
                          {s.yearsSaved > 0
                            ? <> → FatFIRE <strong className="text-green-700">{s.yearsSaved.toFixed(1)} years earlier</strong></>
                            : s.newFireAge ? <> → FatFIRE at <strong className="text-green-700">age {s.newFireAge}</strong></>
                            : <> (insufficient alone)</>
                          }
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {suggestions.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No individual category reduction reaches the target — consider increasing income or investment returns.</p>
          )}
        </div>
      )}
    </div>
  )
}
