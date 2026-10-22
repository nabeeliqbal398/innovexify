/**
 * The cache behind GET /analytics. It is an interface so the in-memory version below can be replaced by Redis without touching
 * the service: implement `get` and `set` against Redis (SET key value EX ttlSeconds, JSON-encoded), provide it under the
 * ANALYTICS_CACHE token in AnalyticsModule, and every server instance then shares one cache. In memory, each instance
 * keeps its own, so with several instances a figure can be up to the TTL old on any of them, which is acceptable for a report.
 */
export interface AnalyticsCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export const ANALYTICS_CACHE = Symbol("ANALYTICS_CACHE");

const MAX_ENTRIES = 200;

export class InMemoryAnalyticsCache implements AnalyticsCache {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  get(key: string): Promise<string | undefined> {
    const hit = this.entries.get(key);
    if (!hit) return Promise.resolve(undefined);
    if (hit.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(hit.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return Promise.resolve();
    if (this.entries.size >= MAX_ENTRIES) {
      const now = Date.now();
      for (const [k, v] of this.entries) if (v.expiresAt <= now) this.entries.delete(k);
      // Still full of live entries: drop the oldest inserted, so memory stays bounded.
      const oldest = this.entries.keys().next().value;
      if (this.entries.size >= MAX_ENTRIES && oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }
}
