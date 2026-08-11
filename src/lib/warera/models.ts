/**
 * Internal normalized models. Nothing downstream (economy engine, combat
 * engine, UI) should ever import from types.ts directly — everything flows
 * through here so the rest of the app is insulated from WarEra API quirks.
 */

// ---------------------------------------------------------------------------
// Result wrapper — the mechanism behind "DATA UNAVAILABLE" / "INSUFFICIENT
// DATA" instead of ever fabricating a number. Every normalizer and every
// warera.* API function returns one of these instead of a bare value.
// ---------------------------------------------------------------------------

export type DataResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

export function ok<T>(data: T): DataResult<T> {
  return { status: "ok", data };
}
export function unavailable<T>(reason: string): DataResult<T> {
  return { status: "unavailable", reason };
}
export function errored<T>(reason: string): DataResult<T> {
  return { status: "error", reason };
}

export function isOk<T>(result: DataResult<T>): result is { status: "ok"; data: T } {
  return result.status === "ok";
}

// ---------------------------------------------------------------------------
// Economy models
// ---------------------------------------------------------------------------

export type ItemCategory = "raw" | "product" | "weapon" | "gear" | "ammo" | "consumable" | "box" | "other";

export interface Recipe {
  /** itemCode -> quantity of that input required per unit of output. */
  inputs: Record<string, number>;
}

export interface Item {
  code: string;
  name: string;
  category: ItemCategory;
  rarity: string | null;
  isTradable: boolean;
  isConsumable: boolean;
  isDeposit: boolean;
  /** Real icon URL from gameConfig.items[code].iconImg, when the API provides one. Never fabricated. */
  iconUrl: string | null;
  /**
   * Raw per-rarity-tier-independent combat stats straight from
   * gameConfig.items[code].flatStats, when present (e.g. a weapon's
   * `attack`, a piece of gear's `armor`/`dodge`). Null if the API didn't
   * provide any — never guessed. Rarity-scaled stats (`dynamicStats`) are
   * not surfaced here yet; see advisor/gearAdvisor.ts's confidence notes.
   */
  combatStats: Record<string, number> | null;
  /** Output units produced per production tick, if this is a producible item. */
  productionPoints: number | null;
  /** Direct recipe only — see economy/recipes.ts for recursive resolution. */
  recipe: Recipe | null;
}

export interface MarketPrice {
  itemCode: string;
  average: number;
  bestBuy: number | null;
  bestSell: number | null;
  spread: number | null;
  /** ms since epoch when this price snapshot was fetched. */
  observedAt: number;
}

export interface MarketOrder {
  id: string;
  itemCode: string;
  side: "buy" | "sell";
  userId: string;
  quantity: number;
  price: number;
  offerAt: string;
}

export interface MarketOrderBook {
  itemCode: string;
  buyOrders: MarketOrder[];
  sellOrders: MarketOrder[];
}

export interface Company {
  id: string;
  ownerId: string;
  regionId: string;
  itemCode: string;
  name: string;
  workerCount: number;
  isFull: boolean;
  concreteInvested: number;
  estimatedValue: number;
  /** Raw production figure the API reports for the company right now. */
  currentProduction: number;
  upgrades: {
    automatedEngine: number;
    breakRoom: number;
    storage: number;
  };
}

export interface CompanyProductionBonus {
  strategicBonus: number;
  depositBonus: number;
  ethicSpecializationBonus: number;
  ethicDepositBonus: number;
  total: number;
}

export interface Worker {
  companyId: string;
  companyItemCode: string;
  companyName: string;
  workerCount: number;
}

export interface WorkOffer {
  id: string;
  companyId: string;
  regionId: string;
  posterUserId: string;
  wage: number;
  quantity: number;
  initialQuantity: number;
  minEnergy: number | null;
  minProduction: number | null;
  citizenshipRequired: string | null;
}

export interface RegionResourceBonus {
  resourceCode: string;
  bonusPercent: number;
  startsAt: string;
  endsAt: string;
}

export interface Region {
  id: string;
  code: string;
  name: string;
  mainCity: string;
  countryId: string;
  countryCode: string;
  biome: string;
  climate: string;
  isCapital: boolean;
  isLinkedToCapital: boolean;
  development: number;
  resistance: number;
  resistanceMax: number;
  upgradeLevels: Record<string, number>;
  resourceBonus: RegionResourceBonus | null;
  strategicResource: string | null;
}

export interface Country {
  id: string;
  code: string;
  name: string;
  treasury: number;
  development: number;
  taxes: { income: number; market: number; selfWork: number };
  allyIds: string[];
  warIds: string[];
  rankings: Record<string, { value: number; rank: number; tier: string }>;
}

export interface UpgradeLevelOption {
  level: number;
  steelCost: number;
  constructionPointsCost: number | null;
  maintenanceCost: number | null;
  stats: Record<string, number>;
}

export interface UpgradeDefinition {
  upgradeType: string;
  canDowngrade: boolean;
  levels: UpgradeLevelOption[];
}

export interface UpgradeInstance {
  id: string;
  upgradeType: string;
  level: number;
  status: string;
  investedSteel: number;
  investedConcrete: number;
  investedMoney: number;
  ownerEntity: { kind: "company" | "region" | "mu"; id: string };
}

// ---------------------------------------------------------------------------
// Gear / combat models
// ---------------------------------------------------------------------------

export type GearSlot = "weapon" | "helmet" | "chest" | "gloves" | "pants" | "boots";
export type GearConditionState = "GOOD" | "LOW" | "DAMAGED" | "BROKEN" | "UNKNOWN";

export interface Gear {
  id: string;
  code: string;
  slot: GearSlot;
  rarity: string | null;
  /** Raw durability points, when the API exposes them (weapons/equipment do; not all items do). */
  state: number | null;
  maxState: number | null;
  condition: GearConditionState;
  /** Combat-relevant bonuses, keyed by stat name (attack, armor, dodge, precision, criticalChance, criticalDamages...). */
  bonuses: Record<string, number>;
  equipped: boolean;
}

export interface LiveBattle {
  battleId: string;
  isActive: boolean;
  attackerDamages: number;
  defenderDamages: number;
  attackerPoints: number;
  defenderPoints: number;
  nextTickAt: string | null;
}

export interface BattleRankingEntry {
  entityId: string;
  entityKind: "user" | "country" | "mu";
  value: number;
  rank: number;
}

export interface CombatHit {
  hitterId: string;
  ammoCode: string | null;
  weaponCode: string | null;
  damage: number;
  isCritical: boolean;
  isMiss: boolean;
  hitAt: string;
}

export interface MilitaryUnit {
  id: string;
  name: string;
  regionId: string;
  memberIds: string[];
  level: number;
  monthlyDamages: number;
  rankings: Record<string, { value: number; rank: number; tier: string }>;
}

// ---------------------------------------------------------------------------
// Player profile — merges user.getUserById (equipped-gear slot map) with
// user.getUserLite (real, server-computed skill totals) into one model.
// ---------------------------------------------------------------------------

export interface PlayerSkillBreakdown {
  total: number;
  fromLevel: number;
  fromEquipment: number | null;
  fromWeapon: number | null;
}

export interface PlayerProfile {
  id: string;
  username: string;
  level: number;
  countryId: string;
  muId: string | null;
  companyId: string | null;
  militaryRank: number;
  /** slot name -> equipped item code, straight from the API. */
  equipment: Record<string, string>;
  skills: {
    attack: PlayerSkillBreakdown;
    armor: PlayerSkillBreakdown;
    dodge: PlayerSkillBreakdown;
    criticalChance: PlayerSkillBreakdown;
    criticalDamages: PlayerSkillBreakdown;
    precision: PlayerSkillBreakdown;
    production: PlayerSkillBreakdown;
    companies: PlayerSkillBreakdown;
    management: PlayerSkillBreakdown;
  };
}
