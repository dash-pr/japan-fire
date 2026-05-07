import React, { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceDot, Brush,
} from 'recharts'
import { C, SCENARIO_DASHES } from '../../lib/constants'
import { axisM, displayVal } from '../../lib/format'
import ChartTip from '../ui/ChartTip'
import GapAnalysisPanel from '../panels/GapAnalysisPanel'
import SensitivityChart from '../panels/SensitivityChart'
import BridgePhasePanel from '../panels/BridgePhasePanel'

export default function TabFatFire({ simData, params, lifeEvents, bridgePhase, setBridgePhase, appliedCuts, setAppliedCuts, scenarios }) {
  const [subTab, setSubTab] = useState('projection') // 'projection' | 'sensitivity'
  const defaultEndIdx = Math.min(65 - params.startAge, 90 - params.startAge)
  const [zoomRange, setZoomRange] = useState({ startIndex: 0, endIndex: defaultEndIdx })
  const [visibleScenarios, setVisibleScenarios] = useState(new Set(scenarios))
  useEffect(() => setVisibleScenarios(prev => {
    const next = new Set(scenarios.filter(s => prev.has(s)))
    return next.size > 0 ? next : new Set(scenarios)
  }), [scenarios])
  const toggleScenario = (k) => setVisibleScenarios(prev => {
    const next = new Set(prev)
    if (next.has(k)) { if (next.size > 1) next.delete(k) } else next.add(k)
    return next
  })

  const allScenarios = scenarios.filter(s => visibleScenarios.has(s))

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

        {/* Clickable legend */}
        <div className="flex flex-wrap gap-3 text-xs justify-center">
          {scenarios.map(k=>(
            <button key={k} onClick={()=>toggleScenario(k)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded transition-opacity ${visibleScenarios.has(k)?'opacity-100':'opacity-40'}`}>
              <div className="w-4 h-0.5" style={{background:C[k]}} />
              <span className="text-gray-600">
                {k==='custom' ? (params.customScenario?.label||'Custom') : `${k.charAt(0).toUpperCase()+k.slice(1)} (${params.returns[k]}% real)`}
              </span>
            </button>
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
