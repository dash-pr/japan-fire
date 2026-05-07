// ─── Tax brackets ─────────────────────────────────────────────────────────────
const TAX_BRACKETS = [
  { upTo: 1_950_000, rate: 0.05 },
  { upTo: 3_300_000, rate: 0.10 },
  { upTo: 6_950_000, rate: 0.20 },
  { upTo: 9_000_000, rate: 0.23 },
  { upTo: 18_000_000, rate: 0.33 },
  { upTo: 40_000_000, rate: 0.40 },
  { upTo: Infinity,   rate: 0.45 },
]

function computeIncomeTax(taxableAnnual) {
  let remaining = taxableAnnual, tax = 0, lower = 0
  for (const b of TAX_BRACKETS) {
    const chunk = Math.max(0, Math.min(remaining, b.upTo - lower))
    if (chunk > 0) tax += chunk * b.rate
    remaining -= chunk
    lower = b.upTo
    if (remaining <= 0) break
  }
  return tax
}

function marginalRate(netMonthly) {
  // Approximate combined marginal rate at a given net monthly salary level
  if (netMonthly < 700_000) return 0.43
  if (netMonthly < 850_000) return 0.46
  return 0.48
}

export function calculateMortgagePayment(P, annualRate, years) {
  const n = years * 12
  const r = annualRate / 12
  if (r === 0) return P / n
  return (P * r) / (1 - Math.pow(1 + r, -n))
}

export function computeResidenceTax(netMonthly) {
  const lo = { net: 650_000, tax: 46_000 }
  const hi = { net: 995_000, tax: 100_583 }
  const t = Math.max(0, Math.min(1, (netMonthly - lo.net) / (hi.net - lo.net)))
  return Math.round(lo.tax + t * (hi.tax - lo.tax))
}

// ─── Scenario helpers ──────────────────────────────────────────────────────────
export const SCENARIO_COLORS = {
  bull: '#1D9E75',
  base: '#EF9F27',
  bear: '#E24B4A',
  custom: '#7C3AED',
}

export function getScenarioConfig(params, key) {
  if (key === 'custom') {
    const cs = params.customScenario
    return {
      realReturn: cs.realReturn,
      mortgageRate: cs.mortgageRate,
      mortgageHike: cs.hikeEnabled ? { newRate: cs.hikeRate, atAge: cs.hikeAge } : null,
      salaryGrowthRate: cs.salaryGrowthRate,
      salaryGrowthStep: cs.salaryGrowthStep,
      inflation: cs.inflation,
      label: cs.label || 'Custom',
      color: SCENARIO_COLORS.custom,
    }
  }
  return {
    bull: {
      realReturn: params.returns.bull,
      mortgageRate: params.initialMortgageRate,
      mortgageHike: params.mortgageRateHikes.bull,
      label: 'Bull', color: SCENARIO_COLORS.bull,
    },
    base: {
      realReturn: params.returns.base,
      mortgageRate: params.initialMortgageRate,
      mortgageHike: params.mortgageRateHikes.base,
      label: 'Base', color: SCENARIO_COLORS.base,
    },
    bear: {
      realReturn: params.returns.bear,
      mortgageRate: params.initialMortgageRate,
      mortgageHike: params.mortgageRateHikes.bear,
      label: 'Bear', color: SCENARIO_COLORS.bear,
    },
  }[key]
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
export const DEFAULTS = {
  startAge: 30,
  initialNetMonthly: 650_000,
  incomeGrowthRate: 4,
  incomeGrowthStep: 2,
  netSalaryCap: 995_000,

  inflation: 2,
  returns: { bear: 2, base: 5, bull: 7 },

  propertyPurchaseAge: 40,
  propertyValue: 100_000_000,
  initialMortgageRate: 1.5,
  mortgageTerm: 35,
  mortgageRateHikes: {
    bear: { newRate: 3.5, atAge: 45 },
    base: { newRate: 2.5, atAge: 50 },
    bull: null,
  },
  partnerHousingShare: 33.33,

  totalRentMonthly: 110_000,
  totalUtilitiesMonthly: 10_000,
  phoneInternet: 12_500,
  condoManagementFee: 30_000,
  propertyTaxAnnual: 200_000,

  groceries: 35_000,
  transport: 12_000,
  personalCare: 20_000,
  fineDining: 20_000,
  drinking: 35_000,

  skiTrips: 250_000,
  domesticTrips: 120_000,
  festivals: 250_000,
  europeTrip: 400_000,
  indiaTrip: 150_000,

  iDeCoMonthly: 23_000,
  swr: 3.5,
  swrBuffer: 15,
  emergencyFundTarget: 1_750_000,

  showNominal: false,
  showNenkin: false,

  customScenario: {
    realReturn: 5,
    mortgageRate: 1.5,
    hikeEnabled: true,
    hikeRate: 2.5,
    hikeAge: 50,
    salaryGrowthRate: 4,
    salaryGrowthStep: 2,
    inflation: 2,
    label: 'Custom',
  },
}

// ─── Core simulation ──────────────────────────────────────────────────────────
/**
 * @param {object} params       - all global parameters (from DEFAULTS shape)
 * @param {object|string} scCfg - scenario config object OR preset key ('bear'|'base'|'bull'|'custom')
 * @param {object} opts
 * @param {Array}  opts.lifeEvents   - [{id,age,type,amount,label,endAge?}]
 * @param {object} opts.bridgePhase  - {enabled,startAge,endAge,monthlyIncome}
 * @param {object} opts.cutOverrides - expense key overrides (for gap analysis / applied cuts)
 */
export function runSimulation(params, scCfg, opts = {}) {
  const sc = typeof scCfg === 'string' ? getScenarioConfig(params, scCfg) : scCfg
  const { lifeEvents = [], bridgePhase = null, cutOverrides = {} } = opts

  const p = { ...params, ...cutOverrides }
  const endAge = 90
  const realReturn = sc.realReturn / 100
  const hike = sc.mortgageHike ?? null
  const userShare = 1 - p.partnerHousingShare / 100

  // Use scenario-specific overrides (for custom scenario)
  const growthRate = sc.salaryGrowthRate ?? p.incomeGrowthRate
  const growthStep = sc.salaryGrowthStep ?? p.incomeGrowthStep

  let iDeCo = 0, nisa = 0, taxable = 0
  let mortgageBalance = 0
  let mortgagePaymentMonthly = 0
  let currentMortgageRate = (sc.mortgageRate ?? p.initialMortgageRate) / 100
  let nisaLifetimeUsed = 0
  let fireCrossed = false, fireAge = null

  const results = []

  for (let age = p.startAge; age <= endAge; age++) {
    const yearsPassed = age - p.startAge

    // ── Income ───────────────────────────────────────────────────────────────
    const growthSteps = Math.floor(yearsPassed / growthStep)
    let netMonthly = Math.min(
      p.netSalaryCap,
      p.initialNetMonthly * Math.pow(1 + growthRate / 100, growthSteps)
    )

    // Life events: income changes
    let incomeModifier = 0
    for (const ev of lifeEvents) {
      if (ev.type === 'incomeChange' && age >= ev.age && (!ev.endAge || age < ev.endAge)) {
        incomeModifier += ev.amount
      }
    }
    netMonthly = Math.max(0, netMonthly + incomeModifier)

    // Bridge phase: override income
    const inBridge = bridgePhase?.enabled && age >= bridgePhase.startAge && age < bridgePhase.endAge
    if (inBridge) netMonthly = bridgePhase.monthlyIncome

    const residenceTax = inBridge ? 0 : computeResidenceTax(netMonthly)

    // ── Mortgage state transitions ─────────────────────────────────────────
    if (age === p.propertyPurchaseAge) {
      mortgageBalance = p.propertyValue
      mortgagePaymentMonthly = calculateMortgagePayment(p.propertyValue, currentMortgageRate, p.mortgageTerm)
    }
    if (hike && age === hike.atAge && age > p.propertyPurchaseAge) {
      currentMortgageRate = hike.newRate / 100
      const remainingYears = p.mortgageTerm - (age - p.propertyPurchaseAge)
      mortgagePaymentMonthly = calculateMortgagePayment(mortgageBalance, currentMortgageRate, remainingYears)
    }
    const mortgagePaidOff = age >= p.propertyPurchaseAge + p.mortgageTerm
    if (mortgagePaidOff) { mortgageBalance = 0; mortgagePaymentMonthly = 0 }

    // ── Expenses ───────────────────────────────────────────────────────────
    const isOwner = age >= p.propertyPurchaseAge
    const travelMonthly = (p.skiTrips + p.domesticTrips + p.festivals + p.europeTrip + p.indiaTrip) / 12

    const housing = isOwner ? mortgagePaymentMonthly * userShare : p.totalRentMonthly * userShare
    const condo = isOwner ? p.condoManagementFee : 0
    const propTax = isOwner ? p.propertyTaxAnnual / 12 : 0
    const utilities = p.totalUtilitiesMonthly * userShare
    const phone = p.phoneInternet

    const totalExpenses = housing + utilities + phone + condo + propTax +
      p.groceries + p.transport + p.personalCare + p.fineDining + p.drinking + travelMonthly

    // ── Home loan deduction (ages 40–52, ¥17,500/mo) ──────────────────────
    const homeLoanDeduction = (isOwner && age <= p.propertyPurchaseAge + 12) ? 17_500 : 0

    // ── Investable ────────────────────────────────────────────────────────
    const investable = Math.max(0, netMonthly - residenceTax - totalExpenses + homeLoanDeduction)

    // ── iDeCo tax saving ──────────────────────────────────────────────────
    const iDeCoTaxSaving = Math.round(p.iDeCoMonthly * 12 * marginalRate(netMonthly))

    // ── Portfolio compounding ─────────────────────────────────────────────
    let iDeCoContribYear = 0, nisaContribYear = 0, taxableContribYear = 0

    if (!fireCrossed) {
      iDeCoContribYear = Math.min(p.iDeCoMonthly * 12, investable * 12)
      const afterIDeco = Math.max(0, investable * 12 - iDeCoContribYear)
      const nisaAvailable = Math.max(0, 18_000_000 - nisaLifetimeUsed)
      nisaContribYear = Math.min(afterIDeco, Math.min(3_600_000, nisaAvailable))
      taxableContribYear = Math.max(0, afterIDeco - nisaContribYear)
      nisaLifetimeUsed += nisaContribYear

      iDeCo = iDeCo * (1 + realReturn) + iDeCoContribYear
      nisa = nisa * (1 + realReturn) + nisaContribYear
      taxable = taxable * (1 + realReturn) + taxableContribYear

      if (age === p.propertyPurchaseAge) taxable = Math.max(0, taxable - 650_000)
    } else {
      const retirementExpenses = totalExpenses * 12
      let withdrawal = retirementExpenses
      const fromTaxable = Math.min(taxable, withdrawal)
      taxable = Math.max(0, taxable - fromTaxable); withdrawal -= fromTaxable
      if (withdrawal > 0) { const f = Math.min(nisa, withdrawal); nisa = Math.max(0, nisa - f); withdrawal -= f }
      if (withdrawal > 0 && age >= 60) { const f = Math.min(iDeCo, withdrawal); iDeCo = Math.max(0, iDeCo - f) }
      iDeCo = iDeCo * (1 + realReturn)
      nisa = nisa * (1 + realReturn)
      taxable = taxable * (1 + realReturn)
    }

    // Life events: windfalls and one-time expenses
    for (const ev of lifeEvents) {
      if (ev.age === age) {
        if (ev.type === 'windfall') taxable += ev.amount
        else if (ev.type === 'expense') taxable = Math.max(0, taxable - ev.amount)
      }
    }

    // ── Mortgage amortisation (12-month inner loop) ───────────────────────
    if (isOwner && !mortgagePaidOff && mortgagePaymentMonthly > 0) {
      for (let m = 0; m < 12; m++) {
        const interest = mortgageBalance * (currentMortgageRate / 12)
        let principal = mortgagePaymentMonthly - interest
        if (principal > mortgageBalance) principal = mortgageBalance
        mortgageBalance = Math.max(0, mortgageBalance - principal)
      }
    }

    // ── FatFIRE target ────────────────────────────────────────────────────
    const realAnnualExpenses = totalExpenses * 12
    const fatFireTarget = Math.round((realAnnualExpenses / (p.swr / 100)) * (1 + p.swrBuffer / 100))
    const totalPortfolio = iDeCo + nisa + taxable
    const netWorth = totalPortfolio - mortgageBalance

    if (!fireCrossed && totalPortfolio >= fatFireTarget) { fireCrossed = true; fireAge = age }

    results.push({
      age, year: 2026 + yearsPassed,
      iDeCo: Math.round(iDeCo),
      nisa: Math.round(nisa),
      taxable: Math.round(taxable),
      totalPortfolio: Math.round(totalPortfolio),
      mortgageBalance: Math.round(mortgageBalance),
      netWorth: Math.round(netWorth),
      netMonthly: Math.round(netMonthly),
      residenceTax: Math.round(residenceTax),
      totalExpenses: Math.round(totalExpenses),
      investableSurplus: Math.round(investable),
      housing: Math.round(housing),
      utilities: Math.round(utilities),
      phone: Math.round(phone),
      condo: Math.round(condo),
      propTax: Math.round(propTax),
      groceries: Math.round(p.groceries),
      transport: Math.round(p.transport),
      personalCare: Math.round(p.personalCare),
      fineDining: Math.round(p.fineDining),
      drinking: Math.round(p.drinking),
      travel: Math.round(travelMonthly),
      iDeCoContrib: Math.round(iDeCoContribYear / 12),
      nisaContrib: Math.round(nisaContribYear / 12),
      taxableContrib: Math.round(taxableContribYear / 12),
      nisaLifetimeUsed: Math.round(nisaLifetimeUsed),
      homeLoanDeduction,
      iDeCoTaxSaving,
      fatFireTarget,
      fireCrossed,
      fireAge,
      currentMortgageRate: Math.round(currentMortgageRate * 10000) / 100,
      inBridge,
    })
  }
  return results
}
