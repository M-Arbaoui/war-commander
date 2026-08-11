import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { getMarketOverview, type MarketRow } from "@/server/market-fns";
import { GameIcon } from "@/components/GameIcon";
import {
  CATEGORY_FILTERS,
  SORT_OPTIONS,
  matchesCategory,
  sortRows,
  formatMoney,
  formatPercent,
  marginColorClass,
  type CategoryFilter,
  type SortKey,
} from "@/lib/market/marketView";

const marketSearchSchema = z.object({
  category: z.enum(CATEGORY_FILTERS).optional().default("all"),
  sort: z
    .enum(["craft-opportunity", "margin", "profit", "cost", "spread"])
    .optional()
    .default("craft-opportunity"),
});

export const Route = createFileRoute("/market")({
  validateSearch: marketSearchSchema,
  loaderDeps: ({ search }) => ({ category: search.category, sort: search.sort }),
  loader: () => getMarketOverview(),
  component: MarketPage,
});

function MarketPage() {
  const data = Route.useLoaderData();
  const { category, sort } = Route.useSearch();

  if (data.gameConfigStatus !== "ok" || data.pricesStatus !== "ok") {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16">
        <DataUnavailableBanner gameConfigStatus={data.gameConfigStatus} pricesStatus={data.pricesStatus} />
      </main>
    );
  }

  const filtered = data.rows.filter((row) => matchesCategory(row, category));
  const sorted = sortRows(filtered, sort);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Market Intelligence</p>
          <h1 className="font-display text-3xl font-semibold tracking-wide text-ink">Item Market</h1>
        </div>
        <ControlStrip category={category} sort={sort} />
      </div>

      {data.skippedNoPrice.length > 0 && (
        <p className="mb-4 font-mono text-xs text-ink-faint">
          {data.skippedNoPrice.length} tradable item{data.skippedNoPrice.length === 1 ? "" : "s"} omitted — no market
          price returned by itemTrading.getPrices.
        </p>
      )}

      <MarketTable rows={sorted} />
    </main>
  );
}

function ControlStrip({ category, sort }: { category: CategoryFilter; sort: SortKey }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 rounded-sm border border-line bg-panel p-1">
        {CATEGORY_FILTERS.map((c) => (
          <Link
            key={c}
            to="/market"
            search={(prev) => ({ ...prev, category: c })}
            className="rounded-sm px-3 py-1 font-mono text-xs uppercase tracking-wide text-ink-dim transition-colors hover:text-ink [&.active]:bg-panel-raised [&.active]:text-accent"
            activeProps={{ className: "active" }}
            activeOptions={{ exact: false }}
          >
            {c}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-1.5 font-mono text-xs text-ink-dim">
        <span>Sort</span>
        {SORT_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            to="/market"
            search={(prev) => ({ ...prev, sort: opt.value })}
            className={`rounded-sm px-2 py-0.5 transition-colors hover:text-ink ${sort === opt.value ? "bg-panel-raised text-accent" : ""}`}
          >
            {opt.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function DataUnavailableBanner({
  gameConfigStatus,
  pricesStatus,
}: {
  gameConfigStatus: string;
  pricesStatus: string;
}) {
  return (
    <div className="rounded-sm border border-negative/40 bg-negative-dim px-5 py-4 font-mono text-sm text-ink">
      <p className="mb-1 font-semibold text-negative">DATA UNAVAILABLE</p>
      <p className="text-ink-dim">
        gameConfig.getGameConfig: {gameConfigStatus} · itemTrading.getPrices: {pricesStatus}
      </p>
    </div>
  );
}

function MarketTable({ rows }: { rows: MarketRow[] }) {
  if (rows.length === 0) {
    return <p className="py-12 text-center font-mono text-sm text-ink-dim">No items match this filter.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-panel text-left font-mono text-xs uppercase tracking-wide text-ink-dim">
            <Th>Item</Th>
            <Th>Type</Th>
            <Th>Rarity</Th>
            <Th align="right">Avg</Th>
            <Th align="right">Best Buy</Th>
            <Th align="right">Best Sell</Th>
            <Th align="right">Spread</Th>
            <Th align="right">Craft Cost</Th>
            <Th align="right">Craft Margin</Th>
            <Th align="right">Profit / Unit</Th>
            <Th align="center">Verdict</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <MarketRowView key={row.itemCode} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={`border-b border-line px-3 py-2 font-mono text-sm text-ink font-tnum ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}

function MarketRowView({ row }: { row: MarketRow }) {
  return (
    <tr className="transition-colors hover:bg-panel-raised">
      <Td>
        <div className="flex items-center gap-2">
          <GameIcon src={row.iconUrl} code={row.itemCode} size="sm" />
          <span className="font-body text-ink">{row.itemCode}</span>
        </div>
      </Td>
      <Td className="capitalize text-ink-dim">{row.category}</Td>
      <Td className="capitalize text-ink-dim">{row.rarity ?? "—"}</Td>
      <Td align="right">{formatMoney(row.average)}</Td>
      <Td align="right">{formatMoney(row.bestBuy)}</Td>
      <Td align="right">{formatMoney(row.bestSell)}</Td>
      <Td align="right">{formatMoney(row.spread)}</Td>
      <Td align="right">{row.craftCost.status === "ok" ? formatMoney(row.craftCost.data) : "—"}</Td>
      <Td align="right" className={marginColorClass(row.craftMargin)}>
        {formatPercent(row.craftMargin)}
      </Td>
      <Td align="right" className={marginColorClass(row.profitPerProductionPoint)}>
        {row.profitPerProductionPoint.status === "ok" ? formatMoney(row.profitPerProductionPoint.data) : "—"}
      </Td>
      <Td align="center">
        <VerdictReticle verdict={row.verdict} />
      </Td>
    </tr>
  );
}

const VERDICT_STYLES: Record<MarketRow["verdict"], { label: string; color: string }> = {
  CRAFT: { label: "CRAFT", color: "text-positive" },
  BUY: { label: "BUY", color: "text-accent" },
  NEUTRAL: { label: "NEUTRAL", color: "text-neutral" },
  UNKNOWN: { label: "N/A", color: "text-ink-faint" },
};

/**
 * The page's signature element: the craft/buy call rendered as a targeting-
 * reticle bracket rather than a generic colored pill, tying the market's
 * single most decision-relevant cell back to the "tactical command center"
 * thesis without adding motion or decoration anywhere else in the table.
 */
function VerdictReticle({ verdict }: { verdict: MarketRow["verdict"] }) {
  const style = VERDICT_STYLES[verdict];
  const borderColor = verdict === "UNKNOWN" ? "border-line-strong" : "border-current";
  return (
    <span className="relative inline-flex items-center px-2.5 py-1">
      <span className={`absolute left-0 top-0 h-2 w-2 border-l border-t ${borderColor} ${style.color}`} />
      <span className={`absolute right-0 top-0 h-2 w-2 border-r border-t ${borderColor} ${style.color}`} />
      <span className={`absolute bottom-0 left-0 h-2 w-2 border-b border-l ${borderColor} ${style.color}`} />
      <span className={`absolute bottom-0 right-0 h-2 w-2 border-b border-r ${borderColor} ${style.color}`} />
      <span className={`relative font-mono text-[11px] font-semibold tracking-wider ${style.color}`}>
        {style.label}
      </span>
    </span>
  );
}
