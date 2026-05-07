import React, { useState } from 'react'
import MoneyInput from '../ui/MoneyInput'
import { formatJPY } from '../../lib/format'
import { computeResidenceTax } from '../../simulation.js'

export default function BudgetSettings({ params, setParam, onReset }) {
  const [show, setShow] = useState(false)
  const totalMonthly = params.groceries + params.transport + params.personalCare +
    params.fineDining + params.drinking + params.phoneInternet +
    params.totalRentMonthly * (1 - params.partnerHousingShare / 100) +
    params.totalUtilitiesMonthly * (1 - params.partnerHousingShare / 100) +
    (params.skiTrips + params.domesticTrips + params.festivals + params.europeTrip + params.indiaTrip) / 12

  const investableEst = Math.max(0,
    params.initialNetMonthly - computeResidenceTax(params.initialNetMonthly) - totalMonthly)

  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={()=>setShow(!show)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700 hover:bg-gray-100">
        <span className="flex items-center gap-2"><span>⚙️</span> Budget Settings — All Expense Line Items</span>
        <span className="text-gray-400">{show ? '▲' : '▾'}</span>
      </button>

      {show && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 p-3 bg-teal-50 rounded text-xs font-semibold text-teal-800">
            <div>Total monthly spend: ¥{formatJPY(totalMonthly)}</div>
            <div>Total annual: ¥{formatJPY(totalMonthly * 12)}</div>
            <div>Investable est.: <span className="text-teal-600">¥{formatJPY(investableEst)}/mo</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 border-b pb-1">Housing (total cost)</p>
              <MoneyInput label="Total rent/month" value={params.totalRentMonthly} onChange={v=>setParam('totalRentMonthly',v)} />
              <MoneyInput label="Total utilities/month" value={params.totalUtilitiesMonthly} onChange={v=>setParam('totalUtilitiesMonthly',v)} />
              <div className="text-xs text-gray-400">Your share: {(100-params.partnerHousingShare).toFixed(0)}% = ¥{formatJPY(params.totalRentMonthly*(1-params.partnerHousingShare/100))}/mo rent</div>
              <MoneyInput label="Phone/Internet" value={params.phoneInternet} onChange={v=>setParam('phoneInternet',v)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 border-b pb-1">Daily lifestyle</p>
              <MoneyInput label="Groceries/month" value={params.groceries} onChange={v=>setParam('groceries',v)} />
              <MoneyInput label="Transport/month" value={params.transport} onChange={v=>setParam('transport',v)} />
              <MoneyInput label="Personal care/month" value={params.personalCare} onChange={v=>setParam('personalCare',v)} />
              <MoneyInput label="Fine dining/month" value={params.fineDining} onChange={v=>setParam('fineDining',v)} />
              <MoneyInput label="Drinking bars/month" value={params.drinking} onChange={v=>setParam('drinking',v)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 border-b pb-1">Travel (annual)</p>
              <MoneyInput label="Ski trips/year" value={params.skiTrips} onChange={v=>setParam('skiTrips',v)} annual />
              <MoneyInput label="Domestic trips/year" value={params.domesticTrips} onChange={v=>setParam('domesticTrips',v)} annual />
              <MoneyInput label="Festivals/year" value={params.festivals} onChange={v=>setParam('festivals',v)} annual />
              <MoneyInput label="Europe trip/year" value={params.europeTrip} onChange={v=>setParam('europeTrip',v)} annual />
              <MoneyInput label="India trip/year" value={params.indiaTrip} onChange={v=>setParam('indiaTrip',v)} annual />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 border-b pb-1">Post-purchase costs</p>
              <MoneyInput label="Condo mgmt fee/month" value={params.condoManagementFee} onChange={v=>setParam('condoManagementFee',v)} />
              <MoneyInput label="Property tax/year" value={params.propertyTaxAnnual} onChange={v=>setParam('propertyTaxAnnual',v)} annual />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t">
            <button onClick={()=>setShow(false)}
              className="px-4 py-1.5 bg-teal-600 text-white text-xs font-medium rounded hover:bg-teal-700">
              Done — Update Budget
            </button>
            <button onClick={onReset}
              className="text-xs text-red-500 hover:text-red-700 underline">
              Reset all expenses to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
