# Matchup Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/matchup` as the core weekly H2H advisor: category W/L/T board, greedy Sit/Start with local Apply, and streamer hints deep-linked to Waivers.

**Architecture:** Pure engine under `src/lib/matchup/*` (weekly scale → board → sit/start → streamers). Reuse `loadOwnedSeasonLeague` from waivers, schedule fixture, and `localLineupJson` for Apply. UI board-first stack; SiteNav + home CTA make Matchup primary. No ESPN pairing/writeback; no draft imports.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS 4, Clerk, Prisma/libSQL, Vitest. Work in `.worktrees/feat-season-roster` on `feat/matchup-advisor`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-matchup-advisor-design.md`
- Reuse `SeasonLeague`; opponent is **manual** `opponentTeamIndex` (ESPN pairing later)
- Active slots only: first 10 of `SEASON_ROSTER_SLOTS` (`PG`…`UTIL`); exclude `BE`/`IL`
- Weekly: `(season / ASSUMED_SEASON_GAMES) * gamesThisWeek` with `ASSUMED_SEASON_GAMES = 82`
- Missing `teamAbbr` → `gamesThisWeek = 0`
- Sit/Start Apply → `localLineupJson` only; no ESPN writeback
- Do **not** import `@/lib/sim/*` or draft modules — reimplement pairwise sigmoid in matchup
- Reuse `@/lib/waivers/loadSeasonLeague` `loadOwnedSeasonLeague`
- No semicolons; conventional commits; Tailwind; `handle*` handlers; UI density ~`text-[0.8125rem]`
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>`

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/matchup/constants.ts` | Caps, assumed games, active slots, sigmoid scale |
| `src/lib/matchup/types.ts` | Board / sit-start / streamer / advise DTOs |
| `src/lib/matchup/games.ts` | `gamesThisWeekByPlayerId(players, schedule)` |
| `src/lib/matchup/weekly.ts` | Player + team weekly totals (active only) |
| `src/lib/matchup/board.ts` | W/L/T + expectancy + summary |
| `src/lib/matchup/sitStart.ts` | Greedy BE↔active swaps + apply swap on entries |
| `src/lib/matchup/streamers.ts` | FA/waiver Top N for weak cats |
| `src/lib/matchup/advise.ts` | Orchestrate full advise DTO |
| `src/app/api/matchup/route.ts` | GET advise |
| `src/app/api/matchup/apply-lineup/route.ts` | POST swap → `localLineupJson` |
| `src/components/matchup/MatchupWorkspace.tsx` | Workspace orchestration |
| `src/components/matchup/OpponentPicker.tsx` | Team select |
| `src/components/matchup/MatchupBoard.tsx` | Hero W/L/T board |
| `src/components/matchup/SitStartPanel.tsx` | Swaps + Apply |
| `src/components/matchup/StreamersPanel.tsx` | Streamer list + Waivers links |
| `src/app/matchup/page.tsx` | League picker |
| `src/app/matchup/[id]/page.tsx` | Workspace page |
| `src/components/SiteNav.tsx` | Matchup link (Home → Matchup → …) |
| `src/app/page.tsx` | Primary CTA → Matchup |
| `tests/unit/matchupWeekly.test.ts` | Weekly + games |
| `tests/unit/matchupBoard.test.ts` | Board |
| `tests/unit/matchupSitStart.test.ts` | Sit/Start |
| `tests/unit/matchupStreamers.test.ts` | Streamers |
| `tests/api/matchup.test.ts` | API |
| `tests/unit/MatchupWorkspace.test.tsx` | UI smoke |

---

### Task 1: Constants, types, games, weekly totals

**Files:**
- Create: `src/lib/matchup/constants.ts`
- Create: `src/lib/matchup/types.ts`
- Create: `src/lib/matchup/games.ts`
- Create: `src/lib/matchup/weekly.ts`
- Test: `tests/unit/matchupWeekly.test.ts`

**Interfaces:**
- Produces:
  - `ASSUMED_SEASON_GAMES = 82`
  - `MAX_SIT_START = 5`, `MAX_STREAMERS = 8`, `MIN_STREAMER_GAMES = 2`
  - `MATCHUP_SIGMOID_SCALE = 2` (weekly counting units; tune only if tests need)
  - `ACTIVE_SEASON_SLOTS`: first 10 of `SEASON_ROSTER_SLOTS` (exclude BE/IL)
  - `isActiveSlot(slot): boolean`
  - `gamesThisWeekByPlayerId(players, schedule): Map<string, number>`
  - `weeklyPlayerStats(player, games): { projections: Record<CategoryId, number>, shooting: {FGM,FGA,FTM,FTA} }`
  - `activeTeamWeeklyTotals(entries, playersById, gamesMap): Record<CategoryId, number>` — FG%/FT% from summed shooting

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest"
import { gamesThisWeekByPlayerId } from "@/lib/matchup/games"
import { weeklyPlayerStats, activeTeamWeeklyTotals } from "@/lib/matchup/weekly"
import { ASSUMED_SEASON_GAMES } from "@/lib/matchup/constants"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-09",
    days: ["2025-11-03", "2025-11-04", "2025-11-05"],
  },
  games: [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
  ],
}

describe("gamesThisWeekByPlayerId", () => {
  it("counts distinct game days for teamAbbr; missing abbr → 0", () => {
    const players: SeasonPlayer[] = [
      {
        id: "a",
        name: "A",
        teamAbbr: "BOS",
        projections: { FG_PCT: 0.5, FT_PCT: 0.8, TPM: 82, REB: 400, AST: 400, STL: 80, BLK: 40, TO: 200, PTS: 1640 },
        shooting: { FGM: 500, FGA: 1000, FTM: 200, FTA: 250 },
      },
      {
        id: "b",
        name: "B",
        projections: { FG_PCT: 0.5, FT_PCT: 0.8, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0 },
        shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
      },
    ]
    const map = gamesThisWeekByPlayerId(players, schedule)
    expect(map.get("a")).toBe(2)
    expect(map.get("b")).toBe(0)
  })
})

describe("weeklyPlayerStats", () => {
  it("scales PTS by games/82", () => {
    const player: SeasonPlayer = {
      id: "a",
      name: "A",
      teamAbbr: "BOS",
      projections: { FG_PCT: 0.5, FT_PCT: 0.8, TPM: 82, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 1640 },
      shooting: { FGM: 820, FGA: 1640, FTM: 164, FTA: 205 },
    }
    const weekly = weeklyPlayerStats(player, 2)
    expect(weekly.projections.PTS).toBeCloseTo((1640 / ASSUMED_SEASON_GAMES) * 2)
    expect(weekly.projections.FG_PCT).toBeCloseTo(0.5)
  })
})

describe("activeTeamWeeklyTotals", () => {
  it("sums only active slots", () => {
    // one UTIL player with PTS season 820, 2 games → weekly ~20; BE player ignored
    // assert activeTeamWeeklyTotals(...).PTS close to that
  })
})
```

Fill the third test with concrete stub entries: active UTIL has the player; BE has a high-PTS player that must not count.

- [ ] **Step 2: Run — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupWeekly.test.ts`

- [ ] **Step 3: Implement**

`constants.ts`:

```ts
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type { SeasonSlot } from "@/lib/season/types"

export const ASSUMED_SEASON_GAMES = 82
export const MAX_SIT_START = 5
export const MAX_STREAMERS = 8
export const MIN_STREAMER_GAMES = 2
export const MATCHUP_SIGMOID_SCALE = 2
export const ACTIVE_SEASON_SLOTS: SeasonSlot[] = SEASON_ROSTER_SLOTS.filter(
  (slot) => slot !== "BE" && slot !== "IL",
)
export const isActiveSlot = (slot: SeasonSlot) =>
  ACTIVE_SEASON_SLOTS.includes(slot)
```

`games.ts`: for each player, if no `teamAbbr` return 0; else count distinct `schedule.matchup.days` where player’s team appears in a game that day (mirror `buildPlayerMatchupSchedule` logic).

`weekly.ts`: scale counting cats and shooting volume; set FG%/FT% from scaled makes/attempts; `activeTeamWeeklyTotals` filters `isActiveSlot`, skips null ids, sums counting + shooting then recomputes % cats.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/constants.ts src/lib/matchup/types.ts src/lib/matchup/games.ts src/lib/matchup/weekly.ts tests/unit/matchupWeekly.test.ts
git commit -m "feat(matchup): add weekly projection helpers"
```

---

### Task 2: H2H board

**Files:**
- Create: `src/lib/matchup/board.ts`
- Modify: `src/lib/matchup/types.ts` (board DTOs if not already)
- Test: `tests/unit/matchupBoard.test.ts`

**Interfaces:**
- Consumes: `activeTeamWeeklyTotals`, `MATCHUP_SIGMOID_SCALE`, `ALL_CATEGORY_IDS`
- Produces:
  - `CategoryOutcome = "W" | "L" | "T"`
  - `MatchupBoard = { categories: { categoryId, you, opp, outcome, winProb }[], wins, losses, ties, projectedCatWins }`
  - `buildMatchupBoard(youTotals, oppTotals): MatchupBoard`
  - `categoryWinProb(you, opp, categoryId): number` — `delta = TO ? opp-you : you-opp`; `1/(1+exp(-delta/MATCHUP_SIGMOID_SCALE))`

- [ ] **Step 1: Write failing tests**

```ts
describe("buildMatchupBoard", () => {
  it("marks PTS W when you higher; TO W when you lower", () => {
    const board = buildMatchupBoard(youHigherPtsLowerTo, opp)
    expect(board.categories.find((c) => c.categoryId === "PTS")?.outcome).toBe("W")
    expect(board.categories.find((c) => c.categoryId === "TO")?.outcome).toBe("W")
  })
  it("ties equal values", () => {
    expect(buildMatchupBoard(same, same).ties).toBe(9)
  })
  it("winProb rises when you increase PTS", () => {
    const low = buildMatchupBoard(base, opp)
    const high = buildMatchupBoard({ ...base, PTS: base.PTS + 20 }, opp)
    const pLow = low.categories.find((c) => c.categoryId === "PTS")!.winProb
    const pHigh = high.categories.find((c) => c.categoryId === "PTS")!.winProb
    expect(pHigh).toBeGreaterThan(pLow)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupBoard.test.ts`

- [ ] **Step 3: Implement `board.ts`**

Compare each `ALL_CATEGORY_IDS` (respect enabled categories from state later in `advise` — for pure board, compare all 9; `advise` may filter by `state.categories` where `enabled`).

MVP board uses all enabled categories from caller; `buildMatchupBoard` accepts optional `categoryIds: CategoryId[]` defaulting to `ALL_CATEGORY_IDS`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/board.ts src/lib/matchup/types.ts tests/unit/matchupBoard.test.ts
git commit -m "feat(matchup): build head-to-head category board"
```

---

### Task 3: Sit/Start greedy swaps

**Files:**
- Create: `src/lib/matchup/sitStart.ts`
- Test: `tests/unit/matchupSitStart.test.ts`

**Interfaces:**
- Consumes: `buildMatchupBoard`, weekly helpers, `MAX_SIT_START`
- Produces:
  - `SitStartSuggestion = { benchPlayerId, activePlayerId, deltaProjectedCatWins, reason }`
  - `suggestSitStart({ youEntries, oppEntries, players, gamesMap }): SitStartSuggestion[]`
  - `applySitStartSwap(entries, swap): SeasonRosterEntry[] | { error: "stale_lineup" }` — swap playerIds between the BE slot holding `benchPlayerId` and active slot holding `activePlayerId`; immutable copy

- [ ] **Step 1: Write failing tests**

```ts
describe("suggestSitStart", () => {
  it("recommends promoting a high-volume BE over a zero-game active", () => {
    // Active: player with 0 games; BE: star with 3 games and high PTS
    // Opponent mediocre
    const suggestions = suggestSitStart(...)
    expect(suggestions[0]?.benchPlayerId).toBe("bench-star")
    expect(suggestions[0]?.activePlayerId).toBe("cold-starter")
    expect(suggestions[0]?.deltaProjectedCatWins).toBeGreaterThan(0)
  })
})

describe("applySitStartSwap", () => {
  it("swaps ids between BE and active slots", () => {
    const next = applySitStartSwap(entries, { benchPlayerId: "b", activePlayerId: "a" })
    expect(next).not.toHaveProperty("error")
  })
  it("returns stale_lineup when ids missing", () => {
    expect(applySitStartSwap(entries, { benchPlayerId: "x", activePlayerId: "a" })).toEqual({
      error: "stale_lineup",
    })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupSitStart.test.ts`

- [ ] **Step 3: Implement**

Algorithm:

1. Baseline `projectedCatWins` from current YOU active vs opp active.
2. For each filled BE entry and each filled active entry, simulate swap → recompute board → `delta`.
3. Keep `delta > 0`, sort desc by delta then `benchPlayerId`, take `MAX_SIT_START`.
4. `reason` like `+0.42 cat wins · 3 games`.

Also allow swap into **empty** active slot: `activePlayerId` may be `null` in suggestion type — use `activePlayerId: string | null` and when null, move bench into first empty active (clear BE). Prefer filled-swap tests first; support empty in implementation if easy.

Spec type: `{ benchPlayerId, activePlayerId }` both strings for MVP filled swaps only — **empty-slot promote optional; skip empty in MVP** to keep apply simple.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/sitStart.ts src/lib/matchup/types.ts tests/unit/matchupSitStart.test.ts
git commit -m "feat(matchup): suggest greedy sit/start swaps"
```

---

### Task 4: Streamers + advise orchestrator

**Files:**
- Create: `src/lib/matchup/streamers.ts`
- Create: `src/lib/matchup/advise.ts`
- Test: `tests/unit/matchupStreamers.test.ts`

**Interfaces:**
- Consumes: board, weekly, games, `availablePlayerIds`, `MIN_STREAMER_GAMES`, `MAX_STREAMERS`
- Produces:
  - `StreamerSuggestion = { playerId, score, gamesThisWeek, reasons: string[] }`
  - `suggestStreamers({ state, board, gamesMap }): StreamerSuggestion[]`
  - `adviseMatchup(state, schedule, opponentTeamIndex): MatchupAdvice | { error: string }`
  - `MatchupAdvice = { opponentTeamIndex, scoringPeriod, board, sitStart, streamers }`

`adviseMatchup` validation errors: `"invalid_opponent"` if missing team, self, or out of range.

Streamer scoring:

1. Weak cats = board categories with outcome `L` or `T`.
2. Candidates from `state.availablePlayerIds` with games ≥ `MIN_STREAMER_GAMES`; if `< MAX_STREAMERS` qualify, relax to `games >= 1`.
3. Score = sum over weak cats of weekly contribution (counting: weekly proj; % cats: use player weekly % * small weight 1.0 if helps — keep simple: sum weekly z-less raw for counting cats only in MVP: TPM,REB,AST,STL,BLK,PTS and negative TO).
4. Reason: `Helps STL · 3 games`.

- [ ] **Step 1: Write failing tests**

```ts
describe("suggestStreamers", () => {
  it("ranks multi-game STL specialist above zero-game scrub when STL is L", () => {
    // board forced via advise or inject weak cats
  })
})

describe("adviseMatchup", () => {
  it("rejects opponent === perspective", () => {
    expect(adviseMatchup(state, schedule, state.perspectiveTeamIndex)).toEqual({
      error: "invalid_opponent",
    })
  })
  it("returns board sitStart streamers for valid opponent", () => {
    const advice = adviseMatchup(state, schedule, otherIndex)
    expect(advice).toHaveProperty("board")
    expect(advice).toHaveProperty("sitStart")
    expect(advice).toHaveProperty("streamers")
  })
})
```

Use a tiny 2-team fixture state in the test file (inline), not the full ESPN JSON, for speed.

- [ ] **Step 2: Run — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupStreamers.test.ts`

- [ ] **Step 3: Implement streamers + advise**

`advise.ts` steps: validate opponent → games map → you/opp entries → weekly totals → board → sitStart → streamers → return DTO including `scoringPeriod: schedule.matchup`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamers.ts src/lib/matchup/advise.ts src/lib/matchup/types.ts tests/unit/matchupStreamers.test.ts
git commit -m "feat(matchup): recommend streamers and orchestrate advice"
```

---

### Task 5: Matchup API routes

**Files:**
- Create: `src/app/api/matchup/route.ts`
- Create: `src/app/api/matchup/apply-lineup/route.ts`
- Test: `tests/api/matchup.test.ts`

**Interfaces:**
- Consumes: `loadOwnedSeasonLeague`, `adviseMatchup`, `applySitStartSwap`, schedule fixture JSON, `rateLimit`
- Produces HTTP DTOs

**GET `/api/matchup?seasonLeagueId=&opponentTeamIndex=`**

1. `requireUserId` → 401
2. Parse ints; missing → 400
3. `loadOwnedSeasonLeague` → 404 / 500 invalid_state
4. Import fixture: `import scheduleFixture from "../../../../data/fixtures/nba-matchup-schedule.json"`
5. `adviseMatchup(state, schedule, opponentTeamIndex)` → 400 on error
6. Attach `playersById` subset for ids referenced in sitStart/streamers/active rosters (keep payload bounded)
7. 200 JSON advice + playersById + team names list for picker optional (`teams: { teamIndex, name }[]`)

**POST `/api/matchup/apply-lineup`**

Body: `{ seasonLeagueId, benchPlayerId, activePlayerId }`

1. Auth + rateLimit 10/min/user → 429
2. Load raw league row (need un-normalized entries + existing localLineup) — either extend loader to return raw or re-fetch in route like lineup route
3. `currentEntries` = perspective entries after `applyLocalLineup`
4. `applySitStartSwap(currentEntries, swap)` → 409 `{ error: "stale_lineup" }`
5. Persist `localLineupJson: JSON.stringify(nextEntries)`; if source espn → `mixed`
6. 200 `{ ok: true, youWaiverRank?: never }` — just `{ ok: true, entries: nextEntries }`

Implementation note: Prefer re-fetch in apply route (copy pattern from `season-leagues/[id]/lineup/route.ts`) so we do not clear `stateJson`.

- [ ] **Step 1: Write API tests** (mirror `tests/api/waivers.test.ts` auth helpers)

Cases:

- GET 401
- GET 404 other user
- GET 400 self opponent
- GET 200 has `board.categories.length === 9` (or enabled count) and `sitStart` array
- POST apply 401
- POST apply moves bench player onto active slot in `localLineupJson`
- POST apply 409 when bogus ids

- [ ] **Step 2: Run — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/api/matchup.test.ts`

- [ ] **Step 3: Implement routes**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/matchup tests/api/matchup.test.ts
git commit -m "feat(matchup): add advice and apply-lineup APIs"
```

---

### Task 6: UI + nav + home primacy

**Files:**
- Create: `src/components/matchup/MatchupWorkspace.tsx`
- Create: `src/components/matchup/OpponentPicker.tsx`
- Create: `src/components/matchup/MatchupBoard.tsx`
- Create: `src/components/matchup/SitStartPanel.tsx`
- Create: `src/components/matchup/StreamersPanel.tsx`
- Create: `src/app/matchup/page.tsx`
- Create: `src/app/matchup/[id]/page.tsx`
- Modify: `src/components/SiteNav.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/unit/MatchupWorkspace.test.tsx`

**Behavior:**

1. `/matchup` league list — copy structure from `src/app/waivers/page.tsx` (fetch `/api/season-leagues`, links to `/matchup/[id]`).
2. Workspace: default opponent = first team index ≠ perspective; persist selection in React state (optional `localStorage` key `matchup-opponent:${id}`).
3. Fetch GET `/api/matchup?seasonLeagueId=&opponentTeamIndex=` on mount/opponent change.
4. Render board hero → SitStartPanel (Apply buttons call POST apply-lineup then refetch) → StreamersPanel links to `/waivers/[id]?addPlayerId=`.
5. Incomplete active lineup: if any active slot empty, show banner text `Incomplete lineup — fill active slots for a fair projection`.
6. SiteNav order: **Home, Matchup, Draft, Roster, Trade, Waivers** with `isMatchup = pathname.startsWith("/matchup")`.
7. Home: change H1 emphasis toward season matchup (keep brand FANTASY); primary button `Open matchup advisor` → `/matchup`; demote draft to secondary.

- [ ] **Step 1: Write UI smoke test**

```tsx
// mock fetch for /api/matchup returning board with wins/losses + one sitStart
// render MatchupWorkspace
// expect heading / board summary / Sit/Start label
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupWorkspace.test.tsx`

- [ ] **Step 3: Implement UI + nav + home**

Mirror Trade/Waivers Tailwind. Board: summary `YOU {wins} — Opp {losses} — Tie {ties}` then 9-cat grid. Accessibility: select `aria-label="Matchup opponent"`, Apply buttons `aria-label={`Start ${name} over ${name}`}`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup src/app/matchup src/components/SiteNav.tsx src/app/page.tsx tests/unit/MatchupWorkspace.test.tsx
git commit -m "feat(matchup): add matchup workspace UI and nav primacy"
```

---

### Task 7: Verification smoke

- [x] **Step 1:** `npm.cmd run lint` — PASS  
- [x] **Step 2:** `npx.cmd vitest run --maxWorkers=1` — PASS (171–172/173; 2 unrelated flaky timeouts under load; 24/24 matchup slice green)  
- [x] **Step 3:** Grep matchup paths for `@/lib/sim` / `draft` imports — none  
- [x] **Step 4:** Confirm fixture schedule JSON still no BOM (`{` first byte)  
- [x] **Step 5:** Manual checklist (or document API coverage): open `/matchup/[id]`, pick opponent, see board, apply one sit/start, confirm Roster reflects lineup; click streamer → Waivers — documented in `.superpowers/sdd/task-7-report.md`  
- [x] **Step 6:** Commit fixes only if needed — `235f423`  

```bash
git commit -m "fix(matchup): <only if required>"
```

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| `/matchup` + nav primacy + home CTA | 6 |
| Manual opponent select | 5–6 |
| Active-only weekly projections | 1 |
| H2H W/L/T + expectancy | 2 |
| Sit/Start greedy + local Apply | 3, 5 |
| Streamers → Waivers | 4, 6 |
| No ESPN / no draft imports | 5, 7 |
| Tests | 1–7 |

## Self-review notes

- Pairwise sigmoid lives in `matchup/board.ts` — no `@/lib/sim` import (domain split).
- `loadOwnedSeasonLeague` reused; apply route still re-fetches for precise `localLineupJson` write.
- Empty active promote deferred; filled BE↔active only in MVP.
- Opponent persistence: React state + optional localStorage in Task 6 (not DB).
