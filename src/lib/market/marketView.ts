/**
 * Pure view logic for the /market page: filtering, sorting, and display
 * formatting. Deliberately framework-free (no React, no route imports) so
 * it can be unit-tested directly with Vitest — the route component
 * (market.tsx) just wires this up to search params and JSX.
 */
import type { DataResult } from "@/lib/warera/models";
import type { MarketRow } from "@/server/market-fns";

export const CATEGORY_FILTERS = ["all", "raw", "product", "weapon", "gear"] as const;
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

export const SORT_OPTIONS = [
  { value: "craft-opportunity", label: "Best craft opportunity" },
  { value: "margin", label: "Highest margin" },
  { value: "profit", label: "Highest profit / unit" },
  { value: "cost", label: "Lowest cost" },
  { value: "spread", label: "Highest spread" },
] as const;
export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

function numericOrFloor(result: DataResult<number>, floor: number): number {
  return result.status === "ok" ? result.data : floor;
}

export function matchesCategory(row: MarketRow, filter: CategoryFilter): boolean {
  if (filter === "all") return true;
  return row.category === filter;
}

/**
 * Sorts a copy of `rows` (never mutates the input) according to `sort`.
 * Rows with an unavailable/error metric sort to the bottom for that metric
 * (via -Infinity / +Infinity floors), never treated as 0 — a row with an
 * unknown craft cost is not "free," it's "unknown."
 */
export function sortRows(rows: MarketRow[], sort: SortKey): MarketRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "margin":
      sorted.sort((a, b) => numericOrFloor(b.craftMargin, -Infinity) - numericOrFloor(a.craftMargin, -Infinity));
      break;
    case "profit":
      sorted.sort(
        (a, b) =>
          numericOrFloor(b.profitPerProductionPoint, -Infinity) -
          numericOrFloor(a.profitPerProductionPoint, -Infinity),
      );
      break;
    case "cost":
      sorted.sort((a, b) => numericOrFloor(a.craftCost, Infinity) - numericOrFloor(b.craftCost, Infinity));
      break;
    case "spread":
      sorted.sort((a, b) => (b.spread ?? -Infinity) - (a.spread ?? -Infinity));
      break;
    case "craft-opportunity":
    default:
      // Biggest CRAFT-side margin first, then biggest BUY-side, NEUTRAL/UNKNOWN last.
      sorted.sort((a, b) => {
        const rank = (r: MarketRow) => (r.verdict === "CRAFT" ? 0 : r.verdict === "BUY" ? 1 : 2);
        const rankDiff = rank(a) - rank(b);
        if (rankDiff !== 0) return rankDiff;
        return (
          Math.abs(numericOrFloor(b.craftMargin, 0)) - Math.abs(numericOrFloor(a.craftMargin, 0))
        );
      });
      break;
  }
  return sorted;
}

export function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(4);
}

export function formatPercent(result: DataResult<number>): string {
  if (result.status !== "ok") return "—";
  return `${(result.data * 100).toFixed(1)}%`;
}

export type MarginColor = "text-positive" | "text-negative" | "text-neutral" | "text-ink-faint";

export function marginColorClass(result: DataResult<number>): MarginColor {
  if (result.status !== "ok") return "text-ink-faint";
  if (result.data > 0) return "text-positive";
  if (result.data < 0) return "text-negative";
  return "text-neutral";
}
