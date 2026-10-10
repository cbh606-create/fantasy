# Matchup Realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Matchup Advisor use live NBA week schedules, league slot + player position eligibility, per-category win-prob scales, and B2B second-night expected play weights (0.75).

**Architecture:** Add pure helpers (`eligibility`, `scheduleLive`, B2B weights in `games`) then wire into `advise` / `dailyLineups` / `sitStart` / APIs / ESPN map / Matchup UI. Live schedule is ESPN public scoreboard by date with in-memory cache and fixture fallback.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, existing `src/lib/matchup/*` and `src/lib/adapters/espnSeasonMap.ts`. Worktree: `C:\Users\cbh60\fantasy-dev` (junction to `.worktrees\feat-season-roster`), branch `feat/matchup-advisor`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-matchup-realism-design.md`
- `B2B_SECOND_NIGHT_PLAY_RATE = 0.75`
- Schedule `source: "live" | "fixture"`; live-first, fixture on failure
- Missing `positions` → eligible for `UTIL` / `BE` / `IL` only
- Missing `rosterSlots` → `SEASON_ROSTER_SLOTS`
- No opponent daily lineups; no per-player historical B2B rates; no ESPN lineup writeback
- No semicolons; `handle*` event handlers; conventional commits
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>`
- Windows: prefer `npm.cmd` / `npx.cmd`

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/season/types.ts` | `positions?`, `rosterSlots?`, schedule `source` union |
| `src/lib/matchup/eligibility.ts` | Slot eligibility + active slots from league template |
| `src/lib/matchup/constants.ts` | Category sigmoid scales + B2B rate |
| `src/lib/matchup/board.ts` | Use per-category scales |
| `src/lib/matchup/games.ts` | B2B detection + weighted game maps |
| `src/lib/matchup/scheduleLive.ts` | Fetch/normalize live week + cache + fixture fallback |
| `src/lib/matchup/dailyLineups.ts` | Weighted effective games + eligibility-aware toggle |
| `src/lib/matchup/advise.ts` | Weighted weekly games map |
| `src/lib/matchup/sitStart.ts` | Eligibility-filtered swaps |
| `src/lib/adapters/espnSeasonMap.ts` | Persist `positions` + `rosterSlots` |
| `src/app/api/schedule/route.ts` | Live schedule helper |
| `src/app/api/matchup/route.ts` | Same schedule helper |
| `src/components/matchup/*` | B2B cue + schedule source chip + eligibility UX |
| `tests/unit/matchupEligibility.test.ts` | Eligibility |
| `tests/unit/matchupBoard.test.ts` | Scale bands (extend) |
| `tests/unit/matchupGamesB2b.test.ts` | B2B weights |
| `tests/unit/matchupScheduleLive.test.ts` | Normalizer + fallback |
| `tests/unit/matchupDailyLineups.test.ts` | Weighted + ineligible toggle (extend) |

---

### Task 1: Season types for positions, rosterSlots, schedule source

**Files:**
- Modify: `src/lib/season/types.ts`
- Modify any Zod/validation that mirrors `SeasonPlayer` / `ScheduleResponse` if present (grep `ScheduleResponse` / `SeasonPlayer`)

**Interfaces:**
- Produces:
  - `SeasonPlayer.positions?: Array<"PG"|"SG"|"SF"|"PF"|"C"|"G"|"F">`
  - `SeasonLeagueState.rosterSlots?: SeasonSlot[]`
  - `ScheduleResponse.source: "live" | "fixture"`

- [ ] **Step 1: Update types**

```ts
export type SeasonPosition = "PG" | "SG" | "SF" | "PF" | "C" | "G" | "F"

export type SeasonPlayer = {
  id: string
  name: string
  teamAbbr?: string
  positions?: SeasonPosition[]
  availability?: "fa" | "waiver"
  projections: Record<CategoryId, number>
  shooting: {
    FGM: number
    FGA: number
    FTM: number
    FTA: number
  }
}

export type ScheduleResponse = {
  source: "live" | "fixture"
  matchup: ScheduleMatchup
  games: ScheduleGame[]
}

export type SeasonLeagueState = {
  // ...existing fields...
  rosterSlots?: SeasonSlot[]
}
```

- [ ] **Step 2: Ensure fixture JSON already has `"source": "fixture"`** (it should). If not, set it in `data/fixtures/nba-matchup-schedule.json`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/season/types.ts data/fixtures/nba-matchup-schedule.json
git commit -m "feat(season): add positions, rosterSlots, and live schedule source types"
```

---

### Task 2: Eligibility helpers (TDD)

**Files:**
- Create: `src/lib/matchup/eligibility.ts`
- Test: `tests/unit/matchupEligibility.test.ts`

**Interfaces:**
- Consumes: `SeasonSlot`, `SeasonPlayer`, `SEASON_ROSTER_SLOTS`
- Produces:
  - `rosterSlotsFor(state: { rosterSlots?: SeasonSlot[] }): SeasonSlot[]`
  - `activeSlotsFor(rosterSlots: SeasonSlot[]): SeasonSlot[]`
  - `eligibleForSlot(player: Pick<SeasonPlayer, "positions"> | null | undefined, slot: SeasonSlot): boolean`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest"
import {
  activeSlotsFor,
  eligibleForSlot,
  rosterSlotsFor,
} from "@/lib/matchup/eligibility"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"

describe("eligibility", () => {
  it("defaults roster slots and active slots", () => {
    expect(rosterSlotsFor({})).toEqual(SEASON_ROSTER_SLOTS)
    expect(activeSlotsFor(SEASON_ROSTER_SLOTS)).toEqual(
      SEASON_ROSTER_SLOTS.filter((s) => s !== "BE" && s !== "IL"),
    )
  })

  it("allows PG into PG, G, UTIL; blocks C", () => {
    const pg = { positions: ["PG"] as const }
    expect(eligibleForSlot(pg, "PG")).toBe(true)
    expect(eligibleForSlot(pg, "G")).toBe(true)
    expect(eligibleForSlot(pg, "UTIL")).toBe(true)
    expect(eligibleForSlot(pg, "C")).toBe(false)
    expect(eligibleForSlot(pg, "BE")).toBe(true)
  })

  it("missing positions → UTIL/BE/IL only", () => {
    expect(eligibleForSlot({}, "UTIL")).toBe(true)
    expect(eligibleForSlot({}, "PG")).toBe(false)
    expect(eligibleForSlot(undefined, "SG")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupEligibility.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `eligibility.ts`**

```ts
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type { SeasonPlayer, SeasonSlot } from "@/lib/season/types"

export const rosterSlotsFor = (state: {
  rosterSlots?: SeasonSlot[]
}): SeasonSlot[] =>
  state.rosterSlots?.length ? state.rosterSlots : SEASON_ROSTER_SLOTS

export const activeSlotsFor = (rosterSlots: SeasonSlot[]): SeasonSlot[] =>
  rosterSlots.filter((slot) => slot !== "BE" && slot !== "IL")

export const eligibleForSlot = (
  player: Pick<SeasonPlayer, "positions"> | null | undefined,
  slot: SeasonSlot,
): boolean => {
  if (slot === "BE" || slot === "IL") return true
  if (slot === "UTIL") return true

  const positions = player?.positions
  if (!positions?.length) return false

  if (slot === "G") {
    return positions.some((p) => p === "PG" || p === "SG" || p === "G")
  }
  if (slot === "F") {
    return positions.some((p) => p === "SF" || p === "PF" || p === "F")
  }

  return positions.includes(slot)
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/eligibility.ts tests/unit/matchupEligibility.test.ts
git commit -m "feat(matchup): add league slot eligibility helpers"
```

---

### Task 3: Per-category board scales (TDD)

**Files:**
- Modify: `src/lib/matchup/constants.ts`
- Modify: `src/lib/matchup/board.ts`
- Modify: `tests/unit/matchupBoard.test.ts` (extend)

**Interfaces:**
- Produces:
  - `MATCHUP_CATEGORY_SIGMOID_SCALE: Record<CategoryId, number>`
  - `categoryWinProb` uses `MATCHUP_CATEGORY_SIGMOID_SCALE[categoryId]`
  - Keep `MATCHUP_SIGMOID_SCALE` only if other imports need it; prefer deprecate usage in board

Suggested scales:

```ts
export const MATCHUP_CATEGORY_SIGMOID_SCALE = {
  PTS: 15,
  REB: 12,
  AST: 12,
  TPM: 10,
  STL: 4,
  BLK: 4,
  TO: 5,
  FG_PCT: 0.03,
  FT_PCT: 0.03,
} as const satisfies Record<CategoryId, number>
```

- [ ] **Step 1: Write / extend failing assertions**

```ts
it("keeps small PTS edges uncertain and FG% edges meaningful", () => {
  const pts = categoryWinProb(100.5, 100, "PTS")
  expect(pts).toBeGreaterThan(0.45)
  expect(pts).toBeLessThan(0.6)

  const fg = categoryWinProb(0.46, 0.45, "FG_PCT")
  expect(fg).toBeGreaterThan(0.55)
  expect(fg).toBeLessThan(0.75)
})
```

- [ ] **Step 2: Run — FAIL or wrong bands under old scale=2**

- [ ] **Step 3: Implement scales + update `categoryWinProb`**

```ts
const scale = MATCHUP_CATEGORY_SIGMOID_SCALE[categoryId]
return 1 / (1 + Math.exp(-delta / scale))
```

- [ ] **Step 4: Run matchupBoard tests — PASS** (update any brittle old expectations)

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/constants.ts src/lib/matchup/board.ts tests/unit/matchupBoard.test.ts
git commit -m "feat(matchup): use per-category win-prob sigmoid scales"
```

---

### Task 4: B2B weights in games.ts (TDD)

**Files:**
- Modify: `src/lib/matchup/constants.ts` (add `B2B_SECOND_NIGHT_PLAY_RATE = 0.75`)
- Modify: `src/lib/matchup/games.ts`
- Create: `tests/unit/matchupGamesB2b.test.ts`

**Interfaces:**
- Produces:
  - `previousIsoDate(iso: string): string` (UTC date-only YYYY-MM-DD minus 1 day)
  - `teamGameDates(schedule, teamAbbr, extraLookbackDays?: string[]): Set<string>`
  - `isB2bSecondNight(teamAbbr, date, schedule, lookbackDates?: string[]): boolean`
  - `gameWeightForTeamDate(teamAbbr, date, schedule, lookbackDates?): number` → `0 | 1 | 0.75`
  - `weightedGamesInDaysByPlayerId(players, schedule, days): Map<string, number>`
  - `weightedGamesThisWeekByPlayerId(players, schedule): Map<string, number>`
  - Keep existing `gamesInDaysByPlayerId` / `gamesThisWeekByPlayerId` as integer counts OR migrate callers to weighted and leave integer helpers for UI badges if needed

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest"
import {
  gameWeightForTeamDate,
  weightedGamesInDaysByPlayerId,
} from "@/lib/matchup/games"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-03-09",
    endDate: "2026-03-11",
    days: ["2026-03-09", "2026-03-10", "2026-03-11"],
  },
  games: [
    { date: "2026-03-09", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2026-03-10", homeAbbr: "BOS", awayAbbr: "MIA" },
    { date: "2026-03-11", homeAbbr: "LAL", awayAbbr: "BOS" },
  ],
}

describe("B2B game weights", () => {
  it("marks second night 0.75 and isolated night 1", () => {
    expect(gameWeightForTeamDate("BOS", "2026-03-09", schedule)).toBe(1)
    expect(gameWeightForTeamDate("BOS", "2026-03-10", schedule)).toBe(0.75)
    expect(gameWeightForTeamDate("BOS", "2026-03-11", schedule)).toBe(0.75)
  })

  it("sums weighted games for a player", () => {
    const players: SeasonPlayer[] = [
      {
        id: "1",
        name: "Tatum",
        teamAbbr: "BOS",
        projections: {
          FG_PCT: 0,
          FT_PCT: 0,
          TPM: 0,
          REB: 0,
          AST: 0,
          STL: 0,
          BLK: 0,
          TO: 0,
          PTS: 0,
        },
        shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
      },
    ]
    const map = weightedGamesInDaysByPlayerId(
      players,
      schedule,
      schedule.matchup.days,
    )
    expect(map.get("1")).toBeCloseTo(1 + 0.75 + 0.75, 5)
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement helpers in `games.ts`** (use UTC date arithmetic for `previousIsoDate`)

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/games.ts src/lib/matchup/constants.ts tests/unit/matchupGamesB2b.test.ts
git commit -m "feat(matchup): weight B2B second nights at 0.75 expected games"
```

---

### Task 5: Wire weighted games into advise + daily lineups

**Files:**
- Modify: `src/lib/matchup/advise.ts` — use `weightedGamesThisWeekByPlayerId`
- Modify: `src/lib/matchup/dailyLineups.ts` — `effectiveGamesByPlayerId` adds `gameWeightForTeamDate` instead of `+1`
- Modify: `src/lib/waivers/matchupStream.ts` if it uses integer games maps (grep `gamesThisWeekByPlayerId`)
- Extend: `tests/unit/matchupDailyLineups.test.ts`

**Interfaces:**
- Consumes: weighted helpers from Task 4
- Produces: fractional `effectiveGames` / weekly maps for board math

- [ ] **Step 1: Add daily test** — start player only on B2B second night → effectiveGames `0.75`

- [ ] **Step 2: Implement daily + advise wiring**

- [ ] **Step 3: Run**  
`npx.cmd vitest run --maxWorkers=1 tests/unit/matchupDailyLineups.test.ts tests/unit/matchupGamesB2b.test.ts tests/api/matchup.test.ts`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(matchup): use B2B-weighted games in advise and daily totals"
```

---

### Task 6: Live schedule module (TDD normalizer + fallback)

**Files:**
- Create: `src/lib/matchup/scheduleLive.ts`
- Create: `data/fixtures/espn-nba-scoreboard-sample.json` (small 1–2 day sample shaped like ESPN site API)
- Test: `tests/unit/matchupScheduleLive.test.ts`

**Interfaces:**
- Produces:
  - `normalizeEspnScoreboard(payload, options): ScheduleResponse` with `source: "live"`
  - `buildWeekDays(startIso, endIso): string[]`
  - `getMatchupSchedule(): Promise<ScheduleResponse>` — live-first, 15–30 min memory cache, fixture fallback
  - Team abbr map from ESPN `competitor.team.abbreviation`

Public fetch pattern (no auth):

```
https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD
```

Week window v1: calendar week containing **today (UTC or America/New_York)** Mon–Sun, or rolling 7 days starting today — pick **America/New_York local date, Monday-start week through Sunday** and document in code comment. Include games for each day via parallel fetches or sequential with cache.

- [ ] **Step 1: Write normalizer tests against sample fixture** — expect ≥1 game, `source: "live"`, days non-empty

- [ ] **Step 2: Implement normalizer**

- [ ] **Step 3: Implement `getMatchupSchedule` with try/catch → import fixture**

```ts
import scheduleFixture from "../../../data/fixtures/nba-matchup-schedule.json"
```

- [ ] **Step 4: Unit-test fallback by injecting a failing fetcher** (pass `fetchImpl` optional param)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(matchup): add live NBA week schedule with fixture fallback"
```

---

### Task 7: Wire schedule APIs

**Files:**
- Modify: `src/app/api/schedule/route.ts`
- Modify: `src/app/api/matchup/route.ts`
- Modify: `tests/api/matchup.test.ts` / schedule tests if any — mock `getMatchupSchedule`

- [ ] **Step 1: Replace direct fixture import with `await getMatchupSchedule()`**

- [ ] **Step 2: Run API tests**

`npx.cmd vitest run --maxWorkers=1 tests/api/matchup.test.ts`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): serve live-first matchup schedule"
```

---

### Task 8: ESPN import — positions + rosterSlots

**Files:**
- Modify: `src/lib/adapters/espnSeasonMap.ts`
- Extend: `EspnPlayer` with `defaultPositionId?: number`, `eligibleSlots?: number[]`
- Extend: `EspnLeaguePayload.settings` to optional `rosterSettings.lineupSlotCounts?: Record<string, number>`
- Test: extend `tests/unit/espnSeason*.test.ts` or add `tests/unit/espnSeasonPositions.test.ts`

**Interfaces:**
- Produces players with `positions` from `eligibleSlots` / `defaultPositionId` using same id→slot map as `mapEspnLineupSlot` (filter to PG/SG/SF/PF/C/G/F only)
- Produces `rosterSlots` by expanding `lineupSlotCounts` (e.g. `{ "0": 1, "1": 1, ..., "12": 3 }`) into a `SeasonSlot[]` list; if missing, omit and let eligibility default

- [ ] **Step 1: Failing test** — sample player with `eligibleSlots: [0,5]` → `positions` includes `PG` and `G`

- [ ] **Step 2: Implement mapping helpers `positionsFromEspnPlayer`, `rosterSlotsFromEspnSettings`**

- [ ] **Step 3: Attach on `playerFromEspn` and league state build**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(season): import ESPN positions and roster slot template"
```

---

### Task 9: Sit/Start + daily toggle eligibility

**Files:**
- Modify: `src/lib/matchup/sitStart.ts` — before accepting a swap, require `eligibleForSlot(benchPlayer, activeSlot)` and `eligibleForSlot(activePlayer, "BE")` (always true)
- Modify: `src/lib/matchup/dailyLineups.ts` — change `togglePlayerDay` signature to accept `playersById` + optional `rosterSlots`; when starting, find first empty slot where `eligibleForSlot(player, slot)`; return status `"ineligible"` if none
- Modify: `tests/unit/matchupSitStart.test.ts`, daily tests
- Modify: MatchupWorkspace / DailyLineupPanel call sites for new toggle signature

- [ ] **Step 1: Failing tests** for illegal sit/start and ineligible daily start

- [ ] **Step 2: Implement**

- [ ] **Step 3: Run related unit tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(matchup): enforce position eligibility on sit/start and daily starts"
```

---

### Task 10: UI — schedule source chip + B2B cues

**Files:**
- Modify: `src/components/matchup/MatchupWorkspace.tsx` and/or `DailyLineupPanel.tsx`
- Optionally: Roster schedule panel if it shares cells

**Behavior:**
- Show muted chip: `Schedule: live` or `Schedule: fixture fallback`
- On day cells that are B2B second night for that player’s team, show `B2B` (title/tooltip `B2B · ~75% expected`)
- Use `isB2bSecondNight` / `gameWeightForTeamDate` from `games.ts`

- [ ] **Step 1: Implement UI affordances (keep density; no new card chrome)**

- [ ] **Step 2: Smoke test** `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupWorkspace.test.tsx`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(matchup): show live schedule source and B2B day cues"
```

---

### Task 11: Spec status + verification sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-08-24-matchup-realism-design.md` — set Status to `Implemented`

- [ ] **Step 1: Run focused suite**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/matchupEligibility.test.ts tests/unit/matchupBoard.test.ts tests/unit/matchupGamesB2b.test.ts tests/unit/matchupScheduleLive.test.ts tests/unit/matchupDailyLineups.test.ts tests/unit/matchupSitStart.test.ts tests/api/matchup.test.ts tests/unit/MatchupWorkspace.test.tsx
```

Expected: all PASS

- [ ] **Step 2: Manual check** — open Matchup, confirm schedule chip, spot-check a known B2B team night, try illegal position start

- [ ] **Step 3: Commit docs**

```bash
git commit -m "docs(matchup): mark realism spec implemented"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Live schedule + fixture fallback | 6, 7 |
| `source: live \| fixture` | 1, 6 |
| League `rosterSlots` + player `positions` | 1, 8 |
| Eligibility for daily / sit-start | 2, 9 |
| Per-category sigmoid scales | 3 |
| B2B 0.75 second-night weights | 4, 5 |
| UI B2B + source chip | 10 |
| Unit tests listed in spec §8 | 2–6, 9 |
| Cache live schedule | 6 |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-24-matchup-realism.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
