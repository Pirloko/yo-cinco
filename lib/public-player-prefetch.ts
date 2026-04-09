const inflight = new Map<string, Promise<void>>()

export function prefetchPublicPlayerProfile(userId: string): Promise<void> {
  const id = userId.trim()
  if (!id) return Promise.resolve()
  if (typeof window === 'undefined') return Promise.resolve()
  const existing = inflight.get(id)
  if (existing) return existing
  const req = fetch(
    `/api/public-player-profile?userId=${encodeURIComponent(id)}`,
    { cache: 'force-cache' }
  )
    .then(() => {})
    .catch(() => {})
    .finally(() => {
      inflight.delete(id)
    })
  inflight.set(id, req)
  return req
}
