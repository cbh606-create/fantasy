# Fantasy Draft Tool MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public Next.js MVP that runs server-side H2H-category draft simulations for a snake 12-team league and surfaces optimal pick combinations in Prep + Live draft modes, with ESPN import preferred and full manual fallback.

**Architecture:** Next.js App Router UI + Route Handlers; pure TypeScript simulation engine on the server; ManualAdapter + EspnAdapter both normalize to `LeagueState`; Prisma persistence; Clerk auth. ESPN live HTTP is behind a flag—default path uses fixtures so CI never depends on ESPN.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Clerk, Prisma + SQLite (local/test; `DATABASE_URL` can point at Postgres in production), Vitest, Playwright, Zod.

## Global Constraints

- Format MVP: snake draft, exactly 12 teams (typed extension hooks allowed, no UI for other formats).
- Scoring MVP: H2H categories only; default 9-cat `FG_PCT | FT_PCT | TPM | REB | AST | STL | BLK | TO | PTS` with per-cat `enabled` + `weight`.
- Optimization default: maximize weighted expected category wins; support `puntCategoryIds` / `focusCategoryIds`.
- Opponent AI: ADP-weighted sampling + position needs + category needs.
- User pick policy: evaluate candidates with `forcePick`, then fill remaining user picks greedily (no multi-ply search).
- Default `simCount`: 40; hard cap 100; on timeout retry once at `Math.floor(simCount / 2)`.
- Rate limit: 10 simulate requests / user / minute; 5 ESPN sync / user / minute.
- Auth required for simulate, import, league writes.
- Manual path must work with ESPN disabled (`ESPN_LIVE=false`).
- UI chrome: Nike-adapted tokens — canvas `#ffffff`, soft-cloud `#f5f5f5`, ink `#111111`; pill CTAs; flat rows (no card shadows); display font only on home hero.
- No semicolons in TS/TSX (workspace front-end rule).
- Commits: conventional commits (`feat:`, `fix:`, `test:`, `chore:`); imperative subject; no period at end.
- Spec: `docs/superpowers/specs/2026-07-29-espn-fantasy-draft-tool-design.md`

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts` | Tooling |
| `prisma/schema.prisma`, `src/lib/db.ts` | Persistence |
| `src/lib/domain/types.ts` | Shared domain types |
| `src/lib/domain/categories.ts` | Default 9-cat + weight helpers |
| `src/lib/domain/snake.ts` | Snake pick order / whose turn |
| `src/lib/sim/score.ts` | Roster category totals + win expectancy |
| `src/lib/sim/opponent.ts` | Other-team pick sampler |
| `src/lib/sim/userPolicy.ts` | Force-pick + greedy remaining fills |
| `src/lib/sim/engine.ts` | `runDraftSimulation` entrypoint |
| `src/lib/adapters/types.ts` | Adapter interface |
| `src/lib/adapters/manual.ts` | Manual → `LeagueState` |
| `src/lib/adapters/espn.ts` | ESPN client + fixture fallback → `LeagueState` |
| `src/lib/rateLimit.ts` | In-memory rate limiter (MVP) |
| `src/lib/auth.ts` | Clerk helpers for API routes |
| `src/app/api/draft/simulate/route.ts` | Simulate API |
| `src/app/api/leagues/route.ts`, `src/app/api/leagues/[id]/route.ts` | League CRUD |
| `src/app/api/espn/import/route.ts`, `src/app/api/espn/sync-board/route.ts` | ESPN endpoints |
| `src/components/ui/*` | Button, Chip, SearchPill, Banner |
| `src/components/league/LeagueSetupForm.tsx` | Setup UI |
| `src/components/draft/*` | DraftWorkspace, PrepView, LiveView, RecPanel, SyncBar, BoardGrid |
| `src/app/page.tsx` | Marketing home |
| `src/app/leagues/new/page.tsx` | League setup page |
| `src/app/leagues/[id]/draft/page.tsx` | Draft workspace page |
| `src/app/globals.css` | CSS variables for design tokens |
| `data/fixtures/players-sample.json` | ~36 sample players for manual/sim tests |
| `data/fixtures/espn-league.json` | ESPN-shaped fixture |
| `tests/unit/**` | Vitest unit tests |
| `tests/api/**` | API route tests |
| `tests/e2e/**` | Playwright smoke |

---

### Task 1: Scaffold Next.js app + design tokens

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (temporary placeholder)
- Create: `.env.example`, `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: runnable `npm run dev`, `npm test` scripts; CSS variables `--color-ink`, `--color-canvas`, `--color-soft-cloud`, `--color-mute`, `--color-sale`, `--color-success`, `--color-info`

- [ ] **Step 1: Create Next.js TypeScript app in repo root**

Run from `C:\Users\cbh60\OneDrive\바탕 화면\fantasy` (keep existing `docs/`):

```bash
npx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --yes
```

If create-next-app refuses non-empty dir, scaffold into a temp folder and move `src`, config files into root without deleting `docs/`.

- [ ] **Step 2: Add test + validation deps**

```bash
npm install zod @clerk/nextjs @prisma/client
npm install -D prisma vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom playwright @playwright/test
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/api/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 4: Set design tokens in `src/app/globals.css`**

```css
@import "tailwindcss";

:root {
  --color-ink: #111111;
  --color-canvas: #ffffff;
  --color-soft-cloud: #f5f5f5;
  --color-mute: #707072;
  --color-stone: #9e9ea0;
  --color-hairline: #cacacb;
  --color-sale: #d30005;
  --color-success: #007d48;
  --color-info: #1151ff;
  --font-display: "Bebas Neue", Impact, sans-serif;
  --font-ui: Inter, "Helvetica Neue", Arial, sans-serif;
}

body {
  background: var(--color-canvas);
  color: var(--color-ink);
  font-family: var(--font-ui);
}
```

- [ ] **Step 5: Write `.env.example`**

```env
DATABASE_URL="file:./dev.db"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
ESPN_LIVE=false
```

- [ ] **Step 6: Verify scaffolding**

Run: `npm test`  
Expected: Vitest runs with 0 tests (pass) or “No test files found” depending on vitest version — either is OK if exit 0. If exit 1 for no tests, add empty `tests/unit/smoke.test.ts` with `expect(true).toBe(true)`.

Run: `npx tsc --noEmit`  
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs vitest.config.ts src .env.example .gitignore
git commit -m "chore: scaffold Next.js app with tokens and vitest"
```

---

### Task 2: Domain types + default categories

**Files:**
- Create: `src/lib/domain/types.ts`
- Create: `src/lib/domain/categories.ts`
- Test: `tests/unit/categories.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `CategoryId = "FG_PCT" | "FT_PCT" | "TPM" | "REB" | "AST" | "STL" | "BLK" | "TO" | "PTS"`
  - `CategorySetting { id: CategoryId; enabled: boolean; weight: number }`
  - `LeagueSettings`, `Player`, `DraftPick`, `DraftBoard`, `LeagueState`, `SimulationInput`, `SimulationResult`
  - `defaultCategorySettings(): CategorySetting[]`
  - `effectiveWeights(settings, puntIds, focusIds): Record<CategoryId, number>`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/categories.test.ts
import { describe, expect, it } from "vitest"
import { defaultCategorySettings, effectiveWeights } from "@/lib/domain/categories"

describe("defaultCategorySettings", () => {
  it("returns 9 enabled cats with weight 1", () => {
    const cats = defaultCategorySettings()
    expect(cats).toHaveLength(9)
    expect(cats.every((c) => c.enabled && c.weight === 1)).toBe(true)
  })
})

describe("effectiveWeights", () => {
  it("zeroes punt cats and boosts focus cats", () => {
    const cats = defaultCategorySettings()
    const w = effectiveWeights(cats, ["TO"], ["STL", "BLK"])
    expect(w.TO).toBe(0)
    expect(w.STL).toBe(1.5)
    expect(w.PTS).toBe(1)
  })

  it("disabled cats get weight 0", () => {
    const cats = defaultCategorySettings().map((c) =>
      c.id === "FG_PCT" ? { ...c, enabled: false } : c,
    )
    const w = effectiveWeights(cats, [], [])
    expect(w.FG_PCT).toBe(0)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- tests/unit/categories.test.ts`  
Expected: FAIL module not found / cannot find categories

- [ ] **Step 3: Implement types + categories**

```ts
// src/lib/domain/types.ts
export type CategoryId =
  | "FG_PCT"
  | "FT_PCT"
  | "TPM"
  | "REB"
  | "AST"
  | "STL"
  | "BLK"
  | "TO"
  | "PTS"

export type CategorySetting = {
  id: CategoryId
  enabled: boolean
  weight: number
}

export type RosterSlot = "PG" | "SG" | "SF" | "PF" | "C" | "G" | "F" | "UTIL" | "BE"

export type LeagueSettings = {
  teams: 12
  draftType: "snake"
  rosterSlots: RosterSlot[]
  categories: CategorySetting[]
  userPickSlot: number
  puntCategoryIds: CategoryId[]
  focusCategoryIds: CategoryId[]
  rounds: number
}

export type Player = {
  id: string
  name: string
  positions: Array<"PG" | "SG" | "SF" | "PF" | "C">
  projections: Record<CategoryId, number>
  adp: number
  espnId?: string
  status?: "active" | "out" | "gtd"
}

export type DraftPick = {
  overall: number
  round: number
  teamIndex: number
  playerId: string | null
}

export type DraftBoard = {
  picks: DraftPick[]
  currentOverall: number
}

export type LeagueState = {
  settings: LeagueSettings
  board: DraftBoard
  players: Player[]
  source: "espn" | "manual" | "mixed"
  perspectiveTeamIndex: number
}

export type SimulationInput = {
  state: LeagueState
  simCount: number
  seed: number
  forcePickPlayerId?: string
}

export type NextPickRec = {
  playerId: string
  score: number
  frequency: number
}

export type CombinationPath = {
  playerIds: string[]
  score: number
  frequency: number
}

export type SimulationResult = {
  nextPicks: NextPickRec[]
  topCombinations: CombinationPath[]
  categoryOutlook: Record<CategoryId, number>
  meta: {
    simCount: number
    seed: number
    generatedAt: string
    latencyMs: number
    source: LeagueState["source"]
  }
}
```

```ts
// src/lib/domain/categories.ts
import type { CategoryId, CategorySetting } from "./types"

export const ALL_CATEGORY_IDS: CategoryId[] = [
  "FG_PCT",
  "FT_PCT",
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "TO",
  "PTS",
]

export const defaultCategorySettings = (): CategorySetting[] =>
  ALL_CATEGORY_IDS.map((id) => ({ id, enabled: true, weight: 1 }))

export const effectiveWeights = (
  categories: CategorySetting[],
  puntCategoryIds: CategoryId[],
  focusCategoryIds: CategoryId[],
): Record<CategoryId, number> => {
  const punt = new Set(puntCategoryIds)
  const focus = new Set(focusCategoryIds)
  const out = {} as Record<CategoryId, number>
  for (const cat of categories) {
    if (!cat.enabled || punt.has(cat.id)) {
      out[cat.id] = 0
      continue
    }
    out[cat.id] = focus.has(cat.id) ? cat.weight * 1.5 : cat.weight
  }
  return out
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm test -- tests/unit/categories.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain tests/unit/categories.test.ts
git commit -m "feat: add domain types and category weight helpers"
```

---

### Task 3: Snake draft order helpers

**Files:**
- Create: `src/lib/domain/snake.ts`
- Test: `tests/unit/snake.test.ts`

**Interfaces:**
- Consumes: `LeagueSettings.teams`, `rounds`
- Produces:
  - `teamIndexForOverall(overall: number, teams: number): number` — 0-based, snake
  - `buildEmptyBoard(teams: 12, rounds: number): DraftBoard`
  - `isUserTurn(board, userPickSlot): boolean` — `userPickSlot` is 1–12

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest"
import { teamIndexForOverall, buildEmptyBoard, isUserTurn } from "@/lib/domain/snake"

describe("teamIndexForOverall", () => {
  it("snakes across 12 teams", () => {
    expect(teamIndexForOverall(1, 12)).toBe(0)
    expect(teamIndexForOverall(12, 12)).toBe(11)
    expect(teamIndexForOverall(13, 12)).toBe(11)
    expect(teamIndexForOverall(24, 12)).toBe(0)
  })
})

describe("buildEmptyBoard", () => {
  it("creates teams*rounds null picks starting at overall 1", () => {
    const board = buildEmptyBoard(12, 13)
    expect(board.picks).toHaveLength(156)
    expect(board.currentOverall).toBe(1)
    expect(board.picks[0]).toEqual({
      overall: 1,
      round: 1,
      teamIndex: 0,
      playerId: null,
    })
  })
})

describe("isUserTurn", () => {
  it("is true when current overall maps to user slot", () => {
    const board = buildEmptyBoard(12, 13)
    expect(isUserTurn(board, 1)).toBe(true)
    board.currentOverall = 2
    expect(isUserTurn(board, 1)).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/unit/snake.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/domain/snake.ts
import type { DraftBoard, DraftPick } from "./types"

export const teamIndexForOverall = (overall: number, teams: number): number => {
  const zeroBased = overall - 1
  const roundIndex = Math.floor(zeroBased / teams)
  const posInRound = zeroBased % teams
  if (roundIndex % 2 === 0) return posInRound
  return teams - 1 - posInRound
}

export const buildEmptyBoard = (teams: 12, rounds: number): DraftBoard => {
  const picks: DraftPick[] = []
  const total = teams * rounds
  for (let overall = 1; overall <= total; overall++) {
    const round = Math.ceil(overall / teams)
    picks.push({
      overall,
      round,
      teamIndex: teamIndexForOverall(overall, teams),
      playerId: null,
    })
  }
  return { picks, currentOverall: 1 }
}

export const isUserTurn = (board: DraftBoard, userPickSlot: number): boolean => {
  const teamIndex = userPickSlot - 1
  return teamIndexForOverall(board.currentOverall, 12) === teamIndex
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/snake.ts tests/unit/snake.test.ts
git commit -m "feat: add snake draft order helpers"
```

---

### Task 4: Category scoring

**Files:**
- Create: `src/lib/sim/score.ts`
- Test: `tests/unit/score.test.ts`

**Interfaces:**
- Consumes: `Player`, `CategoryId`, `effectiveWeights`
- Produces:
  - `rosterTotals(players: Player[]): Record<CategoryId, number>` — rates (`FG_PCT`, `FT_PCT`) average; `TO` kept raw (higher worse); counting stats sum
  - `categoryWinExpectancies(teamTotals, leagueMeanTotals, weights): number` — sum over cats of `weight * sigmoid(z)`; for `TO` invert sign so lower TO is better
  - `leagueMeanTotals(rosters: Player[][]): Record<CategoryId, number>`

- [ ] **Step 1: Write failing test** with two tiny players (define inline fixtures) asserting:
  - summing PTS/REB
  - averaging FG_PCT
  - team with fewer TO scores higher on TO dimension when weights include TO
  - punt TO → TO does not change total score when only TO differs

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `score.ts`**

Use:
- `z = (team - mean) / (stdev || 1)` with stdev from league roster totals (population); if single team compare, stdev = 1
- `sigmoid(z) = 1 / (1 + Math.exp(-z))`
- For `TO`: use `z = (mean - team) / stdev` so lower is better

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add category roster scoring"
```

---

### Task 5: Opponent pick sampler

**Files:**
- Create: `src/lib/sim/opponent.ts`
- Test: `tests/unit/opponent.test.ts`

**Interfaces:**
- Consumes: `Player[]` remaining, team roster `Player[]`, weights, `seededRng`
- Produces:
  - `createRng(seed: number): () => number` — mulberry32
  - `scoreOpponentNeed(player, roster, weights): number`
  - `pickOpponentPlayer(remaining, roster, weights, rng): Player`

Need score formula (lock this):
`score = (1 / adp) * 100 + positionNeedBonus(0|25|50) + categoryNeedBonus`

- `positionNeedBonus`: +50 if player primary position missing from roster relative to default slots `["PG","SG","SF","PF","C","G","F","UTIL","UTIL","BE","BE","BE","BE"]`; +25 if only flex fit; else 0
- `categoryNeedBonus`: sum of `weight * (leagueAvg[cat] - rosterAvg[cat])` clipped to >= 0 for counting stats; invert for TO

- [ ] **Step 1: Write failing tests**
  - Fixed rng + pool → deterministic pick
  - Team already has 3 C and pool is C-heavy vs PG → prefers PG when ADP similar (construct fixture)

- [ ] **Step 2–4: TDD implement + pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add opponent ADP and needs picker"
```

---

### Task 6: User pick policy (forcePick + greedy)

**Files:**
- Create: `src/lib/sim/userPolicy.ts`
- Test: `tests/unit/userPolicy.test.ts`

**Interfaces:**
- Consumes: scoring + opponent helpers + snake
- Produces:
  - `greedyUserPick(remaining, userRoster, allRosters, weights, rng): Player` — max one-step EV assuming other teams freeze at current mean (MVP simplification: score player by marginal contribution to weighted win expectancy vs league mean of current known projections)
  - `evaluateForcePick(...): { player, path: Player[], score: number }`

Lock marginal score for MVP:
`marginal = categoryWinExpectancies(rosterTotals(userRoster+[player]), leagueMean, weights)`

- [ ] **Step 1: Failing tests** — picking higher PTS player when only PTS weighted; forcePick appears first in returned path

- [ ] **Step 2–4: Implement + pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add user greedy and forcePick policy"
```

---

### Task 7: Simulation engine

**Files:**
- Create: `src/lib/sim/engine.ts`
- Create: `data/fixtures/players-sample.json` (≥36 players, 12 teams × 3 rounds minimum coverage; prefer 12×13=156 is too many for hand fixture — use **36 players** and `rounds: 3` in unit tests)
- Test: `tests/unit/engine.test.ts`

**Interfaces:**
- Consumes: all sim modules + snake
- Produces: `runDraftSimulation(input: SimulationInput): SimulationResult`

Algorithm:
1. Clamp `simCount` to 1..100
2. For each sim `i` with rng seed `seed + i`:
   - Clone board + roster arrays per team
   - While picks remain:
     - If pick filled, skip advance
     - Else if team is perspective and this is the **first empty user pick in this sim** and `forcePickPlayerId` set for candidate loops — handled outside
     - Else if team is perspective: `greedyUserPick`
     - Else: `pickOpponentPlayer`
   - Record user path + final score + category outlook
3. For **nextPicks** ranking at current turn: if not user turn, return empty `nextPicks` and still return outlook from completing sims with greedy-only; if user turn, for each candidate in top 12 remaining by ADP, run `simCount` sims with `forcePickPlayerId=candidate`, average score, also track frequency when greedy chooses them in unconstrained sims
4. `topCombinations`: aggregate user paths by joined playerId key; sort by `avgScore` then frequency; top 5

- [ ] **Step 1: Write failing tests**
  - Fixed seed → identical `nextPicks` order
  - Mid-draft: only remaining slots filled (pre-fill board pick 1 taken)
  - Punt STL changes top next pick vs focus STL on crafted fixture
  - Empty remaining pool throws / returns empty result without throw — **prefer return result with empty arrays** (no throw)

- [ ] **Step 2–4: Implement + pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add draft simulation engine"
```

---

### Task 8: ManualAdapter

**Files:**
- Create: `src/lib/adapters/types.ts`
- Create: `src/lib/adapters/manual.ts`
- Test: `tests/unit/manualAdapter.test.ts`

**Interfaces:**
- Consumes: domain types, `buildEmptyBoard`, fixtures
- Produces:
  - `ManualLeagueInput` zod schema
  - `manualToLeagueState(input): LeagueState` with `source: "manual"`

`ManualLeagueInput` fields: `userPickSlot`, `categories?`, `puntCategoryIds?`, `focusCategoryIds?`, `rounds?` default 13, `players: Player[]`, optional `picks: { overall: number; playerId: string }[]`

- [ ] **Step 1: Failing test** — fixture players → state with 12 teams, board length `12*rounds`, perspectiveTeamIndex `userPickSlot-1`

- [ ] **Step 2–4: Implement + pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add ManualAdapter to LeagueState"
```

---

### Task 9: EspnAdapter (fixture-first)

**Files:**
- Create: `src/lib/adapters/espn.ts`
- Create: `data/fixtures/espn-league.json`
- Create: `src/lib/adapters/errors.ts` — `EspnErrorCode = "ESPN_AUTH" | "ESPN_TIMEOUT" | "ESPN_UNAVAILABLE" | "ESPN_PARTIAL"`
- Test: `tests/unit/espnAdapter.test.ts`

**Interfaces:**
- Consumes: env `ESPN_LIVE`
- Produces:
  - `espnImportToLeagueState(params: { leagueId: string; season: number; swid?: string; espnS2?: string }): Promise<LeagueState>`
  - `espnSyncBoard(state, params): Promise<{ state: LeagueState; conflicts: number[] }>`
  - When `ESPN_LIVE !== "true"`, load `data/fixtures/espn-league.json` and map to `LeagueState` with `source: "espn"`
  - On simulated failure flag `params.forceFail?: EspnErrorCode`, throw `EspnAdapterError`

Partial sync merge: apply picks where `playerId` non-null from ESPN; if local has different non-null player at same overall, keep local, add overall to `conflicts`, set `source: "mixed"`

- [ ] **Step 1: Failing tests** for fixture import shape + conflict merge + forceFail code

- [ ] **Step 2–4: Implement + pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add fixture-first EspnAdapter"
```

---

### Task 10: Prisma schema + DB client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Modify: `.env` (local, gitignored) with `DATABASE_URL="file:./dev.db"`

**Interfaces:**
- Produces models: `User` (clerkUserId unique), `League` (id, clerkUserId, name, settingsJson, stateJson, createdAt, updatedAt)

- [ ] **Step 1: Write schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model League {
  id          String   @id @default(cuid())
  clerkUserId String
  name        String
  settingsJson String
  stateJson   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([clerkUserId])
}
```

- [ ] **Step 2: Migrate**

```bash
npx prisma migrate dev --name init
```

- [ ] **Step 3: `src/lib/db.ts` singleton PrismaClient**

- [ ] **Step 4: Commit**

```bash
git add prisma src/lib/db.ts
git commit -m "chore: add Prisma sqlite schema for leagues"
```

---

### Task 11: Auth + rate limit helpers

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/rateLimit.ts`
- Create: `src/middleware.ts` (Clerk)
- Test: `tests/unit/rateLimit.test.ts`

**Interfaces:**
- `requireUserId(): Promise<string>` — throws / returns 401 pattern for routes
- `rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs?: number }`

- [ ] **Step 1: Failing test** for rate limit 3rd call in window fails when limit 2

- [ ] **Step 2–3: Implement rateLimit + auth stub**

For unit tests without Clerk, `requireUserId` reads `x-test-user-id` header when `NODE_ENV=test`, else `auth()` from Clerk.

- [ ] **Step 4: Add Clerk middleware protecting `/leagues(.*)` and `/api/(.*)` except public health if any

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add Clerk auth wiring and rate limiter"
```

---

### Task 12: Simulate API

**Files:**
- Create: `src/app/api/draft/simulate/route.ts`
- Create: `src/lib/validation/simulate.ts` — zod body schema
- Test: `tests/api/simulate.test.ts`

**Interfaces:**
- `POST /api/draft/simulate` body: `{ state: LeagueState, simCount?: number, seed?: number, forcePickPlayerId?: string }`
- 200 → `SimulationResult`
- 400 validation errors `{ error: "validation", fields: Record<string,string> }`
- 401 unauthenticated
- 429 rate limited

- [ ] **Step 1: Failing API tests** using vitest + calling route handler `POST` with mock headers

- [ ] **Step 2–4: Implement + pass** including timeout retry: if engine > 8000ms, retry once with half simCount (use fake timers or inject `now` only if needed — MVP: skip real timeout, implement helper `runWithSimCountFallback`)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add draft simulate API"
```

---

### Task 13: Leagues CRUD API

**Files:**
- Create: `src/app/api/leagues/route.ts` — `GET` list, `POST` create from ManualLeagueInput or imported state
- Create: `src/app/api/leagues/[id]/route.ts` — `GET`, `PATCH` (replace stateJson/settingsJson)
- Test: `tests/api/leagues.test.ts`

- [ ] **Step 1–4: TDD create/list/get/patch ownership checks (other user’s league → 404)**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add leagues CRUD API"
```

---

### Task 14: ESPN import + sync API

**Files:**
- Create: `src/app/api/espn/import/route.ts`
- Create: `src/app/api/espn/sync-board/route.ts`
- Test: `tests/api/espnRoutes.test.ts`

Behavior:
- Import success → create/update league state `source: espn`
- Import fail → `502` `{ errorCode: EspnErrorCode, message }` — client may continue manually (no server wipe)
- Sync fail same shape
- Rate limit 5/min

- [ ] **Step 1–4: TDD with `forceFail` in test env**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add ESPN import and sync API routes"
```

---

### Task 15: UI primitives (Nike-adapted)

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Chip.tsx`
- Create: `src/components/ui/SearchPill.tsx`
- Create: `src/components/ui/Banner.tsx`

**Interfaces:**
- `Button` variants: `primary | secondary`
- `Chip` variants: `default | active`
- `Banner` tones: `success | danger | mute`

Rules: primary = bg ink text white rounded-full h-12 px-8; secondary = soft-cloud; no box-shadow; no semicolons.

- [ ] **Step 1: Implement components + minimal RTL test that primary button renders**

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add Nike-adapted UI primitives"
```

---

### Task 16: Home + Auth pages

**Files:**
- Modify: `src/app/layout.tsx` — ClerkProvider, fonts (Inter + Bebas Neue via `next/font` or link)
- Modify: `src/app/page.tsx` — hero brand lockup + one line + CTA `Start draft prep` → `/leagues/new`
- Create: `src/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `src/app/sign-up/[[...sign-up]]/page.tsx`

Home first viewport only: brand name (display uppercase), one supporting sentence, one primary CTA. No stats.

- [ ] **Step 1: Implement pages**

- [ ] **Step 2: Manual check `npm run dev`** — home renders

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add home hero and Clerk auth pages"
```

---

### Task 17: League setup page

**Files:**
- Create: `src/components/league/LeagueSetupForm.tsx`
- Create: `src/app/leagues/new/page.tsx`

Form fields: pick slot 1–12; category chips on/off; weight steppers; punt/focus chips; primary `Import from ESPN` (calls import API then redirects); secondary `Enter manually` (loads sample players, POST `/api/leagues`, redirect to draft).

- [ ] **Step 1: Implement form wired to APIs**

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add league setup form"
```

---

### Task 18: DraftWorkspace Prep mode

**Files:**
- Create: `src/components/draft/DraftWorkspace.tsx`
- Create: `src/components/draft/PrepView.tsx`
- Create: `src/components/draft/RecPanel.tsx`
- Create: `src/app/leagues/[id]/draft/page.tsx`

Prep layout: left rail (goals summary, sim count input default 40, Run simulation button); center topCombinations list (flat rows); right RecPanel nextPicks + categoryOutlook.

Debounce not required for explicit Run click.

- [ ] **Step 1: Wire GET league + POST simulate + render results**

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add draft prep workspace"
```

---

### Task 19: DraftWorkspace Live mode

**Files:**
- Create: `src/components/draft/LiveView.tsx`
- Create: `src/components/draft/BoardGrid.tsx`
- Create: `src/components/draft/SyncBar.tsx`
- Create: `src/components/draft/PlayerPool.tsx`
- Modify: `DraftWorkspace.tsx` — mode tabs Prep | Live

Live:
- SyncBar shows ESPN synced / Manual mode
- Sync button → espn sync-board; on failure Banner danger + Continue manually (sets local manualMode)
- Mark picked via PlayerPool search → PATCH league state → debounce 400ms simulate refresh
- AbortController cancel in-flight simulate

- [ ] **Step 1: Implement live board + manual pick + debounced simulate**

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add live draft board and hybrid sync"
```

---

### Task 20: Playwright smoke tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/draft-smoke.spec.ts`

Use Clerk test mode or bypass: document `E2E_BYPASS_AUTH=true` middleware exception for e2e only on localhost.

Scenarios:
1. Manual setup → prep → run simulation → next picks visible
2. Live: mark picked → recommendation region updates (mock simulate via route interception if auth hard)

- [ ] **Step 1: Implement 2 smoke tests**

- [ ] **Step 2: Run `npm run test:e2e` — PASS**

- [ ] **Step 3: Commit**

```bash
git commit -m "test: add Playwright draft smoke flows"
```

---

### Task 21: README + final verification

**Files:**
- Create: `README.md` — setup (Clerk keys, migrate, `npm run dev`, `npm test`), ESPN_LIVE note, link to design spec

- [ ] **Step 1: Write README**

- [ ] **Step 2: Run full verification**

```bash
npm test
npm run test:e2e
npx tsc --noEmit
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: add README with local setup for draft MVP"
```

---

## Spec coverage self-review

| Spec requirement | Task(s) |
|---|---|
| Snake 12 + 9-cat on/off/weights | 2, 3, 17 |
| Sim pick combinations + next picks | 4–7, 12, 18 |
| Prep + Live workspace | 18, 19 |
| Manual fallback | 8, 14, 17, 19 |
| ESPN import/sync hybrid | 9, 14, 19 |
| Server simulate API Approach 2 | 12 |
| Auth + rate limit | 11–14 |
| Nike-adapted UI | 1, 15, 16 |
| Engine/adapter/API tests + UI smoke | 2–14, 20 |
| Waiver/Trade deferred | No tasks (correct) |

## Placeholder / consistency check

- Locked: Clerk, Prisma/SQLite, simCount 40/cap 100, mulberry32 rng, sigmoid win expectancy, fixture-first ESPN.
- Names consistent: `runDraftSimulation`, `LeagueState`, `perspectiveTeamIndex`, `userPickSlot` (1–12).
- No TBD left in tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-29-fantasy-draft-tool-mvp.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
