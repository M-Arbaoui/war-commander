import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { rankLoadouts, type LoadoutCandidate } from "@/lib/combat/optimizer";
import { calculateWarsToRecoverCost } from "@/lib/combat/war";
import { saveBattleHistoryEntry } from "@/lib/battleHistory";
import type { Gear } from "@/lib/warera/models";

export const Route = createFileRoute("/combat/")({
  component: CombatPage,
});

interface LoadoutRow {
  id: string;
  label: string;
  weaponAttack: number;
  armorTotal: number;
  ammoMarketPrice: number;
  gearPurchaseCost?: number;
}

function makeGear(weaponAttack: number, armorTotal: number): { weapon: Gear; otherGear: Gear[] } {
  const weapon: Gear = {
    id: "w",
    code: "weapon",
    slot: "weapon",
    rarity: null,
    state: null,
    maxState: null,
    condition: "UNKNOWN",
    bonuses: { attack: weaponAttack },
    equipped: true,
  };
  const armor: Gear = {
    id: "a",
    code: "armor",
    slot: "chest",
    rarity: null,
    state: null,
    maxState: null,
    condition: "UNKNOWN",
    bonuses: { armor: armorTotal },
    equipped: true,
  };
  return { weapon, otherGear: [armor] };
}

function CombatPage() {
  const [mode, setMode] = useState<"war" | "bounty">("war");
  const [skillBonusPercent, setSkillBonusPercent] = useState(0);
  const [warBonusPercent, setWarBonusPercent] = useState(0);
  const [otherModifiersPercent, setOtherModifiersPercent] = useState(0);
  const [hitCount, setHitCount] = useState(10);
  const [reward, setReward] = useState(0);
  const [otherCosts, setOtherCosts] = useState(0);
  const [saved, setSaved] = useState(false);

  const [rows, setRows] = useState<LoadoutRow[]>([
    { id: "current", label: "Current Loadout", weaponAttack: 100, armorTotal: 20, ammoMarketPrice: 1 },
  ]);

  const candidates: LoadoutCandidate[] = useMemo(
    () =>
      rows.map((r) => {
        const { weapon, otherGear } = makeGear(r.weaponAttack, r.armorTotal);
        return { label: r.label, weapon, otherGear, ammoMarketPrice: r.ammoMarketPrice };
      }),
    [rows],
  );

  const ranked = useMemo(
    () =>
      rankLoadouts(candidates, {
        skillBonusPercent,
        warBonusPercent,
        otherModifiersPercent,
        hitCount,
        reward,
        otherCosts,
      }),
    [candidates, skillBonusPercent, warBonusPercent, otherModifiersPercent, hitCount, reward, otherCosts],
  );

  const best = ranked.find((r) => r.status === "evaluated");
  const baseline = ranked.find((r) => r.label === rows[0]?.label) ?? ranked[0];

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: `Alternative ${prev.length}`,
        weaponAttack: 100,
        armorTotal: 20,
        ammoMarketPrice: 1,
      },
    ]);
  }

  function updateRow(id: string, patch: Partial<LoadoutRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  function saveSimulation() {
    if (!best?.damage || !best.economics) return;
    saveBattleHistoryEntry({
      mode,
      label: best.label,
      warBonusPercent,
      totalDamage: best.damage.totalDamage,
      reward: best.economics.reward,
      ammoCost: best.economics.ammoCost,
      otherCosts,
      netReward: best.economics.netReward,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <p className="eyebrow mb-1">Combat Simulator</p>
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-wide text-ink">War / Bounty Simulator</h1>
      <p className="mb-6 max-w-2xl font-mono text-xs text-ink-dim">
        Damage is an ESTIMATE — WarEra doesn't publicly document its damage formula, RNG (crit/dodge), or reward
        formula. This models base damage from a weapon's attack stat with additive bonus stacking, and requires you
        to enter the reward amount from your war/bounty screen. Calibrate before trusting for a real decision.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-sm border border-line bg-panel p-4 sm:grid-cols-4 lg:grid-cols-7">
        <Field label="Mode">
          <div className="flex gap-1">
            {(["war", "bounty"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-sm border px-2 py-1.5 font-mono text-xs uppercase ${
                  mode === m ? "border-accent bg-accent-dim text-accent" : "border-line text-ink-dim"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        <NumField label="Skill bonus %" value={skillBonusPercent} onChange={setSkillBonusPercent} />
        <NumField label="War bonus %" value={warBonusPercent} onChange={setWarBonusPercent} />
        <NumField label="Other modifiers %" value={otherModifiersPercent} onChange={setOtherModifiersPercent} />
        <NumField label="Hit count" value={hitCount} onChange={setHitCount} min={0} />
        <NumField label="Reward (from game)" value={reward} onChange={setReward} min={0} />
        <NumField label="Other costs" value={otherCosts} onChange={setOtherCosts} min={0} />
      </div>

      <div className="mb-6 overflow-x-auto rounded-sm border border-line">
        <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-2">
          <p className="eyebrow">Loadout Optimizer</p>
          <button onClick={addRow} className="font-mono text-xs text-accent hover:underline">
            + Add alternative
          </button>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wide text-ink-dim">
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2 text-right">Weapon attack</th>
              <th className="px-3 py-2 text-right">Armor total</th>
              <th className="px-3 py-2 text-right">Ammo price</th>
              <th className="px-3 py-2 text-right">Gear cost</th>
              <th className="px-3 py-2 text-right">Damage</th>
              <th className="px-3 py-2 text-right">Net reward</th>
              <th className="px-3 py-2 text-right">Wars to recover</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const evalRow = ranked.find((r) => r.label === row.label);
              const deltaVsBaseline =
                evalRow?.economics && baseline?.economics && row.id !== rows[0]?.id
                  ? evalRow.economics.netReward - baseline.economics.netReward
                  : null;
              const paybackResult =
                row.gearPurchaseCost && deltaVsBaseline !== null
                  ? calculateWarsToRecoverCost(row.gearPurchaseCost, deltaVsBaseline)
                  : null;
              return (
                <tr key={row.id} className="border-b border-line hover:bg-panel-raised">
                  <td className="px-2 py-1.5">
                    <input
                      className="w-32 rounded-sm border border-line bg-panel-raised px-2 py-1 font-mono text-xs text-ink"
                      value={row.label}
                      onChange={(e) => updateRow(row.id, { label: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <RowNum value={row.weaponAttack} onChange={(v) => updateRow(row.id, { weaponAttack: v })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <RowNum value={row.armorTotal} onChange={(v) => updateRow(row.id, { armorTotal: v })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <RowNum
                      value={row.ammoMarketPrice}
                      onChange={(v) => updateRow(row.id, { ammoMarketPrice: v })}
                      step={0.01}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <RowNum
                      value={row.gearPurchaseCost ?? 0}
                      onChange={(v) => updateRow(row.id, { gearPurchaseCost: v })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-tnum text-ink">
                    {evalRow?.damage ? evalRow.damage.totalDamage.toFixed(1) : "—"}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono font-tnum ${
                      (evalRow?.economics?.netReward ?? 0) >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {evalRow?.economics ? evalRow.economics.netReward.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-tnum text-ink-dim">
                    {paybackResult?.status === "ok" ? `${paybackResult.data.toFixed(1)} wars` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {rows.length > 1 && (
                      <button
                        onClick={() => removeRow(row.id)}
                        className="font-mono text-xs text-ink-faint hover:text-negative"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {best?.damage && best.economics && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-sm border border-line bg-panel p-4">
            <p className="eyebrow mb-3">Recommended: {best.label} — Damage Breakdown</p>
            <ul className="space-y-1 font-mono text-sm">
              {best.damage.breakdown.map((step) => (
                <li key={step.label} className="flex justify-between border-b border-line/50 py-1">
                  <span className="text-ink-dim">{step.label}</span>
                  <span className="font-tnum text-ink">{step.runningTotal.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-sm border border-line bg-panel p-4">
            <p className="eyebrow mb-3">Expected Reward &amp; Costs</p>
            <dl className="grid grid-cols-2 gap-3 font-mono text-sm">
              <Dl label="Reward" value={best.economics.reward.toFixed(2)} />
              <Dl label="Ammo cost" value={best.economics.ammoCost.toFixed(2)} />
              <Dl label="Other costs" value={best.economics.otherCosts.toFixed(2)} />
              <Dl
                label="Net reward"
                value={best.economics.netReward.toFixed(2)}
                className={best.economics.netReward >= 0 ? "text-positive" : "text-negative"}
              />
            </dl>
            <button
              onClick={saveSimulation}
              className="mt-4 w-full rounded-sm border border-accent bg-accent-dim px-3 py-2 font-mono text-sm text-accent hover:bg-accent hover:text-void"
            >
              {saved ? "Saved ✓" : "Save simulation to history"}
            </button>
          </div>
        </div>
      )}

      {ranked.some((r) => r.status === "skipped") && (
        <div className="mt-4 font-mono text-xs text-ink-faint">
          {ranked
            .filter((r) => r.status === "skipped")
            .map((r) => (
              <p key={r.label}>
                {r.label}: skipped — {r.skipReason}
              </p>
            ))}
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-ink-dim">{label}</span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink font-tnum"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

function RowNum({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      type="number"
      step={step}
      className="w-20 rounded-sm border border-line bg-panel-raised px-2 py-1 font-mono text-xs text-ink font-tnum"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function Dl({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wide text-ink-dim">{label}</dt>
      <dd className={`font-tnum text-ink ${className}`}>{value}</dd>
    </div>
  );
}
