/**
 * TanStack Start server functions — the ONLY way browser/UI code is allowed
 * to reach WarEra data. Per the brief: "Do NOT call the WarEra API directly
 * from the browser." Every function here is a thin `createServerFn` wrapper
 * around `src/lib/warera/api.ts`; no business logic lives in this file.
 *
 * WHY THESE AREN'T UNIT-TESTED HERE: `createServerFn` handlers are executed
 * by the Start server runtime (request context, serialization boundary),
 * which isn't meaningfully exercised by calling `.handler` directly in a
 * plain Vitest/Node process — doing so would just re-test that JavaScript
 * calls functions. All of the actual logic (validation, caching,
 * normalization, error handling) already has full coverage in
 * `src/lib/warera/__tests__/`. This file is intentionally a thin,
 * behavior-free proxy layer, which is the pattern TanStack Start itself
 * recommends for keeping server functions testable-by-delegation.
 *
 * Route loaders / components (Phase 4+) should import from here, never from
 * `src/lib/warera/api.ts` directly, and never from `client.ts`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as warera from "@/lib/warera/api";

const forceRefreshValidator = z
  .object({ forceRefresh: z.boolean().optional() })
  .optional();

export const getGameConfig = createServerFn({ method: "GET" })
  .validator(forceRefreshValidator)
  .handler(async ({ data }) => warera.getGameConfig(data));

export const getPrices = createServerFn({ method: "GET" })
  .validator(forceRefreshValidator)
  .handler(async ({ data }) => warera.getPrices(data));

export const getMarketPriceDetail = createServerFn({ method: "GET" })
  .validator(z.object({ itemCode: z.string(), forceRefresh: z.boolean().optional() }))
  .handler(async ({ data }) => warera.getMarketPriceDetail(data.itemCode, { forceRefresh: data.forceRefresh }));

export const getTopOrders = createServerFn({ method: "GET" })
  .validator(z.object({ itemCode: z.string(), forceRefresh: z.boolean().optional() }))
  .handler(async ({ data }) => warera.getTopOrders(data.itemCode, { forceRefresh: data.forceRefresh }));

export const getCompanyById = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string(), forceRefresh: z.boolean().optional() }))
  .handler(async ({ data }) => warera.getCompanyById(data.companyId, { forceRefresh: data.forceRefresh }));

export const getCompanyIds = createServerFn({ method: "GET" })
  .validator(
    z
      .object({ userId: z.string().optional(), perPage: z.number().optional(), cursor: z.string().optional() })
      .optional(),
  )
  .handler(async ({ data }) => warera.getCompanyIds(data ?? {}));

export const getCompanyProductionBonus = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string() }))
  .handler(async ({ data }) => warera.getCompanyProductionBonus(data.companyId));

export const getWorkers = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().optional(), userId: z.string().optional() }))
  .handler(async ({ data }) => warera.getWorkers(data));

export const getWorkOffersPaginated = createServerFn({ method: "GET" })
  .validator(
    z.object({ limit: z.number().optional(), cursor: z.string().optional(), regionId: z.string().optional() }).optional(),
  )
  .handler(async ({ data }) => warera.getWorkOffersPaginated(data ?? {}));

export const getRegions = createServerFn({ method: "GET" })
  .validator(forceRefreshValidator)
  .handler(async ({ data }) => warera.getRegions(data));

export const getCountries = createServerFn({ method: "GET" })
  .validator(forceRefreshValidator)
  .handler(async ({ data }) => warera.getCountries(data));

export const getUpgradeInstance = createServerFn({ method: "GET" })
  .validator(
    z.object({
      upgradeType: z.string(),
      entityId: z.string(),
      entityKind: z.enum(["company", "region", "mu"]),
    }),
  )
  .handler(async ({ data }) => warera.getUpgradeInstance(data));

export const getLiveBattleData = createServerFn({ method: "GET" })
  .validator(z.object({ battleId: z.string() }))
  .handler(async ({ data }) => warera.getLiveBattleData(data.battleId));

export const getBattleRanking = createServerFn({ method: "GET" })
  .validator(
    z.object({
      battleId: z.string(),
      type: z.enum(["user", "country", "mu"]),
      side: z.enum(["attacker", "defender", "merged"]),
      dataType: z.enum(["damage", "points"]).optional(),
    }),
  )
  .handler(async ({ data }) => warera.getBattleRanking(data));

export const getLastHits = createServerFn({ method: "GET" })
  .validator(z.object({ roundId: z.string() }))
  .handler(async ({ data }) => warera.getLastHits(data.roundId));

export const getMilitaryUnit = createServerFn({ method: "GET" })
  .validator(z.object({ muId: z.string() }))
  .handler(async ({ data }) => warera.getMilitaryUnit(data.muId));

/**
 * NOT wired to a form/route yet (no auth flow in V1) — kept here so the
 * one call site that will eventually need a user-pasted session token is
 * already isolated behind the server boundary rather than left to be added
 * ad hoc later. The token is passed straight through per-request; nothing
 * about it is cached or persisted (see api.ts's doc comment on this function).
 */
export const getCurrentEquipment = createServerFn({ method: "POST" })
  .validator(z.object({ sessionToken: z.string() }))
  .handler(async ({ data }) => warera.getCurrentEquipment(data.sessionToken));
