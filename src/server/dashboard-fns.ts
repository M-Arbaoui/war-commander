import { createServerFn } from "@tanstack/react-start";
import * as warera from "@/lib/warera/api";
import { resolveRecipeCost } from "@/lib/economy/recipes";
import { rankProductsForSetup, type RankedProduct } from "@/lib/economy/optimizer";
import { wareraCache } from "@/lib/warera/cache";

export interface MarketMover {
  itemCode: string;
  average: number;
  craftMarginPercent: number | null;
}

export interface DashboardData {
  apiStatus: "ok" | "unavailable" | "error";
  cacheEntryCount: number;
  topCraftOpportunities: MarketMover[];
  bestProductionOpportunities: RankedProduct[];
}

export const getDashboardData = createServerFn({ method: "GET" }).handler(async (): Promise<DashboardData> => {
  const [gameConfigResult, pricesResult] = await Promise.all([warera.getGameConfig(), warera.getPrices()]);

  if (gameConfigResult.status !== "ok" || pricesResult.status !== "ok") {
    return {
      apiStatus: gameConfigResult.status !== "ok" ? gameConfigResult.status : pricesResult.status,
      cacheEntryCount: wareraCache.getStats().size,
      topCraftOpportunities: [],
      bestProductionOpportunities: [],
    };
  }

  const items = gameConfigResult.data.items;
  const prices: Record<string, number> = {};
  for (const [code, entry] of Object.entries(pricesResult.data)) prices[code] = entry.average;

  const movers: MarketMover[] = [];
  for (const item of Object.values(items)) {
    if (!item.isTradable || prices[item.code] === undefined) continue;
    const costResult = resolveRecipeCost(item.code, items, prices);
    if (costResult.status !== "ok") continue;
    const average = prices[item.code]!;
    const marginPercent = average > 0 ? ((average - costResult.data.root.unitCost) / average) * 100 : null;
    movers.push({ itemCode: item.code, average, craftMarginPercent: marginPercent });
  }
  movers.sort((a, b) => (b.craftMarginPercent ?? -Infinity) - (a.craftMarginPercent ?? -Infinity));

  const ranked = rankProductsForSetup({
    items,
    prices,
    workerCount: 3,
    wagePerHour: 1,
    hours: 24,
  });

  return {
    apiStatus: "ok",
    cacheEntryCount: wareraCache.getStats().size,
    topCraftOpportunities: movers.slice(0, 6),
    bestProductionOpportunities: ranked.filter((r) => r.status === "ranked").slice(0, 6),
  };
});
