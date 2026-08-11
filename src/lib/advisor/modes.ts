/**
 * The 3 advisor modes. None of these are new calculation engines — they're
 * presets that decide which existing engine output to show and how to rank
 * it, per the brief: Economic = company profit only, War = combat
 * sustainability only, Eco-War = both blended.
 */
import type { Company, Item } from "@/lib/warera/models";
import { rankProductsForSetup, type RankedProduct } from "@/lib/economy/optimizer";

export type AdvisorMode = "economic" | "war" | "eco-war";

export interface AdvisorModeConfig {
  showCompanyAdvice: boolean;
  showGearAdvice: boolean;
  showBoxFlips: boolean;
}

export const MODE_CONFIG: Record<AdvisorMode, AdvisorModeConfig> = {
  economic: { showCompanyAdvice: true, showGearAdvice: false, showBoxFlips: true },
  war: { showCompanyAdvice: false, showGearAdvice: true, showBoxFlips: true },
  "eco-war": { showCompanyAdvice: true, showGearAdvice: true, showBoxFlips: true },
};

export function rankOwnCompanies(
  companies: Company[],
  items: Record<string, Item>,
  prices: Record<string, number>,
): RankedProduct[] {
  if (companies.length === 0) return [];
  const codes = Array.from(new Set(companies.map((c) => c.itemCode)));
  return rankProductsForSetup({
    items,
    prices,
    workerCount: 1,
    wagePerHour: 0,
    hours: 24,
    candidateItemCodes: codes,
  });
}
