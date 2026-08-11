/**
 * Gear advisor: "what should I buy next, and is it worth the coins" — not a
 * damage simulator. Every suggestion is ranked by coins-per-stat-point, the
 * sustainability metric the player asked for, and every candidate is
 * explicit about whether its stat value is verified (from
 * gameConfig.items[code].flatStats, a real field) or unknown (no flatStats
 * entry found — shown separately, never guessed).
 */
import type { GearSlot, Item, PlayerProfile } from "@/lib/warera/models";
import { inferGearSlot } from "@/lib/warera/normalizers";

export type GearAdvisorConfidence = "verified" | "unknown";

export interface GearCandidate {
  itemCode: string;
  slot: GearSlot;
  price: number;
  statName: string;
  statValue: number | null;
  confidence: GearAdvisorConfidence;
  coinsPerPoint: number | null;
  deltaVsCurrent: number | null;
}

const SLOT_STAT_NAME: Record<GearSlot, string> = {
  weapon: "attack",
  helmet: "armor",
  chest: "armor",
  gloves: "armor",
  pants: "armor",
  boots: "armor",
};

export function buildGearCandidates(params: {
  slot: GearSlot;
  items: Record<string, Item>;
  prices: Record<string, number>;
  currentStatValue: number | null;
  maxPrice?: number;
}): GearCandidate[] {
  const statName = SLOT_STAT_NAME[params.slot];
  const candidates: GearCandidate[] = [];

  for (const item of Object.values(params.items)) {
    if (!item.isTradable) continue;
    const inferredSlot = inferGearSlot(item.code, item.category === "weapon" ? "weapon" : undefined);
    if (inferredSlot !== params.slot) continue;
    const price = params.prices[item.code];
    if (price === undefined) continue;
    if (params.maxPrice !== undefined && price > params.maxPrice) continue;

    const statValue = item.combatStats?.[statName] ?? null;
    const coinsPerPoint = statValue !== null && statValue > 0 ? price / statValue : null;
    const deltaVsCurrent =
      statValue !== null && params.currentStatValue !== null ? statValue - params.currentStatValue : null;

    candidates.push({
      itemCode: item.code,
      slot: params.slot,
      price,
      statName,
      statValue,
      confidence: statValue !== null ? "verified" : "unknown",
      coinsPerPoint,
      deltaVsCurrent,
    });
  }

  return candidates.sort((a, b) => {
    if (a.coinsPerPoint !== null && b.coinsPerPoint !== null) return a.coinsPerPoint - b.coinsPerPoint;
    if (a.coinsPerPoint !== null) return -1;
    if (b.coinsPerPoint !== null) return 1;
    return a.price - b.price;
  });
}

export function filterSustainable(candidates: GearCandidate[], maxCoins: number): GearCandidate[] {
  return candidates.filter((c) => {
    if (c.price > maxCoins) return false;
    if (c.deltaVsCurrent !== null && c.deltaVsCurrent <= 0) return false;
    return true;
  });
}

export interface BoxFlipSuggestion {
  itemCode: string;
  sellPrice: number;
}

export function rankBoxFlips(items: Record<string, Item>, prices: Record<string, number>): BoxFlipSuggestion[] {
  return Object.values(items)
    .filter((item) => item.category === "box" && item.isTradable && prices[item.code] !== undefined)
    .map((item) => ({ itemCode: item.code, sellPrice: prices[item.code]! }))
    .sort((a, b) => b.sellPrice - a.sellPrice);
}

export function currentStatValueForSlot(profile: PlayerProfile, slot: GearSlot): number | null {
  const statName = SLOT_STAT_NAME[slot];
  if (statName === "attack") return profile.skills.attack.fromEquipment;
  if (statName === "armor") return profile.skills.armor.fromEquipment;
  return null;
}
