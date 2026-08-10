# Fantasy Draft Tool (MVP)

ESPN Fantasy Basketball draft analysis app — snake 12-team H2H categories, simulation-based pick recommendations, Prep + Live workspace.

**Design spec:** [docs/superpowers/specs/2026-07-29-espn-fantasy-draft-tool-design.md](docs/superpowers/specs/2026-07-29-espn-fantasy-draft-tool-design.md)

## Prerequisites

- Node.js 20+ (Node 22/24 also fine; this app uses libSQL so Visual Studio C++ build tools are not required)
- npm
- [Clerk](https://clerk.com/) application (publishable + secret keys)

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment variables**

   Copy `.env.example` to `.env` and fill in Clerk keys:

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   | --- | --- |
   | `DATABASE_URL` | SQLite path (default `file:./dev.db`) |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
   | `CLERK_SECRET_KEY` | Clerk secret key |
   | `ESPN_LIVE` | See [ESPN integration](#espn-integration) below |

3. **Database migrate**

   ```bash
   npx prisma migrate dev
   ```

4. **Run dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Player pool (Manual draft)

Manual leagues load real NBA players from a cached JSON pool (default: 2025-26 ESPN Fantasy stats / % owned ranking).

```bash
npm run players:refresh   # rewrite data/players/stats_2025_26.json (~250 players)
```

Optional env: `PLAYER_POOL_SOURCE=stats_2025_26` (default). Later: `proj_2026_27` when that cache exists.

## ESPN integration

`ESPN_LIVE` defaults to `false`. The MVP uses **fixture-first** ESPN data (`data/fixtures/espn-league.json`) for import and sync flows. Manual league setup works without ESPN.

When `ESPN_LIVE=true`, live ESPN API calls are not yet implemented — the adapter returns `ESPN_UNAVAILABLE`. Keep `ESPN_LIVE=false` for local development and tests.

## Tests

```bash
npm test              # Vitest unit/integration tests
npm run test:e2e      # Playwright smoke flows (starts dev server)
npx tsc --noEmit      # TypeScript check
```

For Playwright e2e, set `E2E_BYPASS_AUTH=true` in `.env` to bypass Clerk on localhost (see `.env.example`).
