/**
 * localStorage-backed battle/bounty simulation history, per the brief's V1
 * requirement (no backend persistence needed). Guards every access behind
 * `typeof window !== "undefined"` so it's safe to import from
 * server-rendered route modules without crashing SSR.
 */

const STORAGE_KEY = "warera-command:battle-history";
const MAX_ENTRIES = 50;

export interface BattleHistoryEntry {
  id: string;
  timestamp: number;
  mode: "war" | "bounty";
  label: string;
  warBonusPercent: number;
  totalDamage: number;
  reward: number;
  ammoCost: number;
  otherCosts: number;
  netReward: number;
}

export function loadBattleHistory(): BattleHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBattleHistoryEntry(entry: Omit<BattleHistoryEntry, "id" | "timestamp">): BattleHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const full: BattleHistoryEntry = { ...entry, id: crypto.randomUUID(), timestamp: Date.now() };
  const existing = loadBattleHistory();
  const updated = [full, ...existing].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage full/unavailable — the in-memory list still reflects this session's entry.
  }
  return updated;
}

export function clearBattleHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
