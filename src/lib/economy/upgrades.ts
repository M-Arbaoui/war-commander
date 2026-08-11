/**
 * "Best next upgrade" ranking. Costs (steelCost/constructionPointsCost/
 * maintenanceCost) and stat values come straight from the real
 * gameConfig.upgradesConfig data. The additional profit an upgrade level
 * unlocks is necessarily computed via production.ts's estimated model
 * (since production rate itself is estimated) — this is surfaced honestly
 * via `confidence` rather than presented as a verified number.
 */
import type { Item, UpgradeDefinition } from "../warera/models";
import { unavailable, ok, type DataResult } from "../warera/models";
import { calculateProductionRate, type ProductionBonusInputs } from "./production";

export interface UpgradeLevelEvaluation {
  level: number;
  steelCost: number;
  steelCostAtMarketPrice: number | null;
  maintenanceCost: number | null;
  /** Additional units/hour this level provides vs the current level, per the estimated production model. */
  additionalUnitsPerHour: number;
  /** Additional net profit per hour this level provides, given a sell price. */
  additionalProfitPerHour: number;
  /** Hours of operation needed to recover the steel cost from additional profit alone. */
  paybackHours: DataResult<number>;
  confidence: "estimated";
}

export interface EvaluateUpgradeParams {
  upgrade: UpgradeDefinition;
  currentLevel: number;
  item: Item;
  sellPricePerUnit: number;
  steelMarketPrice?: number;
  workerCount: number;
  bonuses?: ProductionBonusInputs;
  /**
   * Name of the stat within each level's `stats` map that represents this
   * upgrade's production bonus (varies by upgrade type — verify against
   * real gameConfig data before trusting for a given upgrade type).
   */
  productionBonusStatName: string;
}

/**
 * Evaluates every level ABOVE the current one for a single upgrade type,
 * ranked by shortest payback first. Levels the caller can't evaluate
 * (e.g. missing the expected stat) are still returned, with paybackHours
 * as `unavailable`, rather than silently dropped.
 */
export function evaluateUpgradeLevels(params: EvaluateUpgradeParams): UpgradeLevelEvaluation[] {
  const currentLevelDef = params.upgrade.levels.find((l) => l.level === params.currentLevel);
  const currentBonus = currentLevelDef?.stats[params.productionBonusStatName] ?? 0;

  const candidateLevels = params.upgrade.levels.filter((l) => l.level > params.currentLevel);

  const evaluations = candidateLevels.map((levelDef): UpgradeLevelEvaluation => {
    const levelBonus = levelDef.stats[params.productionBonusStatName];
    const steelCostInMoney =
      params.steelMarketPrice !== undefined ? levelDef.steelCost * params.steelMarketPrice : null;

    if (levelBonus === undefined) {
      return {
        level: levelDef.level,
        steelCost: levelDef.steelCost,
        steelCostAtMarketPrice: steelCostInMoney,
        maintenanceCost: levelDef.maintenanceCost,
        additionalUnitsPerHour: 0,
        additionalProfitPerHour: 0,
        confidence: "estimated",
        paybackHours: unavailable(
          `Level ${levelDef.level} of this upgrade has no "${params.productionBonusStatName}" stat — cannot estimate its production impact.`,
        ),
      };
    }

    const currentRate = calculateProductionRate({
      item: params.item,
      workerCount: params.workerCount,
      bonuses: { ...params.bonuses, upgradeBonusPercent: (params.bonuses?.upgradeBonusPercent ?? 0) + currentBonus },
    });
    const newRate = calculateProductionRate({
      item: params.item,
      workerCount: params.workerCount,
      bonuses: { ...params.bonuses, upgradeBonusPercent: (params.bonuses?.upgradeBonusPercent ?? 0) + levelBonus },
    });

    if (currentRate.status !== "ok" || newRate.status !== "ok") {
      return {
        level: levelDef.level,
        steelCost: levelDef.steelCost,
        steelCostAtMarketPrice: steelCostInMoney,
        maintenanceCost: levelDef.maintenanceCost,
        additionalUnitsPerHour: 0,
        additionalProfitPerHour: 0,
        confidence: "estimated",
        paybackHours: unavailable("Could not compute a production rate for this item to estimate impact."),
      };
    }

    const additionalUnitsPerHour = newRate.data.unitsPerHour - currentRate.data.unitsPerHour;
    const additionalProfitPerHour = additionalUnitsPerHour * params.sellPricePerUnit;

    let paybackHours: DataResult<number>;
    if (steelCostInMoney === null) {
      paybackHours = unavailable("No steel market price provided — cannot convert steel cost into a money payback.");
    } else if (additionalProfitPerHour <= 0) {
      paybackHours = unavailable(
        "This level provides no additional profit per hour, so payback is undefined (never recovers).",
      );
    } else {
      paybackHours = ok(steelCostInMoney / additionalProfitPerHour);
    }

    return {
      level: levelDef.level,
      steelCost: levelDef.steelCost,
      steelCostAtMarketPrice: steelCostInMoney,
      maintenanceCost: levelDef.maintenanceCost,
      additionalUnitsPerHour,
      additionalProfitPerHour,
      confidence: "estimated",
      paybackHours,
    };
  });

  return evaluations.sort((a, b) => {
    const aHours = a.paybackHours.status === "ok" ? a.paybackHours.data : Infinity;
    const bHours = b.paybackHours.status === "ok" ? b.paybackHours.data : Infinity;
    return aHours - bHours;
  });
}
