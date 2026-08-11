import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getReferenceData } from "@/server/reference-fns";
import { computeBuilderResult, type BuilderInputs } from "@/lib/builder/buildSetup";
import { GameIcon } from "@/components/GameIcon";
import type { DataResult } from "@/lib/warera/models";

export const Route = createFileRoute("/builder")({
  loader: () => getReferenceData(),
  component: BuilderPage,
});

type LoadedRef = Awaited<ReturnType<typeof getReferenceData>>;

function BuilderPage() {
  const ref = Route.useLoaderData();

  if (ref.status !== "ok") {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16">
        <div className="rounded-sm border border-negative/40 bg-negative-dim px-5 py-4 font-mono text-sm">
          <p className="mb-1 font-semibold text-negative">DATA UNAVAILABLE</p>
          <p className="text-ink-dim">Could not load gameConfig/prices ({ref.status}).</p>
        </div>
      </main>
    );
  }

  return <BuilderForm data={ref as LoadedRef & { status: "ok" }} />;
}

function BuilderForm({ data: ref }: { data: LoadedRef & { status: "ok" } }) {
  const producibleItems = useMemo(
    () => Object.values(ref.items).filter((i) => i.isTradable && i.productionPoints !== null),
    [ref.items],
  );
  const regionList = useMemo(() => Object.entries(ref.regions), [ref.regions]);
  const upgradeTypes = useMemo(() => Object.keys(ref.upgradesConfig), [ref.upgradesConfig]);

  const [inputs, setInputs] = useState<BuilderInputs>(() => ({
    itemCode: producibleItems[0]?.code ?? "",
    workerCount: 3,
    workerSkillBonusPercent: 0,
    wagePerHour: 5,
    hours: 24,
    regionId: regionList[0]?.[0] ?? null,
    selectedUpgrades: {},
  }));

  const result = useMemo(() => computeBuilderResult(inputs, ref), [inputs, ref]);

  function patch(partial: Partial<BuilderInputs>) {
    setInputs((prev) => ({ ...prev, ...partial }));
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <p className="eyebrow mb-1">Economy Engine</p>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-wide text-ink">Company Builder</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4 rounded-sm border border-line bg-panel p-4">
          <Field label="Product">
            <select
              className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink"
              value={inputs.itemCode}
              onChange={(e) => patch({ itemCode: e.target.value })}
            >
              {producibleItems.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Worker count">
            <NumberInput value={inputs.workerCount} min={1} onChange={(v) => patch({ workerCount: v })} />
          </Field>

          <Field label="Worker production skill bonus %">
            <NumberInput
              value={inputs.workerSkillBonusPercent}
              min={0}
              onChange={(v) => patch({ workerSkillBonusPercent: v })}
            />
          </Field>

          <Field label="Wage / worker / hour">
            <NumberInput value={inputs.wagePerHour} min={0} step={0.1} onChange={(v) => patch({ wagePerHour: v })} />
          </Field>

          <Field label="Operating hours">
            <NumberInput value={inputs.hours} min={1} onChange={(v) => patch({ hours: v })} />
          </Field>

          <Field label="Region">
            <select
              className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink"
              value={inputs.regionId ?? ""}
              onChange={(e) => patch({ regionId: e.target.value || null })}
            >
              <option value="">— none —</option>
              {regionList.map(([id, region]) => (
                <option key={id} value={id}>
                  {region.name}
                  {region.resourceBonus ? ` (+${region.resourceBonus.bonusPercent}% ${region.resourceBonus.resourceCode})` : ""}
                </option>
              ))}
            </select>
          </Field>

          {upgradeTypes.length > 0 && (
            <fieldset className="space-y-2 border-t border-line pt-3">
              <p className="eyebrow">Upgrades</p>
              {upgradeTypes.map((type) => {
                const def = ref.upgradesConfig[type]!;
                return (
                  <Field key={type} label={type}>
                    <select
                      className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink"
                      value={inputs.selectedUpgrades[type] ?? 0}
                      onChange={(e) =>
                        patch({ selectedUpgrades: { ...inputs.selectedUpgrades, [type]: Number(e.target.value) } })
                      }
                    >
                      {def.levels.map((l) => (
                        <option key={l.level} value={l.level}>
                          Level {l.level}
                        </option>
                      ))}
                    </select>
                  </Field>
                );
              })}
            </fieldset>
          )}

          <p className="border-t border-line pt-3 font-mono text-[11px] leading-relaxed text-ink-faint">
            Production rate is an estimate — WarEra doesn't publicly document tick duration or bonus stacking. See
            the badge on the results panel.
          </p>
        </div>

        <div className="space-y-6">
          <ResultsPanel result={result} inputs={inputs} />
          <RankedProductsTable ranked={result.ranked} />
        </div>
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

function NumberInput({
  value,
  onChange,
  min,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      className="w-full rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink font-tnum"
      value={value}
      min={min}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function EstimatedBadge() {
  return (
    <span className="rounded-sm border border-neutral/40 bg-neutral-dim px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral">
      Estimated
    </span>
  );
}

function DataCell(result: DataResult<number>, suffix = ""): React.ReactNode {
  if (result.status !== "ok") return <span className="text-ink-faint">DATA UNAVAILABLE</span>;
  return `${result.data.toFixed(3)}${suffix}`;
}

function ResultsPanel({ result, inputs }: { result: ReturnType<typeof computeBuilderResult>; inputs: BuilderInputs }) {
  return (
    <div className="rounded-sm border border-line bg-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="eyebrow">Results for {inputs.itemCode || "—"}</p>
        <EstimatedBadge />
      </div>

      <div className="grid grid-cols-2 gap-4 font-mono text-sm sm:grid-cols-4">
        <Stat
          label="Units/hour"
          value={result.productionRate.status === "ok" ? result.productionRate.data.unitsPerHour.toFixed(2) : "—"}
        />
        <Stat
          label="Units/day"
          value={result.productionRate.status === "ok" ? result.productionRate.data.unitsPerDay.toFixed(2) : "—"}
        />
        <Stat label="Region bonus" value={`+${result.regionBonusPercent}%`} />
        <Stat label="Upgrade bonus" value={`+${result.upgradeBonusPercent}%`} />
      </div>

      {result.resourceConsumption.status === "ok" && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 font-mono text-xs uppercase tracking-wide text-ink-dim">
            Resource consumption ({inputs.hours}h)
          </p>
          <ul className="space-y-1 font-mono text-sm">
            {Object.entries(result.resourceConsumption.data.perUnitProduced).map(([code, qty]) => (
              <li key={code} className="flex items-center gap-2">
                <GameIcon src={null} code={code} size="xs" />
                {code}: {qty.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.profit ? (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 font-mono text-sm sm:grid-cols-4">
          <Stat label="Revenue" value={result.profit.revenue.toFixed(2)} />
          <Stat label="Material cost" value={result.profit.materialCost.toFixed(2)} />
          <Stat label="Wage cost" value={result.profit.wageCost.toFixed(2)} />
          <Stat
            label="Net profit"
            value={result.profit.netProfit.toFixed(2)}
            className={result.profit.netProfit >= 0 ? "text-positive" : "text-negative"}
          />
          <Stat label="Margin" value={DataCell(result.profit.margin, "")} />
          <Stat label="Break-even price" value={DataCell(result.profit.breakEvenPrice)} />
          <Stat label="Profit / worker" value={DataCell(result.profit.profitPerWorker)} />
          <Stat label="Profit / wage" value={DataCell(result.profit.profitPerWage)} />
        </div>
      ) : (
        <p className="mt-4 border-t border-line pt-3 font-mono text-sm text-ink-faint">
          INSUFFICIENT DATA — no market price or recipe cost available for this item.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink-dim">{label}</p>
      <p className={`font-tnum text-ink ${className}`}>{value}</p>
    </div>
  );
}

function RankedProductsTable({ ranked }: { ranked: ReturnType<typeof computeBuilderResult>["ranked"] }) {
  const top = ranked.slice(0, 12);
  return (
    <div className="rounded-sm border border-line">
      <div className="border-b border-line bg-panel px-4 py-2">
        <p className="eyebrow">Best product for this setup</p>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wide text-ink-dim">
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2 text-right">Units/hr</th>
            <th className="px-3 py-2 text-right">Net profit</th>
            <th className="px-3 py-2 text-right">Profit/worker</th>
          </tr>
        </thead>
        <tbody>
          {top.map((row) => (
            <tr key={row.itemCode} className="border-b border-line hover:bg-panel-raised">
              <td className="px-3 py-2 font-mono text-ink">
                <div className="flex items-center gap-2">
                  <GameIcon src={null} code={row.itemCode} size="xs" />
                  {row.itemCode}
                </div>
              </td>
              {row.status === "ranked" ? (
                <>
                  <td className="px-3 py-2 text-right font-mono font-tnum text-ink">{row.unitsPerHour?.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono font-tnum text-ink">{row.profit?.netProfit.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono font-tnum text-ink">
                    {row.profit?.profitPerWorker.status === "ok" ? row.profit.profitPerWorker.data.toFixed(2) : "—"}
                  </td>
                </>
              ) : (
                <td colSpan={3} className="px-3 py-2 font-mono text-xs text-ink-faint">
                  Skipped — {row.skipReason}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
