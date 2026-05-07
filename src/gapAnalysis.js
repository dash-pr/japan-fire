import { runSimulation, getScenarioConfig } from './simulation.js'

// Expense categories with metadata for suggestion engine
export const EXPENSE_CATEGORIES = [
  // key, label, annual (true = annual param divided by 12), tier, icon, max cut fraction
  { key: 'drinking',     label: 'Drinking/bars',    annual: false, tier: 'consider', icon: '🍺', maxCut: 1.0 },
  { key: 'fineDining',   label: 'Fine dining',      annual: false, tier: 'consider', icon: '🍽️',  maxCut: 0.75 },
  { key: 'europeTrip',   label: 'Europe trip',      annual: true,  tier: 'major',    icon: '✈️',   maxCut: 1.0 },
  { key: 'festivals',    label: 'Festivals',        annual: true,  tier: 'major',    icon: '🎵',  maxCut: 1.0 },
  { key: 'skiTrips',     label: 'Ski trips',        annual: true,  tier: 'consider', icon: '⛷️',  maxCut: 1.0 },
  { key: 'personalCare', label: 'Personal care',    annual: false, tier: 'consider', icon: '✂️',  maxCut: 0.5 },
  { key: 'domesticTrips',label: 'Domestic trips',   annual: true,  tier: 'painless', icon: '🚅',  maxCut: 1.0 },
  { key: 'groceries',    label: 'Groceries',        annual: false, tier: 'painless', icon: '🛒',  maxCut: 0.3 },
  { key: 'transport',    label: 'Transport',        annual: false, tier: 'painless', icon: '🚃',  maxCut: 0.4 },
  { key: 'indiaTrip',    label: 'India trip',       annual: true,  tier: 'painless', icon: '🌏',  maxCut: 1.0 },
  { key: 'phoneInternet',label: 'Phone/Internet',   annual: false, tier: 'painless', icon: '📱',  maxCut: 0.3 },
]

const TIER_ICONS = { painless: '🌿', consider: '⚖️', major: '🔥' }
export { TIER_ICONS }

/**
 * Returns gap metrics for one scenario series.
 * shortfall = 0 if FIRE is reached, else estimated monthly expense cut needed.
 */
export function computeGapMetrics(series, targetAge = 90) {
  const fireRow = series.find(r => r.fireCrossed)
  if (fireRow && fireRow.age <= targetAge) {
    return { reached: true, fireAge: fireRow.age, shortfall: 0, yearsGap: 0 }
  }
  // Estimate how much extra monthly surplus is needed
  // Use the row at targetAge to estimate
  const endRow = series.find(r => r.age === targetAge) ?? series[series.length - 1]
  const portfolioAtEnd = endRow.totalPortfolio
  const targetAtEnd = endRow.fatFireTarget
  const shortfallAmount = Math.max(0, targetAtEnd - portfolioAtEnd)
  // Rough: each ¥1/month extra invested ≈ ¥1 × growth_factor over remaining years
  // Simple approximation: shortfall / (years × 12 × avg_multiplier)
  const years = targetAge - (series[0]?.age ?? 30)
  const monthlyNeeded = years > 0 ? Math.round(shortfallAmount / (years * 12 * 8)) : 0

  // Theoretical age past 90 using linear extrapolation (very rough)
  const last5 = series.slice(-5)
  const growthPerYear = last5.length > 1
    ? (last5[last5.length-1].totalPortfolio - last5[0].totalPortfolio) / last5.length
    : 0
  const lastTarget = last5[last5.length-1].fatFireTarget
  const lastPortfolio = last5[last5.length-1].totalPortfolio
  const yearsGap = growthPerYear > 0
    ? Math.ceil((lastTarget - lastPortfolio) / growthPerYear)
    : 999

  return { reached: false, fireAge: null, shortfall: monthlyNeeded, yearsGap: Math.max(0, yearsGap) }
}

/**
 * Generate ranked expense reduction suggestions.
 * @param {object} params
 * @param {string} scenarioKey
 * @param {object} opts  - { lifeEvents, bridgePhase, targetAge }
 * @returns {Array} suggestions sorted by ROI
 */
export function generateSuggestions(params, scenarioKey, opts = {}) {
  const { lifeEvents = [], bridgePhase = null, targetAge = 90 } = opts
  const sc = getScenarioConfig(params, scenarioKey)
  const simOpts = { lifeEvents, bridgePhase }

  const baseline = runSimulation(params, sc, simOpts)
  const baseFireAge = baseline.find(r => r.fireCrossed)?.age ?? Infinity

  if (isFinite(baseFireAge) && baseFireAge <= targetAge) return []

  const suggestions = []

  for (const cat of EXPENSE_CATEGORIES) {
    const currentAnnual = cat.annual ? params[cat.key] : params[cat.key] * 12
    const currentMonthly = currentAnnual / 12
    if (currentMonthly < 1_000) continue // skip negligible categories

    // Test multiple reduction levels
    const reductionFractions = cat.maxCut >= 1.0
      ? [0.25, 0.5, 1.0]
      : cat.maxCut >= 0.5
        ? [0.25, 0.5]
        : [0.2]

    for (const frac of reductionFractions) {
      const cutAnnual = Math.round(currentAnnual * frac)
      const cutMonthly = Math.round(cutAnnual / 12)
      if (cutMonthly < 1_000) continue

      const overrides = cat.annual
        ? { [cat.key]: params[cat.key] - cutAnnual }
        : { [cat.key]: params[cat.key] - cutAnnual / 12 * 12 }
      // For monthly params: reduce by cutMonthly per month = cutAnnual / 12
      const correctedOverride = cat.annual
        ? { [cat.key]: Math.max(0, params[cat.key] - cutAnnual) }
        : { [cat.key]: Math.max(0, params[cat.key] - cutMonthly) }

      const newSeries = runSimulation(params, sc, { ...simOpts, cutOverrides: correctedOverride })
      const newFireAge = newSeries.find(r => r.fireCrossed)?.age ?? Infinity
      const yearsSaved = isFinite(baseFireAge) && isFinite(newFireAge)
        ? baseFireAge - newFireAge
        : isFinite(newFireAge) ? targetAge - newFireAge : 0

      if (yearsSaved > 0 || isFinite(newFireAge)) {
        suggestions.push({
          ...cat,
          reduction: frac,
          cutMonthly,
          cutAnnual,
          newFireAge: isFinite(newFireAge) ? newFireAge : null,
          yearsSaved,
          roi: cutMonthly > 0 ? yearsSaved / cutMonthly : 0,
          descLabel: `Cut ${Math.round(frac * 100)}%`,
          overrideKey: cat.key,
          overrideValue: correctedOverride[cat.key],
        })
      }
    }
  }

  // Sort by ROI descending (most years-saved per ¥ sacrificed)
  suggestions.sort((a, b) => b.roi - a.roi)
  return suggestions
}

/**
 * "Cost in working years" for a category.
 * = annual_category_spend / annual_investable_surplus
 */
export function costInWorkingYears(monthlyAmount, annualSurplus) {
  if (!annualSurplus || annualSurplus <= 0) return null
  return (monthlyAmount * 12) / annualSurplus
}
