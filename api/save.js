import { Redis } from '@upstash/redis'
import { gzipSync } from 'node:zlib'
import { nanoid } from 'nanoid'

const redis = Redis.fromEnv()
const MAX_PAYLOAD_BYTES = 50_000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body
    if (!body || !body.params) {
      return res.status(400).json({ error: 'Invalid plan state' })
    }

    const raw = JSON.stringify(body)
    if (Buffer.byteLength(raw) > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Payload too large' })
    }

    const compressed = gzipSync(Buffer.from(raw))
    const id = nanoid(10)

    await redis.set(`plan:${id}`, compressed.toString('base64'), {
      ex: 365 * 24 * 60 * 60,
    })

    return res.status(201).json({ id, url: `/p/${id}` })
  } catch (err) {
    console.error('Save error:', err)
    return res.status(500).json({ error: 'Failed to save plan' })
  }
}
