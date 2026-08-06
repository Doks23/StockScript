const store = new Map<string, { data: unknown; expiry: number }>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiry) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiry: Date.now() + ttlMs });
}

export function clearCache(): void {
  store.clear();
}

/**
 * Drop every cached response for one user's trades.
 *
 * The search endpoint caches for 5s, and a page that refreshes straight after a
 * write lands inside that window - so the write succeeds, the UI refetches, and
 * the user is handed back the pre-write rows. Any route that changes a trade
 * must call this, or the change appears not to have happened.
 */
export function invalidateUserTrades(userId: string): void {
  const prefix = `trades:search:${userId}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
