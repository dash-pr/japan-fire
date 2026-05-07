function iDeCoMarginalRate(netMonthly) {
  // Approximate marginal tax rate for iDeCo deduction benefit
  // = marginal income tax rate * 1.021 (reconstruction tax) + 10% residence tax
  // Based on net monthly salary (post income tax, post social insurance)
  if (netMonthly <= 720_000) return 0.3042   // 20% income tax bracket + 10% residence
  if (netMonthly <= 920_000) return 0.3348   // 23% income tax bracket + 10% residence
  return 0.4369                               // 33% income tax bracket + 10% residence
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
      mortgageRateGrowth: { annualIncrease: cs.rateIncrease, everyYears: cs.rateEveryYears, cap: cs.rateCap },
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
      mortgageRateGrowth: params.mortgageRateGrowth.bull,
      label: 'Bull', color: SCENARIO_COLORS.bull,
    },
    base: {
      realReturn: params.returns.base,
      mortgageRate: params.initialMortgageRate,
      mortgageRateGrowth: params.mortgageRateGrowth.base,
      label: 'Base', color: SCENARIO_COLORS.base,
    },
    bear: {
      realReturn: params.returns.bear,
      mortgageRate: params.initialMortgageRate,
      mortgageRateGrowth: params.mortgageRateGrowth.bear,
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
  mortgageRateGrowth: {
    bear: { annualIncrease: 0.3, everyYears: 1, cap: 4.0 },
    base: { annualIncrease: 0.15, everyYears: 1, cap: 3.0 },
    bull: { annualIncrease: 0, everyYears: 1, cap: 1.5 },
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
  nenkinMonthly: 175_000,

  customScenario: {
    realReturn: 5,
    mortgageRate: 1.5,
    rateIncrease: 0.2,
    rateEveryYears: 1,
    rateCap: 3.5,
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
  const { lifeEvents = [], bridgePhase = null, cutOverrides = {}, returnOverrides = null, spendingPhases = null } = opts

  const p = { ...params, ...cutOverrides }
  const endAge = Math.max(90, spendingPhases?.targetDepletionAge ?? 90)
  const realReturn = sc.realReturn / 100
  const inflation = (sc.inflation ?? p.inflation) / 100
  const CAPITAL_GAINS_TAX = 0.20315
  const taxableReturn = realReturn * (1 - CAPITAL_GAINS_TAX)
  const rateGrowth = sc.mortgageRateGrowth ?? null
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
    const deflator = Math.pow(1 + inflation, yearsPassed)
    const thisYearReturn = returnOverrides ? returnOverrides[yearsPassed] : realReturn
    const thisYearTaxableReturn = returnOverrides ? thisYearReturn * (1 - CAPITAL_GAINS_TAX) : taxableReturn

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
    if (age > p.propertyPurchaseAge && age < p.propertyPurchaseAge + p.mortgageTerm && rateGrowth && rateGrowth.annualIncrease > 0) {
      const yearsSincePurchase = age - p.propertyPurchaseAge
      const increments = Math.floor(yearsSincePurchase / rateGrowth.everyYears)
      const baseRate = (sc.mortgageRate ?? p.initialMortgageRate) / 100
      currentMortgageRate = Math.min(rateGrowth.cap / 100, baseRate + (rateGrowth.annualIncrease / 100) * increments)
      // 5-year rule: payment recalculates every 5 years
      if (yearsSincePurchase % 5 === 0) {
        const remainingYears = p.mortgageTerm - yearsSincePurchase
        mortgagePaymentMonthly = calculateMortgagePayment(mortgageBalance, currentMortgageRate, remainingYears)
      }
    }
    const mortgagePaidOff = age >= p.propertyPurchaseAge + p.mortgageTerm
    if (mortgagePaidOff) { mortgageBalance = 0; mortgagePaymentMonthly = 0 }

    // ── Expenses ───────────────────────────────────────────────────────────
    const isOwner = age >= p.propertyPurchaseAge
    const travelMonthly = (p.skiTrips + p.domesticTrips + p.festivals + p.europeTrip + p.indiaTrip) / 12

    const housing = isOwner ? (mortgagePaymentMonthly / deflator) * userShare : p.totalRentMonthly * userShare
    const condo = isOwner ? p.condoManagementFee : 0
    const propTax = isOwner ? p.propertyTaxAnnual / 12 : 0
    const utilities = p.totalUtilitiesMonthly * userShare
    const phone = p.phoneInternet

    // Life events: recurring monthly expenses (e.g. kids)
    let recurringExpenses = 0
    let lifestyleMultiplier = 1
    for (const ev of lifeEvents) {
      if (ev.type === 'recurringExpense' && age >= ev.age && (!ev.endAge || age < ev.endAge)) {
        recurringExpenses += ev.amount
        if (ev.lifestyleReduction) lifestyleMultiplier *= (1 - ev.lifestyleReduction)
      }
    }

    const lifestyle = (p.fineDining + p.drinking + p.personalCare) * lifestyleMultiplier
    const totalExpenses = housing + utilities + phone + condo + propTax +
      p.groceries + p.transport + lifestyle + travelMonthly + recurringExpenses

    // ── Home loan deduction (ages 40–52, ¥17,500/mo) ──────────────────────
    const homeLoanDeduction = (isOwner && age <= p.propertyPurchaseAge + 12) ? 17_500 / deflator : 0

    // ── Investable ────────────────────────────────────────────────────────
    const investable = Math.max(0, netMonthly - residenceTax - totalExpenses + homeLoanDeduction)

    // ── iDeCo tax saving ──────────────────────────────────────────────────
    const iDeCoTaxSaving = Math.round(p.iDeCoMonthly * 12 * iDeCoMarginalRate(netMonthly))

    // ── Portfolio compounding ─────────────────────────────────────────────
    let iDeCoContribYear = 0, nisaContribYear = 0, taxableContribYear = 0

    if (!fireCrossed) {
      iDeCoContribYear = Math.min(p.iDeCoMonthly * 12, investable * 12)
      const afterIDeco = Math.max(0, investable * 12 - iDeCoContribYear)
      const nisaAvailable = Math.max(0, 18_000_000 - nisaLifetimeUsed)
      nisaContribYear = Math.min(afterIDeco, Math.min(3_600_000, nisaAvailable))
      taxableContribYear = Math.max(0, afterIDeco - nisaContribYear)
      nisaLifetimeUsed += nisaContribYear

      iDeCo = iDeCo * (1 + thisYearReturn) + iDeCoContribYear
      nisa = nisa * (1 + thisYearReturn) + nisaContribYear
      taxable = taxable * (1 + thisYearTaxableReturn) + taxableContribYear

      if (age === p.propertyPurchaseAge) taxable = Math.max(0, taxable - 650_000)
    } else {
      let phaseMultiplier = 1.0
      if (spendingPhases?.enabled) {
        const phase = spendingPhases.phases.find(ph => age >= ph.startAge && age < ph.endAge)
        if (phase) phaseMultiplier = phase.multiplier
      }
      const retirementExpenses = (totalExpenses + residenceTax) * 12 * phaseMultiplier
      const nenkinIncome = (p.showNenkin && age >= 65) ? (p.nenkinMonthly / deflator) * 12 : 0
      let withdrawal = Math.max(0, retirementExpenses - nenkinIncome)
      const fromTaxable = Math.min(taxable, withdrawal)
      taxable = Math.max(0, taxable - fromTaxable); withdrawal -= fromTaxable
      if (withdrawal > 0) { const f = Math.min(nisa, withdrawal); nisa = Math.max(0, nisa - f); withdrawal -= f }
      if (withdrawal > 0 && age >= 60) { const f = Math.min(iDeCo, withdrawal); iDeCo = Math.max(0, iDeCo - f) }
      iDeCo = iDeCo * (1 + thisYearReturn)
      nisa = nisa * (1 + thisYearReturn)
      taxable = taxable * (1 + thisYearTaxableReturn)
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
    const realAnnualExpenses = (totalExpenses + residenceTax) * 12
    const nenkinOffset = (p.showNenkin && age >= 65) ? (p.nenkinMonthly / deflator) * 12 : 0
    const netExpensesForTarget = Math.max(0, realAnnualExpenses - nenkinOffset)
    const fatFireTarget = Math.round((netExpensesForTarget / (p.swr / 100)) * (1 + p.swrBuffer / 100))
    const totalPortfolio = iDeCo + nisa + taxable
    const realMortgageBalance = mortgageBalance / deflator
    const netWorth = totalPortfolio - realMortgageBalance

    if (!fireCrossed && totalPortfolio >= fatFireTarget) { fireCrossed = true; fireAge = age }

    results.push({
      age, year: 2026 + yearsPassed,
      iDeCo: Math.round(iDeCo),
      nisa: Math.round(nisa),
      taxable: Math.round(taxable),
      totalPortfolio: Math.round(totalPortfolio),
      mortgageBalance: Math.round(realMortgageBalance),
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
      personalCare: Math.round(p.personalCare * lifestyleMultiplier),
      fineDining: Math.round(p.fineDining * lifestyleMultiplier),
      drinking: Math.round(p.drinking * lifestyleMultiplier),
      travel: Math.round(travelMonthly),
      recurringExpenses: Math.round(recurringExpenses),
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
      phaseMultiplier: fireCrossed ? (spendingPhases?.enabled ? (spendingPhases.phases.find(ph => age >= ph.startAge && age < ph.endAge)?.multiplier ?? 1) : 1) : null,
    })
  }
  return results
}

// ─── Max sustainable withdrawal calculator ────────────────────────────────────
export function computeMaxSustainable(params, scenarioKeys, opts, spendingPhases) {
  const results = {}
  for (const key of scenarioKeys) {
    const sc = getScenarioConfig(params, key)
    results[key] = spendingPhases.phases.map(phase => {
      let lo = 0.1, hi = 3.0
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2
        const testPhases = {
          ...spendingPhases,
          phases: spendingPhases.phases.map(p =>
            p.id === phase.id ? { ...p, multiplier: mid } : p
          ),
        }
        const result = runSimulation(params, sc, { ...opts, spendingPhases: testPhases })
        const targetAge = spendingPhases.targetDepletionAge ?? 95
        const row = result.find(r => r.age === targetAge)
        if ((row?.totalPortfolio ?? 0) > 0) lo = mid; else hi = mid
      }
      return { phaseId: phase.id, maxMultiplier: Math.round(lo * 100) / 100 }
    })
  }
  return results
}
