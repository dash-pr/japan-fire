import { Redis } from '@upstash/redis'
import { gunzipSync } from 'node:zlib'

const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query
  if (!id || id.length !== 10) {
    return res.status(400).json({ error: 'Invalid plan ID' })
  }

  try {
    const data = await redis.get(`plan:${id}`)
    if (!data) {
      return res.status(404).json({ error: 'Plan not found' })
    }

    const decompressed = gunzipSync(Buffer.from(data, 'base64'))
    const state = JSON.parse(decompressed.toString())

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.status(200).json(state)
  } catch (err) {
    console.error('Load error:', err)
    return res.status(500).json({ error: 'Failed to load plan' })
  }
}
