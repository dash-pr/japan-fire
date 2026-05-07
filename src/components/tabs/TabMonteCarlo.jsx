import React, { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, ComposedChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { C, PRESET_SCENARIOS } from '../../lib/constants'
import { axisM } from '../../lib/format'
import ChartTip from '../ui/ChartTip'

export default function TabMonteCarlo({ params, lifeEvents, bridgePhase, spendingPhases, scenarios }) {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState({})
  const [activeScenario, setActiveScenario] = useState('base')

  useEffect(() => { setResults({}) }, [params])

  const runSingle = async (scenarioKey) => {
    const res = await fetch('/api/montecarlo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        params,
        scenarioKey,
        numSims: 500,
        opts: { lifeEvents, bridgePhase, spendingPhases },
      }),
    })
    if (!res.ok) throw new Error(`Monte Carlo failed for ${scenarioKey}`)
    return res.json()
  }

  const runOne = async (key) => {
    setRunning(true)
    setActiveScenario(key)
    try {
      const result = await runSingle(key)
      setResults(prev => ({ ...prev, [key]: result }))
    } catch (e) { console.error(e) }
    setRunning(false)
  }

  const runAll = async () => {
    setRunning(true)
    try {
      const entries = await Promise.all(
        scenarios.map(async (key) => {
          const result = await runSingle(key)
          return [key, result]
        })
      )
      setResults(Object.fromEntries(entries))
    } catch (e) { console.error(e) }
    setRunning(false)
  }

  const result = results[activeScenario]
  const fanData = result?.percentiles

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {scenarios.map(k => (
            <button key={k} onClick={() => { setActiveScenario(k); if (!results[k]) runOne(k) }}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${activeScenario === k ? 'text-white border-transparent' : 'border-gray-200 text-gray-600'}`}
              style={activeScenario === k ? { background: C[k] } : {}}>
              {k.charAt(0).toUpperCase() + k.slice(1)}
              {results[k] && ' ✓'}
            </button>
          ))}
        </div>
        <button onClick={() => runOne(activeScenario)} disabled={running}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
          {running ? <><span className="animate-spin">⟳</span> Running...</> : '▶ Run 500 sims'}
        </button>
        <button onClick={runAll} disabled={running}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
          {running ? '...' : `▶▶ Run All (${scenarios.length} scenarios)`}
        </button>
        <span className="text-xs text-gray-400">σ=8% around scenario mean · server-side</span>
      </div>

      {!result && !running && (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-sm">
          Click "Run" to generate probability distribution, or "Run All" for all scenarios
        </div>
      )}

      {running && (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <div className="animate-spin w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-500">Running Monte Carlo simulation on server...</p>
        </div>
      )}

      {result && !running && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'P(FIRE by 55)', val: `${result.stats.probBy55}%`, color: result.stats.probBy55 > 50 ? 'text-teal-600' : 'text-red-500' },
              { label: 'P(FIRE by 60)', val: `${result.stats.probBy60}%`, color: result.stats.probBy60 > 50 ? 'text-teal-600' : 'text-red-500' },
              { label: 'P(FIRE by 65)', val: `${result.stats.probBy65}%`, color: result.stats.probBy65 > 50 ? 'text-teal-600' : 'text-red-500' },
              { label: 'P(survive to 90)', val: `${result.stats.probSurvive90}%`, color: result.stats.probSurvive90 > 80 ? 'text-teal-600' : 'text-amber-600' },
              { label: 'Median FIRE age', val: result.stats.medianFireAge ? `${result.stats.medianFireAge}` : '—', color: 'text-gray-900' },
            ].map(s => (
              <div key={s.label} className="border rounded p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Cross-scenario comparison (if multiple results available) */}
          {Object.keys(results).length > 1 && (
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Scenario Comparison</h3>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="font-medium text-gray-500">Scenario</div>
                <div className="font-medium text-gray-500 text-center">P(FIRE by 60)</div>
                <div className="font-medium text-gray-500 text-center">Median FIRE Age</div>
                <div className="font-medium text-gray-500 text-center">P(survive 90)</div>
                {Object.entries(results).map(([k, r]) => (
                  <React.Fragment key={k}>
                    <div className="font-semibold" style={{ color: C[k] }}>{k.charAt(0).toUpperCase() + k.slice(1)}</div>
                    <div className="text-center">{r.stats.probBy60}%</div>
                    <div className="text-center">{r.stats.medianFireAge ?? '—'}</div>
                    <div className="text-center">{r.stats.probSurvive90}%</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Fan chart */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Portfolio Fan Chart — Percentile Bands</h3>
            <div aria-label="Monte Carlo fan chart" className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fanData} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="age" tickLine={false} />
                  <YAxis tickFormatter={axisM} tickLine={false} width={60} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="p90" name="P90" stroke="none" fill={C[activeScenario]} fillOpacity={0.08} />
                  <Area type="monotone" dataKey="p75" name="P75" stroke="none" fill={C[activeScenario]} fillOpacity={0.12} />
                  <Area type="monotone" dataKey="p25" name="P25" stroke="none" fill="white" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="p10" name="P10" stroke="none" fill="white" fillOpacity={0.5} />
                  <Line type="monotone" dataKey="p50" name="Median" stroke={C[activeScenario]} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 justify-center text-xs mt-1">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block opacity-80" style={{ background: C[activeScenario] }} />10th–90th %ile band</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{ background: C[activeScenario] }} />Median path</span>
            </div>
          </div>

          {/* Histogram */}
          {result.histogram.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Distribution of FatFIRE Ages</h3>
              <div aria-label="FatFIRE age histogram" className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.histogram} margin={{ top: 5, right: 20, left: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="age" tickLine={false} />
                    <YAxis tickLine={false} />
                    <Tooltip formatter={(v) => [`${v} simulations`, 'Count']} labelFormatter={l => `FatFIRE at age ${l}`} />
                    <Bar dataKey="count" name="Simulations" fill={C[activeScenario]} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {result.stats.medianFireAge && (
                <p className="text-xs text-gray-500 text-center mt-1">
                  Median FatFIRE age: <strong>{result.stats.medianFireAge}</strong> ·
                  {result.histogram.reduce((s, h) => s + h.count, 0)} of 500 paths reach FatFIRE before 90
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
