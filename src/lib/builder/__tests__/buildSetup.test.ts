import { describe, expect, it } from "vitest";
import { computeBuilderResult, type BuilderReferenceData } from "../buildSetup";
import type { Item, Region, UpgradeDefinition } from "@/lib/warera/models";

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

function region(overrides: Partial<Region> & { id: string }): Region {
  return {
    code: overrides.id,
    name: overrides.id,
    mainCity: "City",
    countryId: "country1",
    countryCode: "XX",
    biome: "plains",
    climate: "temperate",
    isCapital: false,
    isLinkedToCapital: true,
    development: 10,
    resistance: 100,
    resistanceMax: 100,
    upgradeLevels: {},
    resourceBonus: null,
    strategicResource: null,
    ...overrides,
  };
}

const ref: BuilderReferenceData = {
  items: {
    iron: item({ code: "iron", category: "raw", isDeposit: true }),
    steel: item({ code: "steel", productionPoints: 5, recipe: { inputs: { iron: 10 } } }),
  },
  upgradesConfig: {
    automatedEngine: {
      upgradeType: "automatedEngine",
      canDowngrade: false,
      levels: [
        { level: 0, steelCost: 0, constructionPointsCost: null, maintenanceCost: null, stats: {} },
        { level: 1, steelCost: 100, constructionPointsCost: null, maintenanceCost: null, stats: { productionBonusPercent: 15 } },
      ],
    },
  },
  prices: { iron: 0.05, steel: 2 },
  regions: {
    region1: region({ id: "region1", resourceBonus: { resourceCode: "steel", bonusPercent: 25, startsAt: "x", endsAt: "y" } }),
  },
};

describe("computeBuilderResult", () => {
  it("computes a full result for a valid setup", () => {
    const result = computeBuilderResult(
      {
        itemCode: "steel",
        workerCount: 3,
        workerSkillBonusPercent: 0,
        wagePerHour: 5,
        hours: 8,
        regionId: "region1",
        selectedUpgrades: {},
      },
      ref,
    );

    expect(result.productionRate.status).toBe("ok");
    expect(result.regionBonusPercent).toBe(25); // steel matches region1's deposit resource
    expect(result.profit).not.toBeNull();
    expect(result.recipeCost.status).toBe("ok");
  });

  it("applies an upgrade's production bonus stat by heuristic name match", () => {
    const result = computeBuilderResult(
      {
        itemCode: "steel",
        workerCount: 1,
        workerSkillBonusPercent: 0,
        wagePerHour: 1,
        hours: 1,
        regionId: null,
        selectedUpgrades: { automatedEngine: 1 },
      },
      ref,
    );
    expect(result.upgradeBonusPercent).toBe(15);
  });

  it("returns 0 region bonus when the selected item doesn't match the region's deposit", () => {
    const result = computeBuilderResult(
      {
        itemCode: "iron",
        workerCount: 1,
        workerSkillBonusPercent: 0,
        wagePerHour: 1,
        hours: 1,
        regionId: "region1", // region1's deposit is "steel", not "iron"
        selectedUpgrades: {},
      },
      ref,
    );
    expect(result.regionBonusPercent).toBe(0);
  });

  it("returns unavailable production rate and null profit for an unknown item, without throwing", () => {
    const result = computeBuilderResult(
      {
        itemCode: "nonexistent",
        workerCount: 1,
        workerSkillBonusPercent: 0,
        wagePerHour: 1,
        hours: 1,
        regionId: null,
        selectedUpgrades: {},
      },
      ref,
    );
    expect(result.productionRate.status).toBe("unavailable");
    expect(result.profit).toBeNull();
  });

  it("always returns a ranked product list, even when the primary selection is invalid", () => {
    const result = computeBuilderResult(
      {
        itemCode: "nonexistent",
        workerCount: 1,
        workerSkillBonusPercent: 0,
        wagePerHour: 1,
        hours: 1,
        regionId: null,
        selectedUpgrades: {},
      },
      ref,
    );
    expect(result.ranked.length).toBeGreaterThan(0);
  });
});
