/**
 * War/bounty cost & reward arithmetic. Reward amounts themselves are NOT
 * exposed by any endpoint found in Phase 1 research — like the damage
 * formula, WarEra's reward-per-damage (or flat bounty payout) formula is
 * not published anywhere, so `reward` is always a caller-supplied number
 * (read off the in-game war/bounty screen), never derived here. Everything
 * else — ammo cost from real market prices, net reward arithmetic — is
 * deterministic.
 */
import { ok, unavailable, type DataResult } from "../warera/models";

export interface AmmoConsumptionResult {
  /** Units of ammo consumed. Assumes 1 unit per hit (see assumption note) unless overridden. */
  ammoConsumed: number;
  ammoCost: number;
  confidence: "estimated" | "ok";
  assumption?: string;
}

/**
 * `unitsPerHit` defaults to 1 — WarEra's real per-hit ammo consumption rate
 * per weapon type isn't confirmed by any endpoint; round.getLastHits shows
 * which ammo code was used per hit, not a quantity. Override this with a
 * real observed rate from your own play if you have one.
 */
export function calculateAmmoConsumption(
  hitCount: number,
  ammoMarketPrice: number,
  unitsPerHit = 1,
): DataResult<AmmoConsumptionResult> {
  if (hitCount < 0) return unavailable("hitCount cannot be negative.");
  if (ammoMarketPrice < 0) return unavailable("ammoMarketPrice cannot be negative.");
  const ammoConsumed = hitCount * unitsPerHit;
  return ok({
    ammoConsumed,
    ammoCost: ammoConsumed * ammoMarketPrice,
    confidence: unitsPerHit === 1 ? "estimated" : "ok",
    assumption:
      unitsPerHit === 1
        ? "Assumed 1 ammo unit consumed per hit — WarEra's real per-weapon consumption rate is not confirmed by any endpoint."
        : undefined,
  });
}

export interface WarEconomicsResult {
  reward: number;
  ammoCost: number;
  otherCosts: number;
  netReward: number;
}

export function calculateNetReward(reward: number, ammoCost: number, otherCosts: number): WarEconomicsResult {
  return { reward, ammoCost, otherCosts, netReward: reward - ammoCost - otherCosts };
}

/** Hours/wars-agnostic: how many repetitions of this exact war/bounty would it take to recover a gear purchase, given its per-war net-reward delta. Unit is WARS, per the brief, never days. */
export function calculateWarsToRecoverCost(
  purchaseCost: number,
  additionalNetRewardPerWar: number,
): DataResult<number> {
  if (additionalNetRewardPerWar <= 0) {
    return unavailable("This purchase provides no additional net reward per war, so payback in wars is undefined.");
  }
  return ok(purchaseCost / additionalNetRewardPerWar);
}
