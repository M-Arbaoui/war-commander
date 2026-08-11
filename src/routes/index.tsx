import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getDashboardData } from "@/server/dashboard-fns";
import { loadBattleHistory, type BattleHistoryEntry } from "@/lib/battleHistory";
import { GameIcon } from "@/components/GameIcon";

export const Route = createFileRoute("/")({
  loader: () => getDashboardData(),
  component: Dashboard,
});

function Dashboard() {
  const data = Route.useLoaderData();
  const [recentSims, setRecentSims] = useState<BattleHistoryEntry[]>([]);

  useEffect(() => {
    setRecentSims(loadBattleHistory().slice(0, 8));
  }, []);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Command Overview</p>
          <h1 className="font-display text-3xl font-semibold tracking-wide text-ink">Dashboard</h1>
        </div>
        <StatusPill status={data.apiStatus} cacheEntryCount={data.cacheEntryCount} />
      </div>

      {data.apiStatus !== "ok" ? (
        <div className="rounded-sm border border-negative/40 bg-negative-dim px-5 py-4 font-mono text-sm">
          <p className="mb-1 font-semibold text-negative">DATA UNAVAILABLE</p>
          <p className="text-ink-dim">
            gameConfig.getGameConfig / itemTrading.getPrices: {data.apiStatus}. Nothing below can be computed
            without them.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="Best Craft Opportunities" href="/market">
            {data.topCraftOpportunities.length === 0 ? (
              <EmptyNote text="No craftable items with resolvable cost right now." />
            ) : (
              <ul className="divide-y divide-line">
                {data.topCraftOpportunities.map((m) => (
                  <li key={m.itemCode} className="flex items-center justify-between py-2 font-mono text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <GameIcon src={null} code={m.itemCode} size="xs" />
                      {m.itemCode}
                    </span>
                    <span
                      className={m.craftMarginPercent && m.craftMarginPercent > 0 ? "text-positive" : "text-negative"}
                    >
                      {m.craftMarginPercent !== null ? `${m.craftMarginPercent.toFixed(1)}%` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Best Production Opportunities" href="/builder">
            {data.bestProductionOpportunities.length === 0 ? (
              <EmptyNote text="No producible items with resolvable profit right now." />
            ) : (
              <ul className="divide-y divide-line">
                {data.bestProductionOpportunities.map((r) => (
                  <li key={r.itemCode} className="flex items-center justify-between py-2 font-mono text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <GameIcon src={null} code={r.itemCode} size="xs" />
                      {r.itemCode}
                    </span>
                    <span className={(r.profit?.netProfit ?? 0) >= 0 ? "text-positive" : "text-negative"}>
                      {r.profit?.netProfit.toFixed(2) ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="My Company" href="/companies">
            <EmptyNote text="Look up a company by ID to see its live profit estimate." />
          </Panel>

          <Panel title="Combat Simulator" href="/combat">
            <EmptyNote text="Run a war or bounty simulation to see expected damage and net reward here." />
          </Panel>

          <Panel title="Recent Simulations" href="/combat" className="lg:col-span-2">
            {recentSims.length === 0 ? (
              <EmptyNote text="No simulations saved yet — run one from the Combat Simulator." />
            ) : (
              <ul className="divide-y divide-line">
                {recentSims.map((sim) => (
                  <li key={sim.id} className="flex items-center justify-between py-2 font-mono text-sm">
                    <span className="text-ink-dim">
                      <span className="uppercase text-accent">{sim.mode}</span> · {sim.label} ·{" "}
                      {new Date(sim.timestamp).toLocaleString()}
                    </span>
                    <span className={sim.netReward >= 0 ? "text-positive" : "text-negative"}>
                      {sim.netReward.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </main>
  );
}

function StatusPill({ status, cacheEntryCount }: { status: string; cacheEntryCount: number }) {
  const color = status === "ok" ? "text-positive" : status === "unavailable" ? "text-neutral" : "text-negative";
  return (
    <div className="flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-1.5 font-mono text-xs">
      <span className={color}>● API {status.toUpperCase()}</span>
      <span className="text-ink-faint">· {cacheEntryCount} cached entries (this instance)</span>
    </div>
  );
}

function Panel({
  title,
  href,
  children,
  className = "",
}: {
  title: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-sm border border-line bg-panel p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="eyebrow">{title}</p>
        <Link to={href} className="font-mono text-xs text-accent hover:underline">
          Open →
        </Link>
      </div>
      {children}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="py-4 font-mono text-xs text-ink-faint">{text}</p>;
}
