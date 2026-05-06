import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, CartesianGrid, Legend, ReferenceLine
} from 'recharts'
import { Activity, AlertTriangle, DollarSign } from 'lucide-react'

const TAX_BRACKETS = [
  { upTo: 1950000, rate: 0.05 },
  { upTo: 3300000, rate: 0.10 },
  { upTo: 6950000, rate: 0.20 },
  { upTo: 9000000, rate: 0.23 },
  { upTo: 18000000, rate: 0.33 },
  { upTo: 40000000, rate: 0.40 },
  { upTo: Infinity, rate: 0.45 }
]

function computeIncomeTax(taxableAnnual) {
  let remaining = taxableAnnual
  let tax = 0
  let lower = 0
  for (const b of TAX_BRACKETS) {
    const upper = b.upTo
    const chunk = Math.max(0, Math.min(remaining, upper - lower))
    if (chunk > 0) tax += chunk * b.rate
    remaining -= chunk
    lower = upper
    if (remaining <= 0) break
  }
  return tax
}

function computeTotalTax(annualGross, year, iDeCoAnnual) {
  const taxable = Math.max(0, annualGross - iDeCoAnnual)
  const incomeTax = computeIncomeTax(taxable)
  const residenceTax = taxable * 0.10
  // Defense surcharge applies 2026+
  const defenseSurcharge = year >= 2026 ? incomeTax * 0.01 : 0
  return { 
    incomeTax, 
    residenceTax, 
    defenseSurcharge, 
    totalTax: incomeTax + residenceTax + defenseSurcharge 
  }
}

function calculateMortgagePayment(P, annualRate, years) {
  const n = years * 12
  const r = annualRate / 12
  if (r === 0) return P / n
  return (P * r) / (1 - Math.pow(1 + r, -n))
}

export default function FatFIREOptimizer() {
  const startAge = 30
  const endAge = 60

  // Tunable Parameters
  const [marketCond, setMarketCond] = useState(7)
  const [inflation, setInflation] = useState(2)
  const [interestRate, setInterestRate] = useState(1.5)
  const [incomeGrowthRate, setIncomeGrowthRate] = useState(4)
  const [maxIncomeCap, setMaxIncomeCap] = useState(1500000)
  const [initialNetMonthly, setInitialNetMonthly] = useState(650000)
  
  // Specific Lifestyle & Fixed Parameters
  const [baseExpensesMonthly, setBaseExpensesMonthly] = useState(266000) // Excludes rent
  const [rentMonthly, setRentMonthly] = useState(155000)
  const [partnerSubsidyRatio, setPartnerSubsidyRatio] = useState(33.3)
  const [swr, setSwr] = useState(3.5)

  const data = useMemo(() => {
    const months = (endAge - startAge) * 12
    const monthlyReturnNominal = marketCond / 100 / 12
    const monthlyInflation = inflation / 100 / 12

    let iDeCo = 0
    let nisa = 0
    let nisaLifetimeContributed = 0
    let taxable = 0

    const mortgagePrincipal = 100_000_000
    const mortgageStartMonth = (40 - startAge) * 12
    const mortgageYears = 35
    const mortgagePaymentMonthly = calculateMortgagePayment(mortgagePrincipal, interestRate / 100, mortgageYears)
    let mortgageBalance = mortgagePrincipal

    const yearlySeries = []
    let cumulativeInflation = 1

    for (let m = 0; m <= months; m++) {
      const age = startAge + Math.floor(m / 12)
      const year = 2026 + Math.floor(m / 12)
      const yearsPassed = Math.floor(m / 12)
      
      // Income steps up every 2 years
      const biennial = Math.floor(yearsPassed / 2)
      const monthlyIncome = Math.min(maxIncomeCap, initialNetMonthly * Math.pow(1 + (incomeGrowthRate/100), biennial))

      // Expense shifting at Age 40
      let currentExpenses = baseExpensesMonthly + rentMonthly
      let mortgageOutflow = 0
      let partnerSubsidy = 0
      
      if (m >= mortgageStartMonth && mortgageBalance > 0) {
        const monthlyRate = interestRate / 100 / 12
        const interest = mortgageBalance * monthlyRate
        let principalPayment = mortgagePaymentMonthly - interest
        
        if (principalPayment > mortgageBalance) principalPayment = mortgageBalance
        mortgageBalance -= principalPayment
        
        // Include ¥30k maintenance in housing flow
        mortgageOutflow = mortgagePaymentMonthly + 30000 
        partnerSubsidy = mortgageOutflow * (partnerSubsidyRatio / 100)
        
        // Remove old rent, add subsidized mortgage
        currentExpenses = baseExpensesMonthly + (mortgageOutflow - partnerSubsidy)
      }

      // Convert flows to nominal based on inflation
      const nominalIncome = monthlyIncome * cumulativeInflation
      const nominalExpenses = currentExpenses * cumulativeInflation

      // Fixed iDeCo
      const iDeCoThisMonth = 23000 
      const investableSurplus = Math.max(0, nominalIncome - nominalExpenses - iDeCoThisMonth)
      
      // NISA Waterfall Logic (Hard cap at ¥18M, does not replenish)
      let nisaAllocation = 0
      let taxableAllocation = investableSurplus
      
      if (nisaLifetimeContributed < 18000000) {
         // Max ¥300k/month (¥3.6M/year)
         nisaAllocation = Math.min(taxableAllocation, 300000) 
         const remainingLifetime = 18000000 - nisaLifetimeContributed
         if (nisaAllocation > remainingLifetime) nisaAllocation = remainingLifetime
         
         nisaLifetimeContributed += nisaAllocation
         taxableAllocation -= nisaAllocation
      }

      // Compound Assets
      iDeCo = iDeCo * (1 + monthlyReturnNominal) + iDeCoThisMonth
      nisa = nisa * (1 + monthlyReturnNominal) + nisaAllocation
      taxable = taxable * (1 + monthlyReturnNominal) + taxableAllocation
      
      cumulativeInflation *= (1 + monthlyInflation)

      // Record annual snapshots (Deflated to Real Terms)
      if (m % 12 === 0 && m > 0) {
        const deflator = cumulativeInflation
        
        // Mortgage Tax Credit (Years 40 to 52)
        if (m >= mortgageStartMonth && m < mortgageStartMonth + (13 * 12)) {
          const taxCreditNominal = mortgageBalance * 0.007
          taxable += taxCreditNominal // Reinvest tax refund into taxable
        }

        const realTotal = (iDeCo + nisa + taxable) / deflator
        const realAnnualExpenses = (nominalExpenses * 12) / deflator
        const fatFireTarget = realAnnualExpenses / (swr / 100)

        yearlySeries.push({
          age,
          year,
          iDeCo: Math.round(iDeCo / deflator),
          nisa: Math.round(nisa / deflator),
          taxable: Math.round(taxable / deflator),
          totalNetWorth: Math.round(realTotal),
          fatFireTarget: Math.round(fatFireTarget),
          annualExpenses: Math.round(realAnnualExpenses),
          mortgageBalance: Math.round(mortgageBalance / deflator)
        })
      }
    }
    return yearlySeries
  }, [marketCond, inflation, interestRate, incomeGrowthRate, maxIncomeCap, initialNetMonthly, baseExpensesMonthly, rentMonthly, partnerSubsidyRatio, swr])

  const independenceData = useMemo(() => {
    const hit = data.find(y => y.totalNetWorth >= y.fatFireTarget)
    return hit ? { age: hit.age, year: hit.year } : null
  }, [data])

  const exitTaxWarningAge = useMemo(() => {
    const hit = data.find(y => (y.taxable + y.nisa) > 100_000_000)
    return hit ? hit.age : null
  }, [data])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center gap-4">
        <Activity className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Japan FatFIRE & Real Estate Optimizer</h1>
          <p className="text-gray-600">Dynamic projection with NISA, iDeCo, and Age 40 property pivot (Real ¥ terms).</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Controls Sidebar */}
        <section className="col-span-1 p-4 bg-white rounded-lg shadow border space-y-4">
          <h2 className="font-semibold text-lg border-b pb-2">Global Parameters</h2>
          
          <div>
            <label className="text-sm font-medium flex justify-between">
              <span>Market Return (Nominal)</span>
              <span>{marketCond}%</span>
            </label>
            <input type="range" min="4" max="10" step="0.5" value={marketCond} onChange={e=>setMarketCond(Number(e.target.value))} className="w-full" />
          </div>

          <div>
            <label className="text-sm font-medium flex justify-between">
              <span>Inflation Rate</span>
              <span>{inflation}%</span>
            </label>
            <input type="range" min="0" max="5" step="0.5" value={inflation} onChange={e=>setInflation(Number(e.target.value))} className="w-full" />
          </div>

          <div>
            <label className="text-sm font-medium flex justify-between">
              <span>Safe Withdrawal Rate</span>
              <span>{swr}%</span>
            </label>
            <input type="range" min="2" max="5" step="0.1" value={swr} onChange={e=>setSwr(Number(e.target.value))} className="w-full" />
          </div>

          <h2 className="font-semibold text-lg border-b pb-2 mt-6">Housing & Lifestyle</h2>
          
          <div>
            <label className="text-sm font-medium">Mortgage Rate (¥100M at 40)</label>
            <div className="flex justify-between items-center text-sm mb-1 text-gray-500">
              <span>0.5%</span><span>{interestRate}%</span><span>5.0%</span>
            </div>
            <input type="range" min="0.5" max="5.0" step="0.1" value={interestRate} onChange={e=>setInterestRate(Number(e.target.value))} className="w-full" />
          </div>

          <div>
            <label className="text-sm font-medium">Partner Subsidy (%)</label>
            <input type="range" min="0" max="50" step="1" value={partnerSubsidyRatio} onChange={e=>setPartnerSubsidyRatio(Number(e.target.value))} className="w-full" />
            <div className="text-xs text-right text-gray-500">{partnerSubsidyRatio}%</div>
          </div>
        </section>

        {/* Charts & Visuals */}
        <section className="col-span-3 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded shadow border flex items-center gap-4">
              <div className="p-3 bg-green-100 text-green-700 rounded-full">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Financial Independence</p>
                <p className="text-2xl font-bold">
                  {independenceData ? `Age ${independenceData.age}` : 'Not reached'}
                </p>
              </div>
            </div>

            {exitTaxWarningAge && (
              <div className="p-4 bg-orange-50 border-orange-200 border rounded shadow flex items-center gap-4">
                <div className="p-3 bg-orange-100 text-orange-600 rounded-full">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-orange-800 font-medium">Exit Tax Risk Triggered</p>
                  <p className="text-sm text-orange-600">Assets exceed ¥100M at Age {exitTaxWarningAge}</p>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-white rounded shadow border h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="age" />
                <YAxis tickFormatter={(val) => `¥${(val/1000000).toFixed(0)}M`} />
                <Tooltip formatter={(v) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(v)} labelFormatter={(l) => `Age ${l}`} />
                <Legend />
                <ReferenceLine x={40} stroke="#9ca3af" strokeDasharray="3 3" label={{ position: 'top', value: 'House Purchase' }} />
                <Area type="monotone" name="Real Net Worth" dataKey="totalNetWorth" stroke="#3b82f6" strokeWidth={3} fill="url(#colorTotal)" />
                <Line type="monotone" name="FatFIRE Target" dataKey="fatFireTarget" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  )
}