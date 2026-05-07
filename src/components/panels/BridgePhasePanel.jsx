import React from 'react'
import Toggle from '../ui/Toggle'
import SliderRow from '../ui/SliderRow'
import MoneyInput from '../ui/MoneyInput'

export default function BridgePhasePanel({ bridgePhase, setBridgePhase, params }) {
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
