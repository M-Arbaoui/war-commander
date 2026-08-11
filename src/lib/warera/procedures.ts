/**
 * WarEra tRPC procedure registry.
 *
 * SOURCING / CONFIDENCE
 * ----------------------
 * This sandbox cannot make outbound HTTP calls to api2.warera.io (network egress
 * is restricted to package registries + GitHub in this environment). Every shape
 * below was therefore built from real, previously-captured request/response pairs
 * published in two public, third-party, reverse-engineered documentation projects
 * for this same API, not invented:
 *
 *   - majimawrks/warera-api-docs   (community spec.md/spec.json per endpoint,
 *     captured from live network traffic)
 *   - WarEraProjects/TRPC          (an open-source typed API client whose
 *     Responses.d.ts was generated from real captured payloads across ~35 procedures,
 *     including gameConfig, company, worker, workOffer, upgrade, inventory, round)
 *
 * Every procedure below is tagged with a `confidence` field:
 *   - "captured"   → we have a real example response body from one of those sources.
 *   - "typed-only" → we have a real *type shape* (field names + types) but no
 *                    concrete example payload was published.
 *   - "unverified" → mentioned in the brief but no public capture exists; the
 *                    normalizer for it must fail closed to "DATA UNAVAILABLE"
 *                    rather than guess at a shape.
 *
 * Once this app is deployed (Vercel can reach api2.warera.io), the smoke-test
 * script in `scripts/verify-endpoints.ts` (Phase 1 deliverable, see below) should
 * be run once against the live API to confirm nothing has drifted. Treat every
 * "confidence" tag here as provisional until that smoke test has actually run
 * against production.
 */

export type HttpMethod = "GET";

export type CacheTier =
  /** Game-balance constants that essentially never change mid-session. */
  | "static-config"
  /** Market prices/orders — the brief specifies ~60s. */
  | "market"
  /** Company/worker/region/country state — changes over minutes. */
  | "world-state"
  /** Live battle ticks — must stay fresh, cache briefly to avoid hammering. */
  | "live-combat"
  /** Never cache (mutates per-request context like search). */
  | "no-cache";

export const CACHE_TTL_MS: Record<CacheTier, number> = {
  "static-config": 30 * 60 * 1000, // 30 min — gameConfig rarely changes.
  market: 60 * 1000, // Brief requirement: ~60s.
  "world-state": 5 * 60 * 1000, // 5 min for companies/regions/countries.
  "live-combat": 5 * 1000, // 5s — needs to feel "live" without hammering.
  "no-cache": 0,
};

export type ProcedureConfidence = "captured" | "typed-only" | "unverified";

export interface ProcedureDefinition {
  /** Dot-path as used in the URL: /trpc/<procedure> */
  procedure: string;
  method: HttpMethod;
  auth: "none" | "optional" | "required";
  cacheTier: CacheTier;
  confidence: ProcedureConfidence;
  /** Human note on where the shape came from / any quirks observed. */
  source: string;
}

/**
 * Every procedure WARERA COMMAND is allowed to call. Adding a new endpoint means
 * adding it here first, with an honest confidence rating — never call an
 * undocumented path ad hoc from feature code.
 */
export const PROCEDURES = {
  gameConfig: {
    getGameConfig: {
      procedure: "gameConfig.getGameConfig",
      method: "GET",
      auth: "none",
      cacheTier: "static-config",
      confidence: "typed-only",
      source:
        "WarEraProjects/TRPC Responses.d.ts (GameConfigGetGameConfigResponse) — full field-level type, no example payload captured.",
    },
    getDates: {
      procedure: "gameConfig.getDates",
      method: "GET",
      auth: "none",
      cacheTier: "static-config",
      confidence: "typed-only",
      source: "WarEraProjects/TRPC Responses.d.ts (GameConfigGetDatesResponse).",
    },
  },
  itemTrading: {
    getPrices: {
      procedure: "itemTrading.getPrices",
      method: "GET",
      auth: "none",
      cacheTier: "market",
      confidence: "captured",
      source:
        "majimawrks/warera-api-docs spec.md — real example response captured. Note: `itemCode` input param is silently ignored by the live API; it always returns the full price map.",
    },
  },
  tradingOrder: {
    getTopOrders: {
      procedure: "tradingOrder.getTopOrders",
      method: "GET",
      auth: "none",
      cacheTier: "market",
      confidence: "captured",
      source:
        "majimawrks/warera-api-docs spec.md — real example captured. Output fields are `buyOrders`/`sellOrders` (an earlier doc revision had this wrong).",
    },
  },
  company: {
    getById: {
      procedure: "company.getById",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source: "WarEraProjects/TRPC Responses.d.ts (CompanyGetByIdResponse).",
    },
    getCompanies: {
      procedure: "company.getCompanies",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source:
        "WarEraProjects/TRPC Responses.d.ts (CompanyGetCompaniesResponse) — paginated, `items` is an array of company ID *strings*, not full objects. Callers must follow up with company.getById per ID.",
    },
    getProductionBonus: {
      procedure: "company.getProductionBonus",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source:
        "WarEraProjects/TRPC src/CustomEndpoints/Company.ts — community-documented custom endpoint, not in the official /docs list. Returns the strategic/deposit/ethic bonus breakdown for a company.",
    },
    getRecommendedRegionIdsByItemCode: {
      procedure: "company.getRecommendedRegionIdsByItemCode",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source:
        "WarEraProjects/TRPC src/CustomEndpoints/Company.ts — community-documented custom endpoint. Powers the /regions 'best region for this resource' feature directly from the server, if it holds up under the live smoke test; otherwise we compute the same ranking ourselves from region.getRegionsObject.",
    },
  },
  worker: {
    getWorkers: {
      procedure: "worker.getWorkers",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source: "WarEraProjects/TRPC Responses.d.ts (WorkerGetWorkersResponse).",
    },
    getTotalWorkersCount: {
      procedure: "worker.getTotalWorkersCount",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source: "WarEraProjects/TRPC Responses.d.ts (WorkerGetTotalWorkersCountResponse — a bare number).",
    },
  },
  workOffer: {
    getWorkOffersPaginated: {
      procedure: "workOffer.getWorkOffersPaginated",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source: "WarEraProjects/TRPC Responses.d.ts (WorkOfferGetWorkOffersPaginatedResponse).",
    },
    getWorkOfferByCompanyId: {
      procedure: "workOffer.getWorkOfferByCompanyId",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source: "WarEraProjects/TRPC Responses.d.ts (WorkOfferGetWorkOfferByCompanyIdResponse).",
    },
  },
  region: {
    getRegionsObject: {
      procedure: "region.getRegionsObject",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "captured",
      source:
        "majimawrks/warera-api-docs spec.md — real example captured (large object keyed by region ID, ~700+ entries).",
    },
    getById: {
      procedure: "region.getById",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "captured",
      source: "majimawrks/warera-api-docs spec.md — real example captured.",
    },
  },
  country: {
    getAllCountries: {
      procedure: "country.getAllCountries",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "captured",
      source: "majimawrks/warera-api-docs spec.md — real example captured.",
    },
    getCountryById: {
      procedure: "country.getCountryById",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "captured",
      source: "majimawrks/warera-api-docs spec.md — real example captured.",
    },
  },
  upgrade: {
    getUpgradeByTypeAndEntity: {
      procedure: "upgrade.getUpgradeByTypeAndEntity",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source: "WarEraProjects/TRPC Responses.d.ts (UpgradeGetUpgradeByTypeAndEntityResponse).",
    },
  },
  battle: {
    getLiveBattleData: {
      procedure: "battle.getLiveBattleData",
      method: "GET",
      auth: "none",
      cacheTier: "live-combat",
      confidence: "captured",
      source: "majimawrks/warera-api-docs spec.md — real example captured.",
    },
    getById: {
      procedure: "battle.getById",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source: "WarEraProjects/TRPC Responses.d.ts (BattleGetByIdResponse).",
    },
  },
  battleRanking: {
    getRanking: {
      procedure: "battleRanking.getRanking",
      method: "GET",
      auth: "optional",
      cacheTier: "live-combat",
      confidence: "captured",
      source:
        "majimawrks/warera-api-docs spec.md — real example captured. Requires battleId, type ('user'|'country'|'mu'), and side ('attacker'|'defender'|'merged'); an earlier doc revision omitted type/side as required.",
    },
  },
  round: {
    getById: {
      procedure: "round.getById",
      method: "GET",
      auth: "none",
      cacheTier: "live-combat",
      confidence: "typed-only",
      source: "WarEraProjects/TRPC Responses.d.ts (RoundGetByIdResponse).",
    },
    getLastHits: {
      procedure: "round.getLastHits",
      method: "GET",
      auth: "none",
      cacheTier: "live-combat",
      confidence: "typed-only",
      source:
        "WarEraProjects/TRPC Responses.d.ts (RoundGetLastHitsResponse) — per-hit damage, crit flag, weapon/ammo/equipment used. Useful for empirically cross-checking (not deriving) any damage-engine assumptions later, since the server-side formula itself is not exposed by any endpoint.",
    },
  },
  mu: {
    getById: {
      procedure: "mu.getById",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "captured",
      source: "majimawrks/warera-api-docs spec.md — real example captured.",
    },
  },
  search: {
    searchAnything: {
      procedure: "search.searchAnything",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source:
        "WarEraProjects/TRPC Responses.d.ts (SearchSearchAnythingResponse) — global search across users/mu/country/region/party, returns ID arrays only (userIds, muIds, ...). No captured example payload; needs live verification of match behavior (exact vs fuzzy username matching).",
    },
  },
  user: {
    getUserById: {
      procedure: "user.getUserById",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source:
        "WarEraProjects/TRPC Responses.d.ts (UserGetUserByIdResponse) — has the equipped-gear slot map (`equipment`) but a loosely-typed `skills` blob. Combine with user.getUserLite for the rich skill breakdown.",
    },
    getUserLite: {
      procedure: "user.getUserLite",
      method: "GET",
      auth: "none",
      cacheTier: "world-state",
      confidence: "typed-only",
      source:
        "WarEraProjects/TRPC Responses.d.ts (UserGetUserLiteResponse) — real, server-computed skill totals per stat (attack/armor/dodge/crit/production/...), each broken down into level/weapon/equipment/buff contributions. This is the single richest confirmed-field endpoint found for combat-relevant player data. No `equipment` slot map here, though — combine with user.getUserById.",
    },
  },
  inventory: {
    fetchCurrentEquipment: {
      procedure: "inventory.fetchCurrentEquipment",
      method: "GET",
      auth: "required",
      cacheTier: "world-state",
      confidence: "typed-only",
      source:
        "WarEraProjects/TRPC Responses.d.ts (InventoryFetchCurrentEquipmentResponse) — this is the logged-in player's own equipped gear. Requires the user's session token; WARERA COMMAND cannot call this without the user supplying their own auth, which is out of scope for Phase 1.",
    },
  },
} as const;

/** Flat list of every registered procedure, for smoke-testing / sanity checks. */
export const ALL_PROCEDURES: ProcedureDefinition[] = Object.values(PROCEDURES).flatMap((ns) =>
  Object.values(ns as Record<string, ProcedureDefinition>),
);
