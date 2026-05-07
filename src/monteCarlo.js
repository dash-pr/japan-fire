import { runSimulation, getScenarioConfig } from './simulation.js'

function randn() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function generateReturns(meanReturn, sigma, numYears) {
  return Array.from({ length: numYears }, () => meanReturn + randn() * sigma)
}

export async function runMonteCarlo(params, scenarioKey, numSims = 500, opts = {}, progressCallback = null) {
  const sc = getScenarioConfig(params, scenarioKey)
  const { lifeEvents = [], bridgePhase = null, spendingPhases = null } = opts
  const sigma = 0.08
  const meanReturn = sc.realReturn / 100
  const endAge = Math.max(90, spendingPhases?.targetDepletionAge ?? 90)
  const numYears = endAge - params.startAge + 1

  const ages = Array.from({ length: numYears }, (_, i) => params.startAge + i)
  const allPaths = []
  const fireAges = []

  const chunkSize = 50
  for (let i = 0; i < numSims; i += chunkSize) {
    const batch = Math.min(chunkSize, numSims - i)
    for (let j = 0; j < batch; j++) {
      const returnOverrides = generateReturns(meanReturn, sigma, numYears)
      const path = runSimulation(params, sc, { lifeEvents, bridgePhase, spendingPhases, returnOverrides })
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
