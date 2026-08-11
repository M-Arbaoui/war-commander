import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { wareraGet, unwrapTrpcResponse, WareraApiError, WareraTimeoutError, WARERA_BASE_URL } from "../client";

function jsonResponse(body: unknown, init?: { status?: number }) {
  return {
    ok: (init?.status ?? 200) < 400,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

describe("unwrapTrpcResponse", () => {
  it("unwraps a standard tRPC success envelope", () => {
    const body = { result: { data: { hello: "world" } } };
    expect(unwrapTrpcResponse(body, "test.proc")).toEqual({ hello: "world" });
  });

  it("passes through a bare payload (community-docs style)", () => {
    // This is exactly the shape majimawrks/warera-api-docs captures show for
    // itemTrading.getPrices — no tRPC envelope at all.
    const body = { grain: 0.077, iron: 0.081 };
    expect(unwrapTrpcResponse(body, "itemTrading.getPrices")).toEqual(body);
  });

  it("throws WareraApiError on a tRPC error envelope", () => {
    const body = { error: { message: "Company not found", code: "NOT_FOUND" } };
    expect(() => unwrapTrpcResponse(body, "company.getById")).toThrow(WareraApiError);
    expect(() => unwrapTrpcResponse(body, "company.getById")).toThrow(/Company not found/);
  });
});

describe("wareraGet", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("builds the correct URL and returns the unwrapped payload", async () => {
    // Real captured shape from majimawrks/warera-api-docs for itemTrading.getPrices.
    const realPricesPayload = {
      cookedFish: 7.077837852593168,
      heavyAmmo: 2.3640983661782067,
      steel: 1.6126313592816222,
      grain: 0.07714463991680388,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(realPricesPayload));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await wareraGet("itemTrading.getPrices", undefined, { retries: 0 });

    expect(result).toEqual(realPricesPayload);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe(`${WARERA_BASE_URL}/itemTrading.getPrices`);
  });

  it("encodes input params into the ?input= query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ buyOrders: [], sellOrders: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await wareraGet("tradingOrder.getTopOrders", { itemCode: "grain" }, { retries: 0 });

    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(calledUrl.pathname).toBe("/trpc/tradingOrder.getTopOrders");
    expect(JSON.parse(calledUrl.searchParams.get("input")!)).toEqual({ itemCode: "grain" });
  });

  it("throws WareraApiError on non-2xx responses without retrying 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { status: 400 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(wareraGet("company.getById", { companyId: "bad" }, { retries: 3 })).rejects.toThrow(
      WareraApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1); // 4xx is not retried
  });

  it("retries on 500 and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = wareraGet("region.getRegionsObject", undefined, { retries: 2, retryDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries on repeated 500s", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { status: 502 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = wareraGet("battle.getLiveBattleData", { battleId: "x" }, { retries: 2, retryDelayMs: 10 });
    const expectation = expect(promise).rejects.toThrow(WareraApiError);
    await vi.runAllTimersAsync();
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("wraps an aborted (timeout) request in WareraTimeoutError", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = wareraGet("mu.getById", { muId: "x" }, { timeoutMs: 50, retries: 0 });
    const expectation = expect(promise).rejects.toThrow(WareraTimeoutError);
    await vi.advanceTimersByTimeAsync(51);
    await expectation;
  });

  it("propagates a tRPC error envelope as WareraApiError without retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "Battle not found" } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      wareraGet("battle.getLiveBattleData", { battleId: "missing" }, { retries: 2 }),
    ).rejects.toThrow(/Battle not found/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("extracts the message from a nested error.json.message envelope (confirmed shape from majimawrks/warera-fetch)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { json: { message: "Region not found" } } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(wareraGet("region.getById", { regionId: "missing" }, { retries: 0 })).rejects.toThrow(
      /Region not found/,
    );
  });

  it("retries on HTTP 429 with exponential backoff and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = wareraGet("itemTrading.getPrices", undefined, { retries: 2 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
