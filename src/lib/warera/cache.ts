/**
 * Minimal in-memory TTL cache for server-side use.
 *
 * This deliberately does NOT reach for Redis/Postgres (the brief says V1
 * should not require them). It's a module-level Map, which is enough to
 * de-duplicate requests within a single server process / serverless
 * invocation lifetime and to satisfy the "~60s market cache" /
 * "aggressive static-config cache" requirements.
 *
 * KNOWN LIMITATION (documented on purpose, not hidden): on serverless
 * platforms like Vercel, each cold-started instance gets its own cache, and
 * concurrent instances don't share it. That's an acceptable V1 trade-off —
 * worst case is a few extra upstream requests, never stale-forever data —
 * but it's the reason cache.ts also exposes `stats()` so a future dashboard
 * panel can show actual hit/miss behavior instead of assuming it works.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  storedAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  size: number;
}

export class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private stats: CacheStats = { hits: 0, misses: 0, sets: 0, size: 0 };

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      this.stats.size = this.store.size;
      return undefined;
    }
    this.stats.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return; // ttl of 0 means "never cache"
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs, storedAt: Date.now() });
    this.stats.sets++;
    this.stats.size = this.store.size;
  }

  /** Age of a cached entry in ms, or undefined if not present / expired. */
  ageMs(key: string): number | undefined {
    const entry = this.store.get(key);
    if (!entry || Date.now() >= entry.expiresAt) return undefined;
    return Date.now() - entry.storedAt;
  }

  delete(key: string): void {
    this.store.delete(key);
    this.stats.size = this.store.size;
  }

  clear(): void {
    this.store.clear();
    this.stats.size = 0;
  }

  getStats(): CacheStats {
    return { ...this.stats, size: this.store.size };
  }

  /**
   * De-duplicate concurrent in-flight requests for the same key so a burst
   * of UI components asking for the same data in the same tick only causes
   * one upstream fetch. Not itself a cache read — call get() first.
   */
  private pending = new Map<string, Promise<unknown>>();

  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const promise = fn().finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}

/** Process-wide singleton — import this, don't construct your own TtlCache. */
export const wareraCache = new TtlCache();

/** Builds a stable cache key from a procedure name + input object. */
export function cacheKey(procedure: string, input?: unknown): string {
  if (input === undefined || input === null) return procedure;
  return `${procedure}:${stableStringify(input)}`;
}

/** JSON.stringify with sorted keys so {a:1,b:2} and {b:2,a:1} hash the same. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
