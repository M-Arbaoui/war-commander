/**
 * Server-only aggregation for the /market page. Deliberately NOT a thin
 * pass-through like warera-fns.ts — this does real work server-side
 * (gameConfig + prices + a fan-out of order books + recipe-cost resolution)
 * so the browser gets one payload instead of orchestrating dozens of
 * round-trips itself.
 *
 * KNOWN SCALING NOTE: fetches tradingOrder.getTopOrders for every tradable
 * item with a known price, in bounded concurrency batches. This is fine for
 * WarEra's item catalog size (on the order of ~100 items per the captured
 * gameConfig data) but would need to move to on-demand/paginated fetching
 * if that catalog grows an order of magnitude — flagged here rather than
 * discovered later.
 */
import { createServerFn } from "@tanstack/react-start";
import * as warera from "@/lib/warera/api";
import { resolveRecipeCost } from "@/lib/economy/recipes";
import type { DataResult, Item, ItemCategory } from "@/lib/warera/models";
import { errored, ok, unavailable } from "@/lib/warera/models";

export interface MarketRow {
  itemCode: string;
  category: ItemCategory;
  rarity: string | null;
  iconUrl: string | null;
  average: number;
  bestBuy: number | null;
  bestSell: number | null;
  spread: number | null;
  craftCost: DataResult<number>;
  craftMargin: DataResult<number>;
  /** Profit realized per unit produced (each unit consumes one "production point" of tick capacity in our model — see production.ts). */
  profitPerProductionPoint: DataResult<number>;
  verdict: "CRAFT" | "BUY" | "NEUTRAL" | "UNKNOWN";
}

export interface MarketOverviewResult {
  rows: MarketRow[];
  /** Item codes we couldn't build a row for at all (no price), so the UI can say so rather than just omitting them silently. */
  skippedNoPrice: string[];
  gameConfigStatus: "ok" | "unavailable" | "error";
  pricesStatus: "ok" | "unavailable" | "error";
}

const VERDICT_THRESHOLD = 0.03; // 3% band around parity counts as NEUTRAL.

async function runBatched<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

function buildRow(
  item: Item,
  average: number,
  items: Record<string, Item>,
  prices: Record<string, number>,
  orderBook: { bestBuy: number | null; bestSell: number | null; spread: number | null },
): MarketRow {
  const costResult = resolveRecipeCost(item.code, items, prices);
  const craftCost: DataResult<number> = costResult.status === "ok" ? ok(costResult.data.root.unitCost) : costResult;

  let craftMargin: DataResult<number>;
  let profitPerProductionPoint: DataResult<number>;
  let verdict: MarketRow["verdict"] = "UNKNOWN";

  if (craftCost.status === "ok") {
    if (average <= 0) {
      craftMargin = unavailable("Average market price is 0 — margin is undefined.");
      profitPerProductionPoint = unavailable("Average market price is 0.");
    } else {
      const margin = (average - craftCost.data) / average;
      craftMargin = ok(margin);
      profitPerProductionPoint = ok(average - craftCost.data);
      verdict = margin > VERDICT_THRESHOLD ? "CRAFT" : margin < -VERDICT_THRESHOLD ? "BUY" : "NEUTRAL";
    }
  } else {
    craftMargin = craftCost.status === "unavailable" ? unavailable(craftCost.reason) : errored(craftCost.reason);
    profitPerProductionPoint = craftMargin;
  }

  return {
    itemCode: item.code,
    category: item.category,
    rarity: item.rarity,
    iconUrl: item.iconUrl,
    average,
    bestBuy: orderBook.bestBuy,
    bestSell: orderBook.bestSell,
    spread: orderBook.spread,
    craftCost,
    craftMargin,
    profitPerProductionPoint,
    verdict,
  };
}

export const getMarketOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketOverviewResult> => {
    const [gameConfigResult, pricesResult] = await Promise.all([warera.getGameConfig(), warera.getPrices()]);

    if (gameConfigResult.status !== "ok" || pricesResult.status !== "ok") {
      return {
        rows: [],
        skippedNoPrice: [],
        gameConfigStatus: gameConfigResult.status,
        pricesStatus: pricesResult.status,
      };
    }

    const items = gameConfigResult.data.items;
    const prices: Record<string, number> = {};
    for (const [code, entry] of Object.entries(pricesResult.data)) {
      prices[code] = entry.average;
    }

    const tradableWithPrice = Object.values(items).filter((item) => item.isTradable && prices[item.code] !== undefined);
    const skippedNoPrice = Object.values(items)
      .filter((item) => item.isTradable && prices[item.code] === undefined)
      .map((item) => item.code);

    const rows = await runBatched(tradableWithPrice, 10, async (item) => {
      const ordersResult = await warera.getTopOrders(item.code);
      const orderBook =
        ordersResult.status === "ok"
          ? computeBestBuySell(ordersResult.data.buyOrders, ordersResult.data.sellOrders)
          : { bestBuy: null, bestSell: null, spread: null };
      return buildRow(item, prices[item.code]!, items, prices, orderBook);
    });

    return { rows, skippedNoPrice, gameConfigStatus: "ok", pricesStatus: "ok" };
  },
);

function computeBestBuySell(
  buyOrders: Array<{ price: number }>,
  sellOrders: Array<{ price: number }>,
): { bestBuy: number | null; bestSell: number | null; spread: number | null } {
  const bestBuy = buyOrders.length ? Math.max(...buyOrders.map((o) => o.price)) : null;
  const bestSell = sellOrders.length ? Math.min(...sellOrders.map((o) => o.price)) : null;
  return { bestBuy, bestSell, spread: bestBuy !== null && bestSell !== null ? bestSell - bestBuy : null };
}
