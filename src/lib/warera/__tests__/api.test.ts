import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../client", async () => {
  const actual = await vi.importActual<typeof import("../client")>("../client");
  return {
    ...actual,
    wareraGet: vi.fn(),
  };
});

import { wareraGet } from "../client";
import { wareraCache } from "../cache";
import * as warera from "../api";

const mockedGet = wareraGet as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedGet.mockReset();
  wareraCache.clear();
});

describe("getPrices", () => {
  it("returns ok with normalized prices on a valid payload", async () => {
    mockedGet.mockResolvedValueOnce({ grain: 0.077, iron: 0.081 });
    const result = await warera.getPrices();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.grain?.average).toBe(0.077);
    }
  });

  it("returns unavailable (not a thrown error) when the payload fails schema validation", async () => {
    mockedGet.mockResolvedValueOnce({ grain: "not-a-number" });
    const result = await warera.getPrices();
    expect(result.status).toBe("unavailable");
  });

  it("returns error when the transport throws", async () => {
    mockedGet.mockRejectedValueOnce(new Error("network down"));
    const result = await warera.getPrices();
    expect(result.status).toBe("error");
  });

  it("caches a successful response and does not re-fetch on the next call", async () => {
    mockedGet.mockResolvedValueOnce({ grain: 0.077 });
    await warera.getPrices();
    await warera.getPrices();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("bypasses the cache when forceRefresh is set", async () => {
    mockedGet.mockResolvedValue({ grain: 0.077 });
    await warera.getPrices();
    await warera.getPrices({ forceRefresh: true });
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});

describe("getMarketPriceDetail", () => {
  it("combines price + order book into bestBuy/bestSell/spread", async () => {
    mockedGet.mockImplementation(async (procedure: string) => {
      if (procedure === "itemTrading.getPrices") return { grain: 0.08 };
      if (procedure === "tradingOrder.getTopOrders") {
        return {
          buyOrders: [
            { _id: "o1", user: "u1", itemCode: "grain", quantity: 10, price: 0.075, offerAt: "x", type: "buy" },
          ],
          sellOrders: [
            { _id: "o2", user: "u2", itemCode: "grain", quantity: 10, price: 0.09, offerAt: "x", type: "sell" },
          ],
        };
      }
      throw new Error(`unexpected procedure ${procedure}`);
    });

    const result = await warera.getMarketPriceDetail("grain");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.bestBuy).toBe(0.075);
      expect(result.data.bestSell).toBe(0.09);
    }
  });

  it("returns unavailable when the item has no price entry at all", async () => {
    mockedGet.mockImplementation(async (procedure: string) => {
      if (procedure === "itemTrading.getPrices") return { grain: 0.08 };
      if (procedure === "tradingOrder.getTopOrders") return { buyOrders: [], sellOrders: [] };
      throw new Error("unexpected");
    });
    const result = await warera.getMarketPriceDetail("nonexistentItem");
    expect(result.status).toBe("unavailable");
  });

  it("degrades to average-only (not a full failure) if the order book call errors", async () => {
    mockedGet.mockImplementation(async (procedure: string) => {
      if (procedure === "itemTrading.getPrices") return { grain: 0.08 };
      if (procedure === "tradingOrder.getTopOrders") throw new Error("boom");
      throw new Error("unexpected");
    });
    const result = await warera.getMarketPriceDetail("grain");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.average).toBe(0.08);
      expect(result.data.bestBuy).toBeNull();
      expect(result.data.bestSell).toBeNull();
    }
  });
});

describe("getCompanyById", () => {
  const validCompany = {
    _id: "comp1",
    __v: 0,
    user: "u1",
    region: "r1",
    itemCode: "steel",
    name: "Steel Works",
    production: 10,
    workerCount: 2,
    workers: [],
    isFull: false,
    concreteInvested: 100,
    estimatedValue: 200,
    movedUpAt: "x",
    createdAt: "x",
    updatedAt: "x",
    activeUpgradeLevels: {},
    dates: { lastHiresAt: [] },
  };

  it("returns a normalized Company on success", async () => {
    mockedGet.mockResolvedValueOnce(validCompany);
    const result = await warera.getCompanyById("comp1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.name).toBe("Steel Works");
      expect(result.data.upgrades).toEqual({ automatedEngine: 0, breakRoom: 0, storage: 0 });
    }
  });
});

describe("getUpgradeInstance", () => {
  it("returns unavailable if the instance has no recognizable owner entity", async () => {
    mockedGet.mockResolvedValueOnce({
      _id: "up1",
      upgradeType: "base",
      level: 1,
      status: "active",
      investedSteel: 100,
      investedConcrete: 0,
      investedMoney: 0,
      dependantUsersCount: 0,
      createdAt: "x",
      updatedAt: "x",
    });
    const result = await warera.getUpgradeInstance({ upgradeType: "base", entityId: "x", entityKind: "company" });
    expect(result.status).toBe("unavailable");
  });

  it("returns ok with the correct owner entity when present", async () => {
    mockedGet.mockResolvedValueOnce({
      _id: "up1",
      upgradeType: "base",
      level: 1,
      status: "active",
      investedSteel: 100,
      investedConcrete: 0,
      investedMoney: 0,
      dependantUsersCount: 0,
      createdAt: "x",
      updatedAt: "x",
      company: "comp1",
    });
    const result = await warera.getUpgradeInstance({ upgradeType: "base", entityId: "comp1", entityKind: "company" });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data?.ownerEntity).toEqual({ kind: "company", id: "comp1" });
    }
  });
});

describe("getCurrentEquipment", () => {
  it("returns unavailable immediately when no session token is provided, without calling the transport", async () => {
    const result = await warera.getCurrentEquipment("");
    expect(result.status).toBe("unavailable");
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("normalizes equipped slots into a flat Gear list when a token is provided", async () => {
    mockedGet.mockResolvedValueOnce({
      ammo: "heavyAmmo",
      weapon: {
        _id: "w1",
        code: "rifle3",
        state: 90,
        maxState: 100,
        quantity: 1,
        lastAcquisitionAt: "x",
        skills: { attack: 40 },
      },
      helmet: {
        _id: "h1",
        code: "helmet2",
        state: 10,
        maxState: 100,
        quantity: 1,
        lastAcquisitionAt: "x",
        skills: { armor: 5 },
      },
    });
    const result = await warera.getCurrentEquipment("fake-token");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.ammoCode).toBe("heavyAmmo");
      expect(result.data.gear).toHaveLength(2);
      const helmet = result.data.gear.find((g) => g.slot === "helmet");
      expect(helmet?.condition).toBe("DAMAGED");
    }
  });
});
