import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { DEFAULTS, runSimulation, SCENARIO_COLORS } from './simulation.js'
import { ALL_TABS, PRESET_SCENARIOS, C } from './lib/constants.js'
import { formatJPY, yenM } from './lib/format.js'
import { encodeState, loadInitialState, migrateParams } from './lib/persistence.js'
import { useSimulation } from './hooks/useSimulation.js'

import SliderRow from './components/ui/SliderRow.jsx'
import MoneyInput from './components/ui/MoneyInput.jsx'
import Section from './components/ui/Section.jsx'
import Toggle from './components/ui/Toggle.jsx'

import ProgressTracker from './components/panels/ProgressTracker.jsx'
import LifeEventsPanel from './components/panels/LifeEventsPanel.jsx'

import TabFatFire from './components/tabs/TabFatFire.jsx'
import TabCashFlow from './components/tabs/TabCashFlow.jsx'
import TabNetWorth from './components/tabs/TabNetWorth.jsx'
import TabBudget from './components/tabs/TabBudget.jsx'
import TabAllocation from './components/tabs/TabAllocation.jsx'
import TabSpendingPhases from './components/tabs/TabSpendingPhases.jsx'
import TabCompare from './components/tabs/TabCompare.jsx'
import TabMonteCarlo from './components/tabs/TabMonteCarlo.jsx'

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

// ─── Main component ────────────────────────────────────────────────────────────
export default function FatFIREOptimizer({ sharedPlanId }) {
  const hashState = useMemo(() => loadInitialState(), [])
  const [apiState, setApiState] = useState(null)
  const [loading, setLoading] = useState(!!sharedPlanId && !hashState)

  useEffect(() => {
    if (sharedPlanId && !hashState) {
      fetch(`/api/load/${sharedPlanId}`)
        .then(r => r.ok ? r.json() : null)
        .then(state => { if (state?.params) setApiState({ ...state, params: migrateParams(state.params) }) })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [sharedPlanId, hashState])

  const initial = hashState || apiState
  const [params, setParams] = useState(initial?.params ?? DEFAULTS)
  const [lifeEvents, setLifeEvents] = useState(initial?.lifeEvents ?? [])
  const [bridgePhase, setBridgePhase] = useState(initial?.bridgePhase ?? { enabled: false, startAge: 50, endAge: 56, monthlyIncome: 200_000 })
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

  // Hydrate state when API response arrives (after initial render)
  useEffect(() => {
    if (apiState) {
      setParams(apiState.params ?? DEFAULTS)
      setLifeEvents(apiState.lifeEvents ?? [])
      setBridgePhase(apiState.bridgePhase ?? { enabled: false, startAge: 50, endAge: 56, monthlyIncome: 200_000 })
      setSpendingPhases(apiState.spendingPhases ?? {
        enabled: false, targetDepletionAge: 95,
        phases: [
          { id: 1, label: 'Go-Go', startAge: 55, endAge: 65, multiplier: 1.2, swr: 4.0 },
          { id: 2, label: 'Slow-Go', startAge: 65, endAge: 75, multiplier: 0.85, swr: 3.5 },
          { id: 3, label: 'No-Go', startAge: 75, endAge: 95, multiplier: 0.65, swr: 3.0 },
        ],
      })
      setAppliedCuts(apiState.appliedCuts ?? {})
    }
  }, [apiState])

  useEffect(() => {
    setAppliedCuts({})
  }, [params.groceries, params.transport, params.personalCare, params.fineDining, params.drinking,
      params.phoneInternet, params.skiTrips, params.domesticTrips, params.festivals, params.europeTrip, params.indiaTrip])

  const [activeTab, setActiveTab] = useState('fatfire')
  const [tracker, setTracker] = useState({ enabled: false, currentAge: 30, value: 0 })
  const [savedPlans, setSavedPlans] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fatfire-plans') || '[]') } catch { return [] }
  })
  const [showSavedPlans, setShowSavedPlans] = useState(false)
  const [copyToast, setCopyToast] = useState(false)
  const [sharing, setSharing] = useState(false)
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
  const simData = useSimulation(params, scenarios, { lifeEvents, bridgePhase, appliedCuts })

  // URL persistence (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = { params, lifeEvents, bridgePhase, spendingPhases, appliedCuts }
      const encoded = encodeState(state)
      if (encoded) window.location.hash = encoded
    }, 500)
    return () => clearTimeout(timer)
  }, [params, lifeEvents, bridgePhase, spendingPhases, appliedCuts])

  const copyShareLink = async () => {
    setSharing(true)
    try {
      const state = { params, lifeEvents, bridgePhase, spendingPhases, appliedCuts }
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      if (!res.ok) throw new Error('Save failed')
      const { id } = await res.json()
      const shortUrl = `${window.location.origin}/p/${id}`
      await navigator.clipboard.writeText(shortUrl)
    } catch {
      navigator.clipboard.writeText(window.location.href).catch(() => {})
    }
    setCopyToast(true)
    setTimeout(() => setCopyToast(false), 2500)
    setSharing(false)
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
    setBridgePhase(snap.bridgePhase ?? { enabled: false, startAge: 50, endAge: 56, monthlyIncome: 200_000 })
    setSpendingPhases(snap.spendingPhases ?? {
      enabled: false, targetDepletionAge: 95,
      phases: [
        { id: 1, label: 'Go-Go', startAge: 55, endAge: 65, multiplier: 1.2, swr: 4.0 },
        { id: 2, label: 'Slow-Go', startAge: 65, endAge: 75, multiplier: 0.85, swr: 3.5 },
        { id: 3, label: 'No-Go', startAge: 75, endAge: 95, multiplier: 0.65, swr: 3.0 },
      ],
    })
    setShowSavedPlans(false)
  }

  // KPI
  const baseFireRow = simData.base?.find(r => r.fireCrossed)
  const bullFireRow = simData.bull?.find(r => r.fireCrossed)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-500">Loading shared plan...</p>
        </div>
      </div>
    )
  }

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

        {/* Save/Share */}
        <div className="flex gap-1.5">
          <button onClick={copyShareLink} disabled={sharing}
            className="flex-1 text-xs border rounded px-2 py-1.5 text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1 disabled:opacity-50">
            {sharing ? '...' : '🔗'} Share
          </button>
          <button onClick={() => saveSnapshot()} className="flex-1 text-xs border rounded px-2 py-1.5 text-gray-600 hover:bg-gray-50">💾 Save</button>
          <div className="relative">
            <button onClick={() => setShowSavedPlans(!showSavedPlans)}
              className="text-xs border rounded px-2 py-1.5 text-gray-600 hover:bg-gray-50">📂 {savedPlans.length}</button>
            {showSavedPlans && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-white border rounded-lg shadow-lg z-50 text-xs">
                {savedPlans.length === 0 ? (
                  <p className="p-3 text-gray-400">No saved plans</p>
                ) : savedPlans.map((s, i) => (
                  <button key={i} onClick={() => loadSnapshot(s)}
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
          <SliderRow label="Starting age" value={params.startAge} min={20} max={45} step={1} unit="" decimals={0} onChange={v => setParam('startAge', v)} />
          <MoneyInput label="Initial net monthly (¥)" value={params.initialNetMonthly} onChange={v => setParam('initialNetMonthly', v)} />
          <SliderRow label="Income growth rate" value={params.incomeGrowthRate} min={0} max={10} step={0.5} unit="%" onChange={v => setParam('incomeGrowthRate', v)} helpText="Nominal salary increase per step" />
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Growth interval (years)</label>
            <select value={params.incomeGrowthStep} onChange={e => setParam('incomeGrowthStep', Number(e.target.value))} className="w-full border rounded px-2 py-1 text-xs">
              {[1, 2, 3, 4].map(v => <option key={v} value={v}>{v} yr</option>)}
            </select>
          </div>
          <MoneyInput label="Net salary cap (¥/mo)" value={params.netSalaryCap} onChange={v => setParam('netSalaryCap', v)} />
        </Section>

        <Section title="Inflation & Returns" defaultOpen>
          <SliderRow label="Annual inflation" value={params.inflation} min={0} max={5} step={0.25} unit="%" onChange={v => setParam('inflation', v)} />
          <SliderRow label="Bull real return" value={params.returns.bull} min={0} max={12} step={0.5} unit="%" onChange={v => setReturn_('bull', v)} />
          <SliderRow label="Base real return" value={params.returns.base} min={0} max={12} step={0.5} unit="%" onChange={v => setReturn_('base', v)} />
          <SliderRow label="Bear real return" value={params.returns.bear} min={0} max={12} step={0.5} unit="%" onChange={v => setReturn_('bear', v)} />
        </Section>

        <Section title="Mortgage & Housing">
          <SliderRow label="Purchase age" value={params.propertyPurchaseAge} min={30} max={55} step={1} unit="" decimals={0} onChange={v => setParam('propertyPurchaseAge', v)} />
          <MoneyInput label="Property value (¥)" value={params.propertyValue} onChange={v => setParam('propertyValue', v)} />
          <SliderRow label="Initial mortgage rate" value={params.initialMortgageRate} min={0.5} max={5} step={0.1} unit="%" onChange={v => setParam('initialMortgageRate', v)} />
          <SliderRow label="Mortgage term (years)" value={params.mortgageTerm} min={10} max={35} step={5} unit="yr" decimals={0} onChange={v => setParam('mortgageTerm', v)} />
          <SliderRow label="Partner housing share" value={params.partnerHousingShare} min={0} max={50} step={1} unit="%" decimals={0} onChange={v => setParam('partnerHousingShare', v)} />
          <div className="border-t pt-2 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Bear rate growth (5yr rule)</p>
            <SliderRow label="Increase" value={params.mortgageRateGrowth.bear?.annualIncrease ?? 0.3} min={0} max={1} step={0.05} unit="%/yr" onChange={v => setRateGrowth('bear', 'annualIncrease', v)} />
            <SliderRow label="Every" value={params.mortgageRateGrowth.bear?.everyYears ?? 1} min={1} max={5} step={1} unit="yr" decimals={0} onChange={v => setRateGrowth('bear', 'everyYears', v)} />
            <SliderRow label="Cap" value={params.mortgageRateGrowth.bear?.cap ?? 4.0} min={1} max={6} step={0.25} unit="%" onChange={v => setRateGrowth('bear', 'cap', v)} />
          </div>
          <div className="border-t pt-2 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Base rate growth (5yr rule)</p>
            <SliderRow label="Increase" value={params.mortgageRateGrowth.base?.annualIncrease ?? 0.15} min={0} max={1} step={0.05} unit="%/yr" onChange={v => setRateGrowth('base', 'annualIncrease', v)} />
            <SliderRow label="Every" value={params.mortgageRateGrowth.base?.everyYears ?? 1} min={1} max={5} step={1} unit="yr" decimals={0} onChange={v => setRateGrowth('base', 'everyYears', v)} />
            <SliderRow label="Cap" value={params.mortgageRateGrowth.base?.cap ?? 3.0} min={1} max={6} step={0.25} unit="%" onChange={v => setRateGrowth('base', 'cap', v)} />
          </div>
          <div className="border-t pt-2 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Bull rate growth (5yr rule)</p>
            <SliderRow label="Increase" value={params.mortgageRateGrowth.bull?.annualIncrease ?? 0} min={0} max={1} step={0.05} unit="%/yr" onChange={v => setRateGrowth('bull', 'annualIncrease', v)} />
            <SliderRow label="Every" value={params.mortgageRateGrowth.bull?.everyYears ?? 1} min={1} max={5} step={1} unit="yr" decimals={0} onChange={v => setRateGrowth('bull', 'everyYears', v)} />
            <SliderRow label="Cap" value={params.mortgageRateGrowth.bull?.cap ?? 1.5} min={1} max={6} step={0.25} unit="%" onChange={v => setRateGrowth('bull', 'cap', v)} />
          </div>
        </Section>

        <Section title="Monthly Expenses">
          <SliderRow label="Groceries" value={params.groceries / 1000} min={10} max={80} step={1} unit="k" onChange={v => setParam('groceries', v * 1000)} />
          <SliderRow label="Transport" value={params.transport / 1000} min={0} max={40} step={1} unit="k" onChange={v => setParam('transport', v * 1000)} />
          <SliderRow label="Personal care" value={params.personalCare / 1000} min={0} max={60} step={1} unit="k" onChange={v => setParam('personalCare', v * 1000)} />
          <SliderRow label="Fine dining" value={params.fineDining / 1000} min={0} max={80} step={1} unit="k" onChange={v => setParam('fineDining', v * 1000)} />
          <SliderRow label="Drinking/bars" value={params.drinking / 1000} min={0} max={100} step={1} unit="k" onChange={v => setParam('drinking', v * 1000)} />
          <SliderRow label="Phone/Internet" value={params.phoneInternet / 1000} min={0} max={30} step={0.5} unit="k" onChange={v => setParam('phoneInternet', v * 1000)} />
        </Section>

        <Section title="Annual Travel">
          <SliderRow label="Ski trips" value={params.skiTrips / 10000} min={0} max={100} step={1} unit="万" decimals={0} onChange={v => setParam('skiTrips', v * 10000)} />
          <SliderRow label="Domestic trips" value={params.domesticTrips / 10000} min={0} max={60} step={1} unit="万" decimals={0} onChange={v => setParam('domesticTrips', v * 10000)} />
          <SliderRow label="Festivals" value={params.festivals / 10000} min={0} max={80} step={1} unit="万" decimals={0} onChange={v => setParam('festivals', v * 10000)} />
          <SliderRow label="Europe trip" value={params.europeTrip / 10000} min={0} max={150} step={1} unit="万" decimals={0} onChange={v => setParam('europeTrip', v * 10000)} />
          <SliderRow label="India trip" value={params.indiaTrip / 10000} min={0} max={80} step={1} unit="万" decimals={0} onChange={v => setParam('indiaTrip', v * 10000)} />
        </Section>

        <Section title="Retirement">
          <SliderRow label="Safe withdrawal rate" value={params.swr} min={2.5} max={5} step={0.1} unit="%" onChange={v => setParam('swr', v)} />
          <SliderRow label="Buffer above SWR" value={params.swrBuffer} min={0} max={30} step={1} unit="%" decimals={0} onChange={v => setParam('swrBuffer', v)} />
          <div className="space-y-1">
            <label className="text-xs text-gray-600">iDeCo limit</label>
            <div className="flex gap-1.5">
              {[{ v: 23000, l: '¥23k (no DC)' }, { v: 12000, l: '¥12k (DC plan)' }].map(o => (
                <button key={o.v} onClick={() => setParam('iDeCoMonthly', o.v)}
                  className={`flex-1 text-xs py-1 rounded border ${params.iDeCoMonthly === o.v ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Custom Scenario */}
        <Section title="Custom Scenario" badge={params.customScenario?.enabled ? 'ON' : ''}>
          <Toggle label="Enable Custom scenario" checked={!!params.customScenario?.enabled}
            onChange={v => setCustom('enabled', v)} />
          {params.customScenario?.enabled && (
            <div className="space-y-2 pl-2 border-l-2 border-purple-300 mt-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-600">Label</label>
                <input value={params.customScenario.label} onChange={e => setCustom('label', e.target.value)}
                  className="w-full border rounded px-2 py-1 text-xs" placeholder="My Optimistic Plan" />
              </div>
              <SliderRow label="Real return" value={params.customScenario.realReturn} min={0} max={12} step={0.5} unit="%" onChange={v => setCustom('realReturn', v)} />
              <SliderRow label="Mortgage rate" value={params.customScenario.mortgageRate} min={0.5} max={5} step={0.1} unit="%" onChange={v => setCustom('mortgageRate', v)} />
              <SliderRow label="Rate increase" value={params.customScenario.rateIncrease ?? 0.2} min={0} max={1} step={0.05} unit="%/yr" onChange={v => setCustom('rateIncrease', v)} />
              <SliderRow label="Every" value={params.customScenario.rateEveryYears ?? 1} min={1} max={5} step={1} unit="yr" decimals={0} onChange={v => setCustom('rateEveryYears', v)} />
              <SliderRow label="Rate cap" value={params.customScenario.rateCap ?? 3.5} min={1} max={6} step={0.25} unit="%" onChange={v => setCustom('rateCap', v)} />
              <SliderRow label="Salary growth %" value={params.customScenario.salaryGrowthRate} min={0} max={10} step={0.5} unit="%" onChange={v => setCustom('salaryGrowthRate', v)} />
              <SliderRow label="Salary step (yr)" value={params.customScenario.salaryGrowthStep} min={1} max={4} step={1} unit="yr" decimals={0} onChange={v => setCustom('salaryGrowthStep', v)} />
              <SliderRow label="Inflation" value={params.customScenario.inflation} min={0} max={5} step={0.25} unit="%" onChange={v => setCustom('inflation', v)} />
            </div>
          )}
        </Section>

        <Section title="Display">
          <Toggle label="Show nominal ¥ (not real)" checked={params.showNominal} onChange={v => setParam('showNominal', v)} />
          <Toggle label="Show 年金 Nenkin annotation" checked={params.showNenkin} onChange={v => setParam('showNenkin', v)} />
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
        {/* Progress Tracker */}
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
            <button onClick={() => setShowLifeEvents(!showLifeEvents)}
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
          {ALL_TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === t.id ? 'border-b-2 border-teal-600 text-teal-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white rounded-lg border p-5 min-h-full">
            <ErrorBoundary>
              {activeTab === 'fatfire' && <TabFatFire simData={simData} params={params} lifeEvents={lifeEvents} bridgePhase={bridgePhase} setBridgePhase={setBridgePhase} appliedCuts={appliedCuts} setAppliedCuts={setAppliedCuts} scenarios={scenarios} />}
              {activeTab === 'cashflow' && <TabCashFlow simData={simData} params={params} lifeEvents={lifeEvents} bridgePhase={bridgePhase} scenarios={scenarios} />}
              {activeTab === 'networth' && <TabNetWorth simData={simData} params={params} lifeEvents={lifeEvents} scenarios={scenarios} />}
              {activeTab === 'budget' && <TabBudget simData={simData} params={params} setParam={setParam} onReset={onReset} scenarios={scenarios} />}
              {activeTab === 'alloc' && <TabAllocation simData={simData} params={params} scenarios={scenarios} />}
              {activeTab === 'phases' && <TabSpendingPhases params={params} scenarios={scenarios} lifeEvents={lifeEvents} bridgePhase={bridgePhase} appliedCuts={appliedCuts} spendingPhases={spendingPhases} setSpendingPhases={setSpendingPhases} />}
              {activeTab === 'compare' && <TabCompare simData={simData} params={params} scenarios={scenarios} />}
              {activeTab === 'montecarlo' && <TabMonteCarlo params={params} lifeEvents={lifeEvents} bridgePhase={bridgePhase} spendingPhases={spendingPhases} scenarios={scenarios} />}
            </ErrorBoundary>
          </div>

          {/* About the model */}
          <details className="mt-4 bg-white rounded-lg border p-4 text-xs text-gray-500">
            <summary className="cursor-pointer font-semibold text-gray-600 select-none">About the model & assumptions</summary>
            <div className="mt-3 space-y-2 leading-relaxed">
              <p><strong>Income:</strong> Net monthly salary is post income-tax withholding, 厚生年金, 健康保険, 雇用保険. Only 住民税 (residence tax) is set aside separately.</p>
              <p><strong>Tax wrappers:</strong> iDeCo → NISA (lifetime cap ¥18M) → taxable brokerage. All returns modelled as real annual returns.</p>
              <p><strong>Mortgage:</strong> Variable rate, 35-year term. Rate increases linearly per scenario; payment recalculates every 5 years (5年ルール).</p>
              <p><strong>FatFIRE target:</strong> Annual real expenses ÷ SWR × (1 + buffer%). Drawdown order: taxable → NISA → iDeCo (age 60+).</p>
              <p><strong>Monte Carlo:</strong> 500 paths per scenario, normally distributed annual returns (σ=8%). Run server-side for performance.</p>
              <p className="text-gray-400 italic">This is a planning tool, not financial advice.</p>
            </div>
          </details>
        </div>
      </main>
    </div>
  )
}
