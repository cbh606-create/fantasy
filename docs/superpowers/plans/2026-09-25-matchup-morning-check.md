# Matchup Morning Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each morning, lock finished matchup days to ESPN actuals, show every category's projection against those actuals, and replan today through the end of the week.

**Architecture:** Pure functions in `src/lib/matchup/morningCheck.ts` freeze startable player ids, project them with the selected stat window, blend actuals plus remaining-day projections, and build the summary. ESPN day lines are mapped separately into that input. The matchup GET saves one JSON record on `SeasonLeague` and the existing board, streaming, and sit/start builders consume the blended totals. Two new presentational components render the summary and the day grid.

**Tech Stack:** TypeScript, React, Vitest, Prisma SQLite, existing ESPN league fetch and `weeklyPlayerStats`.

## Global Constraints

- Run once a day, after the previous night is final and before today's lineup lock. A second open the same morning reads the saved check.
- Games still in progress do not update the check. Today stays unfinished until the next morning.
- A finished day stores our startable ids, the opponent's startable ids, both actual 9-category totals, and both played-id lists. Later roster adds do not change those ids.
- The projection shown for a closed day is those saved ids multiplied by the stat window currently selected (`season` | `l7` | `l15` | `l30`). Switching the window recomputes numbers only.
- Counting categories sum. FG% and FT% are aggregated makes and attempts, then a percentage. Use `weeklyPlayerStats` for that math.
- A matchup day with no NBA games still closes at zero for both sides.
- A day before today that had games, but has no final ESPN line, stays open. It is absent from the day grid and from the week sum. The summary says last night's results are not in yet.
- Week board = actuals of closed days + projections for today through the last matchup day, using the current roster and the current stat window.
- Streaming plans and sit/start recompute for remaining days on that blended board. Do not change the 1-spot / 2-spot / 3-spot streaming policy.
- Day grid sits directly under the week scoreboard. Summary sits above it. Columns are the same 9 categories. Each closed day has a You row and an Opp row. Projection is the secondary number above the actual.
- Summary lists all 9 categories with this morning's outcome. A flip against the saved board is marked. None are hidden.
- Opponent lines: an add that was not on the saved roster, an expected add that did not happen, an unexpected drop.
- Us: a saved remaining-day starter who is now `out`, or a saved startable id with no played line on a closed day. `gtd` is not a summary fact.
- Recommendation changes only when at least one fact exists (a flip, an opponent line, or an absence). At most 3. Today's lineup or add/drop comes before later days.
- Facts with the same plan: say the recommendations are unchanged.
- No facts: leave the change lines empty.
- First check of the week: all 9 outcomes, today's recommendations, no flip marks, no change lines.
- Store the check on `SeasonLeague.morningCheckJson`, separate from `stateJson`.
- ESPN sync failure: keep the last saved check on screen. Do not clear the board and do not write a new record.
- Out of scope: live in-game updates, streaming-policy changes, trade, waivers, season-long punt decisions, ESPN lineup writeback.
- English UI. No semicolons in TS/TSX. Tests use the existing semicolon style.
- Tests: `npx.cmd vitest run --maxWorkers=1 <file>`.
- Do not commit unless the user asked for a commit. Skip every commit step below until they do.

---

### Task 1: Project one day from saved player ids

**Files:**
- Create: `src/lib/matchup/morningCheck.ts`
- Test: `tests/unit/morningCheck.test.ts`

**Interfaces:**
- Consumes: `weeklyPlayerStats` from `src/lib/matchup/weekly.ts`, `gameWeightForTeamDate` and `teamHasGameOnDate` from `src/lib/matchup/games.ts`, `isActiveSlot` from `src/lib/matchup/constants.ts`, `CategoryId` from `src/lib/domain/types`, `SeasonPlayer`, `SeasonRosterEntry`, `ScheduleResponse` from `src/lib/season/types.ts`, `StatWindow` from `src/lib/matchup/types.ts`
- Produces:

```ts
export type CategoryTotals = Record<CategoryId, number>

export const emptyCategoryTotals = (): CategoryTotals =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as CategoryTotals

export const startableIdsOnDate = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
): string[] => string[]

export const projectDayTotals = (
  playerIds: string[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
  statWindow: StatWindow,
): CategoryTotals
```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/morningCheck.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import { projectDayTotals, startableIdsOnDate } from "@/lib/matchup/morningCheck"
import type { SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import type { ScheduleResponse } from "@/lib/season/types"

const totals = (overrides: Partial<Record<CategoryId, number>> = {}) =>
  ({
    FG_PCT: 0.5,
    FT_PCT: 0.8,
    TPM: 2,
    REB: 5,
    AST: 3,
    STL: 1,
    BLK: 1,
    TO: 2,
    PTS: 20,
    ...overrides,
  }) as Record<CategoryId, number>

const player = (
  id: string,
  teamAbbr: string,
  points: number,
): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  projections: totals({ PTS: points }),
  projectedGames: 82,
  shooting: { FGM: 8, FGA: 16, FTM: 4, FTA: 5 },
})

const schedule = (): ScheduleResponse => ({
  source: "fixture",
  matchup: {
    scoringPeriodId: 20261020,
    startDate: "2026-10-20",
    endDate: "2026-10-26",
    days: ["2026-10-20", "2026-10-21"],
  },
  games: [
    { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "NYK" },
  ],
})

describe("projectDayTotals", () => {
  it("projects only the saved ids who play that date", () => {
    const players = [
      player("a", "BOS", 1640),
      player("b", "LAL", 820),
    ]
    const playersById = new Map(players.map((item) => [item.id, item]))
    const entries: SeasonRosterEntry[] = [
      { slot: "UTIL", playerId: "a" },
      { slot: "BE", playerId: "b" },
      { slot: "UTIL", playerId: null },
    ]

    expect(
      startableIdsOnDate(entries, playersById, "2026-10-20", schedule()),
    ).toEqual(["a"])

    const projected = projectDayTotals(
      ["a", "b"],
      playersById,
      "2026-10-20",
      schedule(),
      "season",
    )
    expect(projected.PTS).toBeCloseTo(20)
    expect(projected.FG_PCT).toBeCloseTo(0.5)
  })

  it("uses the selected window rates for the same ids", () => {
    const withWindow = player("a", "BOS", 1640)
    withWindow.recentRates = {
      l7: {
        projections: totals({ PTS: 10 }),
        shooting: { FGM: 4, FGA: 10, FTM: 2, FTA: 2 },
      },
    }
    const playersById = new Map([["a", withWindow]])
    const seasonPts = projectDayTotals(
      ["a"],
      playersById,
      "2026-10-20",
      schedule(),
      "season",
    ).PTS
    const recentPts = projectDayTotals(
      ["a"],
      playersById,
      "2026-10-20",
      schedule(),
      "l7",
    ).PTS
    expect(seasonPts).toBeCloseTo(20)
    expect(recentPts).toBeCloseTo(10)
  })
})
```

`1640 / 82 = 20`. The L7 path uses per-game PTS 10.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheck.test.ts`

Expected: FAIL with `projectDayTotals` or `startableIdsOnDate` not exported.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/matchup/morningCheck.ts`:

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"
import { isActiveSlot } from "./constants"
import { gameWeightForTeamDate, teamHasGameOnDate } from "./games"
import type { StatWindow } from "./types"
import { weeklyPlayerStats } from "./weekly"

export type CategoryTotals = Record<CategoryId, number>

const COUNTING_CATEGORIES = ALL_CATEGORY_IDS.filter(
  (categoryId) => categoryId !== "FG_PCT" && categoryId !== "FT_PCT",
)

export const emptyCategoryTotals = (): CategoryTotals =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as CategoryTotals

export const startableIdsOnDate = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
): string[] =>
  entries.flatMap((entry) => {
    if (!isActiveSlot(entry.slot) || !entry.playerId) return []
    const player = playersById.get(entry.playerId)
    if (!player?.teamAbbr) return []
    if (!teamHasGameOnDate(player.teamAbbr, date, schedule)) return []
    return [entry.playerId]
  })

export const projectDayTotals = (
  playerIds: string[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
  statWindow: StatWindow,
): CategoryTotals => {
  const totals = emptyCategoryTotals()
  let fgm = 0
  let fga = 0
  let ftm = 0
  let fta = 0

  for (const playerId of playerIds) {
    const player = playersById.get(playerId)
    if (!player?.teamAbbr) continue
    const games = gameWeightForTeamDate(
      player.teamAbbr,
      date,
      schedule,
      undefined,
      playerId,
    )
    if (games <= 0) continue
    const weekly = weeklyPlayerStats(player, games, statWindow)
    for (const categoryId of COUNTING_CATEGORIES) {
      totals[categoryId] += weekly.projections[categoryId]
    }
    fgm += weekly.shooting.FGM
    fga += weekly.shooting.FGA
    ftm += weekly.shooting.FTM
    fta += weekly.shooting.FTA
  }

  totals.FG_PCT = fga > 0 ? fgm / fga : 0
  totals.FT_PCT = fta > 0 ? ftm / fta : 0
  return totals
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheck.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add src/lib/matchup/morningCheck.ts tests/unit/morningCheck.test.ts
git commit -m "feat(matchup): project a closed day from saved player ids"
```

---

### Task 2: Close finished days and blend the week

**Files:**
- Modify: `src/lib/matchup/morningCheck.ts`
- Modify: `tests/unit/morningCheck.test.ts`

**Interfaces:**
- Consumes: `CategoryTotals`, `emptyCategoryTotals`, `projectDayTotals`, `startableIdsOnDate` from Task 1. `buildMatchupBoard` from `src/lib/matchup/board.ts`. `MatchupBoard` from `src/lib/matchup/types.ts`.
- Produces:

```ts
export type DayActuals = {
  date: string
  you: CategoryTotals
  opp: CategoryTotals
  youPlayedIds: string[]
  oppPlayedIds: string[]
}

export type ClosedDayRecord = {
  date: string
  youStartableIds: string[]
  oppStartableIds: string[]
  youActual: CategoryTotals
  oppActual: CategoryTotals
  youPlayedIds: string[]
  oppPlayedIds: string[]
}

export type DayComparisonRow = {
  date: string
  youProjection: CategoryTotals
  youActual: CategoryTotals
  oppProjection: CategoryTotals
  oppActual: CategoryTotals
}

export const closeFinishedDays = (input: {
  matchupDays: string[]
  today: string
  previousClosed: ClosedDayRecord[]
  actualsByDate: Map<string, DayActuals>
  schedule: ScheduleResponse
  youEntries: SeasonRosterEntry[]
  oppEntries: SeasonRosterEntry[]
  playersById: Map<string, SeasonPlayer>
}): { closedDays: ClosedDayRecord[]; actualsPending: boolean }

export const dayComparisonRows = (
  closedDays: ClosedDayRecord[],
  playersById: Map<string, SeasonPlayer>,
  schedule: ScheduleResponse,
  statWindow: StatWindow,
): DayComparisonRow[]

export const blendWeekTotals = (input: {
  closedDays: ClosedDayRecord[]
  remainingDates: string[]
  youEntries: SeasonRosterEntry[]
  oppEntries: SeasonRosterEntry[]
  playersById: Map<string, SeasonPlayer>
  schedule: ScheduleResponse
  statWindow: StatWindow
}): { you: CategoryTotals; opp: CategoryTotals }

export const blendedMatchupBoard = (
  totals: { you: CategoryTotals; opp: CategoryTotals },
  categoryIds: CategoryId[],
): MatchupBoard
```

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/morningCheck.test.ts`:

```ts
import {
  blendWeekTotals,
  closeFinishedDays,
  dayComparisonRows,
  emptyCategoryTotals,
} from "@/lib/matchup/morningCheck"

const zero = emptyCategoryTotals()

const actualLine = (
  date: string,
  youPts: number,
  oppPts: number,
): DayActuals => ({
  date,
  you: { ...zero, PTS: youPts },
  opp: { ...zero, PTS: oppPts },
  youPlayedIds: ["a"],
  oppPlayedIds: ["c"],
})

describe("closeFinishedDays", () => {
  const playersById = new Map([
    ["a", player("a", "BOS", 1640)],
    ["added-later", player("added-later", "BOS", 2460)],
    ["c", player("c", "NYK", 1640)],
  ])
  const youEntries: SeasonRosterEntry[] = [
    { slot: "UTIL", playerId: "added-later" },
  ]
  const oppEntries: SeasonRosterEntry[] = [{ slot: "UTIL", playerId: "c" }]
  const days = ["2026-10-20", "2026-10-21"]

  it("freezes the first close and ignores a later roster add", () => {
    const first = closeFinishedDays({
      matchupDays: days,
      today: "2026-10-21",
      previousClosed: [
        {
          date: "2026-10-20",
          youStartableIds: ["a"],
          oppStartableIds: ["c"],
          youActual: { ...zero, PTS: 18 },
          oppActual: { ...zero, PTS: 12 },
          youPlayedIds: ["a"],
          oppPlayedIds: ["c"],
        },
      ],
      actualsByDate: new Map([
        ["2026-10-20", actualLine("2026-10-20", 99, 99)],
      ]),
      schedule: schedule(),
      youEntries,
      oppEntries,
      playersById,
    })
    expect(first.closedDays[0]?.youStartableIds).toEqual(["a"])
    expect(first.closedDays[0]?.youActual.PTS).toBe(99)
    expect(first.actualsPending).toBe(false)

    const rows = dayComparisonRows(
      first.closedDays,
      playersById,
      schedule(),
      "season",
    )
    expect(rows[0]?.youProjection.PTS).toBeCloseTo(20)
    expect(rows[0]?.youActual.PTS).toBe(99)
  })

  it("leaves a played day open when ESPN has no final line", () => {
    const pending = closeFinishedDays({
      matchupDays: days,
      today: "2026-10-21",
      previousClosed: [],
      actualsByDate: new Map(),
      schedule: schedule(),
      youEntries,
      oppEntries,
      playersById,
    })
    expect(pending.closedDays).toEqual([])
    expect(pending.actualsPending).toBe(true)
  })

  it("closes a day with no NBA games at zero", () => {
    const quiet = closeFinishedDays({
      matchupDays: ["2026-10-19", "2026-10-20"],
      today: "2026-10-20",
      previousClosed: [],
      actualsByDate: new Map(),
      schedule: schedule(),
      youEntries,
      oppEntries,
      playersById,
    })
    expect(quiet.closedDays.map((day) => day.date)).toEqual(["2026-10-19"])
    expect(quiet.closedDays[0]?.youActual.PTS).toBe(0)
    expect(quiet.actualsPending).toBe(false)
  })

  it("adds closed actuals to remaining-day projections", () => {
    const closed = closeFinishedDays({
      matchupDays: days,
      today: "2026-10-21",
      previousClosed: [],
      actualsByDate: new Map([
        ["2026-10-20", actualLine("2026-10-20", 18, 12)],
      ]),
      schedule: schedule(),
      youEntries: [{ slot: "UTIL", playerId: "a" }],
      oppEntries,
      playersById,
    }).closedDays
    const blended = blendWeekTotals({
      closedDays: closed,
      remainingDates: ["2026-10-21"],
      youEntries: [{ slot: "UTIL", playerId: "a" }],
      oppEntries,
      playersById,
      schedule: schedule(),
      statWindow: "season",
    })
    expect(blended.you.PTS).toBeCloseTo(18)
    expect(blended.opp.PTS).toBeCloseTo(12)
  })
})
```

`2026-10-21` has no game in `schedule()`, so the remaining-day projection for that date is 0. The blended PTS equals Monday's actual.

Import `DayActuals` is not required if the test constructs the object and the function parameter is inferred. Add `import type { DayActuals }` if the annotation is used. The snippet above uses `DayActuals` in `actualLine`, so add it to the import from `@/lib/matchup/morningCheck`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheck.test.ts`

Expected: FAIL because `closeFinishedDays` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/matchup/morningCheck.ts`:

```ts
import { buildMatchupBoard } from "./board"
import type { MatchupBoard } from "./types"

export type DayActuals = {
  date: string
  you: CategoryTotals
  opp: CategoryTotals
  youPlayedIds: string[]
  oppPlayedIds: string[]
}

export type ClosedDayRecord = {
  date: string
  youStartableIds: string[]
  oppStartableIds: string[]
  youActual: CategoryTotals
  oppActual: CategoryTotals
  youPlayedIds: string[]
  oppPlayedIds: string[]
}

export type DayComparisonRow = {
  date: string
  youProjection: CategoryTotals
  youActual: CategoryTotals
  oppProjection: CategoryTotals
  oppActual: CategoryTotals
}

const dateHasNbaGame = (date: string, schedule: ScheduleResponse): boolean =>
  schedule.games.some((game) => game.date === date)

const addTotals = (left: CategoryTotals, right: CategoryTotals): CategoryTotals => {
  const next = emptyCategoryTotals()
  let fgm = 0
  let fga = 0
  let ftm = 0
  let fta = 0
  for (const categoryId of COUNTING_CATEGORIES) {
    next[categoryId] = left[categoryId] + right[categoryId]
  }
  return next
}

export const closeFinishedDays = (input: {
  matchupDays: string[]
  today: string
  previousClosed: ClosedDayRecord[]
  actualsByDate: Map<string, DayActuals>
  schedule: ScheduleResponse
  youEntries: SeasonRosterEntry[]
  oppEntries: SeasonRosterEntry[]
  playersById: Map<string, SeasonPlayer>
}): { closedDays: ClosedDayRecord[]; actualsPending: boolean } => {
  const previousByDate = new Map(
    input.previousClosed.map((day) => [day.date, day]),
  )
  let actualsPending = false
  const closedDays: ClosedDayRecord[] = []

  for (const date of input.matchupDays) {
    if (date >= input.today) continue
    const previous = previousByDate.get(date)
    const actuals = input.actualsByDate.get(date)
    const noGames = !dateHasNbaGame(date, input.schedule)

    if (!previous && !actuals && !noGames) {
      actualsPending = true
      continue
    }

    const youActual = actuals?.you ?? previous?.youActual ?? emptyCategoryTotals()
    const oppActual = actuals?.opp ?? previous?.oppActual ?? emptyCategoryTotals()
    closedDays.push({
      date,
      youStartableIds:
        previous?.youStartableIds ??
        startableIdsOnDate(
          input.youEntries,
          input.playersById,
          date,
          input.schedule,
        ),
      oppStartableIds:
        previous?.oppStartableIds ??
        startableIdsOnDate(
          input.oppEntries,
          input.playersById,
          date,
          input.schedule,
        ),
      youActual,
      oppActual,
      youPlayedIds: actuals?.youPlayedIds ?? previous?.youPlayedIds ?? [],
      oppPlayedIds: actuals?.oppPlayedIds ?? previous?.oppPlayedIds ?? [],
    })
  }

  return { closedDays, actualsPending }
}

export const dayComparisonRows = (
  closedDays: ClosedDayRecord[],
  playersById: Map<string, SeasonPlayer>,
  schedule: ScheduleResponse,
  statWindow: StatWindow,
): DayComparisonRow[] =>
  closedDays.map((day) => ({
    date: day.date,
    youProjection: projectDayTotals(
      day.youStartableIds,
      playersById,
      day.date,
      schedule,
      statWindow,
    ),
    youActual: day.youActual,
    oppProjection: projectDayTotals(
      day.oppStartableIds,
      playersById,
      day.date,
      schedule,
      statWindow,
    ),
    oppActual: day.oppActual,
  }))

const sumCounting = (rows: CategoryTotals[]): CategoryTotals =>
  rows.reduce(addTotals, emptyCategoryTotals())

export const blendWeekTotals = (input: {
  closedDays: ClosedDayRecord[]
  remainingDates: string[]
  youEntries: SeasonRosterEntry[]
  oppEntries: SeasonRosterEntry[]
  playersById: Map<string, SeasonPlayer>
  schedule: ScheduleResponse
  statWindow: StatWindow
}): { you: CategoryTotals; opp: CategoryTotals } => {
  const youClosed = input.closedDays.map((day) => day.youActual)
  const oppClosed = input.closedDays.map((day) => day.oppActual)
  const youRemaining = input.remainingDates.map((date) =>
    projectDayTotals(
      startableIdsOnDate(
        input.youEntries,
        input.playersById,
        date,
        input.schedule,
      ),
      input.playersById,
      date,
      input.schedule,
      input.statWindow,
    ),
  )
  const oppRemaining = input.remainingDates.map((date) =>
    projectDayTotals(
      startableIdsOnDate(
        input.oppEntries,
        input.playersById,
        date,
        input.schedule,
      ),
      input.playersById,
      date,
      input.schedule,
      input.statWindow,
    ),
  )
  return {
    you: sumCounting([...youClosed, ...youRemaining]),
    opp: sumCounting([...oppClosed, ...oppRemaining]),
  }
}

export const blendedMatchupBoard = (
  totals: { you: CategoryTotals; opp: CategoryTotals },
  categoryIds: CategoryId[],
): MatchupBoard => buildMatchupBoard(totals.you, totals.opp, categoryIds)
```

`addTotals` currently drops shooting components, so FG% of a sum would be wrong if both sides have makes. Closed actuals from Task 4 already store FG% as a percentage, and adding two percentages is wrong. Fix `addTotals` before the blend test is considered done:

Store makes and attempts on `CategoryTotals` is out of the existing `CategoryId` set. For the blend of FG% and FT%, recompute from the closed actual percentages only when one side is zero. The honest fix inside this task: extend the actual line with shooting totals.

Add these fields to `DayActuals` and `ClosedDayRecord`:

```ts
youShooting: { FGM: number; FGA: number; FTM: number; FTA: number }
oppShooting: { FGM: number; FGA: number; FTM: number; FTA: number }
```

`projectDayTotals` stays category-only for the grid projection. `blendWeekTotals` sums counting stats, sums shooting from each closed day plus `weeklyPlayerStats(...).shooting` for each remaining startable id, then sets `FG_PCT` and `FT_PCT` from the summed makes and attempts.

Update the Task 2 tests so `actualLine` includes `youShooting: { FGM: 8, FGA: 16, FTM: 4, FTA: 5 }` and the same for opp. Assert `blended.you.FG_PCT` is `8 / 16` when the remaining day has no games.

Do not ship `addTotals` as the FG% implementation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheck.test.ts`

Expected: PASS. The four new cases plus the two from Task 1.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add src/lib/matchup/morningCheck.ts tests/unit/morningCheck.test.ts
git commit -m "feat(matchup): lock finished days and blend the rest of the week"
```

---

### Task 3: Build the morning summary

**Files:**
- Modify: `src/lib/matchup/morningCheck.ts`
- Modify: `tests/unit/morningCheck.test.ts`

**Interfaces:**
- Consumes: `ClosedDayRecord`, `blendedMatchupBoard`, `CategoryOutcome`, `MatchupBoard`, `StreamingPlanDay`, `OpponentStreamDay`, `SitStartSuggestion` from `src/lib/matchup/types.ts`. `InjuryStatus` is the string `"out" | "gtd"` from `src/lib/injuries/types.ts`.
- Produces:

```ts
export type MorningPlanSnapshot = {
  outcomes: Record<CategoryId, CategoryOutcome>
  opponentRosterIds: string[]
  opponentDays: OpponentStreamDay[]
  ourDays: StreamingPlanDay[]
  sitStart: SitStartSuggestion[]
}

export type MorningSummary = {
  categories: Array<{
    categoryId: CategoryId
    outcome: CategoryOutcome
    flipped: boolean
  }>
  opponentMoves: string[]
  ourAbsences: string[]
  recommendationChanges: string[]
  recommendationsUnchanged: boolean
  todayRecommendations: string[]
  actualsPending: boolean
}

export const outcomesFromBoard = (
  board: MatchupBoard,
): Record<CategoryId, CategoryOutcome>

export const buildMorningSummary = (input: {
  board: MatchupBoard
  previous: MorningPlanSnapshot | null
  closedDays: ClosedDayRecord[]
  currentOpponentRosterIds: string[]
  ourDays: StreamingPlanDay[]
  opponentDays: OpponentStreamDay[]
  sitStart: SitStartSuggestion[]
  outPlayerIds: string[]
  today: string
  actualsPending: boolean
}): MorningSummary
```

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { buildMorningSummary } from "@/lib/matchup/morningCheck"
import type { CategoryOutcome } from "@/lib/matchup/types"
import { buildMatchupBoard } from "@/lib/matchup/board"

const boardFromPts = (youPts: number, oppPts: number) => {
  const you = emptyCategoryTotals()
  const opp = emptyCategoryTotals()
  you.PTS = youPts
  opp.PTS = oppPts
  return buildMatchupBoard(you, opp)
}

describe("buildMorningSummary", () => {
  it("lists all nine categories and marks only the flip", () => {
    const previousOutcomes = Object.fromEntries(
      ALL_CATEGORY_IDS.map((categoryId) => [categoryId, "W" as CategoryOutcome]),
    ) as Record<CategoryId, CategoryOutcome>
    previousOutcomes.PTS = "W"
    const summary = buildMorningSummary({
      board: boardFromPts(10, 20),
      previous: {
        outcomes: previousOutcomes,
        opponentRosterIds: ["c"],
        opponentDays: [],
        ourDays: [],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c", "new-fa"],
      ourDays: [
        {
          date: "2026-10-21",
          cells: [
            {
              spotIndex: 0,
              playerId: "fa-on",
              action: "add",
              droppedPlayerId: null,
              rosterDropPlayerId: null,
              rosterDropKind: "none",
              addIndex: 1,
              alternativePlayerIds: [],
              targetCategoryIds: ["PTS"],
            },
          ],
        },
      ],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })

    expect(summary.categories).toHaveLength(9)
    expect(summary.categories.find((row) => row.categoryId === "PTS")).toMatchObject({
      outcome: "L",
      flipped: true,
    })
    expect(summary.categories.filter((row) => row.flipped).map((row) => row.categoryId)).toEqual([
      "PTS",
    ])
    expect(summary.opponentMoves).toEqual(["added new-fa"])
    expect(summary.recommendationChanges.length).toBeLessThanOrEqual(3)
  })

  it("leaves change lines empty when nothing factual changed", () => {
    const quiet = buildMorningSummary({
      board: boardFromPts(20, 10),
      previous: {
        outcomes: Object.fromEntries(
          ALL_CATEGORY_IDS.map((categoryId) => [categoryId, "W"]),
        ) as Record<CategoryId, CategoryOutcome>,
        opponentRosterIds: ["c"],
        opponentDays: [],
        ourDays: [],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(quiet.recommendationChanges).toEqual([])
    expect(quiet.recommendationsUnchanged).toBe(false)
  })

  it("states today's recommendations on the first check and does not mark flips", () => {
    const first = buildMorningSummary({
      board: boardFromPts(20, 10),
      previous: null,
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [
        {
          date: "2026-10-21",
          cells: [
            {
              spotIndex: 0,
              playerId: "fa-on",
              action: "add",
              droppedPlayerId: null,
              rosterDropPlayerId: null,
              rosterDropKind: "none",
              addIndex: 1,
              alternativePlayerIds: [],
              targetCategoryIds: [],
            },
          ],
        },
      ],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(first.categories.every((row) => row.flipped === false)).toBe(true)
    expect(first.recommendationChanges).toEqual([])
    expect(first.todayRecommendations).toEqual(["2026-10-21 add fa-on"])
  })
})
```

The quiet case has no flip, no opponent move, and no absence, so `recommendationsUnchanged` stays false and change lines stay empty. Add one more assertion in a fourth test: when PTS flips and today's add cell is identical to `previous.ourDays`, `recommendationsUnchanged` is true and `recommendationChanges` is `[]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheck.test.ts`

Expected: FAIL because `buildMorningSummary` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CategoryOutcome, MatchupBoard, OpponentStreamDay, SitStartSuggestion, StreamingPlanDay } from "./types"

export type MorningPlanSnapshot = {
  outcomes: Record<CategoryId, CategoryOutcome>
  opponentRosterIds: string[]
  opponentDays: OpponentStreamDay[]
  ourDays: StreamingPlanDay[]
  sitStart: SitStartSuggestion[]
}

export type MorningSummary = {
  categories: Array<{
    categoryId: CategoryId
    outcome: CategoryOutcome
    flipped: boolean
  }>
  opponentMoves: string[]
  ourAbsences: string[]
  recommendationChanges: string[]
  recommendationsUnchanged: boolean
  todayRecommendations: string[]
  actualsPending: boolean
}

export const outcomesFromBoard = (
  board: MatchupBoard,
): Record<CategoryId, CategoryOutcome> =>
  Object.fromEntries(
    board.categories.map((row) => [row.categoryId, row.outcome]),
  ) as Record<CategoryId, CategoryOutcome>

const actionKey = (date: string, action: string, playerId: string | null) =>
  `${date} ${action} ${playerId ?? "none"}`

const planActionLines = (days: StreamingPlanDay[]): string[] =>
  days.flatMap((day) =>
    day.cells
      .filter((cell) => cell.action === "add" || cell.action === "drop_add")
      .map((cell) => actionKey(day.date, cell.action, cell.playerId)),
  )

const sitLines = (sitStart: SitStartSuggestion[], today: string): string[] =>
  sitStart.map(
    (swap) =>
      `${today} sit ${swap.activePlayerId} start ${swap.benchPlayerId}`,
  )

export const buildMorningSummary = (input: {
  board: MatchupBoard
  previous: MorningPlanSnapshot | null
  closedDays: ClosedDayRecord[]
  currentOpponentRosterIds: string[]
  ourDays: StreamingPlanDay[]
  opponentDays: OpponentStreamDay[]
  sitStart: SitStartSuggestion[]
  outPlayerIds: string[]
  today: string
  actualsPending: boolean
}): MorningSummary => {
  const outcomes = outcomesFromBoard(input.board)
  const categories = input.board.categories.map((row) => ({
    categoryId: row.categoryId,
    outcome: row.outcome,
    flipped: input.previous
      ? input.previous.outcomes[row.categoryId] !== row.outcome
      : false,
  }))

  const previousRoster = new Set(input.previous?.opponentRosterIds ?? [])
  const currentRoster = new Set(input.currentOpponentRosterIds)
  const opponentMoves: string[] = []
  if (input.previous) {
    for (const playerId of input.currentOpponentRosterIds) {
      if (!previousRoster.has(playerId)) opponentMoves.push(`added ${playerId}`)
    }
    for (const playerId of input.previous.opponentRosterIds) {
      if (!currentRoster.has(playerId)) opponentMoves.push(`dropped ${playerId}`)
    }
    const expectedAdds = new Set(
      input.previous.opponentDays.flatMap((day) =>
        day.cells
          .filter((cell) => cell.action === "add" || cell.action === "drop_add")
          .flatMap((cell) => (cell.playerId ? [cell.playerId] : [])),
      ),
    )
    for (const playerId of expectedAdds) {
      if (!currentRoster.has(playerId) && !previousRoster.has(playerId)) {
        opponentMoves.push(`missed add ${playerId}`)
      }
    }
  }

  const outIds = new Set(input.outPlayerIds)
  const ourAbsences: string[] = []
  if (input.previous) {
    for (const day of input.previous.ourDays) {
      if (day.date < input.today) continue
      for (const cell of day.cells) {
        if (cell.playerId && outIds.has(cell.playerId)) {
          ourAbsences.push(`out ${cell.playerId}`)
        }
      }
    }
  }
  for (const day of input.closedDays) {
    const played = new Set(day.youPlayedIds)
    for (const playerId of day.youStartableIds) {
      if (!played.has(playerId)) {
        ourAbsences.push(`did not play ${playerId} on ${day.date}`)
      }
    }
  }

  const todayRecommendations = [
    ...planActionLines(input.ourDays.filter((day) => day.date === input.today)),
    ...sitLines(input.sitStart, input.today),
  ].slice(0, 3)

  const hasFact =
    categories.some((row) => row.flipped) ||
    opponentMoves.length > 0 ||
    ourAbsences.length > 0

  let recommendationChanges: string[] = []
  let recommendationsUnchanged = false
  if (input.previous && hasFact) {
    const previousLines = new Set([
      ...planActionLines(input.previous.ourDays),
      ...sitLines(input.previous.sitStart, input.today),
    ])
    const nextLines = [
      ...planActionLines(input.ourDays),
      ...sitLines(input.sitStart, input.today),
    ]
    const changed = nextLines.filter((line) => !previousLines.has(line))
    const todayFirst = [
      ...changed.filter((line) => line.startsWith(input.today)),
      ...changed.filter((line) => !line.startsWith(input.today)),
    ]
    recommendationChanges = todayFirst.slice(0, 3)
    recommendationsUnchanged = recommendationChanges.length === 0
  }

  return {
    categories,
    opponentMoves: input.previous ? opponentMoves : [],
    ourAbsences,
    recommendationChanges,
    recommendationsUnchanged,
    todayRecommendations: input.previous ? [] : todayRecommendations,
    actualsPending: input.actualsPending,
  }
}
```

`ourAbsences` on a first check still reports did-not-play from closed days. The first-check test uses `closedDays: []`, so that stays empty. Do not list `gtd` players; the caller passes only `status === "out"` ids.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheck.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add src/lib/matchup/morningCheck.ts tests/unit/morningCheck.test.ts
git commit -m "feat(matchup): summarize the morning category board and recommendation changes"
```

---

### Task 4: Map an ESPN day box score into DayActuals

**Files:**
- Create: `src/lib/espn/dayBoxScore.ts`
- Test: `tests/unit/dayBoxScore.test.ts`

**Interfaces:**
- Consumes: `DayActuals` and `emptyCategoryTotals` from `src/lib/matchup/morningCheck.ts`
- Produces:

```ts
export type EspnDayBoxPayload = {
  schedule?: Array<{
    matchupPeriodId?: number
    home?: { teamId?: number; rosterForCurrentScoringPeriod?: { entries?: EspnBoxEntry[] } }
    away?: { teamId?: number; rosterForCurrentScoringPeriod?: { entries?: EspnBoxEntry[] } }
  }>
}

export const mapEspnDayBoxScore = (input: {
  payload: EspnDayBoxPayload
  date: string
  youTeamId: number
  oppTeamId: number
}): DayActuals | null
```

Stat ids, copied from `espnSeasonMap.ts`: `0` PTS, `1` BLK, `2` STL, `3` AST, `6` REB, `11` TO, `13` FGM, `14` FGA, `15` FTM, `16` FTA, `17` 3PM. Read `stats`, not `averageStats`. A player played when any of PTS, REB, AST, 3PM, or FGA is greater than 0.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { mapEspnDayBoxScore } from "@/lib/espn/dayBoxScore"

describe("mapEspnDayBoxScore", () => {
  it("sums the two teams and records who played", () => {
    const line = mapEspnDayBoxScore({
      date: "2026-10-20",
      youTeamId: 9,
      oppTeamId: 4,
      payload: {
        schedule: [
          {
            home: {
              teamId: 9,
              rosterForCurrentScoringPeriod: {
                entries: [
                  {
                    playerPoolEntry: {
                      player: {
                        id: 101,
                        stats: [{ stats: { "0": 22, "6": 8, "13": 8, "14": 16, "15": 4, "16": 5, "17": 2 } }],
                      },
                    },
                  },
                  {
                    playerPoolEntry: {
                      player: {
                        id: 102,
                        stats: [{ stats: { "0": 0, "6": 0, "13": 0, "14": 0, "15": 0, "16": 0, "17": 0 } }],
                      },
                    },
                  },
                ],
              },
            },
            away: {
              teamId: 4,
              rosterForCurrentScoringPeriod: {
                entries: [
                  {
                    playerPoolEntry: {
                      player: {
                        id: 201,
                        stats: [{ stats: { "0": 15, "6": 4, "13": 5, "14": 12, "15": 3, "16": 4, "17": 1 } }],
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    })

    expect(line?.date).toBe("2026-10-20")
    expect(line?.you.PTS).toBe(22)
    expect(line?.opp.PTS).toBe(15)
    expect(line?.you.FG_PCT).toBeCloseTo(8 / 16)
    expect(line?.youPlayedIds).toEqual(["101"])
    expect(line?.oppPlayedIds).toEqual(["201"])
    expect(line?.youShooting).toEqual({ FGM: 8, FGA: 16, FTM: 4, FTA: 5 })
  })

  it("returns null when neither team id is present", () => {
    expect(
      mapEspnDayBoxScore({
        date: "2026-10-20",
        youTeamId: 9,
        oppTeamId: 4,
        payload: { schedule: [] },
      }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/dayBoxScore.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write minimal implementation**

`src/lib/espn/dayBoxScore.ts` walks `payload.schedule`, finds the matchup whose home or away `teamId` equals `youTeamId`, and reads the other side only when its `teamId` equals `oppTeamId`. Sum counting stats. Set FG% and FT% from summed makes and attempts. Player id is `String(player.id)`. Push the id into `youPlayedIds` or `oppPlayedIds` only when PTS, REB, AST, 3PM, or FGA is greater than 0. Return null when the you team is missing. Also return `youShooting` and `oppShooting` on the object. `DayActuals` in Task 2 must already include those shooting fields; this mapper fills them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/dayBoxScore.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add src/lib/espn/dayBoxScore.ts tests/unit/dayBoxScore.test.ts src/lib/matchup/morningCheck.ts
git commit -m "feat(matchup): map an ESPN day box score into category actuals"
```

---

### Task 5: Save the check and feed the blended board into advice

**Files:**
- Modify: `prisma/schema.prisma` (`SeasonLeague`)
- Create: `prisma/migrations/20260925120000_morning_check/migration.sql`
- Create: `src/lib/matchup/morningCheckStore.ts`
- Modify: `src/lib/matchup/advise.ts`
- Modify: `src/app/api/matchup/route.ts`
- Test: `tests/unit/morningCheckStore.test.ts`

**Interfaces:**
- Consumes: `closeFinishedDays`, `blendWeekTotals`, `blendedMatchupBoard`, `buildMorningSummary`, `outcomesFromBoard`, `DayActuals`, `MorningPlanSnapshot`, `MorningSummary`, `DayComparisonRow`, `dayComparisonRows` from Task 2 and Task 3. `mapEspnDayBoxScore` from Task 4. `adviseMatchup` in `src/lib/matchup/advise.ts`. `loadOwnedSeasonLeague` used by `src/app/api/matchup/route.ts`.
- Produces:

```ts
export type MorningCheckRecord = {
  matchupStartDate: string
  opponentTeamIndex: number
  checkedOn: string
  closedDays: ClosedDayRecord[]
  plan: MorningPlanSnapshot | null
  actualsPending: boolean
}

export const parseMorningCheck = (raw: string | null): MorningCheckRecord | null

export const morningCheckForOpponent = (
  record: MorningCheckRecord | null,
  matchupStartDate: string,
  opponentTeamIndex: number,
): MorningCheckRecord | null
```

`adviseMatchup` gains an optional argument:

```ts
morning?: {
  today: string
  actualsByDate: Map<string, DayActuals>
  previous: MorningCheckRecord | null
  outPlayerIds: string[]
}
```

When `morning` is set, the board passed to `suggestSitStart`, `suggestStreamers`, and `buildAllStreamingPlans` is `blendedMatchupBoard(...)`. The return value adds:

```ts
morningSummary: MorningSummary
dayComparison: DayComparisonRow[]
nextMorningCheck: MorningCheckRecord
```

When `morning` is omitted, those three fields are absent and the current full-week projection path stays.

- [ ] **Step 1: Write the failing store test**

```ts
import { describe, expect, it } from "vitest"
import {
  morningCheckForOpponent,
  parseMorningCheck,
} from "@/lib/matchup/morningCheckStore"

describe("parseMorningCheck", () => {
  it("returns null for empty or foreign weeks", () => {
    expect(parseMorningCheck(null)).toBeNull()
    expect(parseMorningCheck("{")).toBeNull()
    const raw = JSON.stringify({
      matchupStartDate: "2026-10-20",
      opponentTeamIndex: 3,
      checkedOn: "2026-10-21",
      closedDays: [],
      plan: null,
      actualsPending: false,
    })
    expect(
      morningCheckForOpponent(parseMorningCheck(raw), "2026-10-20", 3)?.checkedOn,
    ).toBe("2026-10-21")
    expect(
      morningCheckForOpponent(parseMorningCheck(raw), "2026-10-27", 3),
    ).toBeNull()
    expect(
      morningCheckForOpponent(parseMorningCheck(raw), "2026-10-20", 4),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheckStore.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write the store, schema, and advise wiring**

Add to `SeasonLeague` in `prisma/schema.prisma`:

```prisma
morningCheckJson String?
```

`prisma/migrations/20260925120000_morning_check/migration.sql`:

```sql
ALTER TABLE "SeasonLeague" ADD COLUMN "morningCheckJson" TEXT;
```

Run: `npx.cmd prisma generate`

`parseMorningCheck` JSON.parses, checks `matchupStartDate`, `opponentTeamIndex`, `checkedOn`, and `Array.isArray(closedDays)`. Anything else returns null. `morningCheckForOpponent` returns the record only when start date and opponent index match.

In `advise.ts`, when `options.morning` is present:

1. `const finished = closeFinishedDays({ matchupDays: schedule.matchup.days, today: options.morning.today, previousClosed: options.morning.previous?.closedDays ?? [], actualsByDate: options.morning.actualsByDate, schedule, youEntries: youTeam.entries, oppEntries: oppTeam.entries, playersById })`
2. `const remainingDates = schedule.matchup.days.filter((date) => date >= options.morning.today)`
3. `const blended = blendWeekTotals({ closedDays: finished.closedDays, remainingDates, youEntries: youTeam.entries, oppEntries: oppTeam.entries, playersById, schedule, statWindow })`
4. Replace `youTotals` / `oppTotals` / `board` with `blended.you`, `blended.opp`, and `blendedMatchupBoard(blended, categoryIds)`.
5. Build streaming and sit/start for remaining days only. Copy the schedule and drop finished days before `buildAllStreamingPlans` and `suggestSitStart`:

```ts
const remainingSchedule: ScheduleResponse = {
  ...schedule,
  matchup: {
    ...schedule.matchup,
    days: schedule.matchup.days.filter((date) => date >= options.morning.today),
  },
  games: schedule.games.filter((game) => game.date >= options.morning.today),
}
```

Pass `remainingSchedule` into those two builders. Keep the original `schedule` for `closeFinishedDays`, `blendWeekTotals`, and `scoringPeriod` on the advice result. Do not edit `streamingPlans.ts` spot policy.
6. After streaming plans are built, pick the plan whose `spotCount` matches `options.morning.spotCount ?? 1`. `ourDays` is that plan's `days`. `opponentDays` is that plan's `opponentDays`. Add `spotCount?: 1 | 2 | 3` on `morning`.
7. `buildMorningSummary` with `previous: options.morning.previous?.plan ?? null`.
8. `nextMorningCheck` copies closed days, sets `checkedOn` to `today`, `plan` to `{ outcomes: outcomesFromBoard(board), opponentRosterIds: opp entries' player ids, opponentDays, ourDays, sitStart }`.

In `src/app/api/matchup/route.ts`:

- Read `loaded.morningCheckJson` once `loadOwnedSeasonLeague` returns it. If the loader type does not include the column, add `morningCheckJson: string | null` to the loader result in the file that loads `SeasonLeague` (the function `loadOwnedSeasonLeague` uses).
- `today` is the UTC date `new Date().toISOString().slice(0, 10)`.
- If the saved record has `checkedOn === today` and `actualsPending === false` for this opponent and this `schedule.matchup.startDate`, do not fetch ESPN. Call `adviseMatchup` with the saved closed days turned back into `actualsByDate`, then return the new summary. Still pass `previous` so flips work. Do not write.
- Otherwise fetch the league box score the same way `winnerStreamHistory.ts` fetches `mScoreboard` / `mMatchupScore`, for each matchup day before `today`, and map it with `mapEspnDayBoxScore`. Team ids come from `state.espnTeamId` and the opponent team's id. If `SeasonTeamRoster` has no ESPN team id, add `espnTeamId?: number` on `SeasonTeamRoster` only if the mapper already has `team.id` and is dropping it. Thread that id through `mapEspnSeasonLeague` in `src/lib/adapters/espnSeasonMap.ts` from `EspnTeam.id`.
- On fetch throw, if a previous record exists, return `adviseMatchup` without `morning` and attach the previous summary fields by replaying `buildMorningSummary` is not possible without the board. Simpler failure path: return the advice from the unblended `adviseMatchup` plus `morningStale: true` and the parsed previous record's last `morningSummary` is not stored. Store `summary` on `MorningCheckRecord` as well so a failed sync can return `record.summary` and `record.dayComparison` without recomputing. Add those two fields to `MorningCheckRecord` and fill them in `nextMorningCheck`.
- On success, `prisma.seasonLeague.update` sets `morningCheckJson` to `JSON.stringify(nextMorningCheck)`.

Do not write when the fetch throws.

- [ ] **Step 4: Run tests**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheckStore.test.ts tests/unit/morningCheck.test.ts tests/unit/dayBoxScore.test.ts`

Expected: PASS.

Add one advise test in `tests/unit/morningCheck.test.ts` only if `adviseMatchup` can run on a tiny `SeasonLeagueState` without reading the ADP file. It currently reads `data/players/proj_2026_27.json` inside a try that still calls `buildAdpByPlayerIdFromProjPool` before the streaming try. Do not call `adviseMatchup` from the unit test if that file read makes the test depend on the workbook. Cover the blend through `blendedMatchupBoard` instead, which Task 2 already does.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add prisma/schema.prisma prisma/migrations/20260925120000_morning_check/migration.sql src/lib/matchup/morningCheckStore.ts src/lib/matchup/advise.ts src/app/api/matchup/route.ts src/lib/adapters/espnSeasonMap.ts src/lib/season/types.ts
git commit -m "feat(matchup): save the morning check and replan on blended totals"
```

---

### Task 6: Show the summary and the day grid

**Files:**
- Create: `src/components/matchup/MorningSummary.tsx`
- Create: `src/components/matchup/DayComparison.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx` (`MatchupResponse` near line 72, and the block that renders `MatchupBoard`)
- Test: `tests/unit/morningSummary.test.tsx` if the repo already uses React test rendering. If it does not, skip a component test and cover the copy with the pure `MorningSummary` assertions from Task 3. Check `tests/unit` for `render(` before adding a tsx test. This repo's matchup tests are pure, so do not add a renderer.

**Interfaces:**
- Consumes: `MorningSummary` and `DayComparisonRow` from `src/lib/matchup/morningCheck.ts`. `formatCategoryStat` and `CATEGORY_SHORT_LABELS` from `src/lib/season/formatCategoryStat.ts`. The matchup GET JSON fields `morningSummary`, `dayComparison`, `morningStale`.
- Produces: the two components, rendered from `MatchupWorkspace`.

- [ ] **Step 1: Write the failing test**

There is no component renderer in the matchup unit tests. Add a display helper instead of a component test.

In `src/lib/matchup/morningCheck.ts`:

```ts
export const morningActualsPendingCopy = "Last night's results are not in yet."
export const morningStaleCopy = "Showing the last saved morning check."
export const morningUnchangedCopy = "Recommendations are unchanged."
```

Append to `tests/unit/morningCheck.test.ts`:

```ts
import {
  morningActualsPendingCopy,
  morningStaleCopy,
  morningUnchangedCopy,
} from "@/lib/matchup/morningCheck"

it("keeps the pending and stale sentences stable", () => {
  expect(morningActualsPendingCopy).toBe("Last night's results are not in yet.")
  expect(morningStaleCopy).toBe("Showing the last saved morning check.")
  expect(morningUnchangedCopy).toBe("Recommendations are unchanged.")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheck.test.ts`

Expected: FAIL because the copy constants are missing.

- [ ] **Step 3: Write the components and place them**

`MorningSummary.tsx`:

```tsx
import {
  morningActualsPendingCopy,
  morningStaleCopy,
  morningUnchangedCopy,
  type MorningSummary as MorningSummaryData,
} from "@/lib/matchup/morningCheck"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"

type MorningSummaryProps = {
  summary: MorningSummaryData
  stale: boolean
}

export const MorningSummary = ({ summary, stale }: MorningSummaryProps) => (
  <section
    aria-label="Morning check"
    className="mb-4 rounded-3xl bg-[var(--color-soft-cloud)] px-4 py-3"
  >
    {stale ? (
      <p className="text-sm text-[var(--color-mute)]">{morningStaleCopy}</p>
    ) : null}
    {summary.actualsPending ? (
      <p className="text-sm text-[var(--color-mute)]">{morningActualsPendingCopy}</p>
    ) : null}
    <ul className="mt-2 flex flex-wrap gap-2">
      {summary.categories.map((row) => (
        <li
          className="rounded-full bg-[var(--color-canvas)] px-2 py-1 text-sm text-[var(--color-ink)]"
          key={row.categoryId}
        >
          {CATEGORY_SHORT_LABELS[row.categoryId]} {row.outcome}
          {row.flipped ? " flipped" : ""}
        </li>
      ))}
    </ul>
    {summary.opponentMoves.length > 0 ? (
      <ul className="mt-2 text-sm text-[var(--color-ink)]">
        {summary.opponentMoves.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : null}
    {summary.ourAbsences.length > 0 ? (
      <ul className="mt-2 text-sm text-[var(--color-ink)]">
        {summary.ourAbsences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : null}
    {summary.recommendationsUnchanged ? (
      <p className="mt-2 text-sm text-[var(--color-ink)]">{morningUnchangedCopy}</p>
    ) : null}
    {summary.recommendationChanges.length > 0 ? (
      <ul className="mt-2 text-sm text-[var(--color-ink)]">
        {summary.recommendationChanges.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : null}
    {summary.todayRecommendations.length > 0 ? (
      <ul className="mt-2 text-sm text-[var(--color-ink)]">
        {summary.todayRecommendations.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : null}
  </section>
)
```

`DayComparison.tsx` renders one block per `DayComparisonRow`. The table header is `CATEGORY_SHORT_LABELS` in `ALL_CATEGORY_IDS` order. Two body rows, `You` and `Opp`. Each cell is:

```tsx
<div className="text-center">
  <p className="text-[0.75rem] text-[var(--color-mute)] tabular-nums">
    {formatCategoryStat(categoryId, sideProjection)}
  </p>
  <p className="text-sm tabular-nums text-[var(--color-ink)]">
    {formatCategoryStat(categoryId, sideActual)}
  </p>
</div>
```

`aria-label={`Day comparison ${row.date}`}`.

Extend `MatchupResponse` in `MatchupWorkspace.tsx`:

```ts
type MatchupResponse = MatchupAdvice & {
  schedule: ScheduleResponse
  playersById: Record<string, SeasonPlayer>
  teams: { teamIndex: number; name: string }[]
  state?: SeasonLeagueState
  morningSummary?: MorningSummaryData
  dayComparison?: DayComparisonRow[]
  morningStale?: boolean
}
```

Render `<MorningSummary>` immediately above the plan-bar row that contains `<MatchupBoard>`. Render `<DayComparison>` immediately under that row. When `morningSummary` is missing, render neither. Do not recompute the grid in the client.

- [ ] **Step 4: Run tests**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/morningCheck.test.ts tests/unit/dayBoxScore.test.ts tests/unit/morningCheckStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add src/components/matchup/MorningSummary.tsx src/components/matchup/DayComparison.tsx src/components/matchup/MatchupWorkspace.tsx src/lib/matchup/morningCheck.ts tests/unit/morningCheck.test.ts
git commit -m "feat(matchup): show the morning summary and day-by-day actuals"
```
