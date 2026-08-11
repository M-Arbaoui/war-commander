import { describe, expect, it } from "vitest";
import { buildGearCandidates, filterSustainable, rankBoxFlips, currentStatValueForSlot } from "../gearAdvisor";
import { rankOwnCompanies, MODE_CONFIG } from "../modes";
import type { Company, Item, PlayerProfile } from "@/lib/warera/models";

function item(overrides: Partial<Item> & { code: string }): Item {
  return {
    name: overrides.code,
    category: "gear",
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

describe("buildGearCandidates", () => {
  const items: Record<string, Item> = {
    helmet1: item({ code: "helmet1", category: "gear", combatStats: { armor: 10 } }),
    helmet2: item({ code: "helmet2", category: "gear", combatStats: { armor: 25 } }),
    helmet3: item({ code: "helmet3", category: "gear" }),
    rifle1: item({ code: "rifle1", category: "weapon", combatStats: { attack: 50 } }),
  };
  const prices = { helmet1: 100, helmet2: 500, helmet3: 50, rifle1: 300 };

  it("only includes items inferred into the requested slot", () => {
    const candidates = buildGearCandidates({ slot: "helmet", items, prices, currentStatValue: null });
    expect(candidates.map((c) => c.itemCode).sort()).toEqual(["helmet1", "helmet2", "helmet3"]);
  });

  it("ranks verified candidates by coins-per-point ascending (best value first)", () => {
    const candidates = buildGearCandidates({ slot: "helmet", items, prices, currentStatValue: null });
    const verified = candidates.filter((c) => c.confidence === "verified");
    expect(verified[0]?.itemCode).toBe("helmet1");
    expect(verified[0]?.coinsPerPoint).toBeCloseTo(10, 6);
  });

  it("marks items with no flatStats as 'unknown' confidence, never guesses a stat", () => {
    const candidates = buildGearCandidates({ slot: "helmet", items, prices, currentStatValue: null });
    const helmet3 = candidates.find((c) => c.itemCode === "helmet3")!;
    expect(helmet3.confidence).toBe("unknown");
    expect(helmet3.statValue).toBeNull();
    expect(helmet3.coinsPerPoint).toBeNull();
  });

  it("sorts unknown-confidence candidates after all verified ones", () => {
    const candidates = buildGearCandidates({ slot: "helmet", items, prices, currentStatValue: null });
    const lastIndex = candidates.length - 1;
    expect(candidates[lastIndex]?.confidence).toBe("unknown");
  });

  it("computes delta vs the player's current real equipped contribution", () => {
    const candidates = buildGearCandidates({ slot: "helmet", items, prices, currentStatValue: 15 });
    const helmet1 = candidates.find((c) => c.itemCode === "helmet1")!;
    const helmet2 = candidates.find((c) => c.itemCode === "helmet2")!;
    expect(helmet1.deltaVsCurrent).toBe(10 - 15);
    expect(helmet2.deltaVsCurrent).toBe(25 - 15);
  });

  it("respects a maxPrice filter", () => {
    const candidates = buildGearCandidates({ slot: "helmet", items, prices, currentStatValue: null, maxPrice: 200 });
    expect(candidates.map((c) => c.itemCode).sort()).toEqual(["helmet1", "helmet3"]);
  });
});

describe("filterSustainable", () => {
  const candidates = buildGearCandidates({
    slot: "helmet",
    items: {
      helmet10: item({ code: "helmet10", category: "gear", combatStats: { armor: 5 } }),
      helmet11: item({ code: "helmet11", category: "gear", combatStats: { armor: 2 } }),
      helmet12: item({ code: "helmet12", category: "gear", combatStats: { armor: 100 } }),
    },
    prices: { helmet10: 10, helmet11: 5, helmet12: 10000 },
    currentStatValue: 3,
  });

  it("excludes anything over budget", () => {
    const result = filterSustainable(candidates, 50);
    expect(result.map((c) => c.itemCode)).not.toContain("helmet12");
  });

  it("excludes items that would be a downgrade vs current gear", () => {
    const result = filterSustainable(candidates, 10000);
    expect(result.map((c) => c.itemCode)).not.toContain("helmet11");
  });

  it("keeps affordable real upgrades", () => {
    const result = filterSustainable(candidates, 50);
    expect(result.map((c) => c.itemCode)).toContain("helmet10");
  });
});

describe("rankBoxFlips", () => {
  it("ranks tradable box items by sell price descending, using only real prices", () => {
    const items: Record<string, Item> = {
      case1: item({ code: "case1", category: "box" }),
      case2: item({ code: "case2", category: "box" }),
      notabox: item({ code: "notabox", category: "product" }),
    };
    const prices = { case1: 50, case2: 200, notabox: 999 };
    const result = rankBoxFlips(items, prices);
    expect(result.map((r) => r.itemCode)).toEqual(["case2", "case1"]);
  });

  it("excludes boxes with no known market price rather than showing a fabricated 0", () => {
    const items: Record<string, Item> = { case1: item({ code: "case1", category: "box" }) };
    const result = rankBoxFlips(items, {});
    expect(result).toEqual([]);
  });
});

describe("currentStatValueForSlot", () => {
  const profile: PlayerProfile = {
    id: "u1",
    username: "test",
    level: 5,
    countryId: "c1",
    muId: null,
    companyId: null,
    militaryRank: 1,
    equipment: {},
    skills: {
      attack: { total: 57, fromLevel: 10, fromEquipment: 12, fromWeapon: 40 },
      armor: { total: 13, fromLevel: 5, fromEquipment: 8, fromWeapon: null },
      dodge: { total: 5, fromLevel: 5, fromEquipment: null, fromWeapon: null },
      criticalChance: { total: 5, fromLevel: 5, fromEquipment: null, fromWeapon: null },
      criticalDamages: { total: 5, fromLevel: 5, fromEquipment: null, fromWeapon: null },
      precision: { total: 5, fromLevel: 5, fromEquipment: null, fromWeapon: null },
      production: { total: 5, fromLevel: 5, fromEquipment: null, fromWeapon: null },
      companies: { total: 5, fromLevel: 5, fromEquipment: null, fromWeapon: null },
      management: { total: 5, fromLevel: 5, fromEquipment: null, fromWeapon: null },
    },
  };

  it("reads real equipment contribution for weapon slot from attack.fromEquipment", () => {
    expect(currentStatValueForSlot(profile, "weapon")).toBe(12);
  });

  it("reads real equipment contribution for armor slots from armor.fromEquipment", () => {
    expect(currentStatValueForSlot(profile, "chest")).toBe(8);
    expect(currentStatValueForSlot(profile, "helmet")).toBe(8);
  });
});

describe("rankOwnCompanies", () => {
  const items: Record<string, Item> = {
    steel: item({ code: "steel", category: "product", productionPoints: 5, recipe: { inputs: { iron: 2 } } }),
    iron: item({ code: "iron", category: "raw", isDeposit: true }),
  };
  const prices = { steel: 2, iron: 0.1 };

  it("returns an empty list when the player has no companies", () => {
    expect(rankOwnCompanies([], items, prices)).toEqual([]);
  });

  it("ranks the player's actual company products, not the whole catalog", () => {
    const companies: Company[] = [
      {
        id: "c1",
        ownerId: "u1",
        regionId: "r1",
        itemCode: "steel",
        name: "Steel Co",
        workerCount: 2,
        isFull: false,
        concreteInvested: 0,
        estimatedValue: 0,
        currentProduction: 0,
        upgrades: { automatedEngine: 0, breakRoom: 0, storage: 0 },
      },
    ];
    const ranked = rankOwnCompanies(companies, items, prices);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.itemCode).toBe("steel");
  });
});

describe("MODE_CONFIG", () => {
  it("economic mode shows company advice, not gear advice", () => {
    expect(MODE_CONFIG.economic.showCompanyAdvice).toBe(true);
    expect(MODE_CONFIG.economic.showGearAdvice).toBe(false);
  });

  it("war mode shows gear advice, not company advice", () => {
    expect(MODE_CONFIG.war.showCompanyAdvice).toBe(false);
    expect(MODE_CONFIG.war.showGearAdvice).toBe(true);
  });

  it("eco-war mode shows both", () => {
    expect(MODE_CONFIG["eco-war"].showCompanyAdvice).toBe(true);
    expect(MODE_CONFIG["eco-war"].showGearAdvice).toBe(true);
  });
});
