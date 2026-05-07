import { getScenarioConfig } from './simulation.js'

function randn() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function resTax(net) {
  const lo = { net: 650_000, tax: 46_000 }, hi = { net: 995_000, tax: 100_583 }
  const t = Math.max(0, Math.min(1, (net - lo.net) / (hi.net - lo.net)))
  return lo.tax + t * (hi.tax - lo.tax)
}

function mortgagePmt(P, annualRate, years) {
  const n = years * 12, r = annualRate / 12
  if (r === 0) return P / n
  return (P * r) / (1 - Math.pow(1 + r, -n))
}

function runOnePath(params, sc, sigma, lifeEvents = [], bridgePhase = null) {
  const p = params
  const userShare = 1 - p.partnerHousingShare / 100
  const hike = sc.mortgageHike ?? null
  const growthRate = sc.salaryGrowthRate ?? p.incomeGrowthRate
  const growthStep = sc.salaryGrowthStep ?? p.incomeGrowthStep

  let iDeCo = 0, nisa = 0, taxable = 0
  let mortgageBalance = 0, mortgagePaymentMonthly = 0
  let currentMortgageRate = (sc.mortgageRate ?? p.initialMortgageRate) / 100
  let nisaLifetimeUsed = 0, fireCrossed = false

  const path = []

  for (let age = p.startAge; age <= 90; age++) {
    const yearsPassed = age - p.startAge
    const thisYearReturn = (sc.realReturn / 100) + randn() * sigma

    const growthSteps = Math.floor(yearsPassed / growthStep)
    let netMonthly = Math.min(p.netSalaryCap,
      p.initialNetMonthly * Math.pow(1 + growthRate / 100, growthSteps))

    for (const ev of lifeEvents) {
      if (ev.type === 'incomeChange' && age >= ev.age && (!ev.endAge || age < ev.endAge))
        netMonthly = Math.max(0, netMonthly + ev.amount)
    }
    const inBridge = bridgePhase?.enabled && age >= bridgePhase.startAge && age < bridgePhase.endAge
    if (inBridge) netMonthly = bridgePhase.monthlyIncome
    const residenceTax = inBridge ? 0 : resTax(netMonthly)

    if (age === p.propertyPurchaseAge) {
      mortgageBalance = p.propertyValue
      mortgagePaymentMonthly = mortgagePmt(p.propertyValue, currentMortgageRate, p.mortgageTerm)
    }
    if (hike && age === hike.atAge && age > p.propertyPurchaseAge) {
      currentMortgageRate = hike.newRate / 100
      mortgagePaymentMonthly = mortgagePmt(mortgageBalance, currentMortgageRate,
        p.mortgageTerm - (age - p.propertyPurchaseAge))
    }
    const mortgagePaidOff = age >= p.propertyPurchaseAge + p.mortgageTerm
    if (mortgagePaidOff) { mortgageBalance = 0; mortgagePaymentMonthly = 0 }

    const isOwner = age >= p.propertyPurchaseAge
    const travelMonthly = (p.skiTrips + p.domesticTrips + p.festivals + p.europeTrip + p.indiaTrip) / 12
    const housing = isOwner ? mortgagePaymentMonthly * userShare : p.totalRentMonthly * userShare
    const totalExpenses = housing + p.totalUtilitiesMonthly * userShare + p.phoneInternet +
      (isOwner ? p.condoManagementFee + p.propertyTaxAnnual / 12 : 0) +
      p.groceries + p.transport + p.personalCare + p.fineDining + p.drinking + travelMonthly
    const homeLoanDeduction = isOwner && age <= p.propertyPurchaseAge + 12 ? 17_500 : 0
    const investable = Math.max(0, netMonthly - residenceTax - totalExpenses + homeLoanDeduction)

    if (!fireCrossed) {
      const iDeCoY = Math.min(p.iDeCoMonthly * 12, investable * 12)
      const afterIDeco = Math.max(0, investable * 12 - iDeCoY)
      const nisaAvail = Math.max(0, 18_000_000 - nisaLifetimeUsed)
      const nisaY = Math.min(afterIDeco, Math.min(3_600_000, nisaAvail))
      const taxableY = Math.max(0, afterIDeco - nisaY)
      nisaLifetimeUsed += nisaY
      iDeCo = iDeCo * (1 + thisYearReturn) + iDeCoY
      nisa = nisa * (1 + thisYearReturn) + nisaY
      taxable = taxable * (1 + thisYearReturn) + taxableY
      if (age === p.propertyPurchaseAge) taxable = Math.max(0, taxable - 650_000)
    } else {
      let wd = totalExpenses * 12
      const ft = Math.min(taxable, wd); taxable = Math.max(0, taxable - ft); wd -= ft
      if (wd > 0) { const fn = Math.min(nisa, wd); nisa = Math.max(0, nisa - fn); wd -= fn }
      if (wd > 0 && age >= 60) { const fi = Math.min(iDeCo, wd); iDeCo = Math.max(0, iDeCo - fi) }
      iDeCo = iDeCo * (1 + thisYearReturn)
      nisa = nisa * (1 + thisYearReturn)
      taxable = taxable * (1 + thisYearReturn)
    }

    for (const ev of lifeEvents) {
      if (ev.age === age) {
        if (ev.type === 'windfall') taxable += ev.amount
        else if (ev.type === 'expense') taxable = Math.max(0, taxable - ev.amount)
      }
    }

    if (isOwner && !mortgagePaidOff && mortgagePaymentMonthly > 0) {
      for (let m = 0; m < 12; m++) {
        const interest = mortgageBalance * (currentMortgageRate / 12)
        let principal = mortgagePaymentMonthly - interest
        if (principal > mortgageBalance) principal = mortgageBalance
        mortgageBalance = Math.max(0, mortgageBalance - principal)
      }
    }

    const realAnnualExpenses = totalExpenses * 12
    const fatFireTarget = (realAnnualExpenses / (p.swr / 100)) * (1 + p.swrBuffer / 100)
    const totalPortfolio = iDeCo + nisa + taxable
    if (!fireCrossed && totalPortfolio >= fatFireTarget) fireCrossed = true

    path.push({ age, totalPortfolio, fatFireTarget, fireCrossed })
  }
  return path
}

export async function runMonteCarlo(params, scenarioKey, numSims = 500, opts = {}, progressCallback = null) {
  const sc = getScenarioConfig(params, scenarioKey)
  const { lifeEvents = [], bridgePhase = null } = opts
  const sigma = 0.08

  const ages = Array.from({ length: 90 - params.startAge + 1 }, (_, i) => params.startAge + i)
  const allPaths = []
  const fireAges = []

  const chunkSize = 50
  for (let i = 0; i < numSims; i += chunkSize) {
    const batch = Math.min(chunkSize, numSims - i)
    for (let j = 0; j < batch; j++) {
      const path = runOnePath(params, sc, sigma, lifeEvents, bridgePhase)
      allPaths.push(path)
      const fireRow = path.find(r => r.fireCrossed)
      fireAges.push(fireRow ? fireRow.age : null)
    }
    if (progressCallback) progressCallback(i + batch, numSims)
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  const percentiles = ages.map((age, idx) => {
    const vals = allPaths.map(p => p[idx]?.totalPortfolio ?? 0).sort((a, b) => a - b)
    const n = vals.length
    return {
      age,
      p10: vals[Math.floor(n * 0.10)],
      p25: vals[Math.floor(n * 0.25)],
      p50: vals[Math.floor(n * 0.50)],
      p75: vals[Math.floor(n * 0.75)],
      p90: vals[Math.floor(n * 0.90)],
    }
  })

  const reached = fireAges.filter(a => a !== null)
  const histMap = {}
  for (const a of reached) histMap[a] = (histMap[a] || 0) + 1
  const histogram = Object.entries(histMap)
    .map(([age, count]) => ({ age: Number(age), count }))
    .sort((a, b) => a.age - b.age)

  const probByAge = (t) => Math.round((fireAges.filter(a => a !== null && a <= t).length / numSims) * 100)
  const survives90 = allPaths.filter(p => (p[p.length - 1]?.totalPortfolio ?? 0) > 0).length

  return {
    percentiles,
    histogram,
    stats: {
      probBy55: probByAge(55),
      probBy60: probByAge(60),
      probBy65: probByAge(65),
      probSurvive90: Math.round((survives90 / numSims) * 100),
      medianFireAge: reached.length ? reached.sort((a, b) => a - b)[Math.floor(reached.length / 2)] : null,
    },
  }
}
