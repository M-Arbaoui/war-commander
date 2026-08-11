import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { lookupPlayerByUsername, type PlayerLookupResult } from "@/server/player-fns";
import { getReferenceData } from "@/server/reference-fns";
import {
  buildGearCandidates,
  filterSustainable,
  rankBoxFlips,
  currentStatValueForSlot,
  type GearCandidate,
} from "@/lib/advisor/gearAdvisor";
import { rankOwnCompanies, MODE_CONFIG, type AdvisorMode } from "@/lib/advisor/modes";
import { GameIcon } from "@/components/GameIcon";
import type { GearSlot, Item } from "@/lib/warera/models";

export const Route = createFileRoute("/advisor")({
  loader: () => getReferenceData(),
  component: AdvisorPage,
});

const SLOTS: GearSlot[] = ["weapon", "helmet", "chest", "gloves", "pants", "boots"];
const MODES: { value: AdvisorMode; label: string }[] = [
  { value: "economic", label: "Economic" },
  { value: "war", label: "War" },
  { value: "eco-war", label: "Eco-War" },
];

function AdvisorPage() {
  const ref = Route.useLoaderData();
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<AdvisorMode>("eco-war");
  const [budget, setBudget] = useState(1000);
  const [lookup, setLookup] = useState<PlayerLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = MODE_CONFIG[mode];

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const result = await lookupPlayerByUsername({ data: { username } });
      if (result.status !== "ok") {
        setError(result.reason ?? `Couldn't find "${username}" (${result.status}).`);
        setLookup(null);
      } else {
        setLookup(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  if (ref.status !== "ok") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-sm border border-negative/40 bg-negative-dim px-5 py-4 font-mono text-sm">
          <p className="font-semibold text-negative">DATA UNAVAILABLE</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="eyebrow mb-1">Advisor</p>
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-wide text-ink">What should I do next?</h1>
      <p className="mb-6 font-mono text-xs text-ink-dim">
        Enter your username, pick a mode. No simulation, no clutter — just what's worth spending coins on right now.
      </p>

      <div className="mb-6 flex flex-wrap gap-3">
        <input
          className="min-w-48 flex-1 rounded-sm border border-line bg-panel-raised px-3 py-2 font-mono text-sm text-ink"
          placeholder="Your WarEra username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button
          onClick={search}
          disabled={!username || loading}
          className="rounded-sm border border-accent bg-accent-dim px-4 py-2 font-mono text-sm text-accent hover:bg-accent hover:text-void disabled:opacity-40"
        >
          {loading ? "Looking up…" : "Find me"}
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-sm border border-line bg-panel p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide ${
                mode === m.value ? "bg-panel-raised text-accent" : "text-ink-dim hover:text-ink"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 font-mono text-xs text-ink-dim">
          Max coins per item
          <input
            type="number"
            className="w-24 rounded-sm border border-line bg-panel-raised px-2 py-1 font-mono text-xs text-ink font-tnum"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
        </label>
      </div>

      {error && (
        <div className="mb-6 rounded-sm border border-negative/40 bg-negative-dim px-4 py-3 font-mono text-sm text-negative">
          {error}
        </div>
      )}

      {lookup?.profile && <PlayerSummary profile={lookup.profile} />}

      {lookup?.profile && config.showGearAdvice && (
        <GearAdvice profile={lookup.profile} items={ref.items} prices={ref.prices} budget={budget} />
      )}

      {lookup?.profile && config.showCompanyAdvice && (
        <CompanyAdvice companies={lookup.companies ?? []} items={ref.items} prices={ref.prices} />
      )}

      {config.showBoxFlips && <BoxFlips items={ref.items} prices={ref.prices} />}

      {!lookup && !error && (
        <p className="py-10 text-center font-mono text-xs text-ink-faint">
          Look yourself up to see gear and company suggestions tailored to your real level and skills.
        </p>
      )}
    </main>
  );
}

function PlayerSummary({ profile }: { profile: NonNullable<PlayerLookupResult["profile"]> }) {
  return (
    <div className="mb-6 rounded-sm border border-line bg-panel p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-xl text-ink">{profile.username}</p>
          <p className="font-mono text-xs text-ink-dim">
            Level {profile.level} · Rank {profile.militaryRank}
          </p>
        </div>
        <div className="text-right font-mono text-xs text-ink-dim">
          <p>Attack: {profile.skills.attack.total.toFixed(0)}</p>
          <p>Armor: {profile.skills.armor.total.toFixed(0)}</p>
        </div>
      </div>
    </div>
  );
}

function GearAdvice({
  profile,
  items,
  prices,
  budget,
}: {
  profile: NonNullable<PlayerLookupResult["profile"]>;
  items: Record<string, Item>;
  prices: Record<string, number>;
  budget: number;
}) {
  const suggestions = useMemo(() => {
    return SLOTS.map((slot) => {
      const current = currentStatValueForSlot(profile, slot);
      const candidates = buildGearCandidates({
        slot,
        items,
        prices,
        currentStatValue: current,
        maxPrice: budget * 3,
      });
      const sustainable = filterSustainable(candidates, budget);
      return {
        slot,
        current,
        best: sustainable[0] ?? null,
        hasUnverified: candidates.some((c) => c.confidence === "unknown"),
      };
    }).filter((s) => s.best !== null);
  }, [profile, items, prices, budget]);

  return (
    <section className="mb-6">
      <p className="eyebrow mb-2">Sustainable Gear Upgrades</p>
      {suggestions.length === 0 ? (
        <p className="font-mono text-xs text-ink-faint">
          No verified upgrade under your budget found right now. Try raising "max coins per item."
        </p>
      ) : (
        <div className="space-y-2">
          {suggestions.map(({ slot, best, hasUnverified }) => (
            <GearRow key={slot} slot={slot} candidate={best!} hasUnverified={hasUnverified} />
          ))}
        </div>
      )}
      <p className="mt-2 font-mono text-[11px] text-ink-faint">
        Only items with a confirmed stat value (gameConfig flatStats) are ranked here — items without one are
        skipped rather than guessed at. Slot detection is name-based and needs live verification against real item
        codes.
      </p>
    </section>
  );
}

function GearRow({
  slot,
  candidate,
}: {
  slot: GearSlot;
  candidate: GearCandidate;
  hasUnverified: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-sm border border-line bg-panel px-4 py-3">
      <div className="flex items-center gap-3">
        <GameIcon src={null} code={candidate.itemCode} size="sm" />
        <div>
          <p className="font-mono text-sm text-ink">{candidate.itemCode}</p>
          <p className="font-mono text-[10px] uppercase tracking-wide text-ink-dim">{slot}</p>
        </div>
      </div>
      <div className="text-right font-mono text-sm">
        <p className="text-ink">{candidate.price.toFixed(0)} coins</p>
        <p className={candidate.deltaVsCurrent && candidate.deltaVsCurrent > 0 ? "text-positive" : "text-ink-dim"}>
          {candidate.deltaVsCurrent !== null ? `+${candidate.deltaVsCurrent.toFixed(0)} ${candidate.statName}` : "—"}
        </p>
      </div>
    </div>
  );
}

function CompanyAdvice({
  companies,
  items,
  prices,
}: {
  companies: NonNullable<PlayerLookupResult["companies"]>;
  items: Record<string, Item>;
  prices: Record<string, number>;
}) {
  const ranked = useMemo(() => rankOwnCompanies(companies, items, prices), [companies, items, prices]);

  return (
    <section className="mb-6">
      <p className="eyebrow mb-2">Your Companies</p>
      {companies.length === 0 ? (
        <p className="font-mono text-xs text-ink-faint">No companies found for this player.</p>
      ) : (
        <div className="space-y-2">
          {ranked.map((r) => (
            <div
              key={r.itemCode}
              className="flex items-center justify-between rounded-sm border border-line bg-panel px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <GameIcon src={null} code={r.itemCode} size="sm" />
                <p className="font-mono text-sm text-ink">{r.itemCode}</p>
              </div>
              <p className={`font-mono text-sm ${(r.profit?.netProfit ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                {r.status === "ranked" ? `${r.profit?.netProfit.toFixed(2)} / worker-day` : "insufficient data"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BoxFlips({ items, prices }: { items: Record<string, Item>; prices: Record<string, number> }) {
  const boxes = useMemo(() => rankBoxFlips(items, prices).slice(0, 5), [items, prices]);
  if (boxes.length === 0) return null;

  return (
    <section>
      <p className="eyebrow mb-2">Boxes Worth Selling</p>
      <p className="mb-2 font-mono text-[11px] text-ink-faint">
        Sell price only — opening odds aren't published anywhere, so this isn't an "expected value of opening"
        calculation, just what the market pays right now.
      </p>
      <div className="space-y-2">
        {boxes.map((b) => (
          <div
            key={b.itemCode}
            className="flex items-center justify-between rounded-sm border border-line bg-panel px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <GameIcon src={null} code={b.itemCode} size="sm" />
              <p className="font-mono text-sm text-ink">{b.itemCode}</p>
            </div>
            <p className="font-mono text-sm text-positive">{b.sellPrice.toFixed(2)} coins</p>
          </div>
        ))}
      </div>
    </section>
  );
}
