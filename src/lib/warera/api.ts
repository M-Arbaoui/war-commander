/**
 * Public entry point for all WarEra data. Server functions (Phase 5+) should
 * only ever import from here — never reach into client.ts, schemas.ts, or
 * normalizers.ts directly, and never call fetch() against api2.warera.io
 * from anywhere else in the codebase.
 *
 * Every function returns a DataResult<T>:
 *   - { status: "ok", data }             — validated, normalized, ready to use.
 *   - { status: "unavailable", reason }  — the API responded, but the shape
 *                                          didn't validate (schema mismatch),
 *                                          OR the specific field/entity the
 *                                          caller wants doesn't exist.
 *   - { status: "error", reason }        — transport failure (timeout, 5xx,
 *                                          network error) after retries.
 *
 * UI code should render "DATA UNAVAILABLE" / "INSUFFICIENT DATA" straight
 * from these statuses rather than ever falling back to a fabricated number.
 */

import { z } from "zod";
import { wareraGet, WareraApiError } from "./client";
import { wareraCache, cacheKey } from "./cache";
import { CACHE_TTL_MS, PROCEDURES } from "./procedures";
import * as schemas from "./schemas";
import * as normalize from "./normalizers";
import { errored, ok, unavailable, type DataResult } from "./models";
import type {
  BattleRankingEntry,
  Company,
  CompanyProductionBonus,
  Country,
  Gear,
  Item,
  LiveBattle,
  MarketOrderBook,
  MilitaryUnit,
  Region,
  UpgradeDefinition,
  Worker,
  WorkOffer,
} from "./models";

// ---------------------------------------------------------------------------
// Generic fetch-validate-cache-normalize pipeline
// ---------------------------------------------------------------------------

interface FetchOptions {
  /** Bypass the cache for this one call (e.g. a manual "refresh" button). */
  forceRefresh?: boolean;
}

async function fetchValidated<Raw>(
  procedure: string,
  schema: z.ZodType<Raw>,
  input: Record<string, unknown> | undefined,
  cacheTier: keyof typeof CACHE_TTL_MS,
  options: FetchOptions = {},
): Promise<DataResult<Raw>> {
  const key = cacheKey(procedure, input);

  if (!options.forceRefresh) {
    const cached = wareraCache.get<Raw>(key);
    if (cached !== undefined) return ok(cached);
  }

  try {
    const raw = await wareraCache.dedupe(key, () => wareraGet<unknown>(procedure, input));
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return unavailable(
        `${procedure} responded, but the payload didn't match the expected shape ` +
          `(${summarizeZodError(parsed.error)}). The live API may have changed — this needs re-verification.`,
      );
    }
    wareraCache.set(key, parsed.data, CACHE_TTL_MS[cacheTier]);
    return ok(parsed.data);
  } catch (err) {
    if (err instanceof WareraApiError) {
      return errored(`${procedure} failed: ${err.message}`);
    }
    return errored(`${procedure} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function summarizeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// gameConfig
// ---------------------------------------------------------------------------

export async function getGameConfig(options?: FetchOptions): Promise<
  DataResult<{
    items: Record<string, Item>;
    upgradesConfig: Record<string, UpgradeDefinition>;
    skills: z.infer<typeof schemas.GameConfigSkillsSchema>;
    battle: z.infer<typeof schemas.GameConfigBattleSchema>;
  }>
> {
  const result = await fetchValidated(
    PROCEDURES.gameConfig.getGameConfig.procedure,
    schemas.GameConfigSchema,
    undefined,
    "static-config",
    options,
  );
  if (result.status !== "ok") return result;
  return ok({
    items: normalize.normalizeGameConfigItems(result.data.items as never),
    upgradesConfig: normalize.normalizeUpgradesConfig(result.data.upgradesConfig as never),
    skills: result.data.skills,
    battle: result.data.battle,
  });
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export async function getPrices(
  options?: FetchOptions,
): Promise<DataResult<Record<string, { itemCode: string; average: number; observedAt: number }>>> {
  const result = await fetchValidated(
    PROCEDURES.itemTrading.getPrices.procedure,
    schemas.ItemPricesSchema,
    undefined,
    "market",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizePricesOnly(result.data));
}

export async function getTopOrders(
  itemCode: string,
  options?: FetchOptions,
): Promise<DataResult<MarketOrderBook>> {
  const result = await fetchValidated(
    PROCEDURES.tradingOrder.getTopOrders.procedure,
    schemas.TopOrdersSchema,
    { itemCode },
    "market",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizeTopOrders(itemCode, result.data));
}

/**
 * Convenience combinator for the /market page: fetches the average price
 * AND the order book for one item, and merges them into a single
 * MarketPrice with real bestBuy/bestSell/spread (or null if that side of
 * the book is empty — never fabricated).
 */
export interface MarketPriceDetail {
  itemCode: string;
  average: number;
  bestBuy: number | null;
  bestSell: number | null;
  spread: number | null;
  observedAt: number;
  orderBookStatus: "ok" | "unavailable" | "error";
}

export async function getMarketPriceDetail(
  itemCode: string,
  options?: FetchOptions,
): Promise<DataResult<MarketPriceDetail>> {
  const [pricesResult, ordersResult] = await Promise.all([
    getPrices(options),
    getTopOrders(itemCode, options),
  ]);

  if (pricesResult.status !== "ok") return pricesResult;
  const priceEntry = pricesResult.data[itemCode];
  if (!priceEntry) {
    return unavailable(`No market price entry for itemCode "${itemCode}".`);
  }
  if (ordersResult.status !== "ok") {
    // We still have the average price — degrade gracefully to average-only
    // rather than failing the whole call, but bid/ask/spread are unavailable.
    return ok({
      itemCode,
      average: priceEntry.average,
      bestBuy: null,
      bestSell: null,
      spread: null,
      observedAt: priceEntry.observedAt,
      orderBookStatus: ordersResult.status,
    });
  }
  return ok({
    ...normalize.combinePriceWithOrders(itemCode, priceEntry.average, ordersResult.data),
    orderBookStatus: "ok" as const,
  });
}

// ---------------------------------------------------------------------------
// Companies / workers / work offers
// ---------------------------------------------------------------------------

export async function getCompanyById(companyId: string, options?: FetchOptions): Promise<DataResult<Company>> {
  const result = await fetchValidated(
    PROCEDURES.company.getById.procedure,
    schemas.CompanySchema,
    { companyId },
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizeCompany(result.data as never));
}

export async function getCompanyIds(
  params: { userId?: string; perPage?: number; cursor?: string } = {},
  options?: FetchOptions,
): Promise<DataResult<{ ids: string[]; nextCursor?: string }>> {
  const result = await fetchValidated(
    PROCEDURES.company.getCompanies.procedure,
    schemas.CompanyListPageSchema,
    params,
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  return ok({ ids: result.data.items, nextCursor: result.data.nextCursor });
}

export async function getCompanyProductionBonus(
  companyId: string,
  options?: FetchOptions,
): Promise<DataResult<CompanyProductionBonus>> {
  const result = await fetchValidated(
    PROCEDURES.company.getProductionBonus.procedure,
    schemas.CompanyProductionBonusSchema,
    { companyId },
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizeCompanyProductionBonus(result.data));
}

export async function getWorkers(
  params: { companyId?: string; userId?: string },
  options?: FetchOptions,
): Promise<DataResult<Worker[]>> {
  const result = await fetchValidated(
    PROCEDURES.worker.getWorkers.procedure,
    schemas.WorkersResponseSchema,
    params,
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizeWorkers(result.data as never));
}

export async function getWorkOffersPaginated(
  params: { limit?: number; cursor?: string; regionId?: string } = {},
  options?: FetchOptions,
): Promise<DataResult<{ offers: WorkOffer[]; nextCursor?: string }>> {
  const result = await fetchValidated(
    PROCEDURES.workOffer.getWorkOffersPaginated.procedure,
    schemas.WorkOfferPageSchema,
    params,
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  return ok({
    offers: result.data.items.map((o) => normalize.normalizeWorkOffer(o as never)),
    nextCursor: result.data.nextCursor,
  });
}

// ---------------------------------------------------------------------------
// Regions / countries
// ---------------------------------------------------------------------------

export async function getRegions(options?: FetchOptions): Promise<DataResult<Record<string, Region>>> {
  const result = await fetchValidated(
    PROCEDURES.region.getRegionsObject.procedure,
    schemas.RegionsObjectSchema,
    undefined,
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizeRegionsObject(result.data as never));
}

export async function getCountries(options?: FetchOptions): Promise<DataResult<Country[]>> {
  const result = await fetchValidated(
    PROCEDURES.country.getAllCountries.procedure,
    schemas.CountriesSchema,
    undefined,
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(result.data.map((c) => normalize.normalizeCountry(c as never)));
}

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------

export async function getUpgradeInstance(
  params: { upgradeType: string; entityId: string; entityKind: "company" | "region" | "mu" },
  options?: FetchOptions,
): Promise<DataResult<ReturnType<typeof normalize.normalizeUpgradeInstance>>> {
  const inputKey =
    params.entityKind === "company" ? "companyId" : params.entityKind === "region" ? "regionId" : "muId";
  const result = await fetchValidated(
    PROCEDURES.upgrade.getUpgradeByTypeAndEntity.procedure,
    schemas.UpgradeInstanceSchema,
    { upgradeType: params.upgradeType, [inputKey]: params.entityId },
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  const normalized = normalize.normalizeUpgradeInstance(result.data as never);
  if (!normalized) {
    return unavailable(`upgrade.getUpgradeByTypeAndEntity returned an instance with no recognizable owner entity.`);
  }
  return ok(normalized);
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

export async function getLiveBattleData(battleId: string, options?: FetchOptions): Promise<DataResult<LiveBattle>> {
  const result = await fetchValidated(
    PROCEDURES.battle.getLiveBattleData.procedure,
    schemas.LiveBattleDataSchema,
    { battleId },
    "live-combat",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizeLiveBattle(battleId, result.data));
}

export async function getBattleRanking(
  params: {
    battleId: string;
    type: "user" | "country" | "mu";
    side: "attacker" | "defender" | "merged";
    dataType?: "damage" | "points";
  },
  options?: FetchOptions,
): Promise<DataResult<BattleRankingEntry[]>> {
  const result = await fetchValidated(
    PROCEDURES.battleRanking.getRanking.procedure,
    schemas.BattleRankingSchema,
    params,
    "live-combat",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizeBattleRanking(result.data, params.type));
}

export async function getLastHits(roundId: string, options?: FetchOptions) {
  const result = await fetchValidated(
    PROCEDURES.round.getLastHits.procedure,
    schemas.LastHitsSchema,
    { roundId },
    "live-combat",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizeLastHits(result.data as never));
}

export async function getMilitaryUnit(muId: string, options?: FetchOptions): Promise<DataResult<MilitaryUnit>> {
  const result = await fetchValidated(
    PROCEDURES.mu.getById.procedure,
    schemas.MuSchema,
    { muId },
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(normalize.normalizeMu(result.data as never));
}

// ---------------------------------------------------------------------------
// Players (search + profile)
// ---------------------------------------------------------------------------

export async function searchUsers(searchText: string, options?: FetchOptions): Promise<DataResult<string[]>> {
  const result = await fetchValidated(
    PROCEDURES.search.searchAnything.procedure,
    schemas.SearchResultSchema,
    { searchText },
    "world-state",
    options,
  );
  if (result.status !== "ok") return result;
  return ok(result.data.userIds);
}

/**
 * Merges user.getUserById (equipped-gear slot map) with user.getUserLite
 * (real, server-computed skill totals) into one PlayerProfile. Two upstream
 * calls, run in parallel — both are needed since neither endpoint alone has
 * both equipment and the rich skill breakdown (see procedures.ts notes).
 */
export async function getUserProfile(
  userId: string,
  options?: FetchOptions,
): Promise<DataResult<import("./models").PlayerProfile>> {
  const [byIdResult, liteResult] = await Promise.all([
    fetchValidated(PROCEDURES.user.getUserById.procedure, schemas.UserByIdSchema, { userId }, "world-state", options),
    fetchValidated(PROCEDURES.user.getUserLite.procedure, schemas.UserLiteSchema, { userId }, "world-state", options),
  ]);
  if (byIdResult.status !== "ok") return byIdResult;
  if (liteResult.status !== "ok") return liteResult;
  return ok(normalize.mergePlayerProfile(byIdResult.data as never, liteResult.data as never));
}

/**
 * inventory.fetchCurrentEquipment requires the *player's own* session token.
 * WARERA COMMAND has no login flow in V1, so this only works if the caller
 * supplies a token the user pasted in locally (e.g. from their own browser
 * devtools) — it is never stored server-side beyond the single request.
 */
export async function getCurrentEquipment(
  sessionToken: string,
): Promise<DataResult<{ ammoCode: string | null; gear: Gear[] }>> {
  if (!sessionToken) {
    return unavailable("inventory.fetchCurrentEquipment requires a session token; none was provided.");
  }
  // Deliberately bypasses fetchValidated's default (no-auth) path — auth-bearing
  // calls are never cached across users, and never share the anonymous cache key.
  try {
    const raw = await wareraGet<unknown>(PROCEDURES.inventory.fetchCurrentEquipment.procedure, undefined);
    const parsed = schemas.CurrentEquipmentSchema.safeParse(raw);
    if (!parsed.success) {
      return unavailable(`inventory.fetchCurrentEquipment payload didn't match expected shape.`);
    }
    return ok(normalize.normalizeCurrentEquipment(parsed.data as never));
  } catch (err) {
    return errored(`inventory.fetchCurrentEquipment failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Re-exported for callers that need cache introspection (e.g. a dashboard "API status" tile). */
export { wareraCache } from "./cache";
export type { DataResult } from "./models";
