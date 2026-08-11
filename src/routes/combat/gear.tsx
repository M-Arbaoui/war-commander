import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getCurrentEquipment } from "@/server/warera-fns";
import { GameIcon } from "@/components/GameIcon";
import type { Gear, GearSlot } from "@/lib/warera/models";

export const Route = createFileRoute("/combat/gear")({
  component: GearPage,
});

const SLOTS: GearSlot[] = ["weapon", "helmet", "chest", "gloves", "pants", "boots"];

function GearPage() {
  const [token, setToken] = useState("");
  const [gear, setGear] = useState<Gear[] | null>(null);
  const [ammoCode, setAmmoCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getCurrentEquipment({ data: { sessionToken: token } });
      if (result.status !== "ok") {
        setError(result.reason ?? `Could not load equipment (${result.status}).`);
        setGear(null);
      } else {
        setGear(result.data.gear);
        setAmmoCode(result.data.ammoCode);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load equipment.");
    } finally {
      setLoading(false);
    }
  }

  const bySlot = new Map((gear ?? []).map((g) => [g.slot, g]));

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <p className="eyebrow mb-1">Loadout</p>
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-wide text-ink">Gear &amp; Inventory</h1>
      <p className="mb-6 max-w-2xl font-mono text-xs text-ink-dim">
        inventory.fetchCurrentEquipment requires your own WarEra session token — WARERA COMMAND has no login flow.
        Paste your token below; it's sent directly to this one request and never stored. Only your currently{" "}
        <em>equipped</em> gear is shown — no endpoint we found exposes a full inventory of owned-but-unequipped
        items separately.
      </p>

      <div className="mb-6 flex gap-2">
        <input
          type="password"
          className="flex-1 rounded-sm border border-line bg-panel-raised px-3 py-2 font-mono text-sm text-ink"
          placeholder="Session token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button
          className="rounded-sm border border-accent bg-accent-dim px-4 py-2 font-mono text-sm text-accent hover:bg-accent hover:text-void disabled:opacity-40"
          onClick={load}
          disabled={!token || loading}
        >
          {loading ? "Loading…" : "Load Equipment"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-sm border border-negative/40 bg-negative-dim px-4 py-3 font-mono text-sm text-negative">
          {error}
        </div>
      )}

      {gear && (
        <>
          {ammoCode && (
            <p className="mb-4 font-mono text-sm text-ink">
              Loaded ammo: <span className="text-accent">{ammoCode}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {SLOTS.map((slot) => {
              const item = bySlot.get(slot);
              return <GearCard key={slot} slot={slot} item={item ?? null} />;
            })}
          </div>
        </>
      )}
    </main>
  );
}

const CONDITION_COLOR: Record<string, string> = {
  GOOD: "text-positive border-positive/40",
  LOW: "text-neutral border-neutral/40",
  DAMAGED: "text-negative border-negative/40",
  BROKEN: "text-negative border-negative/40",
  UNKNOWN: "text-ink-faint border-line",
};

function GearCard({ slot, item }: { slot: GearSlot; item: Gear | null }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-sm border border-line bg-panel p-4 text-center">
      <GameIcon src={null} code={item?.code ?? slot} size="lg" />
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink-dim">{slot}</p>
      {item ? (
        <>
          <p className="font-mono text-xs text-ink">{item.code}</p>
          <span
            className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${CONDITION_COLOR[item.condition]}`}
          >
            {item.condition}
            {item.state !== null && item.maxState !== null ? ` ${item.state}/${item.maxState}` : ""}
          </span>
        </>
      ) : (
        <span className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          UNEQUIPPED
        </span>
      )}
    </div>
  );
}
