import React, { useState, useRef } from 'react'
import SliderRow from '../ui/SliderRow'
import MoneyInput from '../ui/MoneyInput'
import { formatJPY } from '../../lib/format'

export default function LifeEventsPanel({ lifeEvents, setLifeEvents, params }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ age:40, type:'windfall', amount:5_000_000, label:'Inheritance', endAge:null, lifestyleReduction:0 })
  const idRef = useRef(0)

  const add = () => {
    const ev = { ...form, id: ++idRef.current }
    if (ev.type !== 'recurringExpense' && ev.type !== 'incomeChange') { delete ev.endAge; delete ev.lifestyleReduction }
    if (ev.type !== 'recurringExpense') delete ev.lifestyleReduction
    setLifeEvents(evs => [...evs, ev])
    setShowForm(false)
  }
  const remove = (id) => setLifeEvents(evs => evs.filter(e => e.id !== id))

  const HINTS = [
    { label:'First child at 35', age:35, type:'recurringExpense', amount:100_000, endAge:57, lifestyleReduction:0.30 },
    { label:'Second child at 37', age:37, type:'recurringExpense', amount:80_000, endAge:59, lifestyleReduction:0.10 },
    { label:'Inheritance ¥5M at 50', age:50, type:'windfall', amount:5_000_000, endAge:null, lifestyleReduction:0 },
    { label:'Car purchase ¥3M at 42', age:42, type:'expense', amount:3_000_000, endAge:null, lifestyleReduction:0 },
    { label:'Salary bump +¥50k at 35', age:35, type:'incomeChange', amount:50_000, endAge:null, lifestyleReduction:0 },
  ]

  const isRecurring = form.type === 'recurringExpense'
  const hasEndAge = form.type === 'recurringExpense' || form.type === 'incomeChange'

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
        <span className="font-semibold text-sm text-gray-700 flex items-center gap-2"><span>📅</span> Life Events</span>
        <button onClick={()=>setShowForm(!showForm)}
          className="text-xs bg-teal-600 text-white px-3 py-1 rounded hover:bg-teal-700">+ Add event</button>
      </div>

      {showForm && (
        <div className="p-4 border-b bg-gray-50 space-y-3">
          <div className="flex flex-wrap gap-2 mb-2">
            {HINTS.map(h=>(
              <button key={h.label} onClick={()=>setForm(f=>({...f,...h}))}
                className="text-xs border rounded px-2 py-1 text-gray-500 hover:bg-gray-100">{h.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-gray-600">Label</label>
              <input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))}
                className="w-full border rounded px-2 py-1 mt-0.5" />
            </div>
            <div>
              <label className="text-gray-600">Type</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}
                className="w-full border rounded px-2 py-1 mt-0.5">
                <option value="windfall">Windfall (add to portfolio)</option>
                <option value="expense">One-time expense (deduct)</option>
                <option value="incomeChange">Income change (permanent, ¥/mo)</option>
                <option value="recurringExpense">Recurring expense (¥/mo for a period)</option>
              </select>
            </div>
            <SliderRow label="Start age" value={form.age} min={params.startAge} max={89} step={1} decimals={0}
              onChange={v=>setForm(f=>({...f,age:v}))} />
            <MoneyInput label={isRecurring ? "Monthly cost (¥)" : "Amount (¥)"} value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} />
            {hasEndAge && (
              <SliderRow label="End age" value={form.endAge ?? form.age + 22} min={form.age+1} max={90} step={1} decimals={0}
                onChange={v=>setForm(f=>({...f,endAge:v}))} />
            )}
            {isRecurring && (
              <SliderRow label="Lifestyle cut %" value={Math.round((form.lifestyleReduction ?? 0) * 100)} min={0} max={60} step={5} unit="%" decimals={0}
                helpText="Reduces dining/drinking/personal care during this period"
                onChange={v=>setForm(f=>({...f,lifestyleReduction:v/100}))} />
            )}
          </div>
          {isRecurring && (
            <p className="text-xs text-gray-500 bg-white rounded p-2 border">
              Models ¥{formatJPY(form.amount)}/mo extra expenses from age {form.age} to {form.endAge ?? form.age+22}, with a {Math.round((form.lifestyleReduction??0)*100)}% reduction in dining/drinking/personal care during that period.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={add} className="bg-teal-600 text-white text-xs px-3 py-1.5 rounded hover:bg-teal-700">Add</button>
            <button onClick={()=>setShowForm(false)} className="border text-xs px-3 py-1.5 rounded text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {lifeEvents.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No life events added. Click "+ Add event" to model windfalls, expenses, or income changes.</p>
      ) : (
        <div className="divide-y">
          {lifeEvents.map(ev => (
            <div key={ev.id} className="flex items-center justify-between px-4 py-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-gray-400 font-mono">Age {ev.age}{ev.endAge ? `–${ev.endAge}` : ''}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  ev.type==='windfall' ? 'bg-green-100 text-green-700' :
                  ev.type==='expense' ? 'bg-red-100 text-red-700' :
                  ev.type==='recurringExpense' ? 'bg-purple-100 text-purple-700' :
                  'bg-blue-100 text-blue-700'
                }`}>{ev.type==='windfall'?'+':ev.type==='expense'?'-':ev.type==='recurringExpense'?'¥/mo':'+-'} ¥{formatJPY(ev.amount)}{ev.type==='recurringExpense'?'/mo':''}</span>
                <span className="text-gray-700">{ev.label}</span>
                {ev.lifestyleReduction > 0 && <span className="text-purple-500 text-xs">(-{Math.round(ev.lifestyleReduction*100)}% lifestyle)</span>}
              </div>
              <button onClick={()=>remove(ev.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
