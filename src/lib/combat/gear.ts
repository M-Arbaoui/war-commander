/**
 * Aggregates real, per-item combat bonuses from equipped gear. Everything
 * in this file is deterministic: `Gear.bonuses` comes straight from the
 * API's `skills` field on equipped items (see normalizers.ts), so summing
 * them requires no formula assumption. The assumption-bearing step (how a
 * summed bonus percentage actually changes a damage number) lives in
 * damage.ts, not here — this file only tells you what the gear *says*
 * about itself.
 */
import type { Gear } from "../warera/models";

/** Sums a specific stat (e.g. "armor", "attack", "criticalChance") across a set of equipped gear. */
export function sumGearStat(gear: Gear[], statName: string): number {
  return gear.reduce((sum, g) => sum + (g.bonuses[statName] ?? 0), 0);
}

/** Sums every distinct stat present across a set of equipped gear into one map. */
export function aggregateGearBonuses(gear: Gear[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of gear) {
    for (const [stat, value] of Object.entries(item.bonuses)) {
      totals[stat] = (totals[stat] ?? 0) + value;
    }
  }
  return totals;
}

/** Gear currently below GOOD condition, worth surfacing before a war/bounty. */
export function degradedGear(gear: Gear[]): Gear[] {
  return gear.filter((g) => g.condition === "LOW" || g.condition === "DAMAGED" || g.condition === "BROKEN");
}
