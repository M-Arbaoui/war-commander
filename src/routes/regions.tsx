import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getReferenceData } from "@/server/reference-fns";
import type { Region } from "@/lib/warera/models";

export const Route = createFileRoute("/regions")({
  loader: () => getReferenceData(),
  component: RegionsPage,
});

function RegionsPage() {
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

  return <RegionsBody regions={ref.regions} />;
}

function RegionsBody({ regions }: { regions: Record<string, Region> }) {
  const allRegions = useMemo(() => Object.entries(regions), [regions]);
  const resourceCodes = useMemo(() => {
    const set = new Set<string>();
    for (const [, region] of allRegions) {
      if (region.resourceBonus) set.add(region.resourceBonus.resourceCode);
    }
    return Array.from(set).sort();
  }, [allRegions]);

  const [resourceFilter, setResourceFilter] = useState<string>("all");

  const filtered = allRegions.filter(([, region]) =>
    resourceFilter === "all" ? true : region.resourceBonus?.resourceCode === resourceFilter,
  );

  const best =
    resourceFilter !== "all"
      ? [...filtered].sort(
          (a, b) => (b[1].resourceBonus?.bonusPercent ?? 0) - (a[1].resourceBonus?.bonusPercent ?? 0),
        )[0]
      : null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <p className="eyebrow mb-1">World Map</p>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-wide text-ink">Regions</h1>

      <div className="mb-4 flex items-center gap-2">
        <label className="font-mono text-xs uppercase tracking-wide text-ink-dim">Resource</label>
        <select
          className="rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink"
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
        >
          <option value="all">All regions</option>
          {resourceCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      {best && (
        <div className="mb-4 rounded-sm border border-positive/40 bg-positive-dim px-4 py-3 font-mono text-sm">
          <span className="text-positive">BEST REGION FOR {resourceFilter.toUpperCase()}:</span>{" "}
          <span className="text-ink">
            {best[1].name} (+{best[1].resourceBonus?.bonusPercent}%)
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-sm border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-panel text-left font-mono text-xs uppercase tracking-wide text-ink-dim">
              <th className="px-3 py-2">Region</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2 text-right">Development</th>
              <th className="px-3 py-2 text-right">Resistance</th>
              <th className="px-3 py-2">Resource bonus</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map(([id, region]) => (
              <tr key={id} className="border-b border-line hover:bg-panel-raised">
                <td className="px-3 py-2 font-mono text-ink">
                  {region.name}
                  {region.isCapital && <span className="ml-1 text-neutral">★</span>}
                </td>
                <td className="px-3 py-2 font-mono text-ink-dim">{region.countryCode}</td>
                <td className="px-3 py-2 text-right font-mono font-tnum text-ink">{region.development}</td>
                <td className="px-3 py-2 text-right font-mono font-tnum text-ink">
                  {region.resistance}/{region.resistanceMax}
                </td>
                <td className="px-3 py-2 font-mono text-sm">
                  {region.resourceBonus ? (
                    <span className="text-positive">
                      +{region.resourceBonus.bonusPercent}% {region.resourceBonus.resourceCode}
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 200 && (
        <p className="mt-2 font-mono text-xs text-ink-faint">
          Showing first 200 of {filtered.length} matching regions.
        </p>
      )}
    </main>
  );
}
