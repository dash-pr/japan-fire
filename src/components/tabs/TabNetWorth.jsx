import React, { useState } from 'react'
import {
  ComposedChart, Line, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'
import { C } from '../../lib/constants'
import { axisM, displayVal } from '../../lib/format'
import ChartTip from '../ui/ChartTip'
import ScenarioPicker from '../ui/ScenarioPicker'

export default function TabNetWorth({ simData, params, lifeEvents, scenarios }) {
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
