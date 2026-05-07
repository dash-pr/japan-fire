import { computeMaxSustainable } from '../src/simulation.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { params, scenarioKeys, opts, spendingPhases } = req.body ?? {}

    if (!params || !scenarioKeys || !spendingPhases) {
      return res.status(400).json({ error: 'Missing required fields: params, scenarioKeys, spendingPhases' })
    }

    if (!Array.isArray(scenarioKeys) || scenarioKeys.length === 0) {
      return res.status(400).json({ error: 'scenarioKeys must be a non-empty array' })
    }

    const results = computeMaxSustainable(params, scenarioKeys, opts ?? {}, spendingPhases)

    return res.status(200).json(results)
  } catch (err) {
    console.error('Max sustainable error:', err)
    return res.status(500).json({ error: 'Max sustainable computation failed' })
  }
}
