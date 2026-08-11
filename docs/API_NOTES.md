# WARERA COMMAND — Phase 1 API Notes

Phase 1 deliverable: WarEra API discovery, server-side API layer, normalized
types, Zod schemas, caching strategy, and tests. **No UI in this phase.**

## Sourcing — read this before trusting any shape below

This build environment cannot make outbound HTTP requests to `api2.warera.io`
(egress is restricted to package registries + GitHub). So instead of hitting
the live API directly, every raw shape in `src/lib/warera/types.ts` was built
from **real, previously-captured request/response pairs** published in two
public, third-party reverse-engineering projects for this exact API:

1. **[`majimawrks/warera-api-docs`](https://github.com/majimawrks/warera-api-docs)**
   — community-maintained per-endpoint docs (`spec.md` / `spec.json`) with
   real captured example payloads, generated from live network traffic.
2. **[`WarEraProjects/TRPC`](https://github.com/WarEraProjects/TRPC)**
   — an open-source typed API client. Its `src/api/Responses.d.ts` and
   `src/api/warera-openapi.d.ts` were generated from real captured payloads
   across ~35 procedures and give exact field names/types even where no
   single example JSON blob was published.

**Nothing in this codebase was invented.** Every procedure in
`src/lib/warera/procedures.ts` carries a `confidence` field:

| Confidence | Meaning |
|---|---|
| `captured` | We have a real example response body. |
| `typed-only` | We have real field names + types, no example payload. |
| `unverified` | Mentioned in the product brief, no public capture found. |

**Action required before Phase 2+ ships to production:** run
`scripts/verify-endpoints.ts` from an environment that can reach
`api2.warera.io` (e.g. your machine, or a Vercel deployment) and treat every
`confidence` rating here as provisional until that smoke test has actually
run. Fill in real sample IDs (a company ID, region ID, battle ID, etc. you've
observed in-game) at the top of that script first.

## Endpoint-by-endpoint findings

### `itemTrading.getPrices` — confidence: captured
Returns a **flat map of every item code → average price**. There is no
per-item filtering — the `itemCode` input param exists in some client
wrappers but the live API appears to ignore it and always return the full
map. There is no bid/ask split here; that only comes from `tradingOrder.getTopOrders`.

### `tradingOrder.getTopOrders` — confidence: captured
Input: `{ itemCode: string }`. Output: `{ buyOrders: [...], sellOrders: [...] }`,
each order carrying `_id, user, itemCode, quantity, price, offerAt, type`.
`bestBuy` = highest price in `buyOrders`; `bestSell` = lowest price in
`sellOrders`. **If a side is empty, we return `null`, never `0`** — a market
with no sell orders is "no ask", not "free."

### `gameConfig.getGameConfig` — confidence: typed-only
The single most important static-data endpoint. Real captured structure
includes `items` (every item's `productionPoints` + `productionNeeds`, i.e.
the entire recipe graph), `upgradesConfig` (every building's per-level
`steelCost`/`stats`), `skills` (skill-point cost tables), and `battle` (war
bonus percentages, `healthCost`, `maxRounds`, etc. — real game-balance
constants, not guesses). This is aggressively cached (30 min TTL) since it's
essentially static game config, not live state.

**Important honesty note on `battle`:** `gameConfig.battle` exposes bonus
*modifiers* (alliance bonus %, patriotic bonus %, etc.) — it does **not**
expose the underlying damage formula that combines attack/armor/dodge/crit
into a final number. No endpoint anywhere does. See "What we deliberately do
NOT have" below.

### `company.getById` / `company.getCompanies` — confidence: typed-only
`getById` returns one company's `production`, `workerCount`,
`activeUpgradeLevels`, `estimatedValue`, etc. **`getCompanies` returns a page
of company ID *strings*, not full objects** (`{ items: string[], nextCursor?
}`) — you must follow up with `getById` per ID. This is easy to get wrong and
is called out explicitly in `procedures.ts` and in `getCompanyIds()`'s doc
comment.

### `company.getProductionBonus` / `company.getRecommendedRegionIdsByItemCode` — confidence: typed-only
Community-documented **custom endpoints**, not in the official `/docs` list.
Included because they directly power two brief requirements (company profit
breakdown, "best region for this resource") — but flagged for extra scrutiny
in the live smoke test since they're less battle-tested than the core CRUD
endpoints.

### `worker.getWorkers` / `workOffer.getWorkOffersPaginated` — confidence: typed-only
`getWorkers` groups by company; we derive `workerCount` from the length of
the (opaque) `workers` array rather than trusting a separate count field, to
avoid a second source of truth. `workOffer` gives per-offer `wage`,
`quantity`, and optional `minEnergy`/`minProduction`/`citizenship` gates —
normalized to `null` (not omitted, not `0`) when absent.

### `region.getRegionsObject` / `region.getById` — confidence: captured
Keyed-by-ID object of ~700+ regions. Each region's `deposit` field (when
present) is the "region resource bonus" the brief asks about —
`{ type, bonusPercent, startsAt, endsAt }`. **Most regions have no `deposit`
at all** — we return `resourceBonus: null` for those, never a fabricated 0%.

### `country.getAllCountries` / `country.getCountryById` — confidence: captured
Includes `taxes`, `allies`, `warsWith`, and a `rankings` map (damage/points
leaderboards per country).

### `upgrade.getUpgradeByTypeAndEntity` — confidence: typed-only
Input needs the upgrade type plus **one of** `companyId` / `regionId` /
`muId` depending on what's being upgraded. Our normalizer fails closed
(`unavailable`) if the response has none of those three owner fields set,
rather than guessing which entity it belongs to.

### `battle.getLiveBattleData` / `battleRanking.getRanking` — confidence: captured
Live per-round damage/points totals and country/user/mu leaderboards for a
battle. Cached only 5s (`live-combat` tier) since the brief wants this to
feel live.

### `round.getLastHits` — confidence: typed-only
Per-hit combat log: `damages`, `isCriticalHit`, `missed`, and the exact
`weapon`/`equipments`/`ammo` used, including **live durability
(`state`/`maxState`)** on each piece of gear. This is genuinely useful for
building intuition about the game's combat system empirically — but see the
next section on why it can't be used to *derive* the damage formula.

### `mu.getById` — confidence: captured
Military unit profile: members, roles, `leveling.monthlyDamages`, rankings.

### `inventory.fetchCurrentEquipment` — confidence: typed-only, auth: required
Returns the **logged-in player's own** equipped gear per slot
(`weapon/helmet/chest/gloves/pants/boots`) plus loaded `ammo`. **This
requires the player's own session token.** WARERA COMMAND has no login flow
in V1 and will not implement one; `getCurrentEquipment()` only works if a
user pastes in their own token locally, and that token is never persisted
server-side beyond the single request it's used for.

## What we deliberately do NOT have (and will not fabricate)

Per the brief's explicit rules ("never invent damage formulas," "never
invent game mechanics," "prefer DATA UNAVAILABLE over fake numbers"), Phase 1
research turned up **no endpoint, in either source project, that exposes**:

- The actual **damage formula** — how attack/armor/dodge/precision/crit
  combine into a final hit number. `gameConfig.battle` gives bonus
  *modifiers* (alliance %, patriotic %, etc.), and `round.getLastHits` gives
  *observed outputs*, but neither gives the formula itself. The combat engine
  (Phase 9) must treat this as a hard boundary: it can show the *modifiers*
  that are documented, but must show `INSUFFICIENT DATA` for any raw
  base-damage number it can't source from a real field.
- **Box/case drop probabilities or contents.** Confirmed unavailable in both
  sources. The Box Analyzer (a later phase) must show "Probability data
  unavailable" per the brief, with an architecture that accepts verified data
  later — it must not use `round.getLastHits` observations to *statistically
  infer* probabilities either, since that would effectively be fabricating
  game mechanics from a sample.
- **Gear rarity on equipped/round items.** `RawRoundEquipment`,
  `RawRoundWeapon`, and `RawEquippedItem` (inventory/combat-log shapes) don't
  carry a `rarity` field — only `gameConfig.items` (the catalog) does. Our
  `Gear` model sets `rarity: null` for anything normalized from those combat
  shapes rather than trying to cross-reference and risk a stale/incorrect join.
- **Official condition-state labels** (GOOD/LOW/DAMAGED/BROKEN). The API
  exposes raw `state`/`maxState` durability numbers, but never labels them.
  The bucket boundaries in `normalizers.ts::conditionFromState()` are a
  **WARERA COMMAND presentation choice**, documented as such in code, not a
  game mechanic — this must be called out in the UI too once Phase 8 builds
  the gear cards.

## Caching strategy implemented

| Tier | TTL | Used for |
|---|---|---|
| `static-config` | 30 min | `gameConfig.getGameConfig` |
| `market` | 60s | `itemTrading.getPrices`, `tradingOrder.getTopOrders` (per brief) |
| `world-state` | 5 min | companies, workers, work offers, regions, countries, upgrades, mu |
| `live-combat` | 5s | live battle data, battle rankings, round hits |
| `no-cache` | 0 | reserved for anything auth-scoped / mutating |

Implemented as a process-level in-memory `TtlCache` (`cache.ts`) with
request de-duplication for concurrent identical calls. Known V1 limitation,
documented in code: on serverless (Vercel), each cold-started instance has
its own cache — acceptable per the brief's "no Postgres/Redis required for
V1," but worth a "cache freshness" indicator on the future dashboard rather
than assuming perfect sharing.

## What's built vs. what's next

**Built (Phase 1):**
- `procedures.ts` — endpoint registry with cache tier + confidence + sourcing.
- `types.ts` — raw API shapes mirroring real captured data 1:1.
- `schemas.ts` — Zod runtime validation for every raw shape.
- `client.ts` — server-only fetch with timeout, retry (exponential backoff,
  skips 4xx and application-level tRPC errors), and dev logging.
- `cache.ts` — TTL cache + in-flight request de-duplication.
- `normalizers.ts` — raw → internal model mapping, `null`-not-fabricated
  throughout.
- `models.ts` — internal normalized types + the `DataResult<T>` union that
  makes "ok / unavailable / error" a type-level guarantee, not a convention.
- `api.ts` — the only public entry point (`warera.*`), composing
  cache → transport → validation → normalization.
- 56 unit tests (cache, client w/ mocked fetch, normalizers against
  realistic fixtures, api.ts w/ mocked transport) — all passing.
- `scripts/verify-endpoints.ts` — live smoke test to run once real network
  access is available.

**Explicitly NOT done yet (later phases per the brief's development order):**
- No routes/UI yet — Phase 4 (Market page) is next.
- No live integration test has actually run against `api2.warera.io` — see
  "Action required" above.

---

## Phase 2 — Data normalization + server function wiring

Normalization was substantially already done in Phase 1 (`normalizers.ts`).
What Phase 2 added was closing the loop the brief requires: **"Do NOT call
the WarEra API directly from the browser."**

- `src/server/warera.server.ts` — TanStack Start `createServerFn` wrappers
  around every `warera.*` function in `api.ts`. This is now the *only*
  browser-facing boundary; route loaders/components (Phase 4+) must import
  from here, never from `lib/warera/api.ts` or lower.
- These wrappers are intentionally thin and untested directly — all real
  logic already has full coverage in `lib/warera/__tests__/`. Testing a
  `createServerFn` handler in isolation would just re-test "does JS call a
  function," not anything specific to the Start runtime.
- **Real bug caught by TanStack Start's own type-checker**, not by us:
  `getGameConfig`'s `skills`/`battle` fields were built from `.passthrough()`
  Zod schemas, which infer a `[key: string]: unknown` catch-all. Start's
  serialization validator correctly refused to compile that as a server
  function return type, since `unknown` isn't provably serializable across
  the client/server boundary. Fixed by giving `SkillLevelSchema` and
  `GameConfigBattleSchema` (the two schemas actually exposed through a
  server function) fully-typed, non-passthrough shapes.

## Phase 3 — Economy calculation engine

Built `src/lib/economy/`: `recipes.ts`, `production.ts`, `profit.ts`,
`optimizer.ts`, `upgrades.ts`. 40 new tests, all passing.

**Important honesty note, worth reading before Phase 5 (Company Builder)
goes further:** just like the damage formula in combat, **no endpoint
anywhere documents WarEra's actual production-rate formula** — the tick
duration, or how skill/upgrade/region/deposit bonus percentages combine.
`Item.productionPoints` and the various bonus percentages are real API
fields; the formula combining them into units/hour is not published
anywhere either source project captured.

So the economy engine draws the same line Phase 1 drew for combat:

- **`recipes.ts`** — fully deterministic. Recursively resolves the true
  bill-of-materials cost of any item (e.g. Iron → Steel → Rifle) using only
  the real recipe graph and real market prices. No assumptions.
- **`profit.ts`** — pure financial arithmetic over numbers the caller
  already has. No assumptions. Every function that could otherwise return
  `0`/`Infinity`/`NaN` for a degenerate input (zero revenue, zero workers,
  zero units) returns `unavailable`/`error` instead.
- **`production.ts`** — the one place a real modeling assumption is
  unavoidable to deliver units/hour at all. `calculateProductionRate()`
  assumes bonuses stack additively and a default 1-tick-per-hour cadence,
  and every result is tagged `confidence: "estimated"` with its assumptions
  spelled out in the response itself — not hidden in a comment. A
  `calibrateTickHoursFromObservedRate()` helper lets a user replace the
  assumption with a number back-solved from their own real company's
  observed output, which is the intended path to ground-truth this before
  trusting it for anything money-critical.
- **`optimizer.ts` / `upgrades.ts`** — compose the above. Ranking always
  shows *why* an item was skipped (no price, unresolvable recipe, missing
  stat) rather than silently dropping it from the list.

**Bug caught while writing tests (and fixed before it shipped):**
`flattenCostBreakdown()` initially summed each raw-material leaf's cost
without weighting it by how many units of that leaf are actually needed per
unit of the root item — it would have under-counted iron/wood contributions
in any multi-level recipe. Fixed by carrying an explicit
`quantityPerUnitOfParent` on every `RecipeCostNode` and multiplying it
through on the walk down, verified by a test asserting the flattened
breakdown sums back to exactly the root's total unit cost.

## Phase 4 — Market page (first UI phase)

Built the actual TanStack Start application shell and the `/market` route:
`vite.config.ts`, root route + command-bar shell, the dark tactical design
system (`src/styles/app.css`), a reusable `<GameIcon>` component, and
`src/routes/market.tsx` backed by `src/server/market-fns.ts` (a server-only
aggregator combining `warera.*` + the economy engine).

**Design approach:** followed the frontend-design skill's process —
committed to a token system (surfaces/ink/positive-negative-neutral/accent),
a deliberate type pairing (Big Shoulders Condensed for display, IBM Plex
Sans for body, IBM Plex Mono for all numeric data — chosen for their
engineering/terminal heritage rather than defaulting to Inter), and one
signature element: the CRAFT/BUY/NEUTRAL verdict rendered as a
targeting-reticle bracket instead of a generic colored pill, tying the
table's single most decision-relevant cell back to the "tactical command
center" thesis without adding motion or decoration anywhere else.

**Two real, tool-caught bugs, not self-reported:**
1. **TanStack Start's own serialization type-checker** rejected
   `getGameConfig`'s return type at `vite build` time — two `.passthrough()`
   Zod schemas inferred an unprovably-serializable `unknown` catch-all across
   the server/client boundary. Fixed by giving `SkillLevelSchema` and
   `GameConfigBattleSchema` fully-typed shapes.
2. **TanStack Start's import-protection plugin** treats any filename
   matching `*.server.*` as fully client-unreachable — including its own
   `createServerFn` exports, which need to cross that boundary via the RPC
   bridge. This is the opposite of what the `.server.ts` naming convention
   implied. Renamed `warera.server.ts` → `warera-fns.ts` and
   `market.server.ts` → `market-fns.ts`; `vite build` passed immediately after.

**A real sandbox limitation, disclosed rather than glossed over:**
background processes do not survive between tool calls in this environment,
even with `setsid`/`nohup`/explicit PID tracking — so I could not boot the
built server and `curl` it to visually confirm the rendered page. The
production build itself (`vite build`, both client and SSR bundles) is
clean and route-tree generation succeeded, which is real evidence the app
compiles and every import resolves — but it is not the same as having seen
the page render. **Recommended before trusting this further:** run
`npm run build && node dist/server/server.js` (or `npx vite dev`) locally
and open `/market`.

To compensate for not being able to visually verify, the market page's
filtering/sorting/formatting logic was extracted into a framework-free
module (`src/lib/market/marketView.ts`) specifically so it has real unit
test coverage (15 tests) independent of whether the page can be rendered in
this sandbox — every sort mode, the "unavailable data sinks to the bottom,
never treated as 0" rule, and every formatter are verified directly.

**Explicitly NOT done yet:** Phases 5–12 (Company Builder, Companies,
Regions, Upgrades UI, Gear/inventory UI, combat engine, war/bounty
simulator, loadout optimizer, dashboard). No live integration test has
actually run against `api2.warera.io` — see "Action required" above.

---

## Phases 5–12 — full build-out (delivered in one pass)

Everything below was built to close out the remaining brief in a single
continuation. Given the scope, this pass prioritized **breadth with honest
labeling** over exhaustive polish on any one page — every route is real,
wired to real (or clearly-labeled-estimated) data, and covered by the
132-test suite where the logic is pure/extractable. What it has **not**
had is a visual verification pass — see DEPLOY.md.

### A second source confirmed two real transport bugs
Cloned `majimawrks/warera-fetch` (a Python client for this same API) a
second time and found two things Phase 1 had wrong:
1. **Error envelopes are sometimes nested** as `{"error":{"json":{"message":
   ...}}}` rather than the flat `{"error":{"message":...}}` shape Phase 1
   assumed. `client.ts` now checks both.
2. **HTTP 429 exists and needs exponential backoff with jitter** — the
   original retry logic only retried 5xx. Fixed, with a test.

### Combat engine (Phase 9) — same honesty pattern as production.ts
`src/lib/combat/{gear,damage,war,optimizer}.ts`. Gear-bonus aggregation
(`gear.ts`) is fully deterministic — it sums real per-item stats from the
API. The damage formula itself (`damage.ts`) is not published anywhere, so
it's an explicit, labeled model (`confidence: "estimated"`) that uses the
weapon's `attack` stat as base damage and stacks bonuses additively — same
posture as the production-rate model, for the same reason. Reward amounts
are never derived; they're always caller-supplied, because no endpoint
exposes a reward formula either. 16 tests.

### Company Builder (Phase 5)
`/builder` — fully interactive, client-side reactive (no round-trip per
keystroke): worker count, skill %, wage, region (auto-detects matching
resource deposit bonus), and upgrade levels, live-computing production
rate, resource consumption, and full profit breakdown via the Phase 3
engine, plus a "best product for this setup" ranked table. Pure logic
extracted to `src/lib/builder/buildSetup.ts` (5 tests) so it's verifiable
independent of rendering.

**Known compromise, disclosed:** the upgrade-type → production-bonus-stat
mapping is a heuristic (first stat key matching `/production/i`), not
confirmed per upgrade type. Same caveat carried into the Upgrades page.

### Companies / Regions (Phase 6)
`/companies` — lookup by company ID or by owner user ID (via
`company.getCompanies`, which the brief's own docs and Phase 1's findings
warn only returns ID strings, not full objects — handled correctly).
Shows a live company profit estimate and an "Open in Builder" link.
`/regions` — full region table, resource filter, "best region for this
resource" ranking, using the real `deposit` field from `region.getRegionsObject`.

### Upgrades (Phase 7)
`/upgrades` — level-by-level payback ranking via the Phase 3
`evaluateUpgradeLevels` engine, with the production-bonus stat name
exposed as an editable field (since it's unconfirmed per upgrade type) and
a visible note telling the user to try a different value if a level shows
no payback.

### Gear (Phase 8)
`/combat/gear` — real equipped-gear display via `inventory.fetchCurrentEquipment`,
which requires the player's own session token (no login flow exists, by
design — see Phase 1). Token is a per-request form field, never persisted.
Condition badges (GOOD/LOW/DAMAGED/BROKEN/UNEQUIPPED) use the thresholds
defined in `normalizers.ts::conditionFromState`, explicitly disclosed in
the UI as a WARERA COMMAND presentation choice, not a game mechanic.
**Disclosed limitation:** no endpoint found exposes a full inventory of
owned-but-unequipped gear distinct from current equipment — so only the 6
equip slots are shown, never a broader inventory list.

### Combat Simulator + Loadout Optimizer (Phases 10–11)
`/combat` — War/Bounty mode toggle, a war-bonus **percentage input**
(deliberately not the brief's example +20/+35/+50/+70 tier buttons, since
no endpoint confirms WarEra actually exposes discrete selectable tiers —
using invented tier values would have violated the brief's own "never use
fixed example values" instruction), a multi-row loadout table (add/remove
alternatives), full damage breakdown display, reward/cost/net-reward
panel, gear-purchase wars-to-recover calculation, and a "save simulation"
button wired to localStorage battle history.

### Dashboard + Battle History (Phase 12)
`/` — live API status pill (with an honest per-instance cache-size caveat,
consistent with Phase 1's serverless cache-sharing note), best craft
opportunities, best production opportunities, and recent simulations
(client-rendered from `src/lib/battleHistory.ts`, a small SSR-safe
localStorage wrapper).

### Deployment
Wired up Nitro (`vite.config.ts`) per TanStack Start's own bundled
deployment skill — auto-detects the Vercel target at build time, no
`vercel.json` needed. See `DEPLOY.md` for the exact steps and, importantly,
an explicit flag that **the rendered UI has not been visually verified**
in this sandbox (background dev servers don't survive between tool calls
here) — `vite build` compiling cleanly and all 132 tests passing is real
evidence the app is structurally sound, but it is not the same claim as
"someone looked at the pages."

---

## Post-Phase-12 pivot — the Advisor

After the initial 12-phase build, the actual product need turned out to be
narrower and more specific: not a dashboard full of tools, but one focused
question — "what should I buy/do next, without losing coins" — answered
for a specific player, by username, in one of three modes (Economic / War
/ Eco-War).

### A second look at warera-fetch caught two real transport bugs
Re-cloned `majimawrks/warera-fetch` and found:
1. tRPC error envelopes are sometimes nested as `{"error":{"json":{"message":
   ...}}}`, not the flat shape Phase 1 assumed. Fixed in `client.ts`.
2. HTTP 429 exists on this API and needs exponential backoff — the
   original retry logic only handled 5xx. Fixed, with a test.

### A genuinely significant find: `user.getUserLite` + `user.getUserById`
Re-checking the full API surface turned up `search.searchAnything`
(global search, including users, by text — real field-level type, no
captured example) and two user-profile endpoints that split real,
**server-computed** combat stats between them:
- `user.getUserLite` — every skill (attack, armor, dodge, crit chance/damage,
  precision, production, companies, management) as a `{level, equipment,
  weapon, total}` breakdown. The server already computes how much of your
  attack comes from your weapon vs your other equipment vs your level —
  this is real data, not modeled.
- `user.getUserById` — the equipped-gear slot map (`equipment: {weapon:
  "rifle3", helmet: "helmet2", ...}`), which `getUserLite` doesn't have.

`src/lib/warera/normalizers.ts::mergePlayerProfile()` combines both (two
parallel calls) into one `PlayerProfile`. This is the foundation the
Advisor's "your real current gear is worth X attack" numbers stand on —
not modeled, not estimated, read straight from the game's own computation.

**What's still not confirmed:** the reverse direction — "how much would
item Y, which I don't own yet, add to my attack?" That lives in
`gameConfig.items[code].flatStats`, a real field, but no example payload
was ever captured showing its contents. `src/lib/advisor/gearAdvisor.ts`
reads it if present and marks the candidate `confidence: "verified"`; if
absent, `confidence: "unknown"` and the item is excluded from ranked
suggestions rather than guessed at. **This is the single biggest lever for
how good the Advisor's gear suggestions can be — verify `flatStats`
contents against a real weapon/gear item the moment this is deployed.**

### The Advisor (`/advisor`)
One page: username → mode tabs (Economic / War / Eco-War) → a short list
of suggestions, not a stats dump.
- **Sustainability metric:** coins-per-stat-point, not raw damage. A gear
  suggestion has to be both affordable (under a user-set coin budget) and
  a real improvement over the player's actual current equipped item
  (`filterSustainable()` in `gearAdvisor.ts`) — directly answering "don't
  make me lose too much money."
- **Economic mode:** ranks the player's *own real companies* (via
  `company.getCompanies({userId})`, hydrated) by the Phase 3 economy
  engine — no combat involved at all.
- **War mode:** gear suggestions only, no company advice.
- **Eco-War mode:** both, together.
- **Box flips:** real sell prices for box-category market items, explicitly
  *not* framed as "expected value of opening" since drop odds were
  confirmed unavailable back in Phase 1 — sell-price-only, honestly labeled.
- **Slot detection caveat, disclosed in the UI itself:** which market item
  belongs to which equipment slot (helmet/chest/etc.) is inferred from the
  item's code prefix (`helmet1`, `chest2`, ...) — a heuristic carried over
  from Phase 8, not confirmed against real WarEra item-naming conventions.
  Flagged directly under the gear suggestions, not buried in this file.

18 new tests (`src/lib/advisor/__tests__/advisor.test.ts`) cover the gear
ranking, the sustainability filter, box-flip ranking, and mode config —
all passing, 152 total across the project.
