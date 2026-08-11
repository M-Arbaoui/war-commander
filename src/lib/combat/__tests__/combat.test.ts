import { describe, expect, it } from "vitest";
import { sumGearStat, aggregateGearBonuses, degradedGear } from "../gear";
import { calculateBaseDamage, calculateExpectedDamage } from "../damage";
import { calculateAmmoConsumption, calculateNetReward, calculateWarsToRecoverCost } from "../war";
import { rankLoadouts, type LoadoutCandidate } from "../optimizer";
import type { Gear } from "../../warera/models";

function gear(overrides: Partial<Gear> & { id: string }): Gear {
  return {
    code: overrides.id,
    slot: "chest",
    rarity: null,
    state: 100,
    maxState: 100,
    condition: "GOOD",
    bonuses: {},
    equipped: true,
    ...overrides,
  };
}

describe("gear.ts", () => {
  const helmet = gear({ id: "helmet1", slot: "helmet", bonuses: { armor: 5 } });
  const chest = gear({ id: "chest1", slot: "chest", bonuses: { armor: 8, dodge: 2 } });
  const damagedBoots = gear({ id: "boots1", slot: "boots", condition: "DAMAGED", bonuses: { armor: 1 } });

  it("sumGearStat sums one stat across items, defaulting missing stats to 0", () => {
    expect(sumGearStat([helmet, chest], "armor")).toBe(13);
    expect(sumGearStat([helmet, chest], "dodge")).toBe(2);
    expect(sumGearStat([helmet], "criticalChance")).toBe(0);
  });

  it("aggregateGearBonuses sums every distinct stat present", () => {
    expect(aggregateGearBonuses([helmet, chest])).toEqual({ armor: 13, dodge: 2 });
  });

  it("degradedGear flags anything below GOOD condition", () => {
    expect(degradedGear([helmet, chest, damagedBoots])).toEqual([damagedBoots]);
  });
});

describe("damage.ts", () => {
  it("calculateBaseDamage returns unavailable for non-positive attack", () => {
    expect(calculateBaseDamage(0).status).toBe("unavailable");
    expect(calculateBaseDamage(-5).status).toBe("unavailable");
  });

  it("calculateBaseDamage applies the ammo multiplier", () => {
    const result = calculateBaseDamage(50, 1.5);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data).toBe(75);
  });

  it("calculateExpectedDamage builds a transparent step-by-step breakdown", () => {
    const result = calculateExpectedDamage({
      weaponAttack: 100,
      bonuses: { skillBonusPercent: 10, gearBonusPercent: 20, warBonusPercent: 50 },
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.breakdown.map((b) => b.label)).toEqual([
      "Base Damage",
      "Skill Bonus",
      "Gear Bonus",
      "Weapon Bonus",
      "War Bonus",
      "Other Modifiers",
    ]);
    // 100 * 1.1 * 1.2 * 1.5 (weapon/other bonuses default to 0%)
    expect(result.data.totalDamage).toBeCloseTo(100 * 1.1 * 1.2 * 1.5, 6);
    expect(result.data.confidence).toBe("estimated");
    expect(result.data.assumptions.length).toBeGreaterThan(0);
  });

  it("propagates unavailability from calculateBaseDamage", () => {
    const result = calculateExpectedDamage({ weaponAttack: 0 });
    expect(result.status).toBe("unavailable");
  });
});

describe("war.ts", () => {
  it("calculateAmmoConsumption assumes 1 unit per hit by default and flags it as estimated", () => {
    const result = calculateAmmoConsumption(20, 2.5);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.ammoConsumed).toBe(20);
      expect(result.data.ammoCost).toBe(50);
      expect(result.data.confidence).toBe("estimated");
      expect(result.data.assumption).toBeDefined();
    }
  });

  it("does not flag confidence as estimated when a real per-hit rate is supplied", () => {
    const result = calculateAmmoConsumption(20, 2.5, 2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.ammoConsumed).toBe(40);
      expect(result.data.confidence).toBe("ok");
      expect(result.data.assumption).toBeUndefined();
    }
  });

  it("returns unavailable for negative inputs", () => {
    expect(calculateAmmoConsumption(-1, 1).status).toBe("unavailable");
    expect(calculateAmmoConsumption(1, -1).status).toBe("unavailable");
  });

  it("calculateNetReward subtracts ammo and other costs from reward", () => {
    const result = calculateNetReward(500, 50, 25);
    expect(result).toEqual({ reward: 500, ammoCost: 50, otherCosts: 25, netReward: 425 });
  });

  it("calculateWarsToRecoverCost divides purchase cost by per-war profit delta", () => {
    const result = calculateWarsToRecoverCost(1000, 50);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data).toBe(20);
  });

  it("calculateWarsToRecoverCost returns unavailable for non-positive profit delta (never recovers)", () => {
    expect(calculateWarsToRecoverCost(1000, 0).status).toBe("unavailable");
    expect(calculateWarsToRecoverCost(1000, -5).status).toBe("unavailable");
  });
});

describe("optimizer.ts (combat)", () => {
  const strongWeapon = gear({ id: "rifle-strong", slot: "weapon", bonuses: { attack: 100 } });
  const weakWeapon = gear({ id: "rifle-weak", slot: "weapon", bonuses: { attack: 40 } });
  const goodArmor = gear({ id: "armor-good", slot: "chest", bonuses: { armor: 30 } });
  const noAttackStat = gear({ id: "broken-weapon", slot: "weapon", bonuses: {} });

  const context = { hitCount: 10, reward: 1000, warBonusPercent: 20 };

  it("ranks loadouts by damage descending", () => {
    const candidates: LoadoutCandidate[] = [
      { label: "Weak", weapon: weakWeapon, otherGear: [goodArmor], ammoMarketPrice: 1 },
      { label: "Strong", weapon: strongWeapon, otherGear: [goodArmor], ammoMarketPrice: 1 },
    ];
    const ranked = rankLoadouts(candidates, context);
    expect(ranked[0]?.label).toBe("Strong");
    expect(ranked[0]?.status).toBe("evaluated");
  });

  it("sorts skipped candidates to the bottom with an honest reason, never silently dropped", () => {
    const candidates: LoadoutCandidate[] = [
      { label: "Broken", weapon: noAttackStat, otherGear: [], ammoMarketPrice: 1 },
      { label: "Strong", weapon: strongWeapon, otherGear: [goodArmor], ammoMarketPrice: 1 },
    ];
    const ranked = rankLoadouts(candidates, context);
    expect(ranked[0]?.label).toBe("Strong");
    expect(ranked[1]?.label).toBe("Broken");
    expect(ranked[1]?.status).toBe("skipped");
    expect(ranked[1]?.skipReason).toMatch(/attack stat/i);
  });

  it("computes net reward and efficiency for evaluated loadouts", () => {
    const candidates: LoadoutCandidate[] = [
      { label: "Strong", weapon: strongWeapon, otherGear: [goodArmor], ammoMarketPrice: 2 },
    ];
    const ranked = rankLoadouts(candidates, context);
    const entry = ranked[0]!;
    expect(entry.economics?.ammoCost).toBe(20); // 10 hits * 1 ammo/hit * price 2
    expect(entry.economics?.netReward).toBe(980);
    expect(entry.efficiency).toBeCloseTo(980 / 20, 6);
  });
});
