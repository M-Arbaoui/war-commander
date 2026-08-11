import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { lookupCompany, searchCompaniesByUser, type CompanyLookupResult } from "@/server/company-fns";
import { GameIcon } from "@/components/GameIcon";

export const Route = createFileRoute("/companies")({
  component: CompaniesPage,
});

function CompaniesPage() {
  const [companyId, setCompanyId] = useState("");
  const [userId, setUserId] = useState("");
  const [result, setResult] = useState<CompanyLookupResult | null>(null);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCompanyLookup(id: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await lookupCompany({ data: { companyId: id } });
      setResult(r);
      if (r.status !== "ok") setError(r.reason ?? `Lookup failed (${r.status}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runUserSearch() {
    setLoading(true);
    setError(null);
    try {
      const r = await searchCompaniesByUser({ data: { userId } });
      if (r.status !== "ok") {
        setError(r.reason ?? `Search failed (${r.status}).`);
        setCompanyIds([]);
      } else {
        setCompanyIds(r.companyIds);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <p className="eyebrow mb-1">Company Intelligence</p>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-wide text-ink">Companies</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-sm border border-line bg-panel p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-wide text-ink-dim">Lookup by company ID</p>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink"
              placeholder="Company ID"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            />
            <button
              className="rounded-sm border border-accent bg-accent-dim px-3 py-1.5 font-mono text-sm text-accent hover:bg-accent hover:text-void"
              onClick={() => runCompanyLookup(companyId)}
              disabled={!companyId || loading}
            >
              Look up
            </button>
          </div>
        </div>

        <div className="rounded-sm border border-line bg-panel p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-wide text-ink-dim">Search by player (user) ID</p>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-sm border border-line bg-panel-raised px-2 py-1.5 font-mono text-sm text-ink"
              placeholder="User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <button
              className="rounded-sm border border-accent bg-accent-dim px-3 py-1.5 font-mono text-sm text-accent hover:bg-accent hover:text-void"
              onClick={runUserSearch}
              disabled={!userId || loading}
            >
              Search
            </button>
          </div>
          {companyIds.length > 0 && (
            <ul className="mt-3 space-y-1 font-mono text-xs">
              {companyIds.map((id) => (
                <li key={id}>
                  <button className="text-accent hover:underline" onClick={() => runCompanyLookup(id)}>
                    {id}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-sm border border-negative/40 bg-negative-dim px-4 py-3 font-mono text-sm text-negative">
          {error}
        </div>
      )}

      {result?.status === "ok" && result.company && <CompanyDetail result={result} />}
    </main>
  );
}

function CompanyDetail({ result }: { result: CompanyLookupResult }) {
  const company = result.company!;
  return (
    <div className="rounded-sm border border-line bg-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GameIcon src={null} code={company.itemCode} size="md" />
          <div>
            <p className="font-display text-xl text-ink">{company.name}</p>
            <p className="font-mono text-xs text-ink-dim">
              {company.itemCode} · {result.region?.name ?? "unknown region"}
            </p>
          </div>
        </div>
        <Link
          to="/builder"
          className="rounded-sm border border-accent bg-accent-dim px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent hover:text-void"
        >
          Open in Builder →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 font-mono text-sm sm:grid-cols-4">
        <Stat label="Workers" value={String(company.workerCount)} />
        <Stat label="Full" value={company.isFull ? "Yes" : "No"} />
        <Stat label="Est. value" value={company.estimatedValue.toFixed(0)} />
        <Stat label="Concrete invested" value={company.concreteInvested.toFixed(0)} />
        <Stat label="Automated Engine Lv" value={String(company.upgrades.automatedEngine)} />
        <Stat label="Break Room Lv" value={String(company.upgrades.breakRoom)} />
        <Stat label="Storage Lv" value={String(company.upgrades.storage)} />
        <Stat
          label="Est. units/hr"
          value={
            result.estimatedUnitsPerHour?.status === "ok" ? result.estimatedUnitsPerHour.data.toFixed(2) : "—"
          }
        />
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-1 font-mono text-xs uppercase tracking-wide text-ink-dim">Est. net profit / hour</p>
        <p
          className={`font-mono text-lg font-tnum ${
            result.estimatedNetProfitPerHour?.status === "ok"
              ? result.estimatedNetProfitPerHour.data >= 0
                ? "text-positive"
                : "text-negative"
              : "text-ink-faint"
          }`}
        >
          {result.estimatedNetProfitPerHour?.status === "ok"
            ? result.estimatedNetProfitPerHour.data.toFixed(2)
            : "DATA UNAVAILABLE"}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink-dim">{label}</p>
      <p className="font-tnum text-ink">{value}</p>
    </div>
  );
}
