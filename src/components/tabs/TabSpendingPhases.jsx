import React, { useState, useMemo } from 'react'
import {
  ComposedChart, Line, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'
import Toggle from '../ui/Toggle'
import { formatJPY } from '../../lib/format'
import { runSimulation, getScenarioConfig, computeMaxSustainable } from '../../simulation.js'

export default function TabSpendingPhases({ params, scenarios, lifeEvents, bridgePhase, appliedCuts, spendingPhases, setSpendingPhases }) {
  const setPhase = (id, field, val) => setSpendingPhases(sp => ({
    ...sp,
    phases: sp.phases.map(p => p.id === id ? { ...p, [field]: val } : p),
  }))
  const addPhase = () => {
    const last = spendingPhases.phases[spendingPhases.phases.length - 1]
    const newId = Math.max(...spendingPhases.phases.map(p => p.id)) + 1
    setSpendingPhases(sp => ({
      ...sp,
      phases: [...sp.phases, { id: newId, label: `Phase ${newId}`, startAge: last?.endAge ?? 65, endAge: (last?.endAge ?? 65) + 10, multiplier: 0.8, swr: 3.5 }],
    }))
  }
  const removePhase = (id) => setSpendingPhases(sp => ({ ...sp, phases: sp.phases.filter(p => p.id !== id) }))

  const opts = useMemo(() => ({ lifeEvents, bridgePhase, cutOverrides: appliedCuts }), [lifeEvents, bridgePhase, appliedCuts])

  const phasedSimData = useMemo(() => {
    if (!spendingPhases.enabled) return null
    return Object.fromEntries(scenarios.map(k => [k, runSimulation(params, k, { ...opts, spendingPhases })]))
  }, [params, scenarios, opts, spendingPhases])

  const flatSimData = useMemo(() => {
    const flatOpts = { ...opts, spendingPhases: { enabled: false, targetDepletionAge: spendingPhases.targetDepletionAge, phases: [] } }
    return Object.fromEntries(scenarios.map(k => [k, runSimulation(params, k, flatOpts)]))
  }, [params, scenarios, opts, spendingPhases.targetDepletionAge])

  const maxSustainable = useMemo(() => {
    if (!spendingPhases.enabled || spendingPhases.phases.length === 0) return null
    return computeMaxSustainable(params, scenarios, opts, spendingPhases)
  }, [params, scenarios, opts, spendingPhases])

  const [selectedScenario, setSelectedScenario] = useState('base')

  const fireAge = flatSimData.base?.find(r => r.fireCrossed)?.age ?? 55
  const baseExpenses = flatSimData.base?.find(r => r.age === fireAge)
  const monthlyBase = baseExpenses ? (baseExpenses.totalExpenses + baseExpenses.residenceTax) : 400_000

  const chartData = useMemo(() => {
    if (!phasedSimData) return []
    const start = fireAge
    const end = spendingPhases.targetDepletionAge
    return Array.from({ length: end - start + 1 }, (_, i) => {
      const age = start + i
      const pRow = phasedSimData[selectedScenario]?.find(r => r.age === age)
      const fRow = flatSimData[selectedScenario]?.find(r => r.age === age)
      const phase = spendingPhases.phases.find(ph => age >= ph.startAge && age < ph.endAge)
      return {
        age,
        phasedPortfolio: pRow ? pRow.totalPortfolio / 1_000_000 : 0,
        flatPortfolio: fRow ? fRow.totalPortfolio / 1_000_000 : 0,
        monthlySpend: phase ? Math.round(monthlyBase * phase.multiplier) : Math.round(monthlyBase),
      }
    })
  }, [phasedSimData, flatSimData, selectedScenario, fireAge, spendingPhases, monthlyBase])

  const longevityData = useMemo(() => {
    if (!spendingPhases.enabled || spendingPhases.phases.length === 0) return []
    const goGoPhase = spendingPhases.phases[0]
    if (!goGoPhase) return []
    return [90, 95, 100].map(targetAge => {
      let lo = 0.1, hi = 3.0
      const sc = getScenarioConfig(params, 'base')
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2
        const testPhases = { ...spendingPhases, targetDepletionAge: targetAge, phases: spendingPhases.phases.map(p => p.id === goGoPhase.id ? { ...p, multiplier: mid } : p) }
        const result = runSimulation(params, sc, { ...opts, spendingPhases: testPhases })
        const row = result.find(r => r.age === targetAge)
        if ((row?.totalPortfolio ?? 0) > 0) lo = mid; else hi = mid
      }
      return { targetAge, maxMultiplier: Math.round(lo * 100) / 100, maxMonthly: Math.round(monthlyBase * lo) }
    })
  }, [params, opts, spendingPhases, monthlyBase])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-800">Retirement Spending Phases</h2>
          <Toggle label="Enable" checked={spendingPhases.enabled}
            onChange={v => setSpendingPhases(sp => ({ ...sp, enabled: v }))} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Survive to:</span>
          <input type="number" min={80} max={105} value={spendingPhases.targetDepletionAge}
            onChange={e => setSpendingPhases(sp => ({ ...sp, targetDepletionAge: Number(e.target.value) }))}
            className="w-16 border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      {!spendingPhases.enabled && (
        <p className="text-sm text-gray-500">Enable spending phases to model different withdrawal rates across retirement. Early retirees typically spend more in "Go-Go" years (travel, energy) and less in later "No-Go" years.</p>
      )}

      {spendingPhases.enabled && (
        <>
          {/* Phase Editor */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {spendingPhases.phases.map(phase => (
              <div key={phase.id} className="border rounded-lg p-3 bg-gray-50 space-y-2">
                <div className="flex items-center justify-between">
                  <input value={phase.label} onChange={e => setPhase(phase.id, 'label', e.target.value)}
                    className="font-semibold text-sm bg-transparent border-b border-gray-300 focus:border-teal-500 outline-none w-24" />
                  {spendingPhases.phases.length > 1 && (
                    <button onClick={() => removePhase(phase.id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-gray-500">Start age</label>
                    <input type="number" min={30} max={100} value={phase.startAge}
                      onChange={e => setPhase(phase.id, 'startAge', Number(e.target.value))}
                      className="w-full border rounded px-1.5 py-0.5 mt-0.5" />
                  </div>
                  <div>
                    <label className="text-gray-500">End age</label>
                    <input type="number" min={phase.startAge + 1} max={105} value={phase.endAge}
                      onChange={e => setPhase(phase.id, 'endAge', Number(e.target.value))}
                      className="w-full border rounded px-1.5 py-0.5 mt-0.5" />
                  </div>
                </div>
                <div className="text-xs">
                  <label className="text-gray-500">Spending multiplier: {Math.round(phase.multiplier * 100)}%</label>
                  <input type="range" min={0.3} max={2.0} step={0.05} value={phase.multiplier}
                    onChange={e => setPhase(phase.id, 'multiplier', Number(e.target.value))}
                    className="w-full h-1.5 accent-teal-600" />
                  <div className="text-teal-700 font-medium">¥{formatJPY(monthlyBase * phase.multiplier)}/mo</div>
                </div>
                <div className="text-xs">
                  <label className="text-gray-500">Phase SWR: {phase.swr}%</label>
                  <input type="range" min={2.5} max={5.0} step={0.1} value={phase.swr}
                    onChange={e => setPhase(phase.id, 'swr', Number(e.target.value))}
                    className="w-full h-1.5 accent-teal-600" />
                </div>
              </div>
            ))}
          </div>
          <button onClick={addPhase} className="text-sm text-teal-600 hover:text-teal-800 font-medium">+ Add Phase</button>

          {/* Max Sustainable Withdrawal */}
          {maxSustainable && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-700">Max Sustainable Withdrawal</h3>
                <div className="flex gap-1">
                  {scenarios.map(k => (
                    <button key={k} onClick={() => setSelectedScenario(k)}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${selectedScenario === k ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {k.charAt(0).toUpperCase() + k.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {spendingPhases.phases.map(phase => {
                  const ms = maxSustainable[selectedScenario]?.find(m => m.phaseId === phase.id)
                  const headroom = ms ? Math.round((ms.maxMultiplier - phase.multiplier) * 100) : 0
                  const pct = ms ? Math.min(100, (phase.multiplier / ms.maxMultiplier) * 100) : 100
                  const color = headroom > 20 ? 'bg-green-500' : headroom > 5 ? 'bg-amber-500' : 'bg-red-500'
                  return (
                    <div key={phase.id} className="border rounded-lg p-3 bg-white space-y-1.5">
                      <div className="text-sm font-semibold text-gray-700">{phase.label} ({phase.startAge}-{phase.endAge})</div>
                      <div className="text-xs text-gray-600">
                        Current: {Math.round(phase.multiplier * 100)}% (¥{formatJPY(monthlyBase * phase.multiplier)}/mo)
                      </div>
                      <div className="text-xs text-gray-600">
                        Max: {ms ? `${Math.round(ms.maxMultiplier * 100)}% (¥${formatJPY(monthlyBase * ms.maxMultiplier)}/mo)` : '...'}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className={`text-xs font-medium ${headroom > 20 ? 'text-green-700' : headroom > 5 ? 'text-amber-700' : 'text-red-700'}`}>
                        Headroom: {headroom > 0 ? '+' : ''}{headroom}%
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Portfolio Chart */}
          {chartData.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-700">Portfolio Trajectory: Phased vs Flat SWR ({selectedScenario})</h3>
              <div className="h-80" aria-label="Spending phases portfolio chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="age" tickLine={false} />
                    <YAxis yAxisId="left" tickFormatter={v => `¥${v.toFixed(0)}M`} tickLine={false} width={60} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={v => `¥${(v/1000).toFixed(0)}k`} tickLine={false} width={60} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="bg-white border rounded shadow px-3 py-2 text-xs space-y-0.5">
                          <div className="font-semibold">Age {d.age}</div>
                          <div className="text-teal-700">Phased: ¥{d.phasedPortfolio.toFixed(1)}M</div>
                          <div className="text-gray-500">Flat SWR: ¥{d.flatPortfolio.toFixed(1)}M</div>
                          <div className="text-indigo-600">Spend: ¥{formatJPY(d.monthlySpend)}/mo</div>
                        </div>
                      )
                    }} />
                    <Area yAxisId="right" type="stepAfter" dataKey="monthlySpend" fill="#e0e7ff" stroke="#6366f1" strokeWidth={1} fillOpacity={0.3} name="Monthly spend" />
                    <Line yAxisId="left" type="monotone" dataKey="phasedPortfolio" stroke="#0d9488" strokeWidth={2} dot={false} name="Phased" />
                    <Line yAxisId="left" type="monotone" dataKey="flatPortfolio" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="Flat SWR" />
                    {params.showNenkin && <ReferenceLine x={65} yAxisId="left" stroke="#9ca3af" strokeDasharray="4 2" label={{ value: 'Nenkin', position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }} />}
                    {spendingPhases.phases.map((ph, i) => i > 0 && (
                      <ReferenceLine key={ph.id} x={ph.startAge} yAxisId="left" stroke="#cbd5e1" strokeDasharray="3 2" label={{ value: ph.label, position: 'insideTopRight', fontSize: 9, fill: '#64748b' }} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Longevity Sensitivity */}
          {longevityData.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-700">Longevity Sensitivity: Max "{spendingPhases.phases[0]?.label}" Spending</h3>
              <p className="text-xs text-gray-500">How much can you spend in your first retirement phase if you must survive to different ages? (Base scenario)</p>
              <div className="grid grid-cols-3 gap-3">
                {longevityData.map(d => (
                  <div key={d.targetAge} className="border rounded-lg p-3 text-center bg-gray-50">
                    <div className="text-xs text-gray-500">Survive to {d.targetAge}</div>
                    <div className="text-lg font-bold text-gray-800">{Math.round(d.maxMultiplier * 100)}%</div>
                    <div className="text-sm text-teal-700">¥{formatJPY(d.maxMonthly)}/mo</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
