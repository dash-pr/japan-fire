import { SCENARIO_COLORS } from '../simulation.js'

export const C = SCENARIO_COLORS
export const PIE_COLORS = ['#6366f1','#3b82f6','#0ea5e9','#06b6d4','#14b8a6','#10b981',
  '#84cc16','#eab308','#f97316','#ef4444','#a855f7','#ec4899','#64748b','#94a3b8']
export const PRESET_SCENARIOS = ['bear','base','bull']
export const SCENARIO_DASHES = { bull: '', base: '8 4', bear: '4 4', custom: '2 2 6 2' }
export const ALL_TABS = [
  { id:'fatfire',  label:'FatFIRE' },
  { id:'cashflow', label:'Cash Flow' },
  { id:'networth', label:'Net Worth' },
  { id:'budget',   label:'Budget' },
  { id:'alloc',    label:'Allocation' },
  { id:'phases',   label:'Spending Phases' },
  { id:'compare',  label:'Scenarios' },
  { id:'montecarlo', label:'Probability' },
]
