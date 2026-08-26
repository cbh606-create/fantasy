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

Manual leagues load real NBA players from a cached JSON pool (default: 2026-27 ESPN Fantasy ADP + published rankings).

```bash
npm run players:refresh         # ESPN season 2027 → data/players/proj_2026_27.json
npm run players:espn-rankings   # overlay ESPN H2H Points article ranks onto that pool
```

### Refresh all mock ADP / ranks (do this often)

One command updates every Primary/reference source on the draft pool:

```bash
npm run players:adp-refresh
```

That runs, in order:

1. **Yahoo rank** (live overall rank → `yahoo_draft_analysis_rank`, writes fixture)
2. **FantasyPros Yahoo** (live ADP column → `fantasypros_yahoo`, writes fixture)
3. **ESPN article** (checked-in H2H points ranks → `espn_article_h2h_points`)
4. **Merge** (sync meta + project default Primary into `player.adp`)

Offline / CI without network:

```bash
npm run players:adp-refresh -- --fixture
```

Single-source refreshes still work: `players:yahoo-adp`, `players:fantasypros-adp`, `players:espn-rankings`, then optionally `players:adp-merge`.

Commit updated `data/players/proj_2026_27.json` and rank fixtures after a live refresh so Mock stays current for everyone.

GitHub Actions also runs `players:adp-refresh` **Mon/Thu** (or via Actions → Refresh ADP ranks → Run workflow) and opens a PR when files change.

Optional env: `PLAYER_POOL_SOURCE=proj_2026_27` (default). Prior season cache: `stats_2025_26`.

### Hashtag projections overlay

1. Copy the Hashtag projections table into a CSV with Player, Team, GP, FG%, FT%, 3PM, PTS, REB, AST, STL, BLK, TO.
2. Preview matches with `npm run players:import-hashtag -- path/to/hashtag.csv --dry-run`.
3. Apply the overlay with `npm run players:import-hashtag -- path/to/hashtag.csv`.
4. Re-run the overlay after `players:refresh` or an ESPN season refresh to restore the Hashtag numbers.

Per-game CSV values are scaled by GP by default; pass `--per-game=false` for season totals. To patch a saved season after the draft pool write, pass `--season-league-id=<id>`.

### Yahoo projections overlay (primary until ESPN proj)

Use when ESPN season averages are missing (e.g. rookies) or you want one consistent Yahoo sheet for Draft + Season.

1. Export Yahoo mock draft / analysis projections to a CSV with Player, Team, GP, FG%, FT%, 3PM, PTS, REB, AST, STL, BLK, TO.
2. Preview: `npm run players:import-yahoo -- path/to/yahoo.csv --dry-run`
3. Apply to draft pool **and all season leagues**: `npm run players:import-yahoo -- path/to/yahoo.csv`
4. Pool only: add `--skip-seasons`. Single league: `--season-league-id=<id>`.
5. Re-run after `players:refresh` or ESPN season Refresh (overlay is overwritten until re-applied).

When ESPN projections are available, import an ESPN CSV with the same column shape (or a future `players:import-espn`) so `projectionOverlay` becomes `"espn"`.

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
