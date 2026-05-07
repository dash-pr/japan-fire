import { runSimulation, getScenarioConfig } from '../src/simulation.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { params, scenarioKey, opts } = req.body ?? {}

    if (!params || !scenarioKey) {
      return res.status(400).json({ error: 'Missing required fields: params, scenarioKey' })
    }

    const scCfg = getScenarioConfig(params, scenarioKey)
    const results = runSimulation(params, scCfg, opts ?? {})

    return res.status(200).json(results)
  } catch (err) {
    console.error('Simulate error:', err)
    return res.status(500).json({ error: 'Simulation failed' })
  }
}
