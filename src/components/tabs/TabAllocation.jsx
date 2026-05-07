import React, { useState } from 'react'
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'
import { axisM, formatJPY, displayVal } from '../../lib/format'
import ChartTip from '../ui/ChartTip'
import ScenarioPicker from '../ui/ScenarioPicker'

export default function TabAllocation({ simData, params, scenarios }) {
  const [sc, setSc] = useState('base')
  const baseData = simData[sc] ?? simData.base
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
      <div className="flex justify-end">
        <ScenarioPicker value={sc} onChange={setSc} scenarios={scenarios} />
      </div>
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
