/**
 * "Best product for this setup" ranking, for the Company Builder page.
 * Composes recipes.ts + production.ts + profit.ts; introduces no new
 * assumptions of its own beyond what those modules already document.
 */
import type { Item } from "../warera/models";
import { resolveRecipeCost } from "./recipes";
import { calculateProductionRate, type ProductionBonusInputs } from "./production";
import { calculateProfitBreakdown, type ProfitBreakdown } from "./profit";

export interface RankedProduct {
  itemCode: string;
  status: "ranked" | "skipped";
  /** Present when status === "skipped" — e.g. no market price, no recipe, not producible. */
  skipReason?: string;
  productionRateConfidence?: "estimated";
  unitsPerHour?: number;
  profit?: ProfitBreakdown;
}

export interface RankProductsParams {
  items: Record<string, Item>;
  prices: Record<string, number>;
  workerCount: number;
  wagePerHour: number;
  hours: number;
  bonuses?: ProductionBonusInputs;
  maintenanceCostsPerPeriod?: number[];
  maintenancePeriodHours?: number;
  /** Restrict ranking to specific candidate items (e.g. only what's tradable). Defaults to every item with productionPoints. */
  candidateItemCodes?: string[];
}

/**
 * Ranks every candidate producible item by net profit per worker for the
 * given company setup. Items that can't be evaluated (missing price data,
 * no recipe, etc.) are returned with status "skipped" and an honest reason
 * — never silently dropped, so the UI can show why an item isn't ranked.
 */
export function rankProductsForSetup(params: RankProductsParams): RankedProduct[] {
  const candidates =
    params.candidateItemCodes ??
    Object.values(params.items)
      .filter((item) => item.productionPoints !== null && item.productionPoints > 0)
      .map((item) => item.code);

  const maintenanceCostsPerPeriod = params.maintenanceCostsPerPeriod ?? [];
  const maintenancePeriodHours = params.maintenancePeriodHours ?? 24;

  const results: RankedProduct[] = candidates.map((itemCode) => {
    const item = params.items[itemCode];
    if (!item) {
      return { itemCode, status: "skipped", skipReason: "Item not found in game config." };
    }

    const sellPrice = params.prices[itemCode];
    if (sellPrice === undefined) {
      return { itemCode, status: "skipped", skipReason: "No market price available for this item." };
    }

    const rateResult = calculateProductionRate({
      item,
      workerCount: params.workerCount,
      bonuses: params.bonuses,
    });
    if (rateResult.status !== "ok") {
      return { itemCode, status: "skipped", skipReason: rateResult.reason };
    }

    const costResult = resolveRecipeCost(itemCode, params.items, params.prices);
    if (costResult.status !== "ok") {
      return { itemCode, status: "skipped", skipReason: costResult.reason };
    }

    const unitsProduced = rateResult.data.unitsPerHour * params.hours;
    const materialCost = costResult.data.root.unitCost * unitsProduced;

    const profit = calculateProfitBreakdown({
      unitsProduced,
      sellPricePerUnit: sellPrice,
      materialCost,
      wagePerHour: params.wagePerHour,
      workerCount: params.workerCount,
      hours: params.hours,
      maintenanceCostsPerPeriod,
      maintenancePeriodHours,
    });

    return {
      itemCode,
      status: "ranked",
      productionRateConfidence: rateResult.data.confidence,
      unitsPerHour: rateResult.data.unitsPerHour,
      profit,
    };
  });

  return results.sort((a, b) => {
    const aProfit = a.profit?.profitPerWorker.status === "ok" ? a.profit.profitPerWorker.data : -Infinity;
    const bProfit = b.profit?.profitPerWorker.status === "ok" ? b.profit.profitPerWorker.data : -Infinity;
    return bProfit - aProfit;
  });
}
