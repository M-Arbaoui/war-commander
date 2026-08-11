/**
 * Production rate & resource consumption.
 *
 * IMPORTANT HONESTY NOTE, read before using calculateProductionRate():
 * WarEra does not publicly document (in gameConfig or anywhere else found
 * during Phase 1 research) the exact tick duration or how skill/upgrade/
 * region/deposit bonus percentages stack together into a final units/hour
 * number. `Item.productionPoints` and the various bonus percentages ARE
 * real API fields — but the formula that combines them is not.
 *
 * So this file draws a hard line, consistent with the brief's "prefer DATA
 * UNAVAILABLE over fake numbers" rule:
 *
 *   - calculateResourceConsumption() is 100% deterministic. Resource ratios
 *     come directly from the real recipe graph; no time assumption needed.
 *   - calculateProductionRate() IS a model with a documented, overridable
 *     assumption (tick duration + additive bonus stacking). Every result it
 *     returns is tagged `confidence: "estimated"` and lists its assumptions
 *     explicitly, so callers (and the UI, later) can visibly flag it rather
 *     than presenting it as verified game data.
 *   - calibrateTickHoursFromObservedRate() lets a user replace the
 *     assumption with ground truth from their own real company's observed
 *     output — turning "we guessed" into "you told us, from real data."
 */

import type { Item } from "../warera/models";
import { ok, unavailable, type DataResult } from "../warera/models";

export const PRODUCTION_MODEL_DISCLAIMER =
  "Production rate is an ESTIMATE. WarEra does not publicly document tick duration or bonus-stacking rules; " +
  "this model assumes bonuses stack additively and applies a configurable tick-hours constant. " +
  "Calibrate it against your own company's observed output with calibrateTickHoursFromObservedRate().";

/** Default assumption: treat productionPoints as a per-tick figure, one tick per hour, until calibrated otherwise. */
export const DEFAULT_TICK_HOURS = 1;

export interface ProductionBonusInputs {
  /** Sum of relevant company production-bonus percentages (real field: company.getProductionBonus.total). */
  companyProductionBonusPercent?: number;
  /** Real field: region deposit bonusPercent, when this item's resource matches the region's deposit. */
  regionDepositBonusPercent?: number;
  /** Real field: worker's production skill level value (gameConfig.skills.production levels). */
  workerSkillBonusPercent?: number;
  /** Real field: gameConfig.worker.fidelityProductionBonusPercent × (current fidelity / maxFidelity), if tracked. */
  workerFidelityBonusPercent?: number;
  /** Real field: upgradesConfig[...].levels[n].stats.productionBonusPercent (field name varies by upgrade type). */
  upgradeBonusPercent?: number;
}

export interface ProductionRateResult {
  unitsPerHour: number;
  unitsPerDay: number;
  confidence: "estimated";
  assumptions: string[];
  appliedBonusMultiplier: number;
}

function sumBonusPercents(bonuses: ProductionBonusInputs): number {
  return (
    (bonuses.companyProductionBonusPercent ?? 0) +
    (bonuses.regionDepositBonusPercent ?? 0) +
    (bonuses.workerSkillBonusPercent ?? 0) +
    (bonuses.workerFidelityBonusPercent ?? 0) +
    (bonuses.upgradeBonusPercent ?? 0)
  );
}

export function calculateProductionRate(params: {
  item: Item;
  workerCount: number;
  bonuses?: ProductionBonusInputs;
  tickHours?: number;
}): DataResult<ProductionRateResult> {
  if (params.item.productionPoints === null || params.item.productionPoints <= 0) {
    return unavailable(
      `Item "${params.item.code}" has no known productionPoints — it may not be a producible item, or gameConfig hasn't been fetched.`,
    );
  }
  if (params.workerCount <= 0) {
    return unavailable("workerCount must be greater than 0.");
  }

  const tickHours = params.tickHours ?? DEFAULT_TICK_HOURS;
  const bonusPercent = sumBonusPercents(params.bonuses ?? {});
  const bonusMultiplier = 1 + bonusPercent / 100;

  const unitsPerTickPerWorker = params.item.productionPoints * bonusMultiplier;
  const unitsPerHour = (unitsPerTickPerWorker * params.workerCount) / tickHours;

  return ok({
    unitsPerHour,
    unitsPerDay: unitsPerHour * 24,
    confidence: "estimated",
    appliedBonusMultiplier: bonusMultiplier,
    assumptions: [
      PRODUCTION_MODEL_DISCLAIMER,
      `Assumed tick duration: ${tickHours}h (override with the tickHours param once you know your game's real cadence).`,
      `Bonuses combined additively: +${bonusPercent}% total, applied as a single ×${bonusMultiplier.toFixed(4)} multiplier.`,
    ],
  });
}

/**
 * Back-solves the tick-hours assumption from a real, observed units/hour
 * figure (e.g. read directly off the user's own company in-game). This is
 * the recommended way to use calculateProductionRate for anything
 * profit-critical — replace the assumption with the user's own ground truth.
 */
export function calibrateTickHoursFromObservedRate(params: {
  item: Item;
  workerCount: number;
  bonuses?: ProductionBonusInputs;
  observedUnitsPerHour: number;
}): DataResult<{ calibratedTickHours: number }> {
  if (params.item.productionPoints === null || params.item.productionPoints <= 0) {
    return unavailable(`Item "${params.item.code}" has no known productionPoints.`);
  }
  if (params.observedUnitsPerHour <= 0) {
    return unavailable("observedUnitsPerHour must be greater than 0.");
  }
  const bonusMultiplier = 1 + sumBonusPercents(params.bonuses ?? {}) / 100;
  const unitsPerTickPerWorker = params.item.productionPoints * bonusMultiplier;
  const calibratedTickHours = (unitsPerTickPerWorker * params.workerCount) / params.observedUnitsPerHour;
  return ok({ calibratedTickHours });
}

export interface ResourceConsumptionResult {
  /** itemCode -> quantity consumed, for the requested number of units produced. */
  perUnitProduced: Record<string, number>;
}

/**
 * Deterministic — no time/tick assumption needed. Given the real recipe
 * ratios, returns exactly how much of each input is consumed to produce
 * `unitsProduced` units of `item`. Returns unavailable only if the item
 * genuinely has no recipe on file (which is correct for raw materials —
 * that's "0 known inputs", reported as unavailable rather than a
 * fabricated empty breakdown, since "raw material" and "recipe unknown"
 * are different situations upstream callers may want to distinguish).
 */
export function calculateResourceConsumption(
  item: Item,
  unitsProduced: number,
): DataResult<ResourceConsumptionResult> {
  if (!item.recipe) {
    return unavailable(`Item "${item.code}" has no recipe on file (it may be a raw material with no inputs).`);
  }
  if (item.productionPoints === null || item.productionPoints <= 0) {
    return unavailable(`Item "${item.code}" has a recipe but no valid productionPoints.`);
  }
  const perUnitProduced: Record<string, number> = {};
  for (const [inputCode, qtyPerTick] of Object.entries(item.recipe.inputs)) {
    perUnitProduced[inputCode] = (qtyPerTick / item.productionPoints) * unitsProduced;
  }
  return ok({ perUnitProduced });
}
