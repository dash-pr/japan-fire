import React, { useMemo } from 'react'
import { C } from '../../lib/constants'
import { formatJPY, yenM } from '../../lib/format'
import { runSimulation, getScenarioConfig } from '../../simulation.js'

export default function TabCompare({ simData, params, scenarios }) {
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
