import { runSimulation, getScenarioConfig } from '../src/simulation.js'
import { computeGapMetrics, generateSuggestions } from '../src/gapAnalysis.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { params, scenarioKey, opts, targetAge } = req.body ?? {}

    if (!params || !scenarioKey) {
      return res.status(400).json({ error: 'Missing required fields: params, scenarioKey' })
    }

    const age = targetAge ?? 90
    const scCfg = getScenarioConfig(params, scenarioKey)
    const series = runSimulation(params, scCfg, opts ?? {})
    const gap = computeGapMetrics(series, age)
    const suggestions = generateSuggestions(params, scenarioKey, { ...(opts ?? {}), targetAge: age })

    return res.status(200).json({ gap, suggestions })
  } catch (err) {
    console.error('Gap analysis error:', err)
    return res.status(500).json({ error: 'Gap analysis failed' })
  }
}
