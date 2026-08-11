/**
 * One-call reference bundle for pages that need the game's static config +
 * live prices + region list together (Company Builder, Upgrade Planner,
 * Combat Simulator). Each underlying warera.* call is already cached at
 * its own tier (see procedures.ts), so calling this from multiple routes
 * doesn't re-hit the upstream API beyond the first cache miss.
 */
import { createServerFn } from "@tanstack/react-start";
import * as warera from "@/lib/warera/api";
import type { Country, Item, Region, UpgradeDefinition } from "@/lib/warera/models";

export interface ReferenceData {
  status: "ok" | "unavailable" | "error";
  items: Record<string, Item>;
  upgradesConfig: Record<string, UpgradeDefinition>;
  battle: {
    allianceDamagesBonusPercent: number;
    enemyDamagesBonusPercent: number;
    patrioticBonusPercent: number;
    countryOrderBonusPercent: number;
    muOrderBonusPercent: number;
  } | null;
  prices: Record<string, number>;
  regions: Record<string, Region>;
  countries: Country[];
}

export const getReferenceData = createServerFn({ method: "GET" }).handler(async (): Promise<ReferenceData> => {
  const [gameConfigResult, pricesResult, regionsResult, countriesResult] = await Promise.all([
    warera.getGameConfig(),
    warera.getPrices(),
    warera.getRegions(),
    warera.getCountries(),
  ]);

  if (gameConfigResult.status !== "ok" || pricesResult.status !== "ok") {
    return {
      status: gameConfigResult.status !== "ok" ? gameConfigResult.status : pricesResult.status,
      items: {},
      upgradesConfig: {},
      battle: null,
      prices: {},
      regions: {},
      countries: [],
    };
  }

  const prices: Record<string, number> = {};
  for (const [code, entry] of Object.entries(pricesResult.data)) {
    prices[code] = entry.average;
  }

  return {
    status: "ok",
    items: gameConfigResult.data.items,
    upgradesConfig: gameConfigResult.data.upgradesConfig,
    battle: {
      allianceDamagesBonusPercent: gameConfigResult.data.battle.allianceDamagesBonusPercent,
      enemyDamagesBonusPercent: gameConfigResult.data.battle.enemyDamagesBonusPercent,
      patrioticBonusPercent: gameConfigResult.data.battle.patrioticBonusPercent,
      countryOrderBonusPercent: gameConfigResult.data.battle.countryOrderBonusPercent,
      muOrderBonusPercent: gameConfigResult.data.battle.muOrderBonusPercent,
    },
    prices,
    regions: regionsResult.status === "ok" ? regionsResult.data : {},
    countries: countriesResult.status === "ok" ? countriesResult.data : [],
  };
});
