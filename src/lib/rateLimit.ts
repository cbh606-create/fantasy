type RateLimitEntry = {
  count: number
  resetAt: number
}

type RateLimitResult = {
  ok: boolean
  retryAfterMs?: number
}

const entries = new Map<string, RateLimitEntry>()

export const rateLimit = (
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult => {
  const now = Date.now()
  const entry = entries.get(key)

  if (!entry || now >= entry.resetAt) {
    entries.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  if (entry.count >= limit) {
    return { ok: false, retryAfterMs: entry.resetAt - now }
  }

  entry.count += 1
  return { ok: true }
}
