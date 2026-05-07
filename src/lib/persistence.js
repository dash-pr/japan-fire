import { DEFAULTS } from '../simulation.js'

export function encodeState(state) {
  try { return btoa(encodeURIComponent(JSON.stringify(state))) } catch { return '' }
}

export function decodeState(hash) {
  try { return JSON.parse(decodeURIComponent(atob(hash))) } catch { return null }
}

export function loadInitialState() {
  const hash = window.location.hash.slice(1)
  if (hash) {
    const s = decodeState(hash)
    if (s?.params) { s.params = migrateParams(s.params); return s }
  }
  return null
}

export function migrateParams(p) {
  if (p.mortgageRateHikes && !p.mortgageRateGrowth) {
    const initial = p.initialMortgageRate ?? 1.5
    const purchase = p.propertyPurchaseAge ?? 40
    const convert = (hike) => {
      if (!hike) return { annualIncrease: 0, everyYears: 1, cap: initial }
      const years = Math.max(1, hike.atAge - purchase)
      return { annualIncrease: Math.round(((hike.newRate - initial) / years) * 100) / 100, everyYears: 1, cap: hike.newRate }
    }
    p.mortgageRateGrowth = {
      bear: convert(p.mortgageRateHikes.bear),
      base: convert(p.mortgageRateHikes.base),
      bull: convert(p.mortgageRateHikes.bull),
    }
    delete p.mortgageRateHikes
  }
  if (p.customScenario && 'hikeEnabled' in p.customScenario) {
    const cs = p.customScenario
    const initial = cs.mortgageRate ?? 1.5
    if (cs.hikeEnabled && cs.hikeRate) {
      const years = Math.max(1, (cs.hikeAge ?? 50) - (p.propertyPurchaseAge ?? 40))
      cs.rateIncrease = Math.round(((cs.hikeRate - initial) / years) * 100) / 100
      cs.rateCap = cs.hikeRate
    } else {
      cs.rateIncrease = 0
      cs.rateCap = initial
    }
    cs.rateEveryYears = 1
    delete cs.hikeEnabled; delete cs.hikeRate; delete cs.hikeAge
  }
  return p
}
