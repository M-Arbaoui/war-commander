/**
 * Recipe cost resolution.
 *
 * This engine is fully deterministic: it walks the recipe graph exposed by
 * gameConfig.items (Item.recipe.inputs, real data) and prices every raw
 * material at its real current market average. There is no invented
 * formula here — "cost to produce 1 unit of X from raw materials" is pure
 * arithmetic once you have the recipe graph and market prices, both of
 * which come straight from the API.
 *
 * Model: cost(item) =
 *   marketPrice(item)                                     if item has no recipe (raw material / unresolvable)
 *   Σ over inputs: (qty_i × cost(input_i)) / productionPoints(item)   otherwise
 *
 * This recurses all the way down to raw materials, so "Iron → Steel →
 * Weapon → Advanced Weapon" resolves the true bill-of-materials cost, not
 * just the cost of the item's direct inputs.
 */

import type { Item } from "../warera/models";
import { errored, ok, unavailable, type DataResult } from "../warera/models";

export interface RecipeCostNode {
  itemCode: string;
  /** Cost to produce ONE unit of this item, in the game's currency. */
  unitCost: number;
  /** true if this node bottomed out at a market price rather than recursing further. */
  pricedFromMarket: boolean;
  /** Quantity of this node needed to produce exactly 1 unit of its PARENT's output. 1 for the root. */
  quantityPerUnitOfParent: number;
  children: RecipeCostNode[];
}

export interface RecipeCostResult {
  root: RecipeCostNode;
  /** Flattened raw-material requirements to produce 1 unit of the root item. */
  rawMaterialsPerUnit: Record<string, number>;
}

export interface ResolveRecipeCostOptions {
  /**
   * Item codes to price directly from the market instead of recursing into
   * their own recipe, even if they have one — useful for "what if I just
   * buy the steel instead of crafting it myself" scenarios. Defaults to
   * empty (always recurse to raw materials).
   */
  buyInstead?: Set<string>;
}

/**
 * Recursively resolves the true production cost of one unit of `itemCode`.
 * Returns `unavailable` (never a fabricated number) if:
 *   - the item doesn't exist in the provided item catalog,
 *   - a required input item doesn't exist in the catalog,
 *   - a required input has no market price and no recipe of its own
 *     (genuinely unpriceable), or
 *   - the recipe graph contains a cycle (which would otherwise infinite-loop).
 */
export function resolveRecipeCost(
  itemCode: string,
  items: Record<string, Item>,
  prices: Record<string, number>,
  options: ResolveRecipeCostOptions = {},
): DataResult<RecipeCostResult> {
  const rawMaterialsPerUnit: Record<string, number> = {};
  const visiting = new Set<string>();

  function resolve(code: string, unitsNeeded: number, quantityPerUnitOfParent: number): DataResult<RecipeCostNode> {
    if (visiting.has(code)) {
      return errored(`Recipe cycle detected while resolving "${code}" — refusing to infinite-loop.`);
    }
    const item = items[code];
    if (!item) {
      return unavailable(`Item "${code}" is not present in the game config item catalog.`);
    }

    const shouldBuyInstead = options.buyInstead?.has(code) ?? false;
    const hasRecipe = item.recipe !== null && !shouldBuyInstead;

    if (!hasRecipe) {
      const price = prices[code];
      if (price === undefined) {
        return unavailable(
          `No market price available for "${code}", and it has no recipe to derive a cost from instead.`,
        );
      }
      rawMaterialsPerUnit[code] = (rawMaterialsPerUnit[code] ?? 0) + unitsNeeded;
      return ok({ itemCode: code, unitCost: price, pricedFromMarket: true, quantityPerUnitOfParent, children: [] });
    }

    if (item.productionPoints === null || item.productionPoints <= 0) {
      return unavailable(`Item "${code}" has a recipe but no valid productionPoints to divide input cost by.`);
    }

    visiting.add(code);
    const children: RecipeCostNode[] = [];
    let totalInputCost = 0;

    for (const [inputCode, qtyPerTick] of Object.entries(item.recipe!.inputs)) {
      const childQuantityPerUnitOfParent = qtyPerTick / item.productionPoints;
      const childResult = resolve(inputCode, unitsNeeded * childQuantityPerUnitOfParent, childQuantityPerUnitOfParent);
      if (childResult.status !== "ok") {
        visiting.delete(code);
        return childResult.status === "unavailable"
          ? unavailable(`Cannot cost "${code}": ${childResult.reason}`)
          : errored(`Cannot cost "${code}": ${childResult.reason}`);
      }
      children.push(childResult.data);
      totalInputCost += qtyPerTick * childResult.data.unitCost;
    }

    visiting.delete(code);
    const unitCost = totalInputCost / item.productionPoints;
    return ok({ itemCode: code, unitCost, pricedFromMarket: false, quantityPerUnitOfParent, children });
  }

  const rootResult = resolve(itemCode, 1, 1);
  if (rootResult.status !== "ok") return rootResult;

  return ok({ root: rootResult.data, rawMaterialsPerUnit });
}

/**
 * Flattens a resolved recipe cost tree into a simple "itemCode -> cost
 * contribution" breakdown for display, sorted by contribution descending.
 */
export function flattenCostBreakdown(node: RecipeCostNode): Array<{ itemCode: string; contribution: number }> {
  const totals = new Map<string, number>();
  function walk(n: RecipeCostNode, multiplier: number) {
    if (n.pricedFromMarket) {
      totals.set(n.itemCode, (totals.get(n.itemCode) ?? 0) + n.unitCost * multiplier);
      return;
    }
    for (const child of n.children) {
      walk(child, multiplier * child.quantityPerUnitOfParent);
    }
  }
  walk(node, 1);
  return Array.from(totals.entries())
    .map(([itemCode, contribution]) => ({ itemCode, contribution }))
    .sort((a, b) => b.contribution - a.contribution);
}
