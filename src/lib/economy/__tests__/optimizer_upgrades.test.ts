import { describe, expect, it } from "vitest";
import { rankProductsForSetup } from "../optimizer";
import { evaluateUpgradeLevels } from "../upgrades";
import type { Item, UpgradeDefinition } from "../../warera/models";

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

describe("rankProductsForSetup", () => {
  const items: Record<string, Item> = {
    iron: item({ code: "iron", category: "raw", isDeposit: true }),
    steel: item({ code: "steel", productionPoints: 5, recipe: { inputs: { iron: 10 } } }),
    grain: item({ code: "grain", productionPoints: 20, recipe: { inputs: {} } }),
    unpriceable: item({ code: "unpriceable", productionPoints: 3, recipe: { inputs: { ghostMaterial: 1 } } }),
  };
  const prices: Record<string, number> = { iron: 0.05, steel: 999 /* deliberately high to test cost uses recipe, not this */, grain: 0.1 };

  it("ranks producible items by profit per worker, highest first", () => {
    const ranked = rankProductsForSetup({
      items,
      prices,
      workerCount: 2,
      wagePerHour: 5,
      hours: 8,
    });

    const steelEntry = ranked.find((r) => r.itemCode === "steel");
    const grainEntry = ranked.find((r) => r.itemCode === "grain");
    expect(steelEntry?.status).toBe("ranked");
    expect(grainEntry?.status).toBe("ranked");

    const rankedOnly = ranked.filter((r) => r.status === "ranked");
    const profits = rankedOnly.map((r) =>
      r.profit?.profitPerWorker.status === "ok" ? r.profit.profitPerWorker.data : -Infinity,
    );
    for (let i = 1; i < profits.length; i++) {
      expect(profits[i - 1]!).toBeGreaterThanOrEqual(profits[i]!);
    }
  });

  it("skips (with an honest reason) items with no market price", () => {
    const itemsNoPriceForOutput = { ...items, grain: item({ code: "grain", productionPoints: 20, recipe: { inputs: {} } }) };
    const noPriceForGrain = { iron: 0.05, steel: 1 };
    const ranked = rankProductsForSetup({
      items: itemsNoPriceForOutput,
      prices: noPriceForGrain,
      workerCount: 1,
      wagePerHour: 1,
      hours: 1,
      candidateItemCodes: ["grain"],
    });
    expect(ranked[0]?.status).toBe("skipped");
    expect(ranked[0]?.skipReason).toMatch(/market price/i);
  });

  it("skips items whose recipe cost can't be resolved", () => {
    const ranked = rankProductsForSetup({
      items,
      prices: { ...prices, unpriceable: 2 },
      workerCount: 1,
      wagePerHour: 1,
      hours: 1,
      candidateItemCodes: ["unpriceable"],
    });
    expect(ranked[0]?.status).toBe("skipped");
  });
});

describe("evaluateUpgradeLevels", () => {
  const steel = item({ code: "steel", productionPoints: 5, recipe: { inputs: { iron: 10 } } });
  const upgrade: UpgradeDefinition = {
    upgradeType: "automatedEngine",
    canDowngrade: false,
    levels: [
      { level: 0, steelCost: 0, constructionPointsCost: null, maintenanceCost: null, stats: { productionBonusPercent: 0 } },
      { level: 1, steelCost: 100, constructionPointsCost: null, maintenanceCost: 10, stats: { productionBonusPercent: 10 } },
      { level: 2, steelCost: 300, constructionPointsCost: null, maintenanceCost: 25, stats: { productionBonusPercent: 25 } },
      { level: 3, steelCost: 900, constructionPointsCost: null, maintenanceCost: 60, stats: {} }, // missing the stat on purpose
    ],
  };

  it("evaluates only levels above the current one", () => {
    const evaluations = evaluateUpgradeLevels({
      upgrade,
      currentLevel: 0,
      item: steel,
      sellPricePerUnit: 2,
      steelMarketPrice: 1,
      workerCount: 5,
      productionBonusStatName: "productionBonusPercent",
    });
    expect(evaluations.map((e) => e.level).sort()).toEqual([1, 2, 3]);
  });

  it("computes a positive payback for a level with real production upside", () => {
    const evaluations = evaluateUpgradeLevels({
      upgrade,
      currentLevel: 0,
      item: steel,
      sellPricePerUnit: 2,
      steelMarketPrice: 1,
      workerCount: 5,
      productionBonusStatName: "productionBonusPercent",
    });
    const level1 = evaluations.find((e) => e.level === 1)!;
    expect(level1.additionalUnitsPerHour).toBeGreaterThan(0);
    expect(level1.paybackHours.status).toBe("ok");
  });

  it("returns unavailable payback (not a fabricated number) for a level missing the expected stat", () => {
    const evaluations = evaluateUpgradeLevels({
      upgrade,
      currentLevel: 0,
      item: steel,
      sellPricePerUnit: 2,
      steelMarketPrice: 1,
      workerCount: 5,
      productionBonusStatName: "productionBonusPercent",
    });
    const level3 = evaluations.find((e) => e.level === 3)!;
    expect(level3.paybackHours.status).toBe("unavailable");
  });

  it("ranks by shortest payback first", () => {
    const evaluations = evaluateUpgradeLevels({
      upgrade,
      currentLevel: 0,
      item: steel,
      sellPricePerUnit: 2,
      steelMarketPrice: 1,
      workerCount: 5,
      productionBonusStatName: "productionBonusPercent",
    });
    const okOnly = evaluations.filter(
      (e): e is typeof e & { paybackHours: { status: "ok"; data: number } } => e.paybackHours.status === "ok",
    );
    for (let i = 1; i < okOnly.length; i++) {
      expect(okOnly[i - 1]!.paybackHours.data).toBeLessThanOrEqual(okOnly[i]!.paybackHours.data);
    }
  });

  it("returns unavailable payback when no steel market price is supplied", () => {
    const evaluations = evaluateUpgradeLevels({
      upgrade,
      currentLevel: 0,
      item: steel,
      sellPricePerUnit: 2,
      workerCount: 5,
      productionBonusStatName: "productionBonusPercent",
    });
    const level1 = evaluations.find((e) => e.level === 1)!;
    expect(level1.paybackHours.status).toBe("unavailable");
    expect(level1.steelCostAtMarketPrice).toBeNull();
  });
});
