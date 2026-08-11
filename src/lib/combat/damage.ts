/**
 * Damage engine.
 *
 * HONESTY NOTE — read before trusting any number this file produces:
 * Phase 1 research (see docs/API_NOTES.md) found no endpoint, in either
 * public source project examined, that exposes WarEra's actual damage
 * formula — how a weapon's `attack` stat, gear bonuses, skills, war bonus,
 * and RNG (crit chance, dodge, miss) combine into a final per-hit damage
 * number. `round.getLastHits` shows real *observed outputs*; nothing shows
 * the formula that produced them.
 *
 * So, exactly like production.ts's tick-duration assumption, this file
 * treats "base damage = weapon attack stat" and "every bonus stacks
 * additively as a single percentage multiplier" as a documented, stated
 * MODEL — not verified game data. Every result carries
 * `confidence: "estimated"` and an `assumptions` list. This is a starting
 * point for calibration against a real war/bounty's observed outcome, not
 * a ground-truth calculator.
 */
import { ok, unavailable, type DataResult } from "../warera/models";

export const DAMAGE_MODEL_DISCLAIMER =
  "Damage is an ESTIMATE. WarEra does not publicly document how attack/gear/skill/war bonuses combine, or how " +
  "crit chance and dodge affect a hit. This model uses the weapon's attack stat as base damage and stacks all " +
  "bonus percentages additively. Calibrate against a real observed hit before trusting this for a decision.";

export interface DamageBonusInputs {
  skillBonusPercent?: number;
  gearBonusPercent?: number;
  weaponBonusPercent?: number;
  warBonusPercent?: number;
  otherModifiersPercent?: number;
}

export interface DamageBreakdownEntry {
  label: string;
  runningTotal: number;
}

export interface DamageResult {
  totalDamage: number;
  breakdown: DamageBreakdownEntry[];
  confidence: "estimated";
  assumptions: string[];
}

export function calculateBaseDamage(weaponAttack: number, ammoMultiplier = 1): DataResult<number> {
  if (weaponAttack <= 0) return unavailable("Weapon attack stat must be greater than 0.");
  return ok(weaponAttack * ammoMultiplier);
}

function applyPercent(current: number, percent: number | undefined): number {
  return current * (1 + (percent ?? 0) / 100);
}

export function calculateExpectedDamage(params: {
  weaponAttack: number;
  ammoMultiplier?: number;
  bonuses?: DamageBonusInputs;
}): DataResult<DamageResult> {
  const baseResult = calculateBaseDamage(params.weaponAttack, params.ammoMultiplier);
  if (baseResult.status !== "ok") return baseResult;

  const breakdown: DamageBreakdownEntry[] = [{ label: "Base Damage", runningTotal: baseResult.data }];
  let running = baseResult.data;

  const b = params.bonuses ?? {};
  running = applyPercent(running, b.skillBonusPercent);
  breakdown.push({ label: "Skill Bonus", runningTotal: running });

  running = applyPercent(running, b.gearBonusPercent);
  breakdown.push({ label: "Gear Bonus", runningTotal: running });

  running = applyPercent(running, b.weaponBonusPercent);
  breakdown.push({ label: "Weapon Bonus", runningTotal: running });

  running = applyPercent(running, b.warBonusPercent);
  breakdown.push({ label: "War Bonus", runningTotal: running });

  running = applyPercent(running, b.otherModifiersPercent);
  breakdown.push({ label: "Other Modifiers", runningTotal: running });

  return ok({
    totalDamage: running,
    breakdown,
    confidence: "estimated",
    assumptions: [
      DAMAGE_MODEL_DISCLAIMER,
      "Bonuses combined additively into a single multiplier per step, applied in this fixed order.",
    ],
  });
}
