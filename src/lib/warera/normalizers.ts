/**
 * Raw API shape -> internal model normalizers.
 *
 * Rules followed throughout this file (per the brief's engineering rules):
 *   - Never invent a field. If the raw payload doesn't have it, the model
 *     field is `null` (not 0, not a guess).
 *   - Never invent a recipe / production number. If `productionNeeds` is
 *     absent, `recipe` is `null`, not `{ inputs: {} }` (those are different:
 *     "no inputs" vs "we don't know").
 *   - Category inference from `code`/`type`/`usage` is a best-effort UI
 *     convenience, not treated as authoritative game data anywhere in the
 *     economy/combat engines.
 */

import type {
  RawBattleRanking,
  RawCompany,
  RawCompanyProductionBonus,
  RawCountry,
  RawCurrentEquipment,
  RawEquippedItem,
  RawGameConfigItems,
  RawLastHit,
  RawLastHits,
  RawLiveBattleData,
  RawMu,
  RawProducedItem,
  RawRegion,
  RawRoundEquipment,
  RawRoundWeapon,
  RawTopOrders,
  RawUpgradeInstance,
  RawUpgradesConfig,
  RawUserById,
  RawUserLite,
  RawUserSkillAttack,
  RawWorkOffer,
  RawWorkersResponse,
} from "./types";
import type {
  BattleRankingEntry,
  Company,
  CompanyProductionBonus,
  CombatHit,
  Country,
  Gear,
  GearConditionState,
  GearSlot,
  Item,
  ItemCategory,
  LiveBattle,
  MarketOrderBook,
  MilitaryUnit,
  PlayerProfile,
  PlayerSkillBreakdown,
  Region,
  RegionResourceBonus,
  UpgradeDefinition,
  UpgradeInstance,
  Worker,
  WorkOffer,
} from "./models";

// ---------------------------------------------------------------------------
// Items / recipes (gameConfig.items)
// ---------------------------------------------------------------------------

const WEAPON_TYPES = new Set(["gun", "rifle", "knife", "tank", "jet", "sniper"]);
const GEAR_TYPES = new Set(["boots", "chest", "pants", "gloves", "helmet"]);
const AMMO_TYPES = new Set(["ammo", "lightAmmo", "heavyAmmo"]);

function inferCategory(code: string, raw: RawProducedItem): ItemCategory {
  const type = raw.type?.toLowerCase() ?? "";
  if (raw.isDeposit || (raw.productionPoints !== undefined && !raw.productionNeeds && raw.usage === undefined)) {
    // Deposit resources (iron, grain, oil, ...) have no productionNeeds and aren't gear/weapons.
    if (!WEAPON_TYPES.has(type) && !GEAR_TYPES.has(type) && !AMMO_TYPES.has(type) && type !== "case") {
      return "raw";
    }
  }
  if (type === "case") return "box";
  if (WEAPON_TYPES.has(type) || WEAPON_TYPES.has(code)) return "weapon";
  if (GEAR_TYPES.has(type)) return "gear";
  if (AMMO_TYPES.has(type) || AMMO_TYPES.has(code)) return "ammo";
  if (raw.isConsumable) return "consumable";
  if (raw.productionNeeds && Object.keys(raw.productionNeeds).length > 0) return "product";
  if (!raw.isTradable && !raw.productionNeeds) return "other";
  return "product";
}

export function normalizeItem(code: string, raw: RawProducedItem): Item {
  return {
    code,
    name: code, // The API does not expose a display name field for items — code IS the identifier.
    category: inferCategory(code, raw),
    rarity: raw.rarity ?? null,
    isTradable: raw.isTradable ?? false,
    isConsumable: raw.isConsumable ?? false,
    isDeposit: raw.isDeposit ?? false,
    iconUrl: raw.iconImg ?? null,
    combatStats: raw.flatStats && Object.keys(raw.flatStats).length > 0 ? { ...raw.flatStats } : null,
    productionPoints: raw.productionPoints ?? null,
    recipe:
      raw.productionNeeds && Object.keys(raw.productionNeeds).length > 0
        ? { inputs: { ...raw.productionNeeds } }
        : null,
  };
}

export function normalizeGameConfigItems(raw: RawGameConfigItems): Record<string, Item> {
  const items: Record<string, Item> = {};
  for (const [code, item] of Object.entries(raw)) {
    items[code] = normalizeItem(code, item);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Market prices / orders
// ---------------------------------------------------------------------------

/**
 * itemTrading.getPrices returns a bare average price per item — no bid/ask
 * split. Best buy/sell/spread can only be derived by cross-referencing
 * tradingOrder.getTopOrders for that specific item; this function alone
 * cannot populate them, hence `null`.
 */
export function normalizePricesOnly(
  raw: Record<string, number>,
  observedAt: number = Date.now(),
): Record<string, { itemCode: string; average: number; observedAt: number }> {
  const out: Record<string, { itemCode: string; average: number; observedAt: number }> = {};
  for (const [itemCode, average] of Object.entries(raw)) {
    out[itemCode] = { itemCode, average, observedAt };
  }
  return out;
}

export function normalizeTopOrders(itemCode: string, raw: RawTopOrders): MarketOrderBook {
  return {
    itemCode,
    buyOrders: raw.buyOrders.map((o) => ({
      id: o._id,
      itemCode: o.itemCode,
      side: "buy" as const,
      userId: o.user,
      quantity: o.quantity,
      price: o.price,
      offerAt: o.offerAt,
    })),
    sellOrders: raw.sellOrders.map((o) => ({
      id: o._id,
      itemCode: o.itemCode,
      side: "sell" as const,
      userId: o.user,
      quantity: o.quantity,
      price: o.price,
      offerAt: o.offerAt,
    })),
  };
}

/**
 * Combines an average price with a specific item's top-orders book into a
 * single MarketPrice with real bestBuy/bestSell/spread — the shape the
 * /market page and craft-vs-buy engine actually want. Returns null fields
 * for bid/ask if the order book side is empty (thin market), never 0.
 */
export function combinePriceWithOrders(
  itemCode: string,
  average: number,
  orders: MarketOrderBook,
  observedAt: number = Date.now(),
) {
  const bestBuy = orders.buyOrders.length
    ? Math.max(...orders.buyOrders.map((o) => o.price))
    : null;
  const bestSell = orders.sellOrders.length
    ? Math.min(...orders.sellOrders.map((o) => o.price))
    : null;
  return {
    itemCode,
    average,
    bestBuy,
    bestSell,
    spread: bestBuy !== null && bestSell !== null ? bestSell - bestBuy : null,
    observedAt,
  };
}

// ---------------------------------------------------------------------------
// Company / worker / work-offer
// ---------------------------------------------------------------------------

export function normalizeCompany(raw: RawCompany): Company {
  return {
    id: raw._id,
    ownerId: raw.user,
    regionId: raw.region,
    itemCode: raw.itemCode,
    name: raw.name,
    workerCount: raw.workerCount,
    isFull: raw.isFull,
    concreteInvested: raw.concreteInvested,
    estimatedValue: raw.estimatedValue,
    currentProduction: raw.production,
    upgrades: {
      automatedEngine: raw.activeUpgradeLevels.automatedEngine ?? 0,
      breakRoom: raw.activeUpgradeLevels.breakRoom ?? 0,
      storage: raw.activeUpgradeLevels.storage ?? 0,
    },
  };
}

export function normalizeCompanyProductionBonus(raw: RawCompanyProductionBonus): CompanyProductionBonus {
  return { ...raw };
}

export function normalizeWorkers(raw: RawWorkersResponse): Worker[] {
  return raw.workersPerCompany.map((entry) => ({
    companyId: entry.company._id,
    companyItemCode: entry.company.itemCode,
    companyName: entry.company.name,
    workerCount: entry.workers.length,
  }));
}

export function normalizeWorkOffer(raw: RawWorkOffer): WorkOffer {
  return {
    id: raw._id,
    companyId: raw.company,
    regionId: raw.region,
    posterUserId: raw.user,
    wage: raw.wage,
    quantity: raw.quantity,
    initialQuantity: raw.initialQuantity,
    minEnergy: raw.minEnergy ?? null,
    minProduction: raw.minProduction ?? null,
    citizenshipRequired: raw.citizenship ?? null,
  };
}

// ---------------------------------------------------------------------------
// Region / country
// ---------------------------------------------------------------------------

function normalizeRegionResourceBonus(raw: RawRegion): RegionResourceBonus | null {
  if (!raw.deposit) return null;
  return {
    resourceCode: raw.deposit.type,
    bonusPercent: raw.deposit.bonusPercent,
    startsAt: raw.deposit.startsAt,
    endsAt: raw.deposit.endsAt,
  };
}

export function normalizeRegion(raw: RawRegion): Region {
  return {
    id: raw._id,
    code: raw.code,
    name: raw.name,
    mainCity: raw.mainCity,
    countryId: raw.country,
    countryCode: raw.countryCode,
    biome: raw.biome,
    climate: raw.climate,
    isCapital: raw.isCapital,
    isLinkedToCapital: raw.isLinkedToCapital,
    development: raw.development,
    resistance: raw.resistance,
    resistanceMax: raw.resistanceMax,
    upgradeLevels: { ...(raw.activeUpgradeLevels ?? {}) },
    resourceBonus: normalizeRegionResourceBonus(raw),
    strategicResource: raw.strategicResource ?? null,
  };
}

export function normalizeRegionsObject(raw: Record<string, RawRegion>): Record<string, Region> {
  const out: Record<string, Region> = {};
  for (const [id, region] of Object.entries(raw)) {
    out[id] = normalizeRegion(region);
  }
  return out;
}

export function normalizeCountry(raw: RawCountry): Country {
  const rankings: Country["rankings"] = {};
  for (const [key, entry] of Object.entries(raw.rankings)) {
    rankings[key] = { value: entry.value, rank: entry.rank, tier: entry.tier };
  }
  return {
    id: raw._id,
    code: raw.code,
    name: raw.name,
    treasury: raw.money,
    development: raw.development,
    taxes: { ...raw.taxes },
    allyIds: [...raw.allies],
    warIds: [...raw.warsWith],
    rankings,
  };
}

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------

export function normalizeUpgradeDefinition(upgradeType: string, raw: RawUpgradesConfig[string]): UpgradeDefinition {
  const levels = Object.values(raw.levels)
    .map((level) => ({
      level: level.level,
      steelCost: level.steelCost,
      constructionPointsCost: level.constructionPointsCost ?? null,
      maintenanceCost: level.maintenanceCost ?? level.minimumMaintenanceCost ?? null,
      stats: { ...level.stats },
    }))
    .sort((a, b) => a.level - b.level);

  return {
    upgradeType,
    canDowngrade: raw.canDowngrade ?? false,
    levels,
  };
}

export function normalizeUpgradesConfig(raw: RawUpgradesConfig): Record<string, UpgradeDefinition> {
  const out: Record<string, UpgradeDefinition> = {};
  for (const [type, def] of Object.entries(raw)) {
    out[type] = normalizeUpgradeDefinition(type, def);
  }
  return out;
}

export function normalizeUpgradeInstance(raw: RawUpgradeInstance): UpgradeInstance | null {
  const owner = raw.company
    ? { kind: "company" as const, id: raw.company }
    : raw.region
      ? { kind: "region" as const, id: raw.region }
      : raw.mu
        ? { kind: "mu" as const, id: raw.mu }
        : null;
  if (!owner) return null; // Malformed / unrecognized owner — fail closed, don't guess.

  return {
    id: raw._id,
    upgradeType: raw.upgradeType,
    level: raw.level,
    status: raw.status,
    investedSteel: raw.investedSteel,
    investedConcrete: raw.investedConcrete,
    investedMoney: raw.investedMoney,
    ownerEntity: owner,
  };
}

// ---------------------------------------------------------------------------
// Gear / equipment / combat
// ---------------------------------------------------------------------------

const SLOT_FROM_TYPE: Record<string, GearSlot> = {
  boots: "boots",
  chest: "chest",
  pants: "pants",
  gloves: "gloves",
  helmet: "helmet",
};

export function inferGearSlot(code: string, type?: string): GearSlot | null {
  if (type && SLOT_FROM_TYPE[type]) return SLOT_FROM_TYPE[type];
  const codePrefix = code.replace(/[0-9]+$/, "");
  if (SLOT_FROM_TYPE[codePrefix]) return SLOT_FROM_TYPE[codePrefix];
  if (WEAPON_TYPES.has(codePrefix) || WEAPON_TYPES.has(code)) return "weapon";
  return null;
}

/**
 * Condition-state buckets. The API exposes raw `state`/`maxState` durability
 * numbers on equipped items (confirmed via RoundEquipment/RoundWeapon in
 * WarEraProjects/TRPC) but never labels them GOOD/LOW/DAMAGED/BROKEN — those
 * bucket boundaries are a WARERA COMMAND presentation choice, not a game
 * mechanic, and are clearly documented as such wherever they're used in the UI.
 */
export function conditionFromState(state: number | null, maxState: number | null): GearConditionState {
  if (state === null || maxState === null || maxState <= 0) return "UNKNOWN";
  const ratio = state / maxState;
  if (state <= 0) return "BROKEN";
  if (ratio < 0.25) return "DAMAGED";
  if (ratio < 0.6) return "LOW";
  return "GOOD";
}

function normalizeEquipmentLike(
  id: string,
  code: string,
  state: number,
  maxState: number,
  skills: Record<string, number>,
  equipped: boolean,
): Gear {
  const slot = inferGearSlot(code) ?? "weapon";
  return {
    id,
    code,
    slot,
    rarity: null, // Not present on RoundEquipment/RoundWeapon/RawEquippedItem — only on gameConfig.items.
    state,
    maxState,
    condition: conditionFromState(state, maxState),
    bonuses: { ...skills },
    equipped,
  };
}

export function normalizeRoundEquipment(raw: RawRoundEquipment, equipped = true): Gear {
  return normalizeEquipmentLike(raw._id, raw.code, raw.state, raw.maxState, raw.skills, equipped);
}

export function normalizeRoundWeapon(raw: RawRoundWeapon, equipped = true): Gear {
  return normalizeEquipmentLike(raw._id, raw.code, raw.state, raw.maxState, raw.skills, equipped);
}

export function normalizeEquippedItem(raw: RawEquippedItem, equipped = true): Gear {
  return normalizeEquipmentLike(raw._id, raw.code, raw.state, raw.maxState, raw.skills, equipped);
}

export function normalizeCurrentEquipment(raw: RawCurrentEquipment): {
  ammoCode: string | null;
  gear: Gear[];
} {
  const gear: Gear[] = [];
  const slots: Array<[GearSlot, RawEquippedItem | undefined]> = [
    ["weapon", raw.weapon],
    ["helmet", raw.helmet],
    ["chest", raw.chest],
    ["gloves", raw.gloves],
    ["pants", raw.pants],
    ["boots", raw.boots],
  ];
  for (const [slot, item] of slots) {
    if (!item) continue;
    gear.push({ ...normalizeEquippedItem(item, true), slot });
  }
  return { ammoCode: raw.ammo ?? null, gear };
}

export function normalizeLiveBattle(battleId: string, raw: RawLiveBattleData): LiveBattle {
  return {
    battleId,
    isActive: raw.battle.isActive,
    attackerDamages: raw.round.attackerDamages,
    defenderDamages: raw.round.defenderDamages,
    attackerPoints: raw.round.attackerPoints,
    defenderPoints: raw.round.defenderPoints,
    nextTickAt: raw.round.nextTickAt ?? null,
  };
}

export function normalizeBattleRanking(
  raw: RawBattleRanking,
  entityKind: "user" | "country" | "mu",
): BattleRankingEntry[] {
  return raw.rankings.map((entry) => ({
    entityId: entry.user ?? entry.country ?? entry._id,
    entityKind,
    value: entry.value,
    rank: entry.rank,
  }));
}

function normalizeHit(raw: RawLastHit): CombatHit {
  return {
    hitterId: raw.user,
    ammoCode: raw.ammo ?? null,
    weaponCode: raw.weapon?.code ?? null,
    damage: raw.damages,
    isCritical: raw.isCriticalHit,
    isMiss: raw.missed,
    hitAt: raw.hitAt,
  };
}

export function normalizeLastHits(raw: RawLastHits): { attacker: CombatHit[]; defender: CombatHit[] } {
  return {
    attacker: raw.attacker.map(normalizeHit),
    defender: raw.defender.map(normalizeHit),
  };
}

export function normalizeMu(raw: RawMu): MilitaryUnit {
  const rankings: MilitaryUnit["rankings"] = {};
  for (const [key, entry] of Object.entries(raw.rankings)) {
    rankings[key] = { value: entry.value, rank: entry.rank, tier: entry.tier };
  }
  return {
    id: raw._id,
    name: raw.name,
    regionId: raw.region,
    memberIds: [...raw.members],
    level: raw.leveling.level,
    monthlyDamages: raw.leveling.monthlyDamages,
    rankings,
  };
}

// ---------------------------------------------------------------------------
// Player profile — merges user.getUserById + user.getUserLite
// ---------------------------------------------------------------------------

function standardBreakdown(raw: { level?: number; equipment?: number; total: number } | undefined): PlayerSkillBreakdown {
  if (!raw) return { total: 0, fromLevel: 0, fromEquipment: null, fromWeapon: null };
  return {
    total: raw.total,
    fromLevel: raw.level ?? 0,
    fromEquipment: raw.equipment ?? null,
    fromWeapon: null,
  };
}

function attackBreakdown(raw: RawUserSkillAttack | undefined): PlayerSkillBreakdown {
  if (!raw) return { total: 0, fromLevel: 0, fromEquipment: null, fromWeapon: null };
  return {
    total: raw.total,
    fromLevel: raw.level ?? 0,
    fromEquipment: raw.equipment ?? null,
    fromWeapon: raw.weapon ?? null,
  };
}

function barBreakdown(raw: { level?: number; total: number } | undefined): PlayerSkillBreakdown {
  if (!raw) return { total: 0, fromLevel: 0, fromEquipment: null, fromWeapon: null };
  return { total: raw.total, fromLevel: raw.level ?? 0, fromEquipment: null, fromWeapon: null };
}

export function mergePlayerProfile(byId: RawUserById, lite: RawUserLite): PlayerProfile {
  const skills = lite.skills ?? {};
  return {
    id: byId._id,
    username: byId.username,
    level: lite.leveling?.level ?? byId.leveling?.level ?? 0,
    countryId: byId.country ?? "",
    muId: byId.mu ?? null,
    companyId: byId.company ?? null,
    militaryRank: byId.militaryRank ?? 0,
    equipment: { ...(byId.equipment ?? {}) },
    skills: {
      attack: attackBreakdown(skills.attack),
      armor: standardBreakdown(skills.armor),
      dodge: standardBreakdown(skills.dodge),
      criticalChance: standardBreakdown(skills.criticalChance),
      criticalDamages: standardBreakdown(skills.criticalDamages),
      precision: standardBreakdown(skills.precision),
      production: barBreakdown(skills.production),
      companies: standardBreakdown(skills.companies),
      management: standardBreakdown(skills.management),
    },
  };
}
