/**
 * Raw WarEra tRPC response shapes.
 *
 * These mirror the API's actual field names 1:1 (including quirks like `__v`
 * and inconsistent optionality) so that normalizers.ts has an honest, typed
 * starting point. See procedures.ts for the confidence rating + source of
 * each shape. NOTHING in this file should be treated as final application
 * data — always go through normalizers.ts before it touches a calculation
 * engine or the UI.
 */

// ---------------------------------------------------------------------------
// itemTrading.getPrices
// ---------------------------------------------------------------------------

/** Flat map of itemCode -> current average market price. Always returns ALL items. */
export type RawItemPrices = Record<string, number>;

// ---------------------------------------------------------------------------
// tradingOrder.getTopOrders
// ---------------------------------------------------------------------------

export interface RawTradingOrder {
  _id: string;
  user: string;
  itemCode: string;
  quantity: number;
  price: number;
  offerAt: string;
  type: "buy" | "sell";
  __v?: number;
}

export interface RawTopOrders {
  buyOrders: RawTradingOrder[];
  sellOrders: RawTradingOrder[];
}

// ---------------------------------------------------------------------------
// gameConfig.getGameConfig — the single most important static-data endpoint.
// Field names below come from WarEraProjects/TRPC's Responses.d.ts.
// ---------------------------------------------------------------------------

export interface RawProductionNeeds {
  [inputItemCode: string]: number;
}

/** Common shape shared by most produced (non-raw) items. */
export interface RawProducedItem {
  code: string;
  type: string;
  rarity: string;
  usage?: string;
  isTradable?: boolean;
  isConsumable?: boolean;
  isDeposit?: boolean;
  skinSlot?: string;
  climates?: string[];
  productionPoints?: number;
  productionNeeds?: RawProductionNeeds;
  flatStats?: Record<string, number>;
  dynamicStats?: Record<string, number[]>;
  iconImg?: string;
}

/** gameConfig.items — keyed by item code, e.g. "iron", "steel", "rifle", "case1". */
export type RawGameConfigItems = Record<string, RawProducedItem>;

export interface RawUpgradeLevelStats {
  [statName: string]: number;
}

export interface RawUpgradeLevel {
  level: number;
  steelCost: number;
  constructionPointsCost?: number;
  maintenanceCostCountryDevScale?: number;
  maintenanceCostRegionDevScale?: number;
  maintenanceCost?: number;
  minimumMaintenanceCost?: number;
  stats: RawUpgradeLevelStats;
}

export interface RawUpgradeDefinition {
  canDowngrade?: boolean;
  canBeDisabled?: boolean;
  canBeDestroyed?: boolean;
  pendingDurationHours?: number;
  levels: Record<string, RawUpgradeLevel>;
}

/** gameConfig.upgradesConfig — keyed by upgrade name: base, bunker, storage, ... */
export type RawUpgradesConfig = Record<string, RawUpgradeDefinition>;

export interface RawSkillLevel {
  totalCost: number;
  value: number;
  unlockAtLevel?: number;
  isABar?: boolean;
}

export interface RawSkillTrack {
  levels: Record<string, RawSkillLevel>;
}

/** gameConfig.skills — keyed by skill name: attack, armor, production, ... */
export type RawGameConfigSkills = Record<string, RawSkillTrack>;

export interface RawGameConfigBattle {
  allianceDamagesBonusPercent: number;
  enemyDamagesBonusPercent: number;
  patrioticBonusPercent: number;
  countryOrderBonusPercent: number;
  muOrderBonusPercent: number;
  lostAttackingRegionMalusPercent: number;
  occupyingYourRegionsMalusPercent: number;
  regionNotLinkedToCapitalMalusPercent: number;
  healthCost: number;
  maxRounds: number;
  pointsToWinRound: number;
  roundsToWin: number;
  casesPer1kDamagesInPool: number;
  hitFor1CaseInPool: number;
  setCountryOrderMoneyCost: number;
  setMuOrderMoneyCost: number;
  setOrderMoneyCost: number;
  tickPoints: Record<string, number>;
}

export interface RawGameConfigCompany {
  changeItemCost: number;
  constructionCostIncreasePerCompany: number;
  depositResourceBonus: number;
  destructionValuePercent: number;
  moveCost: number;
}

export interface RawGameConfigWorker {
  fidelityProductionBonusPercent: number;
  maxFidelity: number;
}

export interface RawGameConfigRegion {
  battleCooldownHours: number;
  decreaseBy: number;
  decreaseResistanceCost: number;
  depleteHourlyPercent: number;
  increaseBy: number;
  increaseResistanceCost: number;
  maxDailyResistance: number;
  maxResistance: number;
  minDailyResistance: number;
  [key: string]: unknown;
}

export interface RawGameConfig {
  items: RawGameConfigItems;
  upgradesConfig: RawUpgradesConfig;
  skills: RawGameConfigSkills;
  battle: RawGameConfigBattle;
  company: RawGameConfigCompany;
  worker: RawGameConfigWorker;
  region: RawGameConfigRegion;
  // Remaining top-level keys (badge, citizenshipApplication, country, election,
  // government, law, mergingCost, mission, mu, newspaper, org, party, referral,
  // unrest, upgrade, user) exist on the real payload but are out of scope for
  // the economy/combat engines and are intentionally left untyped here.
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// company.getById / company.getCompanies
// ---------------------------------------------------------------------------

export interface RawCompanyActiveUpgradeLevels {
  automatedEngine?: number;
  breakRoom?: number;
  storage?: number;
  [key: string]: number | undefined;
}

export interface RawCompany {
  _id: string;
  __v: number;
  user: string;
  region: string;
  itemCode: string;
  name: string;
  production: number;
  workerCount: number;
  workers: unknown[];
  isFull: boolean;
  concreteInvested: number;
  estimatedValue: number;
  movedUpAt: string;
  createdAt: string;
  updatedAt: string;
  activeUpgradeLevels: RawCompanyActiveUpgradeLevels;
  dates: { lastHiresAt: string[] };
}

export interface RawCompanyListPage {
  /** IMPORTANT: this is a list of company ID strings, not full company objects. */
  items: string[];
  nextCursor?: string;
}

export interface RawCompanyProductionBonus {
  strategicBonus: number;
  depositBonus: number;
  ethicSpecializationBonus: number;
  ethicDepositBonus: number;
  total: number;
}

// ---------------------------------------------------------------------------
// worker.getWorkers / workOffer.*
// ---------------------------------------------------------------------------

export interface RawWorkerCompanyRef {
  _id: string;
  itemCode: string;
  name: string;
}

export interface RawWorkersPerCompany {
  company: RawWorkerCompanyRef;
  workers: unknown[];
}

export interface RawWorkersResponse {
  type: string;
  workersPerCompany: RawWorkersPerCompany[];
}

export interface RawWorkOffer {
  _id: string;
  __v: number;
  company: string;
  region: string;
  user: string;
  wage: number;
  quantity: number;
  initialQuantity: number;
  minEnergy?: number;
  minProduction?: number;
  citizenship?: string;
  text?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RawWorkOfferPage {
  items: RawWorkOffer[];
  nextCursor?: string;
}

// ---------------------------------------------------------------------------
// region.getRegionsObject / region.getById
// ---------------------------------------------------------------------------

export interface RawRegionDeposit {
  type: string;
  bonusPercent: number;
  startsAt: string;
  endsAt: string;
}

export interface RawRegionUpgradeInstance {
  level: number;
  constructionPoints: number;
  investedMoney: number;
  constructionStartedAt?: string;
  constructionEndedAt?: string;
  status?: string;
  statusChangedAt?: string;
  isUnderConstruction?: boolean | null;
  lastConstructions?: unknown[];
}

export interface RawRegion {
  _id: string;
  __v: number;
  code: string;
  name: string;
  mainCity: string;
  country: string;
  initialCountry: string;
  countryCode: string;
  biome: string;
  climate: string;
  position: number[];
  neighbors: string[];
  isCapital: boolean;
  isLinkedToCapital: boolean;
  hasCoast?: boolean;
  development: number;
  baseDevelopment: number;
  resistance: number;
  resistanceMax: number;
  activeUpgradeLevels?: Record<string, number>;
  upgradesV2: {
    upgrades: Record<string, RawRegionUpgradeInstance>;
    activeConstructionCount: number;
  };
  deposit?: RawRegionDeposit;
  strategicResource?: string;
  stats: { investedMoney: number };
  dates: { lastOwnershipChangeAt?: string };
  lastBattleEndedAt?: string;
  lastRevoltEndedAt?: string;
  lastResistanceContributionAt?: string;
  activeBattle?: unknown;
}

/** region.getRegionsObject — keyed by region ID. */
export type RawRegionsObject = Record<string, RawRegion>;

// ---------------------------------------------------------------------------
// country.getAllCountries / country.getCountryById
// ---------------------------------------------------------------------------

export interface RawRankingEntry {
  value: number;
  rank: number;
  tier: string;
}

export interface RawCountry {
  _id: string;
  __v: number;
  name: string;
  code: string;
  money: number;
  scheme: string;
  mapAccent: string;
  orgs: string[];
  allies: string[];
  warsWith: string[];
  development: number;
  specializedItem?: string;
  enemy?: string;
  rulingParty?: string;
  discordUrl?: string;
  pinnedArticle?: string;
  updatedAt: string;
  taxes: { income: number; market: number; selfWork: number };
  unrest: { bar: number; barMax: number; lastContributionAt: string };
  strategicResources?: {
    resources: Record<string, string[]>;
    bonuses: { productionPercent: number; developmentPercent: number };
  };
  rankings: Record<string, RawRankingEntry>;
}

// ---------------------------------------------------------------------------
// upgrade.getUpgradeByTypeAndEntity
// ---------------------------------------------------------------------------

export interface RawUpgradeInstance {
  _id: string;
  __v: number;
  upgradeType: string;
  level: number;
  status: string;
  statusChangedAt?: string;
  investedSteel: number;
  investedConcrete: number;
  investedMoney: number;
  dependantUsersCount: number;
  willBeActiveAt?: string;
  createdAt: string;
  updatedAt: string;
  company?: string;
  region?: string;
  mu?: string;
}

// ---------------------------------------------------------------------------
// battle.getLiveBattleData / battle.getById / battleRanking.getRanking
// ---------------------------------------------------------------------------

export interface RawLiveBattleSummary {
  isActive: boolean;
  attackerCountryOrders: string[];
  defenderCountryOrders: string[];
  roundIds: string[];
  roundHistory?: unknown[];
}

export interface RawLiveRoundSummary {
  roundId: string;
  isActive: boolean;
  attackerDamages: number;
  defenderDamages: number;
  attackerPoints: number;
  defenderPoints: number;
  actualTickPoints: number;
  nextTickAt: string;
}

export interface RawLiveBattleData {
  battle: RawLiveBattleSummary;
  round: RawLiveRoundSummary;
}

export interface RawBattleRankingEntry {
  user?: string;
  country?: string;
  value: number;
  rank: number;
  _id: string;
}

export interface RawBattleRanking {
  rankings: RawBattleRankingEntry[];
}

// ---------------------------------------------------------------------------
// round.getLastHits — per-hit combat log. No formula is exposed anywhere;
// this is observational data only (see procedures.ts note on round.getLastHits).
// ---------------------------------------------------------------------------

export interface RawRoundEquipment {
  _id: string;
  code: string;
  type: string;
  state: number;
  maxState: number;
  quantity: number;
  lastAcquisitionAt: string;
  skills: Record<string, number>;
}

export interface RawRoundWeapon {
  _id: string;
  code: string;
  state: number;
  maxState: number;
  quantity: number;
  lastAcquisitionAt: string;
  skills: { attack: number; criticalChance: number };
}

export interface RawLastHit {
  _id: string;
  user: string;
  mu?: string;
  ammo?: string;
  weapon?: RawRoundWeapon;
  equipments?: RawRoundEquipment[];
  damages: number;
  isCriticalHit: boolean;
  missed: boolean;
  hitAt: string;
}

export interface RawLastHits {
  attacker: RawLastHit[];
  defender: RawLastHit[];
}

// ---------------------------------------------------------------------------
// mu.getById
// ---------------------------------------------------------------------------

export interface RawMu {
  _id: string;
  __v: number;
  user: string;
  region: string;
  name: string;
  members: string[];
  roles: { managers: string[]; commanders: string[] };
  leveling: { level: number; monthlyDamages: number };
  activeUpgradeLevels: Record<string, number>;
  rankings: Record<string, RawRankingEntry>;
  investedMoneyByUsers: Record<string, number>;
  avatarUrl: string;
  mercenaryReputation: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// search.searchAnything / user.getUserById / user.getUserLite
// ---------------------------------------------------------------------------

export interface RawSearchResult {
  hasData: boolean;
  userIds: string[];
  countryIds: unknown[];
  regionIds: unknown[];
  muIds: string[];
  partyIds: unknown[];
}

export interface RawUserSkillStandard {
  level: number;
  equipment?: number;
  total: number;
}

export interface RawUserSkillAttack {
  level: number;
  weapon: number;
  equipment?: number;
  ammoPercent: number;
  buffsPercent: number;
  debuffsPercent: number;
  militaryRankPercent: number;
  total: number;
}

export interface RawUserSkillBar {
  level: number;
  currentBarValue: number;
  hourlyBarRegen: number;
  total: number;
}

/** user.getUserLite — rich computed skill breakdown, no equipment map. */
export interface RawUserLite {
  username: string;
  country: string;
  mu?: string;
  militaryRank: number;
  isActive: boolean;
  leveling: { level: number; totalXp: number; availableSkillPoints: number };
  skills: {
    attack: RawUserSkillAttack;
    armor: RawUserSkillStandard;
    dodge: RawUserSkillStandard;
    criticalChance: RawUserSkillStandard;
    criticalDamages: RawUserSkillStandard;
    precision: RawUserSkillStandard;
    production: RawUserSkillBar;
    companies: RawUserSkillStandard;
    management: RawUserSkillStandard;
    lootChance: RawUserSkillStandard;
    entrepreneurship: RawUserSkillBar;
  };
  rankings: Record<string, RawRankingEntry>;
}

/** user.getUserById — has the equipment slot map, but a loosely-typed skills blob. */
export interface RawUserById {
  _id: string;
  username: string;
  usernameLower: string;
  country: string;
  mu?: string;
  company?: string;
  party?: string;
  militaryRank: number;
  isActive: boolean;
  avatarUrl?: string;
  leveling: { level: number; totalXp: number; availableSkillPoints: number };
  /** slot name -> equipped item code, e.g. { weapon: "rifle3", helmet: "helmet2" } */
  equipment?: Record<string, string>;
  rankings: Record<string, { rank: number; tier: string; value: number } | undefined>;
}



export interface RawEquippedItem {
  _id: string;
  code: string;
  state: number;
  maxState: number;
  quantity: number;
  lastAcquisitionAt: string;
  skills: Record<string, number>;
}

export interface RawCurrentEquipment {
  ammo?: string;
  weapon?: RawEquippedItem;
  helmet?: RawEquippedItem;
  chest?: RawEquippedItem;
  gloves?: RawEquippedItem;
  pants?: RawEquippedItem;
  boots?: RawEquippedItem;
}

// ---------------------------------------------------------------------------
// Generic tRPC transport envelope. WarEra's GET endpoints have been observed
// returning the bare payload in third-party docs (already unwrapped by the
// doc authors), but a stock tRPC httpBatchLink/httpLink server replies with
// `{ result: { data: T } }` for a single query. The client layer normalizes
// both shapes so a live-API change in wrapping doesn't silently break parsing.
// ---------------------------------------------------------------------------

export interface TrpcEnvelope<T> {
  result: { data: T };
}

export interface TrpcErrorEnvelope {
  error: {
    message: string;
    code?: string;
    data?: { code?: string; httpStatus?: number };
  };
}
