import { describe, expect, it } from "vitest";
import {
  matchesCategory,
  sortRows,
  formatMoney,
  formatPercent,
  marginColorClass,
  type SortKey,
} from "../marketView";
import type { MarketRow } from "@/server/market-fns";
import { ok, unavailable } from "@/lib/warera/models";

function row(overrides: Partial<MarketRow> & { itemCode: string }): MarketRow {
  return {
    category: "product",
    rarity: "common",
    iconUrl: null,
    average: 1,
    bestBuy: null,
    bestSell: null,
    spread: null,
    craftCost: ok(1),
    craftMargin: ok(0),
    profitPerProductionPoint: ok(0),
    verdict: "NEUTRAL",
    ...overrides,
  };
}

describe("matchesCategory", () => {
  const weapon = row({ itemCode: "rifle3", category: "weapon" });

  it("matches everything for 'all'", () => {
    expect(matchesCategory(weapon, "all")).toBe(true);
  });

  it("matches only the exact category otherwise", () => {
    expect(matchesCategory(weapon, "weapon")).toBe(true);
    expect(matchesCategory(weapon, "gear")).toBe(false);
  });
});

describe("sortRows", () => {
  const rows: MarketRow[] = [
    row({ itemCode: "a", craftMargin: ok(0.2), profitPerProductionPoint: ok(2), craftCost: ok(5), spread: 0.1, verdict: "CRAFT" }),
    row({ itemCode: "b", craftMargin: ok(-0.1), profitPerProductionPoint: ok(-1), craftCost: ok(2), spread: 0.5, verdict: "BUY" }),
    row({ itemCode: "c", craftMargin: ok(0.5), profitPerProductionPoint: ok(4), craftCost: ok(8), spread: 0.05, verdict: "CRAFT" }),
    row({ itemCode: "d", craftMargin: unavailable("no price"), profitPerProductionPoint: unavailable("no price"), craftCost: unavailable("no price"), spread: null, verdict: "UNKNOWN" }),
  ];

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortRows(rows, "margin");
    expect(rows).toEqual(original);
  });

  it("sorts by margin descending, with unavailable rows sinking to the bottom", () => {
    const sorted = sortRows(rows, "margin");
    expect(sorted.map((r) => r.itemCode)).toEqual(["c", "a", "b", "d"]);
  });

  it("sorts by profit per unit descending", () => {
    const sorted = sortRows(rows, "profit");
    expect(sorted.map((r) => r.itemCode)).toEqual(["c", "a", "b", "d"]);
  });

  it("sorts by cost ascending, with unavailable rows sinking to the bottom", () => {
    const sorted = sortRows(rows, "cost");
    expect(sorted.map((r) => r.itemCode)).toEqual(["b", "a", "c", "d"]);
  });

  it("sorts by spread descending, with null spread sinking to the bottom", () => {
    const sorted = sortRows(rows, "spread");
    expect(sorted.map((r) => r.itemCode)).toEqual(["b", "a", "c", "d"]);
  });

  it("sorts craft-opportunity: CRAFT rows first (by margin size), then BUY, then unknowns last", () => {
    const sorted = sortRows(rows, "craft-opportunity");
    expect(sorted.map((r) => r.itemCode)).toEqual(["c", "a", "b", "d"]);
  });

  it("every declared SortKey is handled without throwing", () => {
    const keys: SortKey[] = ["craft-opportunity", "margin", "profit", "cost", "spread"];
    for (const key of keys) {
      expect(() => sortRows(rows, key)).not.toThrow();
    }
  });
});

describe("formatMoney", () => {
  it("formats a number to 4 decimal places", () => {
    expect(formatMoney(1.5)).toBe("1.5000");
  });

  it("renders null as an em dash, never 0", () => {
    expect(formatMoney(null)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("formats an ok result as a percentage", () => {
    expect(formatPercent(ok(0.125))).toBe("12.5%");
  });

  it("renders an unavailable result as an em dash, never 0%", () => {
    expect(formatPercent(unavailable("no data"))).toBe("—");
  });
});

describe("marginColorClass", () => {
  it("returns positive/negative/neutral tokens correctly", () => {
    expect(marginColorClass(ok(0.1))).toBe("text-positive");
    expect(marginColorClass(ok(-0.1))).toBe("text-negative");
    expect(marginColorClass(ok(0))).toBe("text-neutral");
  });

  it("returns the faint/unknown token for unavailable data, never a false positive/negative", () => {
    expect(marginColorClass(unavailable("no data"))).toBe("text-ink-faint");
  });
});
