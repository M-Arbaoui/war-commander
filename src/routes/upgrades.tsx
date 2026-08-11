import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getReferenceData } from "@/server/reference-fns";
import { evaluateUpgradeLevels, type UpgradeLevelEvaluation } from "@/lib/economy/upgrades";

export const Route = createFileRoute("/upgrades")({
  loader: () => getReferenceData(),
  component: UpgradesPage,
});

type LoadedRef = Awaited<ReturnType<typeof getReferenceData>> & { status: "ok" };

function UpgradesPage() {
  const ref = Route.useLoaderData();
  if (ref.status !== "ok") {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16">
        <div className="rounded-sm border border-negative/40 bg-negative-dim px-5 py-4 font-mono text-sm">
          <p className="font-semibold text-negative">DATA UNAVAILABLE</p>
        </div>
      </main>
    );
  }
  return <UpgradesBody data={ref as LoadedRef} />;
}

function UpgradesBody({ data }: { data: LoadedRef }) {
  const upgradeTypes = useMemo(() => Object.keys(data.upgradesConfig), [data.upgradesConfig]);
  const producibleItems = useMemo(
    () => Object.values(data.items).filter((i) => i.isTradable && i.productionPoints !== null),
    [data.items],
  );

  const [upgradeType, setUpgradeType] = useState(upgradeTypes[0] ?? "");
  const [itemCode, setItemCode] = useState(producibleItems[0]?.code ?? "");
  const [currentLevel, setCurrentLevel] = useState(0);
  const [workerCount, setWorkerCount] = useState(3);
  const [statName, setStatName] = useState("productionBonusPercent");

  const upgrade = data.upgradesConfig[upgradeType];
  const item = data.items[itemCode];
  const sellPrice = data.prices[itemCode];
  const steelPrice = data.prices["steel"];

  const evaluations: UpgradeLevelEvaluation[] = useMemo(() => {
    if (!upgrade || !item || sellPrice === undefined) return [];
    return evaluateUpgradeLevels({
      upgrade,
      currentLevel,
      item,
      sellPricePerUnit: sellPrice,
      steelMarketPrice: steelPrice,
      workerCount,
      productionBonusStatName: statName,
    });
  }, [upgrade, item, sellPrice, steelPrice, currentLevel, workerCount, statName]);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <p className="eyebrow mb-1">Upgrade Planner</p>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-wide text-ink">Best Next Upgrade</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-sm border border-line bg-panel p-4 sm:grid-cols-5">
        <Field label="Upgrade type">
          <select
            className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink"
            value={upgradeType}
            onChange={(e) => setUpgradeType(e.target.value)}
          >
            {upgradeTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Current level">
          <input
            type="number"
            min={0}
            className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink font-tnum"
            value={currentLevel}
            onChange={(e) => setCurrentLevel(Number(e.target.value))}
          />
        </Field>
        <Field label="Product using this company">
          <select
            className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink"
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
          >
            {producibleItems.map((i) => (
              <option key={i.code} value={i.code}>
                {i.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Worker count">
          <input
            type="number"
            min={1}
            className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink font-tnum"
            value={workerCount}
            onChange={(e) => setWorkerCount(Number(e.target.value))}
          />
        </Field>
        <Field label="Production stat name">
          <input
            className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink"
            value={statName}
            onChange={(e) => setStatName(e.target.value)}
          />
        </Field>
      </div>

      <p className="mb-4 font-mono text-xs text-ink-faint">
        The stat name used to read each level's production bonus varies by upgrade type and isn't confirmed by any
        endpoint — it defaults to a guess ("productionBonusPercent"). If a level shows no payback below, try a
        different stat name; the game config for this upgrade type may use a different key.
      </p>

      {steelPrice === undefined && (
        <p className="mb-4 font-mono text-xs text-neutral">
          No market price for steel — payback can't be converted from steel cost into money. Levels will show as
          unavailable.
        </p>
      )}

      <div className="overflow-x-auto rounded-sm border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-panel text-left font-mono text-xs uppercase tracking-wide text-ink-dim">
              <th className="px-3 py-2">Level</th>
              <th className="px-3 py-2 text-right">Steel cost</th>
              <th className="px-3 py-2 text-right">Maintenance</th>
              <th className="px-3 py-2 text-right">+Units/hr</th>
              <th className="px-3 py-2 text-right">+Profit/hr</th>
              <th className="px-3 py-2 text-right">Payback (hours)</th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map((ev) => (
              <tr key={ev.level} className="border-b border-line hover:bg-panel-raised">
                <td className="px-3 py-2 font-mono text-ink">Level {ev.level}</td>
                <td className="px-3 py-2 text-right font-mono font-tnum text-ink">{ev.steelCost}</td>
                <td className="px-3 py-2 text-right font-mono font-tnum text-ink-dim">{ev.maintenanceCost ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono font-tnum text-ink">
                  {ev.additionalUnitsPerHour.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-tnum text-ink">
                  {ev.additionalProfitPerHour.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-tnum">
                  {ev.paybackHours.status === "ok" ? (
                    <span className="text-positive">{ev.paybackHours.data.toFixed(1)}h</span>
                  ) : (
                    <span className="text-ink-faint" title={ev.paybackHours.reason}>
                      DATA UNAVAILABLE
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {evaluations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center font-mono text-sm text-ink-dim">
                  Select an upgrade type and product with a known market price to see level-by-level payback.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
