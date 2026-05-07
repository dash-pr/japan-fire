import React, { useState } from 'react'
import {
  ComposedChart, Line, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'
import { C } from '../../lib/constants'
import { displayVal } from '../../lib/format'
import ChartTip from '../ui/ChartTip'
import ScenarioPicker from '../ui/ScenarioPicker'
import SalaryROIPanel from '../panels/SalaryROIPanel'

export default function TabCashFlow({ simData, params, lifeEvents, bridgePhase, scenarios }) {
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
