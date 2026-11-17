export function createRateLimit({ limit, windowMs }) {
  const hits = new Map()
  const prune = (now) => {
    for (const [key, times] of hits) {
      const live = times.filter((t) => now - t < windowMs)
      if (live.length) hits.set(key, live)
      else hits.delete(key)
    }
  }
  return {
    allow(key, now) {
      prune(now)
      const times = hits.get(key) ?? []
      if (times.length >= limit) return false
      hits.set(key, [...times, now])
      return true
    },
    size: () => hits.size
  }
}
