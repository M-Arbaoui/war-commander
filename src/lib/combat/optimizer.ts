/**
 * Loadout optimizer for the war/bounty simulator. Composes gear.ts's
 * deterministic bonus aggregation with damage.ts's estimated damage model
 * and war.ts's deterministic cost/reward arithmetic — introduces no new
 * assumptions of its own.
 */
import type { Gear } from "../warera/models";
import { aggregateGearBonuses } from "./gear";
import { calculateExpectedDamage, type DamageBonusInputs, type DamageResult } from "./damage";
import { calculateAmmoConsumption, calculateNetReward, type WarEconomicsResult } from "./war";

export interface LoadoutCandidate {
  label: string;
  weapon: Gear;
  otherGear: Gear[];
  ammoMarketPrice: number;
  ammoUnitsPerHit?: number;
}

export interface LoadoutEvaluationContext {
  skillBonusPercent?: number;
  warBonusPercent?: number;
  otherModifiersPercent?: number;
  hitCount: number;
  reward: number;
  otherCosts?: number;
}

export interface LoadoutEvaluation {
  label: string;
  status: "evaluated" | "skipped";
  skipReason?: string;
  damage?: DamageResult;
  economics?: WarEconomicsResult;
  efficiency?: number;
}

function evaluateOne(candidate: LoadoutCandidate, ctx: LoadoutEvaluationContext): LoadoutEvaluation {
  const weaponAttack = candidate.weapon.bonuses.attack;
  if (weaponAttack === undefined) {
    return { label: candidate.label, status: "skipped", skipReason: "Weapon has no known attack stat." };
  }

  const gearBonuses = aggregateGearBonuses(candidate.otherGear);
  const bonuses: DamageBonusInputs = {
    skillBonusPercent: ctx.skillBonusPercent,
    gearBonusPercent: gearBonuses.armor ?? 0,
    warBonusPercent: ctx.warBonusPercent,
    otherModifiersPercent: ctx.otherModifiersPercent,
  };

  const damageResult = calculateExpectedDamage({ weaponAttack, bonuses });
  if (damageResult.status !== "ok") {
    return { label: candidate.label, status: "skipped", skipReason: damageResult.reason };
  }

  const ammoResult = calculateAmmoConsumption(ctx.hitCount, candidate.ammoMarketPrice, candidate.ammoUnitsPerHit);
  if (ammoResult.status !== "ok") {
    return { label: candidate.label, status: "skipped", skipReason: ammoResult.reason };
  }

  const economics = calculateNetReward(ctx.reward, ammoResult.data.ammoCost, ctx.otherCosts ?? 0);

  return {
    label: candidate.label,
    status: "evaluated",
    damage: damageResult.data,
    economics,
    efficiency: ammoResult.data.ammoCost > 0 ? economics.netReward / ammoResult.data.ammoCost : economics.netReward,
  };
}

/**
 * Ranks candidate loadouts by: 1) highest damage, 2) highest net reward,
 * 3) best efficiency (net reward per unit ammo cost) — matching the
 * brief's stated priority order. Skipped candidates (missing data) sort
 * last and always show why, never silently vanish from the list.
 */
export function rankLoadouts(
  candidates: LoadoutCandidate[],
  context: LoadoutEvaluationContext,
): LoadoutEvaluation[] {
  const evaluations = candidates.map((c) => evaluateOne(c, context));
  return evaluations.sort((a, b) => {
    if (a.status !== b.status) return a.status === "evaluated" ? -1 : 1;
    if (a.status === "skipped") return 0;
    const damageDiff = (b.damage?.totalDamage ?? 0) - (a.damage?.totalDamage ?? 0);
    if (damageDiff !== 0) return damageDiff;
    const rewardDiff = (b.economics?.netReward ?? 0) - (a.economics?.netReward ?? 0);
    if (rewardDiff !== 0) return rewardDiff;
    return (b.efficiency ?? 0) - (a.efficiency ?? 0);
  });
}
