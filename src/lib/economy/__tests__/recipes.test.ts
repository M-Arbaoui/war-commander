import { describe, expect, it } from "vitest";
import { resolveRecipeCost, flattenCostBreakdown } from "../recipes";
import type { Item } from "../../warera/models";

function item(overrides: Partial<Item> & { code: string }): Item {
  return {
    name: overrides.code,
    category: "product",
    rarity: null,
    isTradable: true,
    isConsumable: false,
    isDeposit: false,
    iconUrl: null,
    combatStats: null,
    productionPoints: null,
    recipe: null,
    ...overrides,
  };
}

// Iron -> Steel -> Rifle chain, matching the brief's nested-recipe example.
const items: Record<string, Item> = {
  iron: item({ code: "iron", category: "raw", isDeposit: true }),
  wood: item({ code: "wood", category: "raw", isDeposit: true }),
  steel: item({ code: "steel", productionPoints: 5, recipe: { inputs: { iron: 10 } } }),
  rifle: item({ code: "rifle", category: "weapon", productionPoints: 1, recipe: { inputs: { steel: 3, wood: 1 } } }),
};

const prices: Record<string, number> = { iron: 0.08, wood: 0.05 };

describe("resolveRecipeCost", () => {
  it("prices a raw material directly from the market", () => {
    const result = resolveRecipeCost("iron", items, prices);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.root.unitCost).toBe(0.08);
      expect(result.data.root.pricedFromMarket).toBe(true);
    }
  });

  it("resolves a single-level recipe: steel cost = (10 iron * 0.08) / 5 production points", () => {
    const result = resolveRecipeCost("steel", items, prices);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.root.unitCost).toBeCloseTo((10 * 0.08) / 5, 6);
      expect(result.data.rawMaterialsPerUnit.iron).toBeCloseTo(10 / 5, 6);
    }
  });

  it("recurses through a multi-level chain (iron -> steel -> rifle)", () => {
    const result = resolveRecipeCost("rifle", items, prices);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const steelCost = (10 * 0.08) / 5;
      const expectedRifleCost = (3 * steelCost + 1 * 0.05) / 1;
      expect(result.data.root.unitCost).toBeCloseTo(expectedRifleCost, 6);
      // Raw materials should be flattened all the way down, not just direct inputs.
      expect(result.data.rawMaterialsPerUnit.iron).toBeCloseTo(3 * (10 / 5), 6);
      expect(result.data.rawMaterialsPerUnit.wood).toBeCloseTo(1, 6);
    }
  });

  it("returns unavailable when an input has no price and no recipe", () => {
    const brokenItems = { ...items, steel: item({ code: "steel", productionPoints: 5, recipe: { inputs: { unobtainium: 1 } } }) };
    const result = resolveRecipeCost("steel", brokenItems, prices);
    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable when the item itself isn't in the catalog", () => {
    const result = resolveRecipeCost("nonexistent", items, prices);
    expect(result.status).toBe("unavailable");
  });

  it("detects and refuses to infinite-loop on a recipe cycle", () => {
    const cyclic: Record<string, Item> = {
      a: item({ code: "a", productionPoints: 1, recipe: { inputs: { b: 1 } } }),
      b: item({ code: "b", productionPoints: 1, recipe: { inputs: { a: 1 } } }),
    };
    const result = resolveRecipeCost("a", cyclic, {});
    expect(result.status).toBe("error");
  });

  it("respects buyInstead to price an intermediate item from the market directly", () => {
    const result = resolveRecipeCost("rifle", items, { ...prices, steel: 5 }, { buyInstead: new Set(["steel"]) });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const expectedRifleCost = (3 * 5 + 1 * 0.05) / 1;
      expect(result.data.root.unitCost).toBeCloseTo(expectedRifleCost, 6);
      // Steel is now a "raw material" leaf for this resolution, not decomposed into iron.
      expect(result.data.rawMaterialsPerUnit.steel).toBe(3);
      expect(result.data.rawMaterialsPerUnit.iron).toBeUndefined();
    }
  });
});

describe("flattenCostBreakdown", () => {
  it("attributes cost contribution to raw materials, not intermediates", () => {
    const result = resolveRecipeCost("rifle", items, prices);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const breakdown = flattenCostBreakdown(result.data.root);
      const codes = breakdown.map((b) => b.itemCode);
      expect(codes).toContain("iron");
      expect(codes).toContain("wood");
      expect(codes).not.toContain("steel"); // steel is an intermediate, its cost is folded into iron+wood.
      const total = breakdown.reduce((sum, b) => sum + b.contribution, 0);
      expect(total).toBeCloseTo(result.data.root.unitCost, 6);
    }
  });
});
