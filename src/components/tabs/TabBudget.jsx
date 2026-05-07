import React, { useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts'
import { PIE_COLORS } from '../../lib/constants'
import { formatJPY, displayVal } from '../../lib/format'
import ScenarioPicker from '../ui/ScenarioPicker'
import BudgetSettings from '../panels/BudgetSettings'
import { costInWorkingYears } from '../../gapAnalysis.js'

export default function TabBudget({ simData, params, setParam, onReset, scenarios }) {
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
        <ScenarioPicker value={sc} onChange={setSc} scenarios={scenarios} />
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
