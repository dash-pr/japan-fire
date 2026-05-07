import React, { useState, useMemo } from 'react'
import MoneyInput from '../ui/MoneyInput'
import SliderRow from '../ui/SliderRow'
import { formatJPY, yenM } from '../../lib/format'
import { C } from '../../lib/constants'
import { runSimulation } from '../../simulation.js'

export default function SalaryROIPanel({ simData, params, lifeEvents, bridgePhase }) {
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
