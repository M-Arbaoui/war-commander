import { describe, expect, it } from "vitest";
import {
  calculateProductionRate,
  calculateResourceConsumption,
  calibrateTickHoursFromObservedRate,
  DEFAULT_TICK_HOURS,
} from "../production";
import type { Item } from "../../warera/models";

function item(overrides: Partial<Item> & { code: string }): Item {
  return {
    name: overrides.code,
    category: "product",
    rarity: null,
    isTradable: true,
    isConsumable: false,
    isDeposit: false,
    iconUrl: null,
    combatStats: null,
    productionPoints: null,
    recipe: null,
    ...overrides,
  };
}

const steel = item({ code: "steel", productionPoints: 5, recipe: { inputs: { iron: 10 } } });
const rawIron = item({ code: "iron", category: "raw" });

describe("calculateProductionRate", () => {
  it("returns unavailable for an item with no productionPoints", () => {
    const result = calculateProductionRate({ item: rawIron, workerCount: 3 });
    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable for zero/negative worker count", () => {
    const result = calculateProductionRate({ item: steel, workerCount: 0 });
    expect(result.status).toBe("unavailable");
  });

  it("computes a base rate with no bonuses at the default tick assumption", () => {
    const result = calculateProductionRate({ item: steel, workerCount: 3 });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.unitsPerHour).toBeCloseTo((5 * 3) / DEFAULT_TICK_HOURS, 6);
      expect(result.data.confidence).toBe("estimated");
      expect(result.data.assumptions.length).toBeGreaterThan(0);
    }
  });

  it("applies additive bonus stacking as documented", () => {
    const result = calculateProductionRate({
      item: steel,
      workerCount: 1,
      bonuses: { companyProductionBonusPercent: 10, upgradeBonusPercent: 20 },
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.appliedBonusMultiplier).toBeCloseTo(1.3, 6);
      expect(result.data.unitsPerHour).toBeCloseTo(5 * 1.3, 6);
    }
  });

  it("respects a custom tickHours override", () => {
    const result = calculateProductionRate({ item: steel, workerCount: 1, tickHours: 2 });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.unitsPerHour).toBeCloseTo(5 / 2, 6);
    }
  });
});

describe("calibrateTickHoursFromObservedRate", () => {
  it("back-solves tickHours from a real observed rate", () => {
    // If observed rate equals the base-assumption rate exactly, calibrated tickHours should equal DEFAULT_TICK_HOURS.
    const baseline = calculateProductionRate({ item: steel, workerCount: 4 });
    expect(baseline.status).toBe("ok");
    if (baseline.status !== "ok") return;

    const result = calibrateTickHoursFromObservedRate({
      item: steel,
      workerCount: 4,
      observedUnitsPerHour: baseline.data.unitsPerHour,
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.calibratedTickHours).toBeCloseTo(DEFAULT_TICK_HOURS, 6);
    }
  });

  it("returns unavailable for a non-positive observed rate", () => {
    const result = calibrateTickHoursFromObservedRate({ item: steel, workerCount: 4, observedUnitsPerHour: 0 });
    expect(result.status).toBe("unavailable");
  });
});

describe("calculateResourceConsumption", () => {
  it("is fully deterministic given real recipe ratios", () => {
    const result = calculateResourceConsumption(steel, 50);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      // 10 iron per 5 output units => 2 iron per unit => 100 iron for 50 units.
      expect(result.data.perUnitProduced.iron).toBeCloseTo(100, 6);
    }
  });

  it("returns unavailable for a raw material with no recipe, not a fabricated empty breakdown", () => {
    const result = calculateResourceConsumption(rawIron, 10);
    expect(result.status).toBe("unavailable");
  });
});
