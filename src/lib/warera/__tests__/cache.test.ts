import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TtlCache, cacheKey } from "../cache";

describe("TtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for a missing key", () => {
    const cache = new TtlCache();
    expect(cache.get("nope")).toBeUndefined();
  });

  it("stores and retrieves a value within TTL", () => {
    const cache = new TtlCache();
    cache.set("k", { a: 1 }, 1000);
    expect(cache.get("k")).toEqual({ a: 1 });
  });

  it("expires a value after its TTL elapses", () => {
    const cache = new TtlCache();
    cache.set("k", "v", 1000);
    vi.advanceTimersByTime(999);
    expect(cache.get("k")).toBe("v");
    vi.advanceTimersByTime(2);
    expect(cache.get("k")).toBeUndefined();
  });

  it("never caches when ttlMs is 0 (no-cache tier)", () => {
    const cache = new TtlCache();
    cache.set("k", "v", 0);
    expect(cache.get("k")).toBeUndefined();
  });

  it("tracks hit/miss/set stats", () => {
    const cache = new TtlCache();
    cache.get("miss");
    cache.set("k", "v", 1000);
    cache.get("k");
    cache.get("k");
    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(2);
    expect(stats.sets).toBe(1);
    expect(stats.size).toBe(1);
  });

  it("reports entry age via ageMs", () => {
    const cache = new TtlCache();
    cache.set("k", "v", 5000);
    vi.advanceTimersByTime(1200);
    expect(cache.ageMs("k")).toBe(1200);
  });

  it("deletes and clears entries", () => {
    const cache = new TtlCache();
    cache.set("a", 1, 1000);
    cache.set("b", 2, 1000);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    cache.clear();
    expect(cache.get("b")).toBeUndefined();
  });

  it("de-duplicates concurrent in-flight requests for the same key", async () => {
    const cache = new TtlCache();
    let callCount = 0;
    const slow = () =>
      new Promise<number>((resolve) => {
        callCount++;
        setTimeout(() => resolve(42), 100);
      });

    const p1 = cache.dedupe("k", slow);
    const p2 = cache.dedupe("k", slow);
    await vi.advanceTimersByTimeAsync(100);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(42);
    expect(r2).toBe(42);
    expect(callCount).toBe(1);
  });

  it("allows a fresh dedupe call once the previous one settled", async () => {
    const cache = new TtlCache();
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return callCount;
    };
    const first = await cache.dedupe("k", fn);
    const second = await cache.dedupe("k", fn);
    expect(first).toBe(1);
    expect(second).toBe(2);
  });
});

describe("cacheKey", () => {
  it("returns the bare procedure name when there is no input", () => {
    expect(cacheKey("itemTrading.getPrices")).toBe("itemTrading.getPrices");
    expect(cacheKey("itemTrading.getPrices", undefined)).toBe("itemTrading.getPrices");
  });

  it("produces the same key regardless of input key order", () => {
    const a = cacheKey("tradingOrder.getTopOrders", { itemCode: "grain", limit: 5 });
    const b = cacheKey("tradingOrder.getTopOrders", { limit: 5, itemCode: "grain" });
    expect(a).toBe(b);
  });

  it("produces different keys for different inputs", () => {
    const a = cacheKey("tradingOrder.getTopOrders", { itemCode: "grain" });
    const b = cacheKey("tradingOrder.getTopOrders", { itemCode: "iron" });
    expect(a).not.toBe(b);
  });
});
