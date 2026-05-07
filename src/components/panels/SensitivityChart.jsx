import React, { useMemo } from 'react'
import { runSimulation } from '../../simulation.js'

export default function SensitivityChart({ params, lifeEvents, bridgePhase }) {
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
