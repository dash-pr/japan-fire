import { runMonteCarlo } from '../src/monteCarlo.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { params, scenarioKey, numSims, opts } = req.body ?? {}

    if (!params || !scenarioKey) {
      return res.status(400).json({ error: 'Missing required fields: params, scenarioKey' })
    }

    const results = await runMonteCarlo(params, scenarioKey, numSims ?? 500, opts ?? {}, null)

    return res.status(200).json(results)
  } catch (err) {
    console.error('Monte Carlo error:', err)
    return res.status(500).json({ error: 'Monte Carlo simulation failed' })
  }
}
