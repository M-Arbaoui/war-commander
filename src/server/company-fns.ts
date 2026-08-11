import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as warera from "@/lib/warera/api";
import { resolveRecipeCost } from "@/lib/economy/recipes";
import { calculateProductionRate } from "@/lib/economy/production";
import type { Company, CompanyProductionBonus, DataResult, Region } from "@/lib/warera/models";

export interface CompanyLookupResult {
  status: "ok" | "unavailable" | "error";
  reason?: string;
  company?: Company;
  region?: Region | null;
  productionBonus?: CompanyProductionBonus | null;
  estimatedUnitsPerHour?: DataResult<number>;
  estimatedNetProfitPerHour?: DataResult<number>;
}

export const lookupCompany = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().min(1) }))
  .handler(async ({ data }): Promise<CompanyLookupResult> => {
    const companyResult = await warera.getCompanyById(data.companyId);
    if (companyResult.status !== "ok") {
      return { status: companyResult.status, reason: companyResult.reason };
    }

    const [gameConfigResult, pricesResult, regionsResult, bonusResult] = await Promise.all([
      warera.getGameConfig(),
      warera.getPrices(),
      warera.getRegions(),
      warera.getCompanyProductionBonus(data.companyId),
    ]);

    const company = companyResult.data;
    const region = regionsResult.status === "ok" ? regionsResult.data[company.regionId] ?? null : null;
    const productionBonus = bonusResult.status === "ok" ? bonusResult.data : null;

    let estimatedUnitsPerHour: DataResult<number> = { status: "unavailable", reason: "gameConfig unavailable." };
    let estimatedNetProfitPerHour: DataResult<number> = { status: "unavailable", reason: "gameConfig unavailable." };

    if (gameConfigResult.status === "ok") {
      const item = gameConfigResult.data.items[company.itemCode];
      if (item) {
        const rateResult = calculateProductionRate({
          item,
          workerCount: Math.max(company.workerCount, 1),
          bonuses: { companyProductionBonusPercent: productionBonus?.total ?? 0 },
        });
        estimatedUnitsPerHour =
          rateResult.status === "ok" ? { status: "ok", data: rateResult.data.unitsPerHour } : rateResult;

        if (rateResult.status === "ok" && pricesResult.status === "ok") {
          const sellPrice = pricesResult.data[company.itemCode]?.average;
          const prices: Record<string, number> = {};
          for (const [code, entry] of Object.entries(pricesResult.data)) prices[code] = entry.average;
          const costResult = resolveRecipeCost(company.itemCode, gameConfigResult.data.items, prices);
          if (sellPrice !== undefined && costResult.status === "ok") {
            const revenue = rateResult.data.unitsPerHour * sellPrice;
            const cost = rateResult.data.unitsPerHour * costResult.data.root.unitCost;
            estimatedNetProfitPerHour = { status: "ok", data: revenue - cost };
          } else {
            estimatedNetProfitPerHour = { status: "unavailable", reason: "Missing sell price or recipe cost." };
          }
        }
      } else {
        estimatedUnitsPerHour = { status: "unavailable", reason: `Item "${company.itemCode}" not in game config.` };
        estimatedNetProfitPerHour = estimatedUnitsPerHour;
      }
    }

    return {
      status: "ok",
      company,
      region,
      productionBonus,
      estimatedUnitsPerHour,
      estimatedNetProfitPerHour,
    };
  });

export interface CompanySearchResult {
  status: "ok" | "unavailable" | "error";
  reason?: string;
  companyIds: string[];
}

export const searchCompaniesByUser = createServerFn({ method: "GET" })
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }): Promise<CompanySearchResult> => {
    const result = await warera.getCompanyIds({ userId: data.userId, perPage: 25 });
    if (result.status !== "ok") return { status: result.status, reason: result.reason, companyIds: [] };
    return { status: "ok", companyIds: result.data.ids };
  });
