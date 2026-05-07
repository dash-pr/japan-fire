import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceDot, Cell, PieChart, Pie, Brush,
} from 'recharts'
import { DEFAULTS, runSimulation, getScenarioConfig, SCENARIO_COLORS, computeResidenceTax, computeMaxSustainable } from './simulation.js'
import { generateSuggestions, computeGapMetrics, EXPENSE_CATEGORIES, TIER_ICONS, costInWorkingYears } from './gapAnalysis.js'
import { runMonteCarlo } from './monteCarlo.js'

// ─── Constants ─────────────────────────────────────────────────────────────────
const C = SCENARIO_COLORS
const PIE_COLORS = ['#6366f1','#3b82f6','#0ea5e9','#06b6d4','#14b8a6','#10b981',
  '#84cc16','#eab308','#f97316','#ef4444','#a855f7','#ec4899','#64748b','#94a3b8']
const PRESET_SCENARIOS = ['bear','base','bull']
const SCENARIO_DASHES = { bull: '', base: '8 4', bear: '4 4', custom: '2 2 6 2' }
const ALL_TABS = [
  { id:'fatfire',  label:'FatFIRE' },
  { id:'cashflow', label:'Cash Flow' },
  { id:'networth', label:'Net Worth' },
  { id:'budget',   label:'Budget' },
  { id:'alloc',    label:'Allocation' },
  { id:'phases',   label:'Spending Phases' },
  { id:'compare',  label:'Scenarios' },
  { id:'montecarlo', label:'Probability' },
]

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center space-y-4">
          <p className="text-red-600 font-semibold">Something went wrong</p>
          <p className="text-sm text-gray-500">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-teal-600 text-white rounded text-sm">Try again</button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── URL state persistence ──────────────────────────────────────────────────────
function encodeState(state) {
  try { return btoa(encodeURIComponent(JSON.stringify(state))) } catch { return '' }
}
function decodeState(hash) {
  try { return JSON.parse(decodeURIComponent(atob(hash))) } catch { return null }
}
function loadInitialState() {
  const hash = window.location.hash.slice(1)
  if (hash) {
    const s = decodeState(hash)
    if (s?.params) { s.params = migrateParams(s.params); return s }
  }
  return null
}
function migrateParams(p) {
  if (p.mortgageRateHikes && !p.mortgageRateGrowth) {
    const initial = p.initialMortgageRate ?? 1.5
    const purchase = p.propertyPurchaseAge ?? 40
    const convert = (hike) => {
      if (!hike) return { annualIncrease: 0, everyYears: 1, cap: initial }
      const years = Math.max(1, hike.atAge - purchase)
      return { annualIncrease: Math.round(((hike.newRate - initial) / years) * 100) / 100, everyYears: 1, cap: hike.newRate }
    }
    p.mortgageRateGrowth = {
      bear: convert(p.mortgageRateHikes.bear),
      base: convert(p.mortgageRateHikes.base),
      bull: convert(p.mortgageRateHikes.bull),
    }
    delete p.mortgageRateHikes
  }
  if (p.customScenario && 'hikeEnabled' in p.customScenario) {
    const cs = p.customScenario
    const initial = cs.mortgageRate ?? 1.5
    if (cs.hikeEnabled && cs.hikeRate) {
      const years = Math.max(1, (cs.hikeAge ?? 50) - (p.propertyPurchaseAge ?? 40))
      cs.rateIncrease = Math.round(((cs.hikeRate - initial) / years) * 100) / 100
      cs.rateCap = cs.hikeRate
    } else {
      cs.rateIncrease = 0
      cs.rateCap = initial
    }
    cs.rateEveryYears = 1
    delete cs.hikeEnabled; delete cs.hikeRate; delete cs.hikeAge
  }
  return p
}

// ─── Utilities ─────────────────────────────────────────────────────────────────
export function formatJPY(v) { return new Intl.NumberFormat('ja-JP').format(Math.round(v)) }
function yenM(v) {
  if (Math.abs(v) >= 1_000_000) return `¥${(v/1_000_000).toFixed(1)}M`
  return `¥${formatJPY(v)}`
}
function axisM(v) { return `¥${(v/1_000_000).toFixed(0)}M` }
function displayVal(realVal, age, params) {
  if (!params.showNominal) return Math.round(realVal)
  return Math.round(realVal * Math.pow(1 + params.inflation / 100, age - params.startAge))
}

// ─── UI Primitives ──────────────────────────────────────────────────────────────
function SliderRow({ label, value, min, max, step, unit='', onChange, decimals=1, helpText }) {
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

function MoneyInput({ label, value, onChange, annual=false, helpText }) {
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

function Section({ title, children, defaultOpen=false, badge }) {
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

function Toggle({ label, checked, onChange }) {
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

function ChartTip({ active, payload, label }) {
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

function ScenarioPicker({ value, onChange, scenarios }) {
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

// ─── Feature 10: Progress Tracker ─────────────────────────────────────────────
function ProgressTracker({ simData, params, tracker, setTracker }) {
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

// ─── Feature 3: Gap Analysis Panel ────────────────────────────────────────────
function GapAnalysisPanel({ simData, params, lifeEvents, bridgePhase, appliedCuts, setAppliedCuts }) {
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
    // each cut override maps param key → new value; diff from original
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

// ─── Feature 4: Sensitivity Tornado ────────────────────────────────────────────
function SensitivityChart({ params, lifeEvents, bridgePhase }) {
  const data = useMemo(() => {
    const baseFireAge = runSimulation(params, 'base', { lifeEvents, bridgePhase })
      .find(r => r.fireCrossed)?.age ?? 90

    const vars = [
      { name: 'Portfolio return', test: (v) => ({...params, returns:{...params.returns, base: v}}), low: params.returns.base - 2, high: params.returns.base + 2, unit:'%' },
      { name: 'Salary growth rate', test: (v) => ({...params, incomeGrowthRate: v}), low: Math.max(0, params.incomeGrowthRate - 2), high: params.incomeGrowthRate + 2, unit:'%' },
      { name: 'Annual inflation', test: (v) => ({...params, inflation: v}), low: Math.max(0, params.inflation - 1), high: params.inflation + 1, unit:'%' },
      { name: 'Mortgage rate', test: (v) => ({...params, initialMortgageRate: v}), low: Math.max(0.5, params.initialMortgageRate - 1), high: params.initialMortgageRate + 1, unit:'%' },
      { name: 'Partner housing share', test: (v) => ({...params, partnerHousingShare: v}), low: Math.max(0, params.partnerHousingShare - 10), high: Math.min(50, params.partnerHousingShare + 10), unit:'%' },
      { name: 'SWR', test: (v) => ({...params, swr: v}), low: Math.max(2.5, params.swr - 0.5), high: Math.min(5, params.swr + 0.5), unit:'%' },
      { name: 'Lifestyle spend', test: (v) => ({...params, fineDining: v/4, drinking: v/4*1.5, personalCare: v/4*0.75, groceries: params.groceries}), low: (params.fineDining+params.drinking+params.personalCare)*0.7, high: (params.fineDining+params.drinking+params.personalCare)*1.3, unit:'¥' },
      { name: 'SWR buffer', test: (v) => ({...params, swrBuffer: v}), low: Math.max(0, params.swrBuffer - 10), high: Math.min(30, params.swrBuffer + 10), unit:'%' },
      { name: 'Property purchase age', test: (v) => ({...params, propertyPurchaseAge: v}), low: Math.max(30, params.propertyPurchaseAge - 5), high: Math.min(55, params.propertyPurchaseAge + 5), unit:'' },
      { name: 'Income growth interval', test: (v) => ({...params, incomeGrowthStep: v}), low: Math.max(1, params.incomeGrowthStep - 1), high: params.incomeGrowthStep + 1, unit:'yr' },
    ]

    return vars.map(v => {
      const lowAge = runSimulation(v.test(v.low), 'base', { lifeEvents, bridgePhase }).find(r=>r.fireCrossed)?.age ?? 90
      const highAge = runSimulation(v.test(v.high), 'base', { lifeEvents, bridgePhase }).find(r=>r.fireCrossed)?.age ?? 90
      // For some vars, high = better (returns, salary); for others high = worse (inflation, mortgage rate)
      const deltaLow = lowAge - baseFireAge   // negative = retire earlier
      const deltaHigh = highAge - baseFireAge
      return {
        name: v.name,
        favorable: Math.min(deltaLow, deltaHigh),   // best case (most negative = best)
        unfavorable: Math.max(deltaLow, deltaHigh), // worst case
        lowAge, highAge, baseFireAge,
        lowLabel: `${v.low.toFixed(v.unit==='%'?1:0)}${v.unit}`,
        highLabel: `${v.high.toFixed(v.unit==='%'?1:0)}${v.unit}`,
      }
    }).sort((a,b) => (Math.abs(b.unfavorable - b.favorable)) - (Math.abs(a.unfavorable - a.favorable)))
  }, [params, lifeEvents, bridgePhase])

  const maxAbsVal = Math.max(...data.map(d => Math.max(Math.abs(d.favorable), Math.abs(d.unfavorable))), 1)

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Impact on FatFIRE age (base scenario) when each variable shifts by ±1 unit from current value.
        Bars sorted by total impact. <span className="text-teal-600">← Retire earlier</span> / <span className="text-red-500">Retire later →</span>
      </p>
      <div className="space-y-2">
        {data.map((d, i) => {
          const favorableW = Math.abs(d.favorable) / maxAbsVal * 45
          const unfavorableW = Math.abs(d.unfavorable) / maxAbsVal * 45
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-40 text-right text-gray-600 truncate text-xs">{d.name}</div>
              <div className="flex-1 flex items-center">
                {/* Left bar (favorable / earlier retirement) */}
                <div className="flex-1 flex justify-end items-center gap-1">
                  {d.favorable < 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-teal-600 font-medium whitespace-nowrap">{Math.abs(d.favorable).toFixed(0)}yr</span>
                      <div className="h-5 bg-teal-500 rounded-l" style={{width:`${favorableW * 2}px`}} title={`${d.lowLabel} → age ${d.lowAge}`} />
                    </div>
                  )}
                </div>
                {/* Centre line */}
                <div className="w-0.5 h-6 bg-gray-400 mx-1" />
                {/* Right bar (unfavorable / later retirement) */}
                <div className="flex-1 flex justify-start items-center gap-1">
                  {d.unfavorable > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="h-5 bg-red-400 rounded-r" style={{width:`${unfavorableW * 2}px`}} title={`${d.highLabel} → age ${d.highAge}`} />
                      <span className="text-red-500 font-medium whitespace-nowrap">+{d.unfavorable.toFixed(0)}yr</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-center gap-4 text-xs mt-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-teal-500 rounded inline-block" /> Retire earlier</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded inline-block" /> Retire later</span>
      </div>
    </div>
  )
}

// ─── Feature 7: Bridge Phase Panel ────────────────────────────────────────────
function BridgePhasePanel({ bridgePhase, setBridgePhase, params }) {
  return (
    <div className="border rounded-lg p-4 bg-indigo-50 border-indigo-200 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🌉</span>
          <span className="font-semibold text-indigo-800 text-sm">Semi-retirement Bridge</span>
        </div>
        <Toggle label="Enable" checked={bridgePhase.enabled}
          onChange={v=>setBridgePhase(b=>({...b,enabled:v}))} />
      </div>
      {bridgePhase.enabled && (
        <div className="grid grid-cols-3 gap-3">
          <SliderRow label="Bridge start age" value={bridgePhase.startAge} min={params.startAge+1} max={75}
            step={1} decimals={0} unit="" onChange={v=>setBridgePhase(b=>({...b,startAge:v}))} />
          <SliderRow label="Bridge end age" value={bridgePhase.endAge} min={bridgePhase.startAge+1} max={80}
            step={1} decimals={0} unit="" onChange={v=>setBridgePhase(b=>({...b,endAge:v}))} />
          <MoneyInput label="Bridge monthly income" value={bridgePhase.monthlyIncome}
            onChange={v=>setBridgePhase(b=>({...b,monthlyIncome:v}))} />
        </div>
      )}
    </div>
  )
}

// ─── Feature 9: Salary ROI Panel ──────────────────────────────────────────────
function SalaryROIPanel({ simData, params, lifeEvents, bridgePhase }) {
  const [raiseAmount, setRaiseAmount] = useState(50_000)
  const [raiseAge, setRaiseAge] = useState(32)

  const impact = useMemo(() => {
    const ev = [{ id:'salary-raise', age: raiseAge, type:'incomeChange', amount: raiseAmount, label:'Salary raise' }]
    const allEvs = [...lifeEvents, ...ev]
    const newSeries = {
      base: runSimulation(params, 'base', { lifeEvents: allEvs, bridgePhase }),
      bull: runSimulation(params, 'bull', { lifeEvents: allEvs, bridgePhase }),
      bear: runSimulation(params, 'bear', { lifeEvents: allEvs, bridgePhase }),
    }
    return ['base','bull','bear'].reduce((acc, k) => {
      const baseAge = simData[k]?.find(r=>r.fireCrossed)?.age ?? null
      const newAge = newSeries[k].find(r=>r.fireCrossed)?.age ?? null
      const delta = baseAge && newAge ? baseAge - newAge : null
      // Extra portfolio at FatFIRE age
      const fireRow = newSeries[k].find(r=>r.fireCrossed)
      const oldRow = simData[k]?.find(r=>r.age === (fireRow?.age ?? 90))
      const extraPortfolio = fireRow && oldRow ? fireRow.totalPortfolio - oldRow.totalPortfolio : null
      acc[k] = { baseAge, newAge, delta, extraPortfolio }
      return acc
    }, {})
  }, [raiseAmount, raiseAge, params, lifeEvents, bridgePhase, simData])

  // Tax drag estimate: ~43% combined marginal rate
  const monthlyTaxDrag = Math.round(raiseAmount * 0.43)
  const netMonthlyGain = raiseAmount - monthlyTaxDrag

  return (
    <details className="border rounded-lg overflow-hidden">
      <summary className="flex items-center gap-2 px-4 py-3 bg-blue-50 cursor-pointer text-sm font-semibold text-blue-800 select-none">
        <span>💼</span> Salary Negotiation ROI Calculator
        <span className="ml-auto text-blue-400 text-xs">▾</span>
      </summary>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <MoneyInput label="Monthly raise (¥)" value={raiseAmount} onChange={setRaiseAmount} />
          <SliderRow label="Starting at age" value={raiseAge} min={params.startAge} max={60}
            step={1} decimals={0} unit="" onChange={setRaiseAge} />
        </div>
        <div className="bg-blue-50 rounded p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Gross monthly raise</span>
            <span>¥{formatJPY(raiseAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax drag (~43% marginal)</span>
            <span className="text-red-500">−¥{formatJPY(monthlyTaxDrag)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-1">
            <span>Net investable gain</span>
            <span className="text-teal-700">+¥{formatJPY(netMonthlyGain)}/mo</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {['bull','base','bear'].map(k => (
            <div key={k} className="border rounded p-3 text-xs">
              <div className="font-semibold mb-2" style={{color:C[k]}}>{k.charAt(0).toUpperCase()+k.slice(1)}</div>
              <div className="space-y-1 text-gray-600">
                <div className="flex justify-between"><span>FatFIRE age</span><span>{impact[k]?.newAge ?? '—'}</span></div>
                <div className="flex justify-between"><span>Years earlier</span>
                  <span className={impact[k]?.delta > 0 ? 'text-teal-600 font-semibold' : ''}>
                    {impact[k]?.delta != null ? `${impact[k].delta > 0 ? '-' : '+'}${Math.abs(impact[k].delta)}yr` : '—'}
                  </span>
                </div>
                <div className="flex justify-between"><span>Extra portfolio</span>
                  <span>{impact[k]?.extraPortfolio ? yenM(impact[k].extraPortfolio) : '—'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          A ¥{formatJPY(raiseAmount)}/month raise at age {raiseAge} generates ~¥{formatJPY(netMonthlyGain*12)} additional investable per year after taxes.
        </p>
      </div>
    </details>
  )
}

// ─── Feature 6: Life Events Panel ─────────────────────────────────────────────
function LifeEventsPanel({ lifeEvents, setLifeEvents, params }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ age:40, type:'windfall', amount:5_000_000, label:'Inheritance', endAge:null, lifestyleReduction:0 })
  const idRef = useRef(0)

  const add = () => {
    const ev = { ...form, id: ++idRef.current }
    if (ev.type !== 'recurringExpense' && ev.type !== 'incomeChange') { delete ev.endAge; delete ev.lifestyleReduction }
    if (ev.type !== 'recurringExpense') delete ev.lifestyleReduction
    setLifeEvents(evs => [...evs, ev])
    setShowForm(false)
  }
  const remove = (id) => setLifeEvents(evs => evs.filter(e => e.id !== id))

  const HINTS = [
    { label:'First child at 35', age:35, type:'recurringExpense', amount:100_000, endAge:57, lifestyleReduction:0.30 },
    { label:'Second child at 37', age:37, type:'recurringExpense', amount:80_000, endAge:59, lifestyleReduction:0.10 },
    { label:'Inheritance ¥5M at 50', age:50, type:'windfall', amount:5_000_000, endAge:null, lifestyleReduction:0 },
    { label:'Car purchase ¥3M at 42', age:42, type:'expense', amount:3_000_000, endAge:null, lifestyleReduction:0 },
    { label:'Salary bump +¥50k at 35', age:35, type:'incomeChange', amount:50_000, endAge:null, lifestyleReduction:0 },
  ]

  const isRecurring = form.type === 'recurringExpense'
  const hasEndAge = form.type === 'recurringExpense' || form.type === 'incomeChange'

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
        <span className="font-semibold text-sm text-gray-700 flex items-center gap-2"><span>📅</span> Life Events</span>
        <button onClick={()=>setShowForm(!showForm)}
          className="text-xs bg-teal-600 text-white px-3 py-1 rounded hover:bg-teal-700">+ Add event</button>
      </div>

      {showForm && (
        <div className="p-4 border-b bg-gray-50 space-y-3">
          <div className="flex flex-wrap gap-2 mb-2">
            {HINTS.map(h=>(
              <button key={h.label} onClick={()=>setForm(f=>({...f,...h}))}
                className="text-xs border rounded px-2 py-1 text-gray-500 hover:bg-gray-100">{h.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-gray-600">Label</label>
              <input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))}
                className="w-full border rounded px-2 py-1 mt-0.5" />
            </div>
            <div>
              <label className="text-gray-600">Type</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}
                className="w-full border rounded px-2 py-1 mt-0.5">
                <option value="windfall">Windfall (add to portfolio)</option>
                <option value="expense">One-time expense (deduct)</option>
                <option value="incomeChange">Income change (permanent, ¥/mo)</option>
                <option value="recurringExpense">Recurring expense (¥/mo for a period)</option>
              </select>
            </div>
            <SliderRow label="Start age" value={form.age} min={params.startAge} max={89} step={1} decimals={0}
              onChange={v=>setForm(f=>({...f,age:v}))} />
            <MoneyInput label={isRecurring ? "Monthly cost (¥)" : "Amount (¥)"} value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} />
            {hasEndAge && (
              <SliderRow label="End age" value={form.endAge ?? form.age + 22} min={form.age+1} max={90} step={1} decimals={0}
                onChange={v=>setForm(f=>({...f,endAge:v}))} />
            )}
            {isRecurring && (
              <SliderRow label="Lifestyle cut %" value={Math.round((form.lifestyleReduction ?? 0) * 100)} min={0} max={60} step={5} unit="%" decimals={0}
                helpText="Reduces dining/drinking/personal care during this period"
                onChange={v=>setForm(f=>({...f,lifestyleReduction:v/100}))} />
            )}
          </div>
          {isRecurring && (
            <p className="text-xs text-gray-500 bg-white rounded p-2 border">
              Models ¥{formatJPY(form.amount)}/mo extra expenses from age {form.age} to {form.endAge ?? form.age+22}, with a {Math.round((form.lifestyleReduction??0)*100)}% reduction in dining/drinking/personal care during that period.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={add} className="bg-teal-600 text-white text-xs px-3 py-1.5 rounded hover:bg-teal-700">Add</button>
            <button onClick={()=>setShowForm(false)} className="border text-xs px-3 py-1.5 rounded text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {lifeEvents.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No life events added. Click "+ Add event" to model windfalls, expenses, or income changes.</p>
      ) : (
        <div className="divide-y">
          {lifeEvents.map(ev => (
            <div key={ev.id} className="flex items-center justify-between px-4 py-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-gray-400 font-mono">Age {ev.age}{ev.endAge ? `–${ev.endAge}` : ''}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  ev.type==='windfall' ? 'bg-green-100 text-green-700' :
                  ev.type==='expense' ? 'bg-red-100 text-red-700' :
                  ev.type==='recurringExpense' ? 'bg-purple-100 text-purple-700' :
                  'bg-blue-100 text-blue-700'
                }`}>{ev.type==='windfall'?'+':ev.type==='expense'?'-':ev.type==='recurringExpense'?'¥/mo':'+-'} ¥{formatJPY(ev.amount)}{ev.type==='recurringExpense'?'/mo':''}</span>
                <span className="text-gray-700">{ev.label}</span>
                {ev.lifestyleReduction > 0 && <span className="text-purple-500 text-xs">(-{Math.round(ev.lifestyleReduction*100)}% lifestyle)</span>}
              </div>
              <button onClick={()=>remove(ev.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Feature 2: Budget Settings ────────────────────────────────────────────────
function BudgetSettings({ params, setParam, onReset }) {
  const [show, setShow] = useState(false)
  const totalMonthly = params.groceries + params.transport + params.personalCare +
    params.fineDining + params.drinking + params.phoneInternet +
    params.totalRentMonthly * (1 - params.partnerHousingShare / 100) +
    params.totalUtilitiesMonthly * (1 - params.partnerHousingShare / 100) +
    (params.skiTrips + params.domesticTrips + params.festivals + params.europeTrip + params.indiaTrip) / 12

  const investableEst = Math.max(0,
    params.initialNetMonthly - computeResidenceTax(params.initialNetMonthly) - totalMonthly)

  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={()=>setShow(!show)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700 hover:bg-gray-100">
        <span className="flex items-center gap-2"><span>⚙️</span> Budget Settings — All Expense Line Items</span>
        <span className="text-gray-400">{show ? '▲' : '▾'}</span>
      </button>

      {show && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 p-3 bg-teal-50 rounded text-xs font-semibold text-teal-800">
            <div>Total monthly spend: ¥{formatJPY(totalMonthly)}</div>
            <div>Total annual: ¥{formatJPY(totalMonthly * 12)}</div>
            <div>Investable est.: <span className="text-teal-600">¥{formatJPY(investableEst)}/mo</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 border-b pb-1">Housing (total cost)</p>
              <MoneyInput label="Total rent/month" value={params.totalRentMonthly} onChange={v=>setParam('totalRentMonthly',v)} />
              <MoneyInput label="Total utilities/month" value={params.totalUtilitiesMonthly} onChange={v=>setParam('totalUtilitiesMonthly',v)} />
              <div className="text-xs text-gray-400">Your share: {(100-params.partnerHousingShare).toFixed(0)}% = ¥{formatJPY(params.totalRentMonthly*(1-params.partnerHousingShare/100))}/mo rent</div>
              <MoneyInput label="Phone/Internet" value={params.phoneInternet} onChange={v=>setParam('phoneInternet',v)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 border-b pb-1">Daily lifestyle</p>
              <MoneyInput label="Groceries/month" value={params.groceries} onChange={v=>setParam('groceries',v)} />
              <MoneyInput label="Transport/month" value={params.transport} onChange={v=>setParam('transport',v)} />
              <MoneyInput label="Personal care/month" value={params.personalCare} onChange={v=>setParam('personalCare',v)} />
              <MoneyInput label="Fine dining/month" value={params.fineDining} onChange={v=>setParam('fineDining',v)} />
              <MoneyInput label="Drinking bars/month" value={params.drinking} onChange={v=>setParam('drinking',v)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 border-b pb-1">Travel (annual)</p>
              <MoneyInput label="Ski trips/year" value={params.skiTrips} onChange={v=>setParam('skiTrips',v)} annual />
              <MoneyInput label="Domestic trips/year" value={params.domesticTrips} onChange={v=>setParam('domesticTrips',v)} annual />
              <MoneyInput label="Festivals/year" value={params.festivals} onChange={v=>setParam('festivals',v)} annual />
              <MoneyInput label="Europe trip/year" value={params.europeTrip} onChange={v=>setParam('europeTrip',v)} annual />
              <MoneyInput label="India trip/year" value={params.indiaTrip} onChange={v=>setParam('indiaTrip',v)} annual />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 border-b pb-1">Post-purchase costs</p>
              <MoneyInput label="Condo mgmt fee/month" value={params.condoManagementFee} onChange={v=>setParam('condoManagementFee',v)} />
              <MoneyInput label="Property tax/year" value={params.propertyTaxAnnual} onChange={v=>setParam('propertyTaxAnnual',v)} annual />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t">
            <button onClick={()=>setShow(false)}
              className="px-4 py-1.5 bg-teal-600 text-white text-xs font-medium rounded hover:bg-teal-700">
              Done — Update Budget
            </button>
            <button onClick={onReset}
              className="text-xs text-red-500 hover:text-red-700 underline">
              Reset all expenses to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Feature 5: Monte Carlo Tab ────────────────────────────────────────────────
function TabMonteCarlo({ params, lifeEvents, bridgePhase, spendingPhases }) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [scenario, setScenario] = useState('base')

  useEffect(() => { setResult(null) }, [params])

  const run = async () => {
    setRunning(true); setProgress(0); setResult(null)
    try {
      const res = await runMonteCarlo(params, scenario, 500,
        { lifeEvents, bridgePhase, spendingPhases },
        (done, total) => setProgress(Math.round(done/total*100))
      )
      setResult(res)
    } catch(e) { console.error(e) }
    setRunning(false)
  }

  const fanData = result?.percentiles

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {PRESET_SCENARIOS.map(k=>(
            <button key={k} onClick={()=>setScenario(k)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${scenario===k?'text-white border-transparent':'border-gray-200 text-gray-600'}`}
              style={scenario===k?{background:C[k]}:{}}>
              {k.charAt(0).toUpperCase()+k.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={run} disabled={running}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
          {running ? <><span className="animate-spin">⟳</span> Running {progress}%</> : '▶ Run 500 simulations'}
        </button>
        <span className="text-xs text-gray-400">Returns randomised with σ=8% around the scenario mean</span>
      </div>

      {!result && !running && (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-sm">
          Click "Run simulations" to generate the probability distribution
        </div>
      )}

      {running && (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all" style={{width:`${progress}%`}} />
          </div>
          <p className="text-sm text-gray-500">Simulating {progress}% ({Math.round(progress*5)}/500 paths)…</p>
        </div>
      )}

      {result && !running && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label:'P(FIRE by 55)', val:`${result.stats.probBy55}%`, color: result.stats.probBy55>50?'text-teal-600':'text-red-500' },
              { label:'P(FIRE by 60)', val:`${result.stats.probBy60}%`, color: result.stats.probBy60>50?'text-teal-600':'text-red-500' },
              { label:'P(FIRE by 65)', val:`${result.stats.probBy65}%`, color: result.stats.probBy65>50?'text-teal-600':'text-red-500' },
              { label:'P(survive to 90)', val:`${result.stats.probSurvive90}%`, color: result.stats.probSurvive90>80?'text-teal-600':'text-amber-600' },
            ].map(s=>(
              <div key={s.label} className="border rounded p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Fan chart */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Portfolio Fan Chart — Percentile Bands</h3>
            <div aria-label="Monte Carlo fan chart" className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fanData} margin={{top:5,right:20,left:10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="age" tickLine={false} />
                  <YAxis tickFormatter={axisM} tickLine={false} width={60} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="p90" name="P90" stroke="none" fill={C[scenario]} fillOpacity={0.08} />
                  <Area type="monotone" dataKey="p75" name="P75" stroke="none" fill={C[scenario]} fillOpacity={0.12} />
                  <Area type="monotone" dataKey="p25" name="P25" stroke="none" fill="white" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="p10" name="P10" stroke="none" fill="white" fillOpacity={0.5} />
                  <Line type="monotone" dataKey="p50" name="Median" stroke={C[scenario]} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 justify-center text-xs mt-1">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block opacity-80" style={{background:C[scenario]}} />10th–90th %ile band</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{background:C[scenario]}} />Median path</span>
            </div>
          </div>

          {/* Histogram */}
          {result.histogram.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Distribution of FatFIRE Ages</h3>
              <div aria-label="FatFIRE age histogram" className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.histogram} margin={{top:5,right:20,left:5,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="age" tickLine={false} />
                    <YAxis tickLine={false} />
                    <Tooltip formatter={(v)=>[`${v} simulations`,'Count']} labelFormatter={l=>`FatFIRE at age ${l}`} />
                    <Bar dataKey="count" name="Simulations" fill={C[scenario]} radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {result.stats.medianFireAge && (
                <p className="text-xs text-gray-500 text-center mt-1">
                  Median FatFIRE age: <strong>{result.stats.medianFireAge}</strong> ·
                  {result.histogram.reduce((s,h)=>s+h.count,0)} of 500 paths reach FatFIRE before 90
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab 4: FatFIRE Projection ────────────────────────────────────────────────
function TabFatFire({ simData, params, lifeEvents, bridgePhase, setBridgePhase, appliedCuts, setAppliedCuts, scenarios }) {
  const [subTab, setSubTab] = useState('projection') // 'projection' | 'sensitivity'
  const defaultEndIdx = Math.min(65 - params.startAge, 90 - params.startAge)
  const [zoomRange, setZoomRange] = useState({ startIndex: 0, endIndex: defaultEndIdx })

  const allScenarios = scenarios

  const chartData = simData.base.map((row, i) => {
    const d = { age: row.age }
    for (const k of allScenarios) {
      const r = simData[k]?.[i]
      if (r) {
        d[`${k}Portfolio`] = displayVal(r.totalPortfolio, row.age, params)
        d[`${k}Target`] = displayVal(r.fatFireTarget, row.age, params)
        if (r.inBridge) d[`${k}Bridge`] = true
      }
    }
    return d
  })

  const crossings = {}
  for (const k of allScenarios) crossings[k] = simData[k]?.find(r=>r.fireCrossed)

  // Actual portfolio tracker overlay
  return (
    <div className="space-y-4">
      {/* Gap analysis banner */}
      <GapAnalysisPanel simData={simData} params={params} lifeEvents={lifeEvents}
        bridgePhase={bridgePhase} appliedCuts={appliedCuts} setAppliedCuts={setAppliedCuts} />

      {/* Sub-tab nav */}
      <div className="flex gap-1 border-b">
        {[['projection','📈 Projection'],['sensitivity','🌪️ Sensitivity Analysis']].map(([id,label])=>(
          <button key={id} onClick={()=>setSubTab(id)}
            className={`px-4 py-2 text-xs font-medium rounded-t ${subTab===id?'bg-white border border-b-white -mb-px text-teal-700':'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'sensitivity' && (
        <SensitivityChart params={params} lifeEvents={lifeEvents} bridgePhase={bridgePhase} />
      )}

      {subTab === 'projection' && <>
        {/* Bridge phase toggle */}
        <BridgePhasePanel bridgePhase={bridgePhase} setBridgePhase={setBridgePhase} params={params} />

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Solid = portfolio · Dashed = FatFIRE target · All in real 2026 ¥{params.showNominal?' (nominal)':''}</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Zoom:</span>
            <button onClick={()=>setZoomRange({startIndex:0,endIndex:defaultEndIdx})}
              className={`px-2 py-0.5 rounded border ${zoomRange.endIndex===defaultEndIdx&&zoomRange.startIndex===0?'bg-teal-600 text-white border-teal-600':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>To 65</button>
            <button onClick={()=>setZoomRange({startIndex:0,endIndex:90-params.startAge})}
              className={`px-2 py-0.5 rounded border ${zoomRange.endIndex===90-params.startAge?'bg-teal-600 text-white border-teal-600':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Full</button>
            <span className="text-gray-400">or drag the range bar below</span>
          </div>
        </div>
        <div aria-label="FatFIRE projection chart" className="h-[440px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{top:24,right:30,left:10,bottom:30}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="age" tickLine={false} />
              <YAxis tickFormatter={axisM} tickLine={false} width={60} />
              <Tooltip content={<ChartTip />} />
              <Brush dataKey="age" height={24} stroke="#94a3b8" fill="#f8fafc" travellerWidth={8}
                startIndex={zoomRange.startIndex} endIndex={zoomRange.endIndex}
                onChange={range => setZoomRange(range)} />
              <ReferenceLine x={40} stroke="#9ca3af" strokeDasharray="4 2" label={{value:'Purchase',position:'insideTopRight',fontSize:10,fill:'#9ca3af',offset:12}} />
              <ReferenceLine x={53} stroke="#9ca3af" strokeDasharray="4 2" label={{value:'Dedn ends',position:'insideTopRight',fontSize:10,fill:'#9ca3af',offset:12}} />
              <ReferenceLine x={75} stroke="#9ca3af" strokeDasharray="4 2" label={{value:'Mtg off',position:'insideTopRight',fontSize:10,fill:'#9ca3af',offset:12}} />
              {params.showNenkin && <ReferenceLine x={65} stroke="#9ca3af" strokeDasharray="2 4" label={{value:'Nenkin 65',position:'insideTopRight',fontSize:10,fill:'#9ca3af',offset:12}} />}
              {lifeEvents.map(ev=>(
                <ReferenceLine key={ev.id} x={ev.age} stroke="#6366f1" strokeDasharray="3 3"
                  label={{value:ev.label,position:'insideTopRight',fontSize:9,fill:'#6366f1',offset:12}} />
              ))}
              {allScenarios.map(k=>(
                <React.Fragment key={k}>
                  <Line type="monotone" dataKey={`${k}Portfolio`} name={`${k.charAt(0).toUpperCase()+k.slice(1)} portfolio`}
                    stroke={C[k]} strokeWidth={2} dot={false} strokeDasharray={SCENARIO_DASHES[k]} />
                  <Line type="monotone" dataKey={`${k}Target`} name={`${k.charAt(0).toUpperCase()+k.slice(1)} target`}
                    stroke={C[k]} strokeWidth={1.5} dot={false} strokeDasharray="6 3" />
                  {crossings[k] && (
                    <ReferenceDot x={crossings[k].age}
                      y={displayVal(crossings[k].totalPortfolio, crossings[k].age, params)}
                      r={5} fill={C[k]} stroke="white" strokeWidth={2} />
                  )}
                </React.Fragment>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Custom legend */}
        <div className="flex flex-wrap gap-4 text-xs justify-center">
          {allScenarios.map(k=>(
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-4 h-0.5" style={{background:C[k]}} />
              <span className="text-gray-600">
                {k==='custom' ? (params.customScenario?.label||'Custom') : `${k.charAt(0).toUpperCase()+k.slice(1)} (${params.returns[k]}% real)`}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-4 border-t border-dashed border-gray-400" />
            <span className="text-gray-600">Target line</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-gray-600" />
            <span className="text-gray-600">Crossing point</span>
          </div>
        </div>
      </>}
    </div>
  )
}

// ─── Tab 2: Cash Flow ─────────────────────────────────────────────────────────
function TabCashFlow({ simData, params, lifeEvents, bridgePhase, scenarios }) {
  const [sc, setSc] = useState('base')
  const data = simData[sc] ?? simData.base
  const baseData = data.filter(r=>r.age<=65)
  const salaryCap = baseData.find(r=>r.netMonthly>=params.netSalaryCap)

  const chartData = baseData.map(r=>({
    age: r.age,
    income: r.fireCrossed ? 0 : displayVal(r.netMonthly, r.age, params),
    expenses: displayVal(r.totalExpenses+r.residenceTax, r.age, params),
    surplus: r.fireCrossed ? 0 : displayVal(r.investableSurplus, r.age, params),
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Monthly figures · Real 2026 ¥</p>
        <ScenarioPicker value={sc} onChange={setSc} scenarios={scenarios} />
      </div>
      <div aria-label="Monthly cash flow chart" className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{top:24,right:30,left:10,bottom:0}}>
            <defs>
              <linearGradient id="surplusGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.bull} stopOpacity={0.25} />
                <stop offset="95%" stopColor={C.bull} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="age" tickLine={false} />
            <YAxis tickFormatter={v=>`¥${(v/1000).toFixed(0)}k`} tickLine={false} width={55} />
            <Tooltip content={<ChartTip />} />
            <ReferenceLine x={40} stroke="#9ca3af" strokeDasharray="4 2" label={{value:'Purchase',position:'insideTopRight',fontSize:10,fill:'#9ca3af',offset:12}} />
            <ReferenceLine x={53} stroke="#9ca3af" strokeDasharray="4 2" label={{value:'Dedn ends',position:'insideTopRight',fontSize:10,fill:'#9ca3af',offset:12}} />
            {salaryCap && <ReferenceLine x={salaryCap.age} stroke="#6366f1" strokeDasharray="4 2" label={{value:'Salary cap',position:'insideTopRight',fontSize:10,fill:'#6366f1',offset:12}} />}
            {lifeEvents.map(ev=>(
              <ReferenceLine key={ev.id} x={ev.age} stroke="#6366f1" strokeDasharray="3 3" label={{value:ev.label,position:'insideTopRight',fontSize:9,fill:'#6366f1',offset:12}} />
            ))}
            <Area type="monotone" dataKey="surplus" name="Investable surplus" stroke={C.bull} strokeWidth={2} fill="url(#surplusGrad)" />
            <Line type="monotone" dataKey="income" name="Net income" stroke="#64748b" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expenses" name="Total expenses" stroke={C.bear} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <SalaryROIPanel simData={simData} params={params} lifeEvents={lifeEvents} bridgePhase={bridgePhase} />
    </div>
  )
}

// ─── Tab 3: Net Worth ─────────────────────────────────────────────────────────
function TabNetWorth({ simData, params, lifeEvents, scenarios }) {
  const [sc, setSc] = useState('base')
  const data = simData[sc] ?? simData.base
  const baseFireTarget = data.find(r=>r.fireCrossed)?.fatFireTarget
  const chartData = data.map(r=>({
    age: r.age,
    iDeCo: displayVal(r.iDeCo, r.age, params),
    nisa: displayVal(r.nisa, r.age, params),
    taxable: displayVal(r.taxable, r.age, params),
    mortgage: displayVal(r.mortgageBalance, r.age, params),
    netWorth: displayVal(r.netWorth, r.age, params),
  }))
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ScenarioPicker value={sc} onChange={setSc} scenarios={scenarios} />
      </div>
      <div aria-label="Yearly net worth chart" className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{top:10,right:30,left:10,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="age" tickLine={false} />
            <YAxis tickFormatter={axisM} tickLine={false} width={60} />
            <Tooltip content={<ChartTip />} />
            {params.emergencyFundTarget>0 && <ReferenceLine y={params.emergencyFundTarget} stroke="#6366f1" strokeDasharray="3 3" label={{value:'Emergency fund',position:'right',fontSize:9,fill:'#6366f1'}} />}
            {baseFireTarget && <ReferenceLine y={baseFireTarget} stroke={C.base} strokeDasharray="5 3" label={{value:'FatFIRE target',position:'right',fontSize:9,fill:C.base}} />}
            {lifeEvents.map(ev=>(
              <ReferenceLine key={ev.id} x={ev.age} stroke="#6366f1" strokeDasharray="3 3" label={{value:ev.label,position:'top',fontSize:9,fill:'#6366f1'}} />
            ))}
            <Area type="monotone" dataKey="iDeCo" name="iDeCo" stackId="p" stroke="#a855f7" fill="#a855f7" fillOpacity={0.5} />
            <Area type="monotone" dataKey="nisa" name="NISA" stackId="p" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
            <Area type="monotone" dataKey="taxable" name="Taxable" stackId="p" stroke="#10b981" fill="#10b981" fillOpacity={0.5} />
            <Line type="monotone" dataKey="mortgage" name="Mortgage" stroke={C.bear} strokeWidth={2} dot={false} strokeDasharray="5 3" />
            <Line type="monotone" dataKey="netWorth" name="Net worth" stroke="#1e293b" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Tab 1: Budget ────────────────────────────────────────────────────────────
function TabBudget({ simData, params, setParam, onReset, scenarios }) {
  const [budgetAge, setBudgetAge] = useState(35)
  const [sc, setSc] = useState('base')
  const data = simData[sc] ?? simData.base
  const row = data.find(r=>r.age===budgetAge) ?? data[0]
  const isOwner = budgetAge >= params.propertyPurchaseAge
  const annualSurplus = (row.investableSurplus ?? 0) * 12

  const slices = [
    { name: isOwner ? 'Mortgage (user)' : 'Rent (user)', value: row.housing },
    { name: 'Utilities', value: row.utilities },
    { name: 'Phone/Internet', value: row.phone },
    ...(isOwner ? [{ name:'Condo fee',value:row.condo },{ name:'Property tax',value:row.propTax }] : []),
    { name:'Groceries', value:row.groceries },
    { name:'Transport', value:row.transport },
    { name:'Personal care', value:row.personalCare },
    { name:'Fine dining', value:row.fineDining },
    { name:'Drinking', value:row.drinking },
    { name:'Travel', value:row.travel },
    ...(row.recurringExpenses > 0 ? [{ name:'Kids/recurring', value:row.recurringExpenses }] : []),
    { name:'Residence tax', value:row.residenceTax },
    { name:'iDeCo', value:row.iDeCoContrib },
    { name:'NISA', value:row.nisaContrib },
    { name:'Taxable invest.', value:row.taxableContrib },
  ].filter(s=>s.value>0)

  const total = slices.reduce((s,x)=>s+x.value,0)

  const CustomPieTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const entry = payload[0]
    const wyrs = costInWorkingYears(entry.value, annualSurplus)
    return (
      <div className="bg-white border rounded shadow p-2 text-xs space-y-1">
        <p className="font-semibold">{entry.name}</p>
        <p>¥{formatJPY(entry.value)}/mo</p>
        {wyrs != null && (
          <p className="text-amber-600">≈ {wyrs.toFixed(2)} working years of surplus</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-sm font-medium text-gray-700">Age:</label>
        <input type="range" min={params.startAge} max={89} step={1} value={budgetAge}
          onChange={e=>setBudgetAge(Number(e.target.value))} className="w-48 h-1.5 accent-teal-600" />
        <span className="font-bold text-lg">{budgetAge}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {isOwner ? 'Owner (mortgage)' : 'Renting'}
        </span>
        <span className="text-xs text-teal-600 font-medium">Investable: ¥{formatJPY(row.investableSurplus)}/mo</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div aria-label="Monthly budget breakdown pie chart" className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={110} paddingAngle={2}>
                {slices.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomPieTip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1 text-sm overflow-y-auto max-h-72">
          <div className="flex justify-between font-semibold border-b pb-1 mb-2">
            <span>Net income</span><span>¥{formatJPY(row.netMonthly)}</span>
          </div>
          {slices.map((s,i)=>(
            <div key={s.name} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{background:PIE_COLORS[i%PIE_COLORS.length]}} />
                <span className="text-gray-700">{s.name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400">{total>0?((s.value/total)*100).toFixed(0):0}%</span>
                <span className="font-medium w-24 text-right">¥{formatJPY(s.value)}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-between font-semibold border-t pt-1 mt-1 text-xs">
            <span>Total allocated</span><span>¥{formatJPY(total)}</span>
          </div>
        </div>
      </div>

      <BudgetSettings params={params} setParam={setParam} onReset={onReset} />
    </div>
  )
}

// ─── Tab 5: Allocation ────────────────────────────────────────────────────────
function TabAllocation({ simData, params }) {
  const baseData = simData.base
  const nisaCapAge = baseData.find(r=>r.nisaLifetimeUsed>=18_000_000)?.age
  const contribData = baseData.filter(r=>r.age<=65).map(r=>({
    age:r.age,
    iDeCo: displayVal(r.iDeCoContrib*12, r.age, params),
    nisa: displayVal(r.nisaContrib*12, r.age, params),
    taxable: displayVal(r.taxableContrib*12, r.age, params),
    iDeCoTaxSaving: r.iDeCoTaxSaving,
  }))
  const balData = baseData.map(r=>({
    age:r.age,
    iDeCo: displayVal(r.iDeCo, r.age, params),
    nisa: displayVal(r.nisa, r.age, params),
    taxable: displayVal(r.taxable, r.age, params),
  }))
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-2 text-gray-700">Annual Contributions</h3>
        <div aria-label="Annual investment contributions" className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={contribData} margin={{top:5,right:20,left:5,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="age" tickLine={false} />
              <YAxis tickFormatter={axisM} tickLine={false} width={55} />
              <Tooltip content={<ChartTip />} />
              {nisaCapAge && <ReferenceLine x={nisaCapAge} stroke="#3b82f6" strokeDasharray="4 2" label={{value:'NISA cap ¥18M',position:'top',fontSize:9,fill:'#3b82f6'}} />}
              <Bar dataKey="iDeCo" name="iDeCo" stackId="c" fill="#a855f7" />
              <Bar dataKey="nisa" name="NISA" stackId="c" fill="#3b82f6" />
              <Bar dataKey="taxable" name="Taxable" stackId="c" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2 text-gray-700">Cumulative Balances</h3>
        <div aria-label="Cumulative investment balances" className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={balData} margin={{top:5,right:20,left:5,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="age" tickLine={false} />
              <YAxis tickFormatter={axisM} tickLine={false} width={60} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="iDeCo" name="iDeCo" stackId="b" stroke="#a855f7" fill="#a855f7" fillOpacity={0.6} />
              <Area type="monotone" dataKey="nisa" name="NISA" stackId="b" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
              <Area type="monotone" dataKey="taxable" name="Taxable" stackId="b" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2 text-gray-700">iDeCo Annual Tax Saving (estimated)</h3>
        <div aria-label="iDeCo tax savings" className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={contribData} margin={{top:5,right:20,left:5,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="age" tickLine={false} />
              <YAxis tickFormatter={v=>`¥${(v/1000).toFixed(0)}k`} tickLine={false} width={55} />
              <Tooltip formatter={v=>[`¥${formatJPY(v)}`,'Tax saving']} labelFormatter={l=>`Age ${l}`} />
              <Bar dataKey="iDeCoTaxSaving" name="iDeCo saving" fill="#a855f7" opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 6: Spending Phases ───────────────────────────────────────────────────
function TabSpendingPhases({ params, scenarios, lifeEvents, bridgePhase, appliedCuts, spendingPhases, setSpendingPhases }) {
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

// ─── Tab 7: Scenario Comparison ───────────────────────────────────────────────
function TabCompare({ simData, params, scenarios }) {
  const summary = scenarios.map(k=>{
    const series = simData[k]
    const sc = getScenarioConfig(params, k)
    const fireRow = series?.find(r=>r.fireCrossed)
    const at75 = series?.find(r=>r.age===75)
    const at90 = series?.find(r=>r.age===90)
    return { key:k, label: sc?.label ?? k, color: C[k], fireRow, at75, at90 }
  })

  const sensitivityRates = [1.0, 1.5, 2.0, 2.5]
  const sensitivityData = useMemo(()=>
    sensitivityRates.map(rate=>({
      rate,
      bull: runSimulation({...params,initialMortgageRate:rate},'bull').find(r=>r.fireCrossed)?.age ?? 'N/A',
      base: runSimulation({...params,initialMortgageRate:rate},'base').find(r=>r.fireCrossed)?.age ?? 'N/A',
      bear: runSimulation({...params,initialMortgageRate:rate},'bear').find(r=>r.fireCrossed)?.age ?? 'N/A',
    })), [params])

  return (
    <div className="space-y-6">
      <div className="grid gap-4" style={{gridTemplateColumns:`repeat(${Math.min(summary.length,4)},1fr)`}}>
        {summary.map(s=>(
          <div key={s.key} className="border rounded-lg p-4 space-y-3" style={{borderColor:s.color}}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{background:s.color}} />
              <span className="font-bold text-sm" style={{color:s.color}}>{s.label}</span>
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                ['FatFIRE age', s.fireRow?.age ?? <span className="text-red-500">Not reached</span>],
                ['Years to FIRE', s.fireRow ? s.fireRow.age - params.startAge : '—'],
                ['Portfolio at target', s.fireRow ? yenM(s.fireRow.totalPortfolio) : '—'],
                ['Monthly drawdown', s.fireRow ? `¥${formatJPY(s.fireRow.totalExpenses)}` : '—'],
                ['Portfolio @ 75', s.at75 ? yenM(s.at75.totalPortfolio) : '—'],
                ['Portfolio @ 90', s.at90 ? yenM(s.at90.totalPortfolio) : '—'],
              ].map(([label, val])=>(
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-semibold">{val}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">FatFIRE Age Sensitivity — Initial Mortgage Rate</h3>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left p-2 border text-gray-600">Mortgage rate</th>
              <th className="text-center p-2 border" style={{color:C.bull}}>Bull</th>
              <th className="text-center p-2 border" style={{color:C.base}}>Base</th>
              <th className="text-center p-2 border" style={{color:C.bear}}>Bear</th>
            </tr>
          </thead>
          <tbody>
            {sensitivityData.map(row=>(
              <tr key={row.rate} className="border-b">
                <td className="p-2 border font-medium">{row.rate.toFixed(1)}%</td>
                <td className="p-2 border text-center">{row.bull}</td>
                <td className="p-2 border text-center">{row.base}</td>
                <td className="p-2 border text-center">{row.bear}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {params.showNenkin && (
        <div className="bg-teal-50 border border-teal-200 rounded p-4 text-sm text-teal-800">
          <strong>年金 Nenkin effect (age 65+):</strong> ¥175,000/month = ¥2,100,000/year reduction in required withdrawals → extends portfolio survival by ~5–10 years.
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function FatFIREOptimizer() {
  const initial = useMemo(() => loadInitialState(), [])
  const [params, setParams] = useState(initial?.params ?? DEFAULTS)
  const [lifeEvents, setLifeEvents] = useState(initial?.lifeEvents ?? [])
  const [bridgePhase, setBridgePhase] = useState(initial?.bridgePhase ?? { enabled:false, startAge:50, endAge:56, monthlyIncome:200_000 })
  const [spendingPhases, setSpendingPhases] = useState(initial?.spendingPhases ?? {
    enabled: false,
    targetDepletionAge: 95,
    phases: [
      { id: 1, label: 'Go-Go', startAge: 55, endAge: 65, multiplier: 1.2, swr: 4.0 },
      { id: 2, label: 'Slow-Go', startAge: 65, endAge: 75, multiplier: 0.85, swr: 3.5 },
      { id: 3, label: 'No-Go', startAge: 75, endAge: 95, multiplier: 0.65, swr: 3.0 },
    ],
  })
  const [appliedCuts, setAppliedCuts] = useState(initial?.appliedCuts ?? {})

  useEffect(() => {
    setAppliedCuts({})
  }, [params.groceries, params.transport, params.personalCare, params.fineDining, params.drinking,
      params.phoneInternet, params.skiTrips, params.domesticTrips, params.festivals, params.europeTrip, params.indiaTrip])

  const [activeTab, setActiveTab] = useState('fatfire')
  const [tracker, setTracker] = useState({ enabled:false, currentAge:30, value:0 })
  const [savedPlans, setSavedPlans] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fatfire-plans') || '[]') } catch { return [] }
  })
  const [showSavedPlans, setShowSavedPlans] = useState(false)
  const [copyToast, setCopyToast] = useState(false)
  const [showLifeEvents, setShowLifeEvents] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const setParam = useCallback((key, val) => setParams(p => ({ ...p, [key]: val })), [])
  const setReturn_ = useCallback((s, v) => setParams(p => ({ ...p, returns: { ...p.returns, [s]: v } })), [])
  const setRateGrowth = useCallback((s, field, v) => setParams(p => ({
    ...p,
    mortgageRateGrowth: {
      ...p.mortgageRateGrowth,
      [s]: { ...p.mortgageRateGrowth[s], [field]: v },
    },
  })), [])
  const setCustom = useCallback((field, val) => setParams(p => ({
    ...p, customScenario: { ...p.customScenario, [field]: val },
  })), [])

  const onReset = useCallback(() => {
    setParams(p => ({
      ...p,
      groceries: DEFAULTS.groceries, transport: DEFAULTS.transport,
      personalCare: DEFAULTS.personalCare, fineDining: DEFAULTS.fineDining,
      drinking: DEFAULTS.drinking, phoneInternet: DEFAULTS.phoneInternet,
      totalRentMonthly: DEFAULTS.totalRentMonthly, totalUtilitiesMonthly: DEFAULTS.totalUtilitiesMonthly,
      skiTrips: DEFAULTS.skiTrips, domesticTrips: DEFAULTS.domesticTrips,
      festivals: DEFAULTS.festivals, europeTrip: DEFAULTS.europeTrip, indiaTrip: DEFAULTS.indiaTrip,
      condoManagementFee: DEFAULTS.condoManagementFee, propertyTaxAnnual: DEFAULTS.propertyTaxAnnual,
    }))
  }, [])

  // Active scenarios
  const scenarios = useMemo(() =>
    [...PRESET_SCENARIOS, ...(params.customScenario?.enabled ? ['custom'] : [])], [params.customScenario?.enabled])

  // Simulation data for all scenarios
  const simData = useMemo(() => {
    const opts = { lifeEvents, bridgePhase, cutOverrides: appliedCuts }
    return Object.fromEntries(scenarios.map(k => [k, runSimulation(params, k, opts)]))
  }, [params, lifeEvents, bridgePhase, appliedCuts, scenarios])

  // URL persistence (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = { params, lifeEvents, bridgePhase, spendingPhases, appliedCuts }
      const encoded = encodeState(state)
      if (encoded) window.location.hash = encoded
    }, 500)
    return () => clearTimeout(timer)
  }, [params, lifeEvents, bridgePhase, spendingPhases, appliedCuts])

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
    setCopyToast(true)
    setTimeout(() => setCopyToast(false), 2500)
  }

  const saveSnapshot = (name) => {
    const snap = { name: name || `Plan ${new Date().toLocaleDateString()}`, date: new Date().toISOString(), params, lifeEvents, bridgePhase, spendingPhases }
    const plans = [...savedPlans.slice(0, 4), snap]
    localStorage.setItem('fatfire-plans', JSON.stringify(plans))
    setSavedPlans(plans)
    setShowSavedPlans(false)
  }
  const loadSnapshot = (snap) => {
    setParams(migrateParams(snap.params ?? DEFAULTS))
    setLifeEvents(snap.lifeEvents ?? [])
    setBridgePhase(snap.bridgePhase ?? { enabled:false, startAge:50, endAge:56, monthlyIncome:200_000 })
    setSpendingPhases(snap.spendingPhases ?? { enabled:false, targetDepletionAge:95, phases:[
      { id:1, label:'Go-Go', startAge:55, endAge:65, multiplier:1.2, swr:4.0 },
      { id:2, label:'Slow-Go', startAge:65, endAge:75, multiplier:0.85, swr:3.5 },
      { id:3, label:'No-Go', startAge:75, endAge:95, multiplier:0.65, swr:3.0 },
    ]})
    setShowSavedPlans(false)
  }

  // KPI
  const baseFireRow = simData.base?.find(r=>r.fireCrossed)
  const bullFireRow = simData.bull?.find(r=>r.fireCrossed)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 font-sans text-gray-900">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={`w-72 flex-none overflow-y-auto bg-white border-r border-gray-200 px-4 py-5 space-y-3 fixed inset-y-0 left-0 z-40 transform transition-transform lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute top-3 right-3 p-1 rounded hover:bg-gray-100 text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div>
          <h1 className="text-sm font-bold text-gray-900 leading-snug">Japan FatFIRE Optimizer</h1>
          <p className="text-xs text-gray-400">Real 2026 ¥ · Age {params.startAge} → 90</p>
        </div>

        {/* Feature 8: Save/Share */}
        <div className="flex gap-1.5">
          <button onClick={copyShareLink}
            className="flex-1 text-xs border rounded px-2 py-1.5 text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1">
            🔗 Share
          </button>
          <button onClick={()=>saveSnapshot()} className="flex-1 text-xs border rounded px-2 py-1.5 text-gray-600 hover:bg-gray-50">💾 Save</button>
          <div className="relative">
            <button onClick={()=>setShowSavedPlans(!showSavedPlans)}
              className="text-xs border rounded px-2 py-1.5 text-gray-600 hover:bg-gray-50">📂 {savedPlans.length}</button>
            {showSavedPlans && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-white border rounded-lg shadow-lg z-50 text-xs">
                {savedPlans.length === 0 ? (
                  <p className="p-3 text-gray-400">No saved plans</p>
                ) : savedPlans.map((s,i)=>(
                  <button key={i} onClick={()=>loadSnapshot(s)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-gray-400">{new Date(s.date).toLocaleDateString()}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {copyToast && <div className="text-xs text-center text-teal-600 bg-teal-50 rounded py-1">✓ Link copied!</div>}

        <Section title="Income" defaultOpen>
          <SliderRow label="Starting age" value={params.startAge} min={20} max={45} step={1} unit="" decimals={0} onChange={v=>setParam('startAge',v)} />
          <MoneyInput label="Initial net monthly (¥)" value={params.initialNetMonthly} onChange={v=>setParam('initialNetMonthly',v)} />
          <SliderRow label="Income growth rate" value={params.incomeGrowthRate} min={0} max={10} step={0.5} unit="%" onChange={v=>setParam('incomeGrowthRate',v)} helpText="Nominal salary increase per step" />
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Growth interval (years)</label>
            <select value={params.incomeGrowthStep} onChange={e=>setParam('incomeGrowthStep',Number(e.target.value))} className="w-full border rounded px-2 py-1 text-xs">
              {[1,2,3,4].map(v=><option key={v} value={v}>{v} yr</option>)}
            </select>
          </div>
          <MoneyInput label="Net salary cap (¥/mo)" value={params.netSalaryCap} onChange={v=>setParam('netSalaryCap',v)} />
        </Section>

        <Section title="Inflation & Returns" defaultOpen>
          <SliderRow label="Annual inflation" value={params.inflation} min={0} max={5} step={0.25} unit="%" onChange={v=>setParam('inflation',v)} />
          <SliderRow label="Bull real return" value={params.returns.bull} min={0} max={12} step={0.5} unit="%" onChange={v=>setReturn_('bull',v)} />
          <SliderRow label="Base real return" value={params.returns.base} min={0} max={12} step={0.5} unit="%" onChange={v=>setReturn_('base',v)} />
          <SliderRow label="Bear real return" value={params.returns.bear} min={0} max={12} step={0.5} unit="%" onChange={v=>setReturn_('bear',v)} />
        </Section>

        <Section title="Mortgage & Housing">
          <SliderRow label="Purchase age" value={params.propertyPurchaseAge} min={30} max={55} step={1} unit="" decimals={0} onChange={v=>setParam('propertyPurchaseAge',v)} />
          <MoneyInput label="Property value (¥)" value={params.propertyValue} onChange={v=>setParam('propertyValue',v)} />
          <SliderRow label="Initial mortgage rate" value={params.initialMortgageRate} min={0.5} max={5} step={0.1} unit="%" onChange={v=>setParam('initialMortgageRate',v)} />
          <SliderRow label="Mortgage term (years)" value={params.mortgageTerm} min={10} max={35} step={5} unit="yr" decimals={0} onChange={v=>setParam('mortgageTerm',v)} />
          <SliderRow label="Partner housing share" value={params.partnerHousingShare} min={0} max={50} step={1} unit="%" decimals={0} onChange={v=>setParam('partnerHousingShare',v)} />
          <div className="border-t pt-2 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Bear rate growth (5yr rule)</p>
            <SliderRow label="Increase" value={params.mortgageRateGrowth.bear?.annualIncrease??0.3} min={0} max={1} step={0.05} unit="%/yr" onChange={v=>setRateGrowth('bear','annualIncrease',v)} />
            <SliderRow label="Every" value={params.mortgageRateGrowth.bear?.everyYears??1} min={1} max={5} step={1} unit="yr" decimals={0} onChange={v=>setRateGrowth('bear','everyYears',v)} />
            <SliderRow label="Cap" value={params.mortgageRateGrowth.bear?.cap??4.0} min={1} max={6} step={0.25} unit="%" onChange={v=>setRateGrowth('bear','cap',v)} />
          </div>
          <div className="border-t pt-2 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Base rate growth (5yr rule)</p>
            <SliderRow label="Increase" value={params.mortgageRateGrowth.base?.annualIncrease??0.15} min={0} max={1} step={0.05} unit="%/yr" onChange={v=>setRateGrowth('base','annualIncrease',v)} />
            <SliderRow label="Every" value={params.mortgageRateGrowth.base?.everyYears??1} min={1} max={5} step={1} unit="yr" decimals={0} onChange={v=>setRateGrowth('base','everyYears',v)} />
            <SliderRow label="Cap" value={params.mortgageRateGrowth.base?.cap??3.0} min={1} max={6} step={0.25} unit="%" onChange={v=>setRateGrowth('base','cap',v)} />
          </div>
          <div className="border-t pt-2 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Bull rate growth (5yr rule)</p>
            <SliderRow label="Increase" value={params.mortgageRateGrowth.bull?.annualIncrease??0} min={0} max={1} step={0.05} unit="%/yr" onChange={v=>setRateGrowth('bull','annualIncrease',v)} />
            <SliderRow label="Every" value={params.mortgageRateGrowth.bull?.everyYears??1} min={1} max={5} step={1} unit="yr" decimals={0} onChange={v=>setRateGrowth('bull','everyYears',v)} />
            <SliderRow label="Cap" value={params.mortgageRateGrowth.bull?.cap??1.5} min={1} max={6} step={0.25} unit="%" onChange={v=>setRateGrowth('bull','cap',v)} />
          </div>
        </Section>

        <Section title="Monthly Expenses">
          <SliderRow label="Groceries" value={params.groceries/1000} min={10} max={80} step={1} unit="k" onChange={v=>setParam('groceries',v*1000)} />
          <SliderRow label="Transport" value={params.transport/1000} min={0} max={40} step={1} unit="k" onChange={v=>setParam('transport',v*1000)} />
          <SliderRow label="Personal care" value={params.personalCare/1000} min={0} max={60} step={1} unit="k" onChange={v=>setParam('personalCare',v*1000)} />
          <SliderRow label="Fine dining" value={params.fineDining/1000} min={0} max={80} step={1} unit="k" onChange={v=>setParam('fineDining',v*1000)} />
          <SliderRow label="Drinking/bars" value={params.drinking/1000} min={0} max={100} step={1} unit="k" onChange={v=>setParam('drinking',v*1000)} />
          <SliderRow label="Phone/Internet" value={params.phoneInternet/1000} min={0} max={30} step={0.5} unit="k" onChange={v=>setParam('phoneInternet',v*1000)} />
        </Section>

        <Section title="Annual Travel">
          <SliderRow label="Ski trips" value={params.skiTrips/10000} min={0} max={100} step={1} unit="万" decimals={0} onChange={v=>setParam('skiTrips',v*10000)} />
          <SliderRow label="Domestic trips" value={params.domesticTrips/10000} min={0} max={60} step={1} unit="万" decimals={0} onChange={v=>setParam('domesticTrips',v*10000)} />
          <SliderRow label="Festivals" value={params.festivals/10000} min={0} max={80} step={1} unit="万" decimals={0} onChange={v=>setParam('festivals',v*10000)} />
          <SliderRow label="Europe trip" value={params.europeTrip/10000} min={0} max={150} step={1} unit="万" decimals={0} onChange={v=>setParam('europeTrip',v*10000)} />
          <SliderRow label="India trip" value={params.indiaTrip/10000} min={0} max={80} step={1} unit="万" decimals={0} onChange={v=>setParam('indiaTrip',v*10000)} />
        </Section>

        <Section title="Retirement">
          <SliderRow label="Safe withdrawal rate" value={params.swr} min={2.5} max={5} step={0.1} unit="%" onChange={v=>setParam('swr',v)} />
          <SliderRow label="Buffer above SWR" value={params.swrBuffer} min={0} max={30} step={1} unit="%" decimals={0} onChange={v=>setParam('swrBuffer',v)} />
          <div className="space-y-1">
            <label className="text-xs text-gray-600">iDeCo limit</label>
            <div className="flex gap-1.5">
              {[{v:23000,l:'¥23k (no DC)'},{v:12000,l:'¥12k (DC plan)'}].map(o=>(
                <button key={o.v} onClick={()=>setParam('iDeCoMonthly',o.v)}
                  className={`flex-1 text-xs py-1 rounded border ${params.iDeCoMonthly===o.v?'bg-teal-600 text-white border-teal-600':'border-gray-200 text-gray-600'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Feature 1: Custom Scenario */}
        <Section title="Custom Scenario" badge={params.customScenario?.enabled ? 'ON' : ''}>
          <Toggle label="Enable Custom scenario" checked={!!params.customScenario?.enabled}
            onChange={v=>setCustom('enabled',v)} />
          {params.customScenario?.enabled && (
            <div className="space-y-2 pl-2 border-l-2 border-purple-300 mt-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-600">Label</label>
                <input value={params.customScenario.label} onChange={e=>setCustom('label',e.target.value)}
                  className="w-full border rounded px-2 py-1 text-xs" placeholder="My Optimistic Plan" />
              </div>
              <SliderRow label="Real return" value={params.customScenario.realReturn} min={0} max={12} step={0.5} unit="%" onChange={v=>setCustom('realReturn',v)} />
              <SliderRow label="Mortgage rate" value={params.customScenario.mortgageRate} min={0.5} max={5} step={0.1} unit="%" onChange={v=>setCustom('mortgageRate',v)} />
              <SliderRow label="Rate increase" value={params.customScenario.rateIncrease??0.2} min={0} max={1} step={0.05} unit="%/yr" onChange={v=>setCustom('rateIncrease',v)} />
              <SliderRow label="Every" value={params.customScenario.rateEveryYears??1} min={1} max={5} step={1} unit="yr" decimals={0} onChange={v=>setCustom('rateEveryYears',v)} />
              <SliderRow label="Rate cap" value={params.customScenario.rateCap??3.5} min={1} max={6} step={0.25} unit="%" onChange={v=>setCustom('rateCap',v)} />
              <SliderRow label="Salary growth %" value={params.customScenario.salaryGrowthRate} min={0} max={10} step={0.5} unit="%" onChange={v=>setCustom('salaryGrowthRate',v)} />
              <SliderRow label="Salary step (yr)" value={params.customScenario.salaryGrowthStep} min={1} max={4} step={1} unit="yr" decimals={0} onChange={v=>setCustom('salaryGrowthStep',v)} />
              <SliderRow label="Inflation" value={params.customScenario.inflation} min={0} max={5} step={0.25} unit="%" onChange={v=>setCustom('inflation',v)} />
            </div>
          )}
        </Section>

        <Section title="Display">
          <Toggle label="Show nominal ¥ (not real)" checked={params.showNominal} onChange={v=>setParam('showNominal',v)} />
          <Toggle label="Show 年金 Nenkin annotation" checked={params.showNenkin} onChange={v=>setParam('showNenkin',v)} />
        </Section>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="lg:hidden flex items-center gap-3 px-4 py-2 bg-white border-b">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-bold text-gray-900">Japan FatFIRE Optimizer</span>
        </div>
        {/* Feature 10: Progress Tracker */}
        <ProgressTracker simData={simData} params={params} tracker={tracker} setTracker={setTracker} />

        {/* KPI header */}
        <div className="px-6 pt-4 pb-2 grid grid-cols-4 gap-3 flex-shrink-0">
          <div className="bg-white rounded-lg border p-3">
            <p className="text-xs text-gray-500">Base FatFIRE Age</p>
            <p className="text-xl font-bold text-amber-600">{baseFireRow ? `Age ${baseFireRow.age}` : 'Not reached'}</p>
            {baseFireRow && <p className="text-xs text-gray-400">{baseFireRow.age - params.startAge}yr from age {params.startAge}</p>}
          </div>
          <div className="bg-white rounded-lg border p-3">
            <p className="text-xs text-gray-500">Bull FatFIRE Age</p>
            <p className="text-xl font-bold text-teal-600">{bullFireRow ? `Age ${bullFireRow.age}` : 'Not reached'}</p>
            {bullFireRow && <p className="text-xs text-gray-400">{bullFireRow.age - params.startAge}yr from age {params.startAge}</p>}
          </div>
          <div className="bg-white rounded-lg border p-3">
            <p className="text-xs text-gray-500">Base Portfolio @ FIRE</p>
            <p className="text-xl font-bold">{baseFireRow ? yenM(baseFireRow.totalPortfolio) : '—'}</p>
            {baseFireRow && <p className="text-xs text-gray-400">Target: {yenM(baseFireRow.fatFireTarget)}</p>}
          </div>
          <div className="bg-white rounded-lg border p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Life Events</p>
              <p className="text-xl font-bold">{lifeEvents.length}</p>
            </div>
            <button onClick={()=>setShowLifeEvents(!showLifeEvents)}
              className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-gray-600">
              {showLifeEvents ? 'Close' : 'Manage'}
            </button>
          </div>
        </div>

        {/* Life events panel */}
        {showLifeEvents && (
          <div className="px-6 pb-3 flex-shrink-0">
            <LifeEventsPanel lifeEvents={lifeEvents} setLifeEvents={setLifeEvents} params={params} />
          </div>
        )}

        {/* Tab nav */}
        <div className="flex border-b border-gray-200 bg-white flex-shrink-0 overflow-x-auto mx-6">
          {ALL_TABS.map(t=>(
            <button key={t.id} type="button" onClick={()=>setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab===t.id ? 'border-b-2 border-teal-600 text-teal-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white rounded-lg border p-5 min-h-full">
            <ErrorBoundary>
              {activeTab==='fatfire'    && <TabFatFire simData={simData} params={params} lifeEvents={lifeEvents} bridgePhase={bridgePhase} setBridgePhase={setBridgePhase} appliedCuts={appliedCuts} setAppliedCuts={setAppliedCuts} scenarios={scenarios} />}
              {activeTab==='cashflow'   && <TabCashFlow simData={simData} params={params} lifeEvents={lifeEvents} bridgePhase={bridgePhase} />}
              {activeTab==='networth'   && <TabNetWorth simData={simData} params={params} lifeEvents={lifeEvents} />}
              {activeTab==='budget'     && <TabBudget simData={simData} params={params} setParam={setParam} onReset={onReset} />}
              {activeTab==='alloc'      && <TabAllocation simData={simData} params={params} />}
              {activeTab==='phases'     && <TabSpendingPhases params={params} scenarios={scenarios} lifeEvents={lifeEvents} bridgePhase={bridgePhase} appliedCuts={appliedCuts} spendingPhases={spendingPhases} setSpendingPhases={setSpendingPhases} />}
              {activeTab==='compare'    && <TabCompare simData={simData} params={params} scenarios={scenarios} />}
              {activeTab==='montecarlo' && <TabMonteCarlo params={params} lifeEvents={lifeEvents} bridgePhase={bridgePhase} spendingPhases={spendingPhases} />}
            </ErrorBoundary>
          </div>

          {/* About the model */}
          <details className="mt-4 bg-white rounded-lg border p-4 text-xs text-gray-500">
            <summary className="cursor-pointer font-semibold text-gray-600 select-none">About the model & assumptions</summary>
            <div className="mt-3 space-y-2 leading-relaxed">
              <p><strong>Income:</strong> Net monthly salary is post income-tax withholding, 厚生年金, 健康保険, 雇用保険. Only 住民税 (residence tax) is set aside separately, interpolated from ¥46k/mo at ¥650k net to ¥100,583/mo at ¥995k net cap.</p>
              <p><strong>Tax wrappers:</strong> iDeCo (¥23k or ¥12k/mo, locked until 60) → NISA tsumitate (¥100k/mo) + growth (¥200k/mo), lifetime cap ¥18M → taxable brokerage. All returns modelled as real annual returns.</p>
              <p><strong>Mortgage:</strong> ¥100M at variable rate starting 1.5%, 35-year term from age 40. 住宅ローン控除: ¥17,500/mo tax benefit ages 40–52 (0.7% × ¥30M cap ÷ 12). Rate increases linearly per scenario; payment recalculates every 5 years (5年ルール).</p>
              <p><strong>FatFIRE target:</strong> Annual real expenses ÷ SWR × (1 + buffer%). Drawdown order at retirement: taxable → NISA → iDeCo (age 60+).</p>
              <p><strong>Monte Carlo:</strong> 500 paths, normally distributed annual returns around the scenario mean with σ=8%. Computation is chunked asynchronously.</p>
              <p className="text-gray-400 italic">This is a planning tool, not financial advice. Projections assume constant real returns, which does not reflect actual market volatility. Consult a licensed financial adviser before making investment decisions.</p>
            </div>
          </details>
        </div>
      </main>
    </div>
  )
}
