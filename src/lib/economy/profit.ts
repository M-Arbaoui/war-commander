/**
 * Profit engine. Every function here is pure arithmetic over numbers the
 * caller already has (from real market/recipe/wage data or from
 * production.ts's clearly-flagged estimate) — there is no additional
 * modeling assumption introduced in this file itself.
 */
import { errored, ok, unavailable, type DataResult } from "../warera/models";

export function calculateWorkerCost(wagePerHour: number, workerCount: number, hours: number): number {
  return wagePerHour * workerCount * hours;
}

/**
 * Sums real per-period maintenance costs (from upgrade level `stats`/
 * `maintenanceCost` fields — see UpgradeLevelOption). The *cadence* of that
 * maintenance cost (hourly vs daily) is not confirmed by any endpoint, so
 * the caller must state it explicitly via `periodHours` rather than this
 * function silently assuming one.
 */
export function calculateMaintenance(maintenanceCostsPerPeriod: number[], periodHours: number, hours: number): number {
  const totalPerPeriod = maintenanceCostsPerPeriod.reduce((sum, c) => sum + c, 0);
  return (totalPerPeriod / periodHours) * hours;
}

export function calculateRevenue(unitsProduced: number, sellPricePerUnit: number): number {
  return unitsProduced * sellPricePerUnit;
}

export function calculateGrossProfit(revenue: number, materialCost: number): number {
  return revenue - materialCost;
}

export function calculateNetProfit(revenue: number, totalCosts: number): number {
  return revenue - totalCosts;
}

/** Returns unavailable rather than Infinity/NaN when revenue is 0 — a real "can't compute a margin" case, not a fabricated 0%. */
export function calculateMargin(netProfit: number, revenue: number): DataResult<number> {
  if (revenue === 0) return unavailable("Revenue is 0 — margin is undefined, not 0%.");
  return ok(netProfit / revenue);
}

/** Sell price per unit at which net profit is exactly 0, given known per-unit cost and unit count. */
export function calculateBreakEvenPrice(totalCosts: number, unitsProduced: number): DataResult<number> {
  if (unitsProduced <= 0) return unavailable("unitsProduced must be greater than 0 to compute a break-even price.");
  return ok(totalCosts / unitsProduced);
}

export function calculateProfitPerWorker(netProfit: number, workerCount: number): DataResult<number> {
  if (workerCount <= 0) return errored("workerCount must be greater than 0.");
  return ok(netProfit / workerCount);
}

export function calculateProfitPerWage(netProfit: number, totalWageCost: number): DataResult<number> {
  if (totalWageCost <= 0) return unavailable("Total wage cost is 0 — profit-per-wage is undefined.");
  return ok(netProfit / totalWageCost);
}

export interface ProfitBreakdown {
  revenue: number;
  materialCost: number;
  wageCost: number;
  maintenanceCost: number;
  grossProfit: number;
  totalCosts: number;
  netProfit: number;
  margin: DataResult<number>;
  breakEvenPrice: DataResult<number>;
  profitPerWorker: DataResult<number>;
  profitPerWage: DataResult<number>;
}

/**
 * Convenience combinator that runs the full profit breakdown in one call,
 * for the Company Builder page. Every sub-result that can be legitimately
 * undefined (margin/break-even/profit-per-worker/profit-per-wage) stays a
 * DataResult rather than being silently coerced to 0.
 */
export function calculateProfitBreakdown(params: {
  unitsProduced: number;
  sellPricePerUnit: number;
  materialCost: number;
  wagePerHour: number;
  workerCount: number;
  hours: number;
  maintenanceCostsPerPeriod: number[];
  maintenancePeriodHours: number;
}): ProfitBreakdown {
  const revenue = calculateRevenue(params.unitsProduced, params.sellPricePerUnit);
  const wageCost = calculateWorkerCost(params.wagePerHour, params.workerCount, params.hours);
  const maintenanceCost = calculateMaintenance(
    params.maintenanceCostsPerPeriod,
    params.maintenancePeriodHours,
    params.hours,
  );
  const grossProfit = calculateGrossProfit(revenue, params.materialCost);
  const totalCosts = params.materialCost + wageCost + maintenanceCost;
  const netProfit = calculateNetProfit(revenue, totalCosts);

  return {
    revenue,
    materialCost: params.materialCost,
    wageCost,
    maintenanceCost,
    grossProfit,
    totalCosts,
    netProfit,
    margin: calculateMargin(netProfit, revenue),
    breakEvenPrice: calculateBreakEvenPrice(totalCosts, params.unitsProduced),
    profitPerWorker: calculateProfitPerWorker(netProfit, params.workerCount),
    profitPerWage: calculateProfitPerWage(netProfit, wageCost),
  };
}
