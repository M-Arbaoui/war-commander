# Deploying WARERA COMMAND to Vercel

This is a TanStack Start app built on Vite + Nitro. Nitro auto-detects the
Vercel deployment target at build time (Vercel sets a `VERCEL=1` env var
during its own build step), so **no `vercel.json` is required** — this is
a zero-config deploy.

## Steps

1. Push this repository to GitHub (or GitLab/Bitbucket).
2. In the Vercel dashboard: **New Project → Import** the repo.
3. Vercel will detect a Node project. Confirm these build settings (should
   be auto-filled, but verify):
   - **Build Command:** `npm run build` (i.e. `vite build`)
   - **Output Directory:** leave as detected — Nitro's Vercel preset emits
     `.vercel/output` directly in the Build Output API v3 format, which
     Vercel reads automatically regardless of the configured output
     directory setting.
   - **Install Command:** `npm install`
4. Deploy. No environment variables are required — every WarEra API call
   is unauthenticated (see `docs/API_NOTES.md`), and the one feature that
   needs a user credential (`inventory.fetchCurrentEquipment` on the Gear
   page) takes it as a per-request form field, never an env var.

## Verifying locally before you push

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test             # vitest run — 132 tests
npm run build        # vite build via Nitro; auto-detects "node-server" preset locally
npm start             # node .output/server/index.mjs — serves the build on :3000
```

Open `http://localhost:3000` and click through every nav item
(Dashboard, Market, Builder, Companies, Regions, Upgrades, Combat, Gear).

**Important — this was not visually verified in the sandbox that built it.**
Background dev/preview servers don't survive between tool calls in that
environment, so while `vite build` compiles cleanly and all 132 unit tests
pass, nobody has actually looked at the rendered pages yet. Please do that
verification pass — ideally on every route — before treating this as
production-ready. If something looks visually broken, it's very likely a
Tailwind class or layout issue rather than a data/logic issue, since the
logic layers are the parts with real test coverage.

## What will "just work" the moment this is live

Every page's server functions call the *real* `api2.warera.io` API for the
first time here — this sandbox could never reach it. The Phase 1 endpoint
"confidence" ratings in `docs/API_NOTES.md` are the honest state of
verification: some endpoints have real captured example payloads
(`captured`), some only have real field-level types with no example
(`typed-only`). Once deployed, run `scripts/verify-endpoints.ts`'s checks
manually (or watch the dev-mode console logs, which log every request) to
confirm nothing drifted from the community-sourced shapes this was built
against.
