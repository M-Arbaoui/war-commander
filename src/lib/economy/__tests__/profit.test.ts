import { describe, expect, it } from "vitest";
import {
  calculateWorkerCost,
  calculateMaintenance,
  calculateRevenue,
  calculateGrossProfit,
  calculateNetProfit,
  calculateMargin,
  calculateBreakEvenPrice,
  calculateProfitPerWorker,
  calculateProfitPerWage,
  calculateProfitBreakdown,
} from "../profit";

describe("basic arithmetic functions", () => {
  it("calculateWorkerCost", () => {
    expect(calculateWorkerCost(10, 3, 8)).toBe(240);
  });

  it("calculateMaintenance scales a per-period cost to the requested hours", () => {
    expect(calculateMaintenance([240], 24, 8)).toBeCloseTo(80, 6);
  });

  it("calculateMaintenance sums multiple upgrade maintenance costs", () => {
    expect(calculateMaintenance([100, 50], 24, 24)).toBe(150);
  });

  it("calculateRevenue / calculateGrossProfit / calculateNetProfit", () => {
    const revenue = calculateRevenue(100, 2.5);
    expect(revenue).toBe(250);
    expect(calculateGrossProfit(revenue, 100)).toBe(150);
    expect(calculateNetProfit(revenue, 180)).toBe(70);
  });
});

describe("calculateMargin", () => {
  it("computes margin as netProfit/revenue", () => {
    const result = calculateMargin(50, 200);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data).toBeCloseTo(0.25, 6);
  });

  it("returns unavailable (not 0 or Infinity) when revenue is 0", () => {
    const result = calculateMargin(0, 0);
    expect(result.status).toBe("unavailable");
  });
});

describe("calculateBreakEvenPrice", () => {
  it("computes cost per unit", () => {
    const result = calculateBreakEvenPrice(500, 100);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data).toBe(5);
  });

  it("returns unavailable for zero units produced", () => {
    const result = calculateBreakEvenPrice(500, 0);
    expect(result.status).toBe("unavailable");
  });
});

describe("calculateProfitPerWorker / calculateProfitPerWage", () => {
  it("divides profit by worker count", () => {
    const result = calculateProfitPerWorker(300, 3);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data).toBe(100);
  });

  it("errors (not silently 0) for zero workers", () => {
    const result = calculateProfitPerWorker(300, 0);
    expect(result.status).toBe("error");
  });

  it("returns unavailable for zero wage cost in profit-per-wage", () => {
    const result = calculateProfitPerWage(300, 0);
    expect(result.status).toBe("unavailable");
  });
});

describe("calculateProfitBreakdown", () => {
  it("assembles a full breakdown consistently", () => {
    const breakdown = calculateProfitBreakdown({
      unitsProduced: 100,
      sellPricePerUnit: 3,
      materialCost: 120,
      wagePerHour: 15,
      workerCount: 2,
      hours: 8,
      maintenanceCostsPerPeriod: [240],
      maintenancePeriodHours: 24,
    });

    expect(breakdown.revenue).toBe(300);
    expect(breakdown.wageCost).toBe(240);
    expect(breakdown.maintenanceCost).toBeCloseTo(80, 6);
    expect(breakdown.grossProfit).toBe(180);
    expect(breakdown.totalCosts).toBeCloseTo(120 + 240 + 80, 6);
    expect(breakdown.netProfit).toBeCloseTo(300 - (120 + 240 + 80), 6);
    expect(breakdown.margin.status).toBe("ok");
    expect(breakdown.profitPerWorker.status).toBe("ok");
  });

  it("surfaces an unavailable margin without breaking the rest of the breakdown", () => {
    const breakdown = calculateProfitBreakdown({
      unitsProduced: 0,
      sellPricePerUnit: 3,
      materialCost: 0,
      wagePerHour: 15,
      workerCount: 2,
      hours: 8,
      maintenanceCostsPerPeriod: [],
      maintenancePeriodHours: 24,
    });
    expect(breakdown.revenue).toBe(0);
    expect(breakdown.margin.status).toBe("unavailable");
    expect(breakdown.breakEvenPrice.status).toBe("unavailable");
  });
});
