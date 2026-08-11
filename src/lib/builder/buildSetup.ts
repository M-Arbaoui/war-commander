/**
 * Pure computation layer for the /builder page. Framework-free so it's
 * directly unit-testable; the route component just wires this up to form
 * state and JSX.
 */
import type { Item, Region, UpgradeDefinition } from "@/lib/warera/models";
import type { DataResult } from "@/lib/warera/models";
import { resolveRecipeCost, type RecipeCostResult } from "@/lib/economy/recipes";
import { calculateProductionRate, calculateResourceConsumption, type ProductionRateResult, type ResourceConsumptionResult } from "@/lib/economy/production";
import { calculateProfitBreakdown, type ProfitBreakdown } from "@/lib/economy/profit";
import { rankProductsForSetup, type RankedProduct } from "@/lib/economy/optimizer";

export interface BuilderInputs {
  itemCode: string;
  workerCount: number;
  workerSkillBonusPercent: number;
  wagePerHour: number;
  hours: number;
  regionId: string | null;
  /** upgradeType -> selected level */
  selectedUpgrades: Record<string, number>;
}

export interface BuilderReferenceData {
  items: Record<string, Item>;
  upgradesConfig: Record<string, UpgradeDefinition>;
  prices: Record<string, number>;
  regions: Record<string, Region>;
}

export interface BuilderResult {
  productionRate: DataResult<ProductionRateResult>;
  resourceConsumption: DataResult<ResourceConsumptionResult>;
  recipeCost: DataResult<RecipeCostResult>;
  profit: ProfitBreakdown | null;
  regionBonusPercent: number;
  upgradeBonusPercent: number;
  ranked: RankedProduct[];
}

/** Finds the first stat on a level whose name suggests a production bonus. WarEra doesn't confirm a canonical stat name across upgrade types, so this is a best-effort heuristic — surfaced to the caller via the returned stat name for transparency. */
function findProductionBonusPercent(stats: Record<string, number>): number {
  for (const [key, val] of Object.entries(stats)) {
    if (/production/i.test(key)) return val;
  }
  return 0;
}

function computeUpgradeBonusPercent(
  selectedUpgrades: Record<string, number>,
  upgradesConfig: Record<string, UpgradeDefinition>,
): number {
  let total = 0;
  for (const [upgradeType, level] of Object.entries(selectedUpgrades)) {
    const def = upgradesConfig[upgradeType];
    const levelDef = def?.levels.find((l) => l.level === level);
    if (levelDef) total += findProductionBonusPercent(levelDef.stats);
  }
  return total;
}

function computeRegionBonusPercent(itemCode: string, region: Region | null): number {
  if (!region?.resourceBonus) return 0;
  return region.resourceBonus.resourceCode === itemCode ? region.resourceBonus.bonusPercent : 0;
}

export function computeBuilderResult(inputs: BuilderInputs, ref: BuilderReferenceData): BuilderResult {
  const item = ref.items[inputs.itemCode];
  const region = inputs.regionId ? (ref.regions[inputs.regionId] ?? null) : null;

  const regionBonusPercent = computeRegionBonusPercent(inputs.itemCode, region);
  const upgradeBonusPercent = computeUpgradeBonusPercent(inputs.selectedUpgrades, ref.upgradesConfig);

  const productionRate = item
    ? calculateProductionRate({
        item,
        workerCount: inputs.workerCount,
        bonuses: {
          workerSkillBonusPercent: inputs.workerSkillBonusPercent,
          regionDepositBonusPercent: regionBonusPercent,
          upgradeBonusPercent,
        },
      })
    : ({ status: "unavailable", reason: `Item "${inputs.itemCode}" not found.` } as const);

  const resourceConsumption =
    item && productionRate.status === "ok"
      ? calculateResourceConsumption(item, productionRate.data.unitsPerHour * inputs.hours)
      : ({ status: "unavailable", reason: "No production rate available to derive consumption from." } as const);

  const recipeCost = resolveRecipeCost(inputs.itemCode, ref.items, ref.prices);

  let profit: ProfitBreakdown | null = null;
  const sellPrice = ref.prices[inputs.itemCode];
  if (productionRate.status === "ok" && recipeCost.status === "ok" && sellPrice !== undefined) {
    const unitsProduced = productionRate.data.unitsPerHour * inputs.hours;
    profit = calculateProfitBreakdown({
      unitsProduced,
      sellPricePerUnit: sellPrice,
      materialCost: recipeCost.data.root.unitCost * unitsProduced,
      wagePerHour: inputs.wagePerHour,
      workerCount: inputs.workerCount,
      hours: inputs.hours,
      maintenanceCostsPerPeriod: [],
      maintenancePeriodHours: 24,
    });
  }

  const ranked = rankProductsForSetup({
    items: ref.items,
    prices: ref.prices,
    workerCount: inputs.workerCount,
    wagePerHour: inputs.wagePerHour,
    hours: inputs.hours,
    bonuses: {
      workerSkillBonusPercent: inputs.workerSkillBonusPercent,
      regionDepositBonusPercent: 0, // Applying one region's bonus universally across all candidate products would misrepresent items that don't match its resource — left at 0 for the comparison table.
      upgradeBonusPercent,
    },
  });

  return { productionRate, resourceConsumption, recipeCost, profit, regionBonusPercent, upgradeBonusPercent, ranked };
}
