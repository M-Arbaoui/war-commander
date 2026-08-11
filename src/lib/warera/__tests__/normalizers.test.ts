import { describe, expect, it } from "vitest";
import * as normalize from "../normalizers";
import type {
  RawCompany,
  RawCountry,
  RawGameConfigItems,
  RawLastHits,
  RawLiveBattleData,
  RawMu,
  RawRegion,
  RawRoundEquipment,
  RawTopOrders,
  RawUpgradesConfig,
  RawWorkOffer,
  RawWorkersResponse,
} from "../types";

// ---------------------------------------------------------------------------
// Fixtures below are shaped from real captured payloads (see procedures.ts
// sourcing notes) — trimmed to the fields relevant to each test, not invented.
// ---------------------------------------------------------------------------

describe("normalizeGameConfigItems", () => {
  const raw: RawGameConfigItems = {
    iron: {
      code: "iron",
      type: "rawMaterial",
      rarity: "common",
      isTradable: true,
      isDeposit: true,
      productionPoints: 10,
      // No productionNeeds — iron is a raw deposit resource, not crafted.
    },
    steel: {
      code: "steel",
      type: "product",
      rarity: "common",
      isTradable: true,
      productionPoints: 5,
      productionNeeds: { iron: 2 },
    },
    rifle: {
      code: "rifle",
      type: "rifle",
      rarity: "rare",
      isTradable: true,
      productionPoints: 1,
      productionNeeds: { steel: 3, wood: 1 },
    },
    case1: {
      code: "case1",
      type: "case",
      rarity: "common",
      isTradable: true,
    },
  };

  const items = normalize.normalizeGameConfigItems(raw);

  it("marks a raw deposit resource with no recipe as category 'raw' and recipe null", () => {
    expect(items.iron?.category).toBe("raw");
    expect(items.iron?.recipe).toBeNull();
    expect(items.iron?.isDeposit).toBe(true);
  });

  it("builds a recipe from productionNeeds for a crafted product", () => {
    expect(items.steel?.category).toBe("product");
    expect(items.steel?.recipe).toEqual({ inputs: { iron: 2 } });
  });

  it("categorizes weapon types correctly and preserves a multi-input recipe", () => {
    expect(items.rifle?.category).toBe("weapon");
    expect(items.rifle?.recipe).toEqual({ inputs: { steel: 3, wood: 1 } });
  });

  it("categorizes case items as 'box'", () => {
    expect(items.case1?.category).toBe("box");
    expect(items.case1?.recipe).toBeNull();
  });

  it("never fabricates a display name — uses the item code", () => {
    expect(items.iron?.name).toBe("iron");
  });
});

describe("normalizeTopOrders + combinePriceWithOrders", () => {
  // Shape based on majimawrks/warera-api-docs captured example for tradingOrder.getTopOrders.
  const raw: RawTopOrders = {
    buyOrders: [
      { _id: "o1", user: "u1", itemCode: "grain", quantity: 100, price: 0.07, offerAt: "2026-01-01T00:00:00Z", type: "buy", __v: 0 },
      { _id: "o2", user: "u2", itemCode: "grain", quantity: 50, price: 0.075, offerAt: "2026-01-01T00:00:00Z", type: "buy", __v: 0 },
    ],
    sellOrders: [
      { _id: "o3", user: "u3", itemCode: "grain", quantity: 30, price: 0.09, offerAt: "2026-01-01T00:00:00Z", type: "sell", __v: 0 },
    ],
  };

  it("normalizes buy/sell orders with correct sides", () => {
    const book = normalize.normalizeTopOrders("grain", raw);
    expect(book.buyOrders).toHaveLength(2);
    expect(book.sellOrders).toHaveLength(1);
    expect(book.buyOrders[0]?.side).toBe("buy");
    expect(book.sellOrders[0]?.side).toBe("sell");
  });

  it("computes bestBuy as the highest buy price and bestSell as the lowest sell price", () => {
    const book = normalize.normalizeTopOrders("grain", raw);
    const combined = normalize.combinePriceWithOrders("grain", 0.077, book);
    expect(combined.bestBuy).toBe(0.075);
    expect(combined.bestSell).toBe(0.09);
    expect(combined.spread).toBeCloseTo(0.015, 5);
  });

  it("returns null bestBuy/bestSell/spread for an empty side, never 0", () => {
    const emptyBook = normalize.normalizeTopOrders("obscureItem", { buyOrders: [], sellOrders: [] });
    const combined = normalize.combinePriceWithOrders("obscureItem", 1, emptyBook);
    expect(combined.bestBuy).toBeNull();
    expect(combined.bestSell).toBeNull();
    expect(combined.spread).toBeNull();
  });
});

describe("normalizeCompany", () => {
  // Shape based on WarEraProjects/TRPC CompanyGetByIdResponse type.
  const raw: RawCompany = {
    _id: "comp1",
    __v: 0,
    user: "user1",
    region: "region1",
    itemCode: "steel",
    name: "Steel Works",
    production: 42,
    workerCount: 3,
    workers: [],
    isFull: false,
    concreteInvested: 1000,
    estimatedValue: 5000,
    movedUpAt: "2026-01-01T00:00:00Z",
    createdAt: "2025-12-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    activeUpgradeLevels: { automatedEngine: 2, storage: 1 },
    dates: { lastHiresAt: [] },
  };

  it("maps fields 1:1 and defaults missing upgrade levels to 0, not undefined", () => {
    const company = normalize.normalizeCompany(raw);
    expect(company.id).toBe("comp1");
    expect(company.itemCode).toBe("steel");
    expect(company.upgrades).toEqual({ automatedEngine: 2, breakRoom: 0, storage: 1 });
    expect(company.currentProduction).toBe(42);
  });
});

describe("normalizeWorkers", () => {
  const raw: RawWorkersResponse = {
    type: "byCompany",
    workersPerCompany: [
      { company: { _id: "c1", itemCode: "steel", name: "Steel Works" }, workers: [{}, {}, {}] },
      { company: { _id: "c2", itemCode: "grain", name: "Farm Co" }, workers: [] },
    ],
  };

  it("derives workerCount from the workers array length per company", () => {
    const workers = normalize.normalizeWorkers(raw);
    expect(workers).toEqual([
      { companyId: "c1", companyItemCode: "steel", companyName: "Steel Works", workerCount: 3 },
      { companyId: "c2", companyItemCode: "grain", companyName: "Farm Co", workerCount: 0 },
    ]);
  });
});

describe("normalizeWorkOffer", () => {
  const raw: RawWorkOffer = {
    _id: "wo1",
    __v: 0,
    company: "c1",
    region: "r1",
    user: "u1",
    wage: 15.5,
    quantity: 5,
    initialQuantity: 10,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("normalizes optional fields to null rather than undefined", () => {
    const offer = normalize.normalizeWorkOffer(raw);
    expect(offer.minEnergy).toBeNull();
    expect(offer.minProduction).toBeNull();
    expect(offer.citizenshipRequired).toBeNull();
    expect(offer.wage).toBe(15.5);
  });
});

describe("normalizeRegion", () => {
  // Shape based on majimawrks/warera-api-docs captured region.getById example.
  const raw: RawRegion = {
    _id: "region1",
    __v: 0,
    code: "US-CA",
    name: "California",
    mainCity: "Los Angeles",
    country: "country1",
    initialCountry: "country1",
    countryCode: "US",
    biome: "temperate",
    climate: "mediterranean",
    position: [34.0, -118.2],
    neighbors: ["region2"],
    isCapital: false,
    isLinkedToCapital: true,
    development: 55,
    baseDevelopment: 40,
    resistance: 80,
    resistanceMax: 100,
    upgradesV2: { upgrades: {}, activeConstructionCount: 0 },
    deposit: { type: "oil", bonusPercent: 25, startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-02-01T00:00:00Z" },
    stats: { investedMoney: 0 },
    dates: {},
  };

  it("maps a present deposit into resourceBonus", () => {
    const region = normalize.normalizeRegion(raw);
    expect(region.resourceBonus).toEqual({
      resourceCode: "oil",
      bonusPercent: 25,
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: "2026-02-01T00:00:00Z",
    });
  });

  it("returns resourceBonus null when the region has no deposit, not a fabricated 0%", () => {
    const noDeposit = normalize.normalizeRegion({ ...raw, deposit: undefined });
    expect(noDeposit.resourceBonus).toBeNull();
  });
});

describe("normalizeCountry", () => {
  const raw: RawCountry = {
    _id: "country1",
    __v: 0,
    name: "Freedonia",
    code: "FR2",
    money: 100000,
    scheme: "democracy",
    mapAccent: "#ff0000",
    orgs: ["org1"],
    allies: ["country2"],
    warsWith: ["country3"],
    development: 70,
    updatedAt: "2026-01-01T00:00:00Z",
    taxes: { income: 0.1, market: 0.05, selfWork: 0.02 },
    unrest: { bar: 0, barMax: 100, lastContributionAt: "2026-01-01T00:00:00Z" },
    rankings: { damage: { value: 500000, rank: 3, tier: "gold" } },
  };

  it("maps allies/wars and rankings", () => {
    const country = normalize.normalizeCountry(raw);
    expect(country.allyIds).toEqual(["country2"]);
    expect(country.warIds).toEqual(["country3"]);
    expect(country.rankings.damage).toEqual({ value: 500000, rank: 3, tier: "gold" });
  });
});

describe("normalizeUpgradesConfig", () => {
  const raw: RawUpgradesConfig = {
    base: {
      canDowngrade: false,
      levels: {
        "1": { level: 1, steelCost: 100, stats: { productionBonusPercent: 10 } },
        "2": { level: 2, steelCost: 250, stats: { productionBonusPercent: 20 } },
      },
    },
  };

  it("sorts levels ascending and preserves stats", () => {
    const config = normalize.normalizeUpgradesConfig(raw);
    expect(config.base?.levels.map((l) => l.level)).toEqual([1, 2]);
    expect(config.base?.levels[1]?.stats).toEqual({ productionBonusPercent: 20 });
  });

  it("uses null for missing cost fields instead of 0", () => {
    const config = normalize.normalizeUpgradesConfig(raw);
    expect(config.base?.levels[0]?.constructionPointsCost).toBeNull();
    expect(config.base?.levels[0]?.maintenanceCost).toBeNull();
  });
});

describe("conditionFromState / gear normalizers", () => {
  it("buckets condition from state/maxState ratio", () => {
    expect(normalize.conditionFromState(100, 100)).toBe("GOOD");
    expect(normalize.conditionFromState(50, 100)).toBe("LOW");
    expect(normalize.conditionFromState(10, 100)).toBe("DAMAGED");
    expect(normalize.conditionFromState(0, 100)).toBe("BROKEN");
    expect(normalize.conditionFromState(null, null)).toBe("UNKNOWN");
  });

  it("normalizes RoundEquipment into Gear with condition + bonuses", () => {
    const raw: RawRoundEquipment = {
      _id: "eq1",
      code: "helmet3",
      type: "helmet",
      state: 20,
      maxState: 100,
      quantity: 1,
      lastAcquisitionAt: "2026-01-01T00:00:00Z",
      skills: { armor: 12 },
    };
    const gear = normalize.normalizeRoundEquipment(raw);
    expect(gear.slot).toBe("helmet");
    expect(gear.condition).toBe("DAMAGED");
    expect(gear.bonuses).toEqual({ armor: 12 });
    expect(gear.rarity).toBeNull(); // Not present on this raw shape — must not be fabricated.
  });
});

describe("normalizeLiveBattle", () => {
  const raw: RawLiveBattleData = {
    battle: { isActive: true, attackerCountryOrders: [], defenderCountryOrders: [], roundIds: ["round1"], roundHistory: [] },
    round: {
      roundId: "round1",
      isActive: true,
      attackerDamages: 15000,
      defenderDamages: 12000,
      attackerPoints: 3,
      defenderPoints: 2,
      actualTickPoints: 1,
      nextTickAt: "2026-01-01T00:05:00Z",
    },
  };

  it("flattens battle+round into a single LiveBattle", () => {
    const battle = normalize.normalizeLiveBattle("battle1", raw);
    expect(battle).toEqual({
      battleId: "battle1",
      isActive: true,
      attackerDamages: 15000,
      defenderDamages: 12000,
      attackerPoints: 3,
      defenderPoints: 2,
      nextTickAt: "2026-01-01T00:05:00Z",
    });
  });
});

describe("normalizeLastHits", () => {
  const raw: RawLastHits = {
    attacker: [
      {
        _id: "h1",
        user: "u1",
        ammo: "heavyAmmo",
        weapon: { _id: "w1", code: "rifle3", state: 80, maxState: 100, quantity: 1, lastAcquisitionAt: "x", skills: { attack: 40, criticalChance: 0.1 } },
        damages: 250,
        isCriticalHit: false,
        missed: false,
        hitAt: "2026-01-01T00:00:00Z",
      },
      {
        _id: "h2",
        user: "u1",
        damages: 0,
        isCriticalHit: false,
        missed: true,
        hitAt: "2026-01-01T00:00:01Z",
      },
    ],
    defender: [],
  };

  it("normalizes hits including misses, without inventing a weapon code for a missed hit", () => {
    const hits = normalize.normalizeLastHits(raw);
    expect(hits.attacker[0]?.weaponCode).toBe("rifle3");
    expect(hits.attacker[1]?.weaponCode).toBeNull();
    expect(hits.attacker[1]?.isMiss).toBe(true);
  });
});

describe("mergePlayerProfile", () => {
  it("merges equipment (from getUserById) with computed skill totals (from getUserLite)", () => {
    const byId = {
      _id: "u1",
      username: "TestPlayer",
      usernameLower: "testplayer",
      country: "country1",
      mu: "mu1",
      company: "comp1",
      militaryRank: 5,
      isActive: true,
      leveling: { level: 10, totalXp: 5000, availableSkillPoints: 2 },
      equipment: { weapon: "rifle3", helmet: "helmet2" },
      rankings: {},
    };
    const lite = {
      username: "TestPlayer",
      country: "country1",
      militaryRank: 5,
      isActive: true,
      leveling: { level: 10, totalXp: 5000, availableSkillPoints: 2 },
      skills: {
        attack: { level: 10, weapon: 40, equipment: 12, ammoPercent: 0, buffsPercent: 0, debuffsPercent: 0, militaryRankPercent: 5, total: 57 },
        armor: { level: 5, equipment: 8, total: 13 },
        dodge: { level: 5, total: 5 },
        criticalChance: { level: 5, total: 5 },
        criticalDamages: { level: 5, total: 5 },
        precision: { level: 5, total: 5 },
        production: { level: 5, currentBarValue: 0, hourlyBarRegen: 0, total: 5 },
        companies: { level: 5, total: 5 },
        management: { level: 5, total: 5 },
        lootChance: { level: 5, total: 5 },
        entrepreneurship: { level: 5, currentBarValue: 0, hourlyBarRegen: 0, total: 5 },
      },
      rankings: {},
    };

    const profile = normalize.mergePlayerProfile(byId as never, lite as never);
    expect(profile.equipment).toEqual({ weapon: "rifle3", helmet: "helmet2" });
    expect(profile.skills.attack).toEqual({ total: 57, fromLevel: 10, fromEquipment: 12, fromWeapon: 40 });
    expect(profile.skills.armor).toEqual({ total: 13, fromLevel: 5, fromEquipment: 8, fromWeapon: null });
    expect(profile.companyId).toBe("comp1");
    expect(profile.muId).toBe("mu1");
  });

  it("defaults missing equipment contribution to null, never 0", () => {
    const byId = {
      _id: "u2",
      username: "NoGear",
      usernameLower: "nogear",
      country: "country1",
      militaryRank: 1,
      isActive: true,
      leveling: { level: 1, totalXp: 0, availableSkillPoints: 0 },
      rankings: {},
    };
    const lite = {
      username: "NoGear",
      country: "country1",
      militaryRank: 1,
      isActive: true,
      leveling: { level: 1, totalXp: 0, availableSkillPoints: 0 },
      skills: {
        attack: { level: 1, weapon: 0, ammoPercent: 0, buffsPercent: 0, debuffsPercent: 0, militaryRankPercent: 0, total: 0 },
        armor: { level: 1, total: 0 },
        dodge: { level: 1, total: 0 },
        criticalChance: { level: 1, total: 0 },
        criticalDamages: { level: 1, total: 0 },
        precision: { level: 1, total: 0 },
        production: { level: 1, currentBarValue: 0, hourlyBarRegen: 0, total: 0 },
        companies: { level: 1, total: 0 },
        management: { level: 1, total: 0 },
        lootChance: { level: 1, total: 0 },
        entrepreneurship: { level: 1, currentBarValue: 0, hourlyBarRegen: 0, total: 0 },
      },
      rankings: {},
    };
    const profile = normalize.mergePlayerProfile(byId as never, lite as never);
    expect(profile.equipment).toEqual({});
    expect(profile.skills.attack.fromEquipment).toBeNull();
    expect(profile.companyId).toBeNull();
    expect(profile.muId).toBeNull();
  });
});

describe("normalizeMu", () => {
  const raw: RawMu = {
    _id: "mu1",
    __v: 0,
    user: "owner1",
    region: "region1",
    name: "Iron Wolves",
    members: ["u1", "u2"],
    roles: { managers: ["u1"], commanders: [] },
    leveling: { level: 4, monthlyDamages: 900000 },
    activeUpgradeLevels: {},
    rankings: { damage: { value: 900000, rank: 12, tier: "silver" } },
    investedMoneyByUsers: {},
    avatarUrl: "https://example.com/avatar.png",
    mercenaryReputation: 0,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("maps members and leveling", () => {
    const mu = normalize.normalizeMu(raw);
    expect(mu.memberIds).toEqual(["u1", "u2"]);
    expect(mu.level).toBe(4);
    expect(mu.monthlyDamages).toBe(900000);
  });
});
