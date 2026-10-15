# Breakout Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select each available player who breaks out on recent production, on an unexpected confirmed start, or on both.

**Architecture:** `readBreakoutStatLines` turns one ESPN player's stat rows into season, last-7, and projection per-game lines. `selectBreakouts` is a pure function over those lines plus the injury module's confirmed lineups, depth chart, updates, and crosswalk. It does not fetch, and it does not change `selectInjuryReplacements`.

**Tech Stack:** TypeScript, Vitest, the existing ESPN stat ids and injury selection types.

## Global Constraints

- The add must be in `availablePlayerIds`. One row per player. Reasons are `rates`, `lineup`, or both, in that order.
- Season games 1–3: season-to-date per game versus that player's ESPN projection. Qualify when minutes are higher or the 9-category z-sum is higher.
- Season games 4–7: same baseline. Qualify when both are higher.
- Season games 8 or more: last-7 per game versus season-to-date per game. The last-7 window must contain at least 4 games. Qualify when both are higher.
- Season games 0 or unknown: no rates reason.
- Z-sum uses `FG_PCT`, `FT_PCT`, `TPM`, `REB`, `AST`, `STL`, `BLK`, `TO`, `PTS`. Turnovers are inverted only inside z. Minutes stay raw minutes per game and must be strictly greater. No extra gap.
- Games 1–7 z-scores use every player's ESPN projection rates. Games 8 or more use every player's season-to-date rates. The pool is all passed-in players, not only available ids.
- Do not read `SeasonPlayer.projections`.
- ESPN projection row: `seasonId` matches, `statSourceId === 1`, and `statSplitTypeId === 0`. This is the projection row already selected by `scripts/lib/espn-season-stats.mjs` (`id` `10{season}`, `statSourceId === 1`). Do not call `pickBestStats`.
- Minutes per game: `averageStats["40"]` when it is a number. Otherwise `stats["40"] / stats["42"]` when both are numbers and games are positive. `40` is `MIN` on the ESPN fantasy stat map that uses the same ids this repo already reads (`0` PTS through `42` GP). Games played stays `stats["42"]`.
- Lineup path runs all season with no game-count wait. Confirmed starter, not depth-chart `playerIds[0]` at that lineup position, and rank 1's latest 24-hour status is not `OUT` or `GTD`. No update means healthy. Projected lineups are not inputs.
- A candidate whose own latest 24-hour status is `OUT` is dropped from both paths. `GTD` stays.
- Rank 1 `OUT` or `GTD` is not a lineup breakout.
- An unmapped starter, a missing lineup position, or an unmapped rank-1 id produces no lineup reason.
- Empty rate inputs still allow the lineup path. Empty lineup inputs still allow the rates path.
- Do not change `selectInjuryReplacements`, the RotoWire cache, or any screen.

---

### Task 1: ESPN breakout stat lines

**Files:**
- Create: `src/lib/injuries/breakoutStats.ts`
- Test: `tests/unit/breakoutStats.test.ts`

**Interfaces:**
- Consumes: ESPN stat rows shaped like `scripts/lib/espn-season-stats.mjs`
- Produces:
  - `readBreakoutStatLines(rows: readonly EspnStatRow[] | undefined, seasonId: number): BreakoutStatLines`
  - `EspnStatRow = { id?: string; seasonId?: number; statSourceId?: number; statSplitTypeId?: number; averageStats?: Record<string, number>; stats?: Record<string, number> }`
  - `RateLine = { gamesPlayed: number; minutesPerGame: number | null; rates: Record<CategoryId, number> | null }`
  - `BreakoutStatLines = { seasonGames: number | null; season: RateLine | null; last7: RateLine | null; projection: RateLine | null }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { readBreakoutStatLines } from "@/lib/injuries/breakoutStats"

describe("readBreakoutStatLines", () => {
  it("reads season, last-7, and projection lines without using actuals as the projection", () => {
    const lines = readBreakoutStatLines(
      [
        {
          id: "002026",
          seasonId: 2026,
          statSourceId: 0,
          statSplitTypeId: 0,
          stats: { "42": 10, "40": 300, "0": 200 },
          averageStats: { "40": 30, "0": 20, "1": 1, "2": 1, "3": 5, "6": 4, "11": 2, "13": 8, "14": 16, "15": 4, "16": 5, "17": 2, "19": 0.5, "20": 0.8 },
        },
        {
          id: "012026",
          seasonId: 2026,
          statSourceId: 0,
          statSplitTypeId: 1,
          stats: { "42": 7 },
          averageStats: { "40": 36, "0": 28, "1": 1, "2": 1, "3": 7, "6": 5, "11": 1, "13": 10, "14": 18, "15": 4, "16": 5, "17": 3, "19": 0.55, "20": 0.8 },
        },
        {
          id: "102026",
          seasonId: 2026,
          statSourceId: 1,
          statSplitTypeId: 0,
          stats: { "42": 70, "40": 1750, "0": 1400, "1": 70, "2": 70, "3": 350, "6": 280, "11": 140, "13": 560, "14": 1120, "15": 280, "16": 350, "17": 140 },
        },
      ],
      2026,
    )

    expect(lines.seasonGames).toBe(10)
    expect(lines.season?.minutesPerGame).toBe(30)
    expect(lines.season?.rates?.PTS).toBe(20)
    expect(lines.last7?.gamesPlayed).toBe(7)
    expect(lines.last7?.minutesPerGame).toBe(36)
    expect(lines.projection?.minutesPerGame).toBe(25)
    expect(lines.projection?.rates?.PTS).toBe(20)
    expect(lines.projection?.rates?.FG_PCT).toBe(0.5)
  })

  it("returns null minutes when stat 40 is missing and still keeps category rates", () => {
    const lines = readBreakoutStatLines(
      [
        {
          seasonId: 2026,
          statSourceId: 0,
          statSplitTypeId: 0,
          stats: { "42": 2 },
          averageStats: { "0": 10, "1": 0, "2": 0, "3": 1, "6": 2, "11": 1, "13": 4, "14": 10, "15": 2, "16": 2, "17": 1, "19": 0.4, "20": 1 },
        },
      ],
      2026,
    )

    expect(lines.seasonGames).toBe(2)
    expect(lines.season?.minutesPerGame).toBeNull()
    expect(lines.season?.rates?.PTS).toBe(10)
    expect(lines.projection).toBeNull()
    expect(lines.last7).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/unit/breakoutStats.test.ts`

Expected: FAIL because `@/lib/injuries/breakoutStats` does not exist.

- [ ] **Step 3: Write the parser**

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"

export type EspnStatRow = {
  id?: string
  seasonId?: number
  statSourceId?: number
  statSplitTypeId?: number
  averageStats?: Record<string, number>
  stats?: Record<string, number>
}

export type RateLine = {
  gamesPlayed: number
  minutesPerGame: number | null
  rates: Record<CategoryId, number> | null
}

export type BreakoutStatLines = {
  seasonGames: number | null
  season: RateLine | null
  last7: RateLine | null
  projection: RateLine | null
}

const MINUTES = "40"
const GAMES = "42"

const numberAt = (
  stats: Record<string, number> | undefined,
  key: string,
): number | null => {
  const value = stats?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

const findRow = (
  rows: readonly EspnStatRow[],
  seasonId: number,
  sourceId: number,
  splitId: number,
): EspnStatRow | undefined =>
  rows.find(
    (row) =>
      row.seasonId === seasonId &&
      row.statSourceId === sourceId &&
      row.statSplitTypeId === splitId,
  )

const minutesPerGame = (row: EspnStatRow, gamesPlayed: number): number | null => {
  const average = numberAt(row.averageStats, MINUTES)
  if (average !== null) return average
  const total = numberAt(row.stats, MINUTES)
  if (total === null || !(gamesPlayed > 0)) return null
  return total / gamesPlayed
}

const rateNumber = (
  row: EspnStatRow,
  key: string,
  gamesPlayed: number,
  counting: boolean,
): number | null => {
  const average = numberAt(row.averageStats, key)
  if (average !== null) return average
  if (!counting) return null
  const total = numberAt(row.stats, key)
  if (total === null || !(gamesPlayed > 0)) return null
  return total / gamesPlayed
}

const ratesFromRow = (
  row: EspnStatRow,
  gamesPlayed: number,
): Record<CategoryId, number> | null => {
  const counting: Record<Exclude<CategoryId, "FG_PCT" | "FT_PCT">, string> = {
    PTS: "0",
    BLK: "1",
    STL: "2",
    AST: "3",
    REB: "6",
    TO: "11",
    TPM: "17",
  }
  const rates = {} as Record<CategoryId, number>
  for (const categoryId of ALL_CATEGORY_IDS) {
    if (categoryId === "FG_PCT" || categoryId === "FT_PCT") continue
    const value = rateNumber(row, counting[categoryId], gamesPlayed, true)
    if (value === null) return null
    rates[categoryId] = value
  }

  const fgm = rateNumber(row, "13", gamesPlayed, true)
  const fga = rateNumber(row, "14", gamesPlayed, true)
  const ftm = rateNumber(row, "15", gamesPlayed, true)
  const fta = rateNumber(row, "16", gamesPlayed, true)
  const fg =
    rateNumber(row, "19", gamesPlayed, false) ??
    (fgm !== null && fga !== null && fga > 0 ? fgm / fga : null)
  const ft =
    rateNumber(row, "20", gamesPlayed, false) ??
    (ftm !== null && fta !== null && fta > 0 ? ftm / fta : null)
  if (fg === null || ft === null) return null
  rates.FG_PCT = fg
  rates.FT_PCT = ft
  return rates
}

const lineFromRow = (row: EspnStatRow | undefined): RateLine | null => {
  if (!row) return null
  const gamesPlayed = numberAt(row.stats, GAMES)
  if (gamesPlayed === null || !(gamesPlayed > 0)) return null
  return {
    gamesPlayed,
    minutesPerGame: minutesPerGame(row, gamesPlayed),
    rates: ratesFromRow(row, gamesPlayed),
  }
}

export const readBreakoutStatLines = (
  rows: readonly EspnStatRow[] | undefined,
  seasonId: number,
): BreakoutStatLines => {
  const list = rows ?? []
  const season = lineFromRow(findRow(list, seasonId, 0, 0))
  return {
    seasonGames: season?.gamesPlayed ?? null,
    season,
    last7: lineFromRow(findRow(list, seasonId, 0, 1)),
    projection: lineFromRow(findRow(list, seasonId, 1, 0)),
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/breakoutStats.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/breakoutStats.ts tests/unit/breakoutStats.test.ts
git -c user.name="cbh606-create" -c user.email="cbh606@gmail.com" commit -m "feat(injuries): read ESPN minutes and projection lines"
```

---

### Task 2: Rates path

**Files:**
- Create: `src/lib/injuries/breakout.ts`
- Test: `tests/unit/breakoutSelection.test.ts`

**Interfaces:**
- Consumes: `RateLine` and `BreakoutStatLines` from `src/lib/injuries/breakoutStats.ts`. `ConfirmedLineup`, `DepthChart`, and `InjuryUpdate` from `src/lib/injuries/selection.ts`.
- Produces:
  - `selectBreakouts(inputs: BreakoutSelectionInputs): BreakoutPick[]`
  - `BreakoutPlayer = BreakoutStatLines & { id: string }`
  - `BreakoutSelectionInputs = { players: readonly BreakoutPlayer[]; availablePlayerIds: readonly string[]; lineups: readonly ConfirmedLineup[]; depth: DepthChart; updates: readonly InjuryUpdate[]; crosswalk: ReadonlyMap<string, string>; now: Date }`
  - `BreakoutPick = { playerId: string; reasons: Array<"rates" | "lineup"> }`

This task fills `reasons` with `rates` only. Task 3 adds `lineup`. Pass lineup fields through so the signature does not change.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { selectBreakouts, type BreakoutPlayer } from "@/lib/injuries/breakout"
import type { RateLine } from "@/lib/injuries/breakoutStats"

const rates = (pts: number, to: number): RateLine["rates"] => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 4,
  AST: 3,
  STL: 1,
  BLK: 1,
  TO: to,
  PTS: pts,
})

const line = (
  gamesPlayed: number,
  minutesPerGame: number | null,
  pts: number,
  to = 2,
): RateLine => ({
  gamesPlayed,
  minutesPerGame,
  rates: rates(pts, to),
})

const player = (overrides: Partial<BreakoutPlayer> & { id: string }): BreakoutPlayer => ({
  id: overrides.id,
  seasonGames: overrides.seasonGames ?? null,
  season: overrides.season ?? null,
  last7: overrides.last7 ?? null,
  projection: overrides.projection ?? null,
})

const select = (players: BreakoutPlayer[]) =>
  selectBreakouts({
    players,
    availablePlayerIds: players.map((item) => item.id),
    lineups: [],
    depth: { teams: [] },
    updates: [],
    crosswalk: new Map(),
    now: new Date("2026-01-15T00:00:00.000Z"),
  })

describe("selectBreakouts rates", () => {
  it("accepts one higher side during games 1 through 3", () => {
    const pool = player({
      id: "pool",
      seasonGames: 2,
      season: line(2, 20, 10),
      projection: line(70, 24, 12),
    })
    const minutesOnly = player({
      id: "minutes",
      seasonGames: 1,
      season: line(1, 30, 10),
      projection: line(70, 24, 12),
    })
    const statsOnly = player({
      id: "stats",
      seasonGames: 2,
      season: line(2, 20, 18),
      projection: line(70, 24, 12),
    })
    const neither = player({
      id: "flat",
      seasonGames: 2,
      season: line(2, 20, 10),
      projection: line(70, 24, 12),
    })
    const both = player({
      id: "both",
      seasonGames: 3,
      season: line(3, 30, 18),
      projection: line(70, 24, 12),
    })

    const picks = select([pool, minutesOnly, statsOnly, neither, both])

    expect(picks.find((pick) => pick.playerId === "minutes")?.reasons).toEqual(["rates"])
    expect(picks.find((pick) => pick.playerId === "stats")?.reasons).toEqual(["rates"])
    expect(picks.find((pick) => pick.playerId === "both")?.reasons).toEqual(["rates"])
    expect(picks.find((pick) => pick.playerId === "flat")).toBeUndefined()
  })

  it("requires both sides against the projection for games 4 through 7", () => {
    const both = player({
      id: "both",
      seasonGames: 5,
      season: line(5, 30, 20),
      projection: line(70, 24, 12),
    })
    const minutesOnly = player({
      id: "minutes",
      seasonGames: 5,
      season: line(5, 30, 10),
      projection: line(70, 24, 12),
    })

    const picks = select([both, minutesOnly])

    expect(picks.map((pick) => pick.playerId)).toEqual(["both"])
  })

  it("uses last-7 against the season line after 8 games", () => {
    const breakout = player({
      id: "breakout",
      seasonGames: 10,
      season: line(10, 24, 12, 3),
      last7: line(7, 32, 12, 1),
    })
    const shortWindow = player({
      id: "short",
      seasonGames: 10,
      season: line(10, 24, 12),
      last7: line(3, 40, 30),
    })
    const oneSide = player({
      id: "minutes-only",
      seasonGames: 10,
      season: line(10, 24, 12),
      last7: line(7, 32, 12),
    })

    const picks = select([breakout, shortWindow, oneSide])

    expect(picks.map((pick) => pick.playerId)).toEqual(["breakout"])
  })

  it("drops a missing projection, zero games, and an unavailable id", () => {
    const missing = player({
      id: "missing",
      seasonGames: 5,
      season: line(5, 30, 20),
      projection: null,
    })
    const zero = player({ id: "zero", seasonGames: 0 })
    const benched = player({
      id: "benched",
      seasonGames: 2,
      season: line(2, 30, 20),
      projection: line(70, 20, 10),
    })

    const picks = selectBreakouts({
      players: [missing, zero, benched],
      availablePlayerIds: ["missing", "zero"],
      lineups: [],
      depth: { teams: [] },
      updates: [],
      crosswalk: new Map(),
      now: new Date("2026-01-15T00:00:00.000Z"),
    })

    expect(picks).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/unit/breakoutSelection.test.ts`

Expected: FAIL because `@/lib/injuries/breakout` does not exist.

- [ ] **Step 3: Implement the rates path**

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { BreakoutStatLines, RateLine } from "./breakoutStats"
import type { ConfirmedLineup, DepthChart, InjuryUpdate } from "./selection"

export type BreakoutReason = "rates" | "lineup"

export type BreakoutPlayer = BreakoutStatLines & { id: string }

export type BreakoutSelectionInputs = {
  players: readonly BreakoutPlayer[]
  availablePlayerIds: readonly string[]
  lineups: readonly ConfirmedLineup[]
  depth: DepthChart
  updates: readonly InjuryUpdate[]
  crosswalk: ReadonlyMap<string, string>
  now: Date
}

export type BreakoutPick = {
  playerId: string
  reasons: BreakoutReason[]
}

const zSum = (
  line: RateLine | null,
  pool: readonly RateLine[],
): number | null => {
  if (!line?.rates) return null
  const samples = pool.flatMap((item) => (item.rates ? [item.rates] : []))
  if (samples.length === 0) return null

  return ALL_CATEGORY_IDS.reduce((sum, categoryId) => {
    const values = samples.map((sample) => sample[categoryId])
    const mean = values.reduce((total, value) => total + value, 0) / values.length
    const deviation = Math.sqrt(
      values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length,
    )
    if (deviation === 0) return sum
    const value = line.rates?.[categoryId] ?? mean
    const z = categoryId === "TO" ? (mean - value) / deviation : (value - mean) / deviation
    return sum + z
  }, 0)
}

const sideUp = (
  recent: RateLine | null,
  baseline: RateLine | null,
  recentPool: readonly RateLine[],
  baselinePool: readonly RateLine[],
): { minutes: boolean | null; value: boolean | null } => {
  const minutes =
    recent?.minutesPerGame != null && baseline?.minutesPerGame != null
      ? recent.minutesPerGame > baseline.minutesPerGame
      : null
  const recentZ = zSum(recent, recentPool)
  const baselineZ = zSum(baseline, baselinePool)
  const value = recentZ !== null && baselineZ !== null ? recentZ > baselineZ : null
  return { minutes, value }
}

const ratesReason = (
  player: BreakoutPlayer,
  players: readonly BreakoutPlayer[],
): boolean => {
  const games = player.seasonGames
  if (games === null || !(games > 0)) return false
  const projectionPool = players.flatMap((item) => (item.projection ? [item.projection] : []))
  const seasonPool = players.flatMap((item) => (item.season ? [item.season] : []))

  if (games <= 7) {
    const sides = sideUp(player.season, player.projection, projectionPool, projectionPool)
    if (games <= 3) return sides.minutes === true || sides.value === true
    return sides.minutes === true && sides.value === true
  }

  if (!player.last7 || player.last7.gamesPlayed < 4) return false
  const sides = sideUp(player.last7, player.season, seasonPool, seasonPool)
  return sides.minutes === true && sides.value === true
}

export const selectBreakouts = (inputs: BreakoutSelectionInputs): BreakoutPick[] => {
  const available = new Set(inputs.availablePlayerIds)
  return inputs.players.flatMap((player) => {
    if (!available.has(player.id) || !ratesReason(player, inputs.players)) return []
    return [{ playerId: player.id, reasons: ["rates"] as BreakoutReason[] }]
  })
}
```

`CategoryId` may be unused if the annotation above is the only reference. Omit that import if the file does not mention it.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/breakoutSelection.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/breakout.ts tests/unit/breakoutSelection.test.ts
git -c user.name="cbh606-create" -c user.email="cbh606@gmail.com" commit -m "feat(injuries): select breakouts from minutes and category z"
```

---

### Task 3: Lineup path

**Files:**
- Modify: `src/lib/injuries/breakout.ts`
- Modify: `tests/unit/breakoutSelection.test.ts`

**Interfaces:**
- Consumes: the Task 2 signature. Depth `playerIds[0]` is rank 1 because `parseDepthChart` sorts by ascending rank. Starter and depth ids are RotoWire ids. `crosswalk` maps a RotoWire id to an ESPN id. `canonicalTeam` from `src/lib/injuries/crosswalk.ts` compares team codes.
- Produces: the same `selectBreakouts`. A lineup match appends `"lineup"`. A lineup-only player is still returned.

- [ ] **Step 1: Add the failing lineup tests**

Append these cases to `tests/unit/breakoutSelection.test.ts`.

```ts
describe("selectBreakouts lineup", () => {
  const now = new Date("2026-01-15T12:00:00.000Z")
  const depth = {
    teams: [
      {
        teamAbbr: "ATL",
        positions: [{ position: "PG" as const, playerIds: ["rw-starter", "rw-new"] }],
      },
    ],
  }
  const lineups = [
    {
      teamAbbr: "ATL",
      startsAt: "2026-01-15T00:00:00.000Z",
      starters: [{ playerId: "rw-new", position: "PG" as const }],
    },
  ]
  const crosswalk = new Map([
    ["rw-starter", "espn-starter"],
    ["rw-new", "espn-new"],
  ])

  it("selects a confirmed starter when rank 1 is healthy", () => {
    const picks = selectBreakouts({
      players: [],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [],
      crosswalk,
      now,
    })

    expect(picks).toEqual([{ playerId: "espn-new", reasons: ["lineup"] }])
  })

  it("skips rank 1 when that player is OUT or GTD", () => {
    for (const status of ["out", "gtd"] as const) {
      const picks = selectBreakouts({
        players: [],
        availablePlayerIds: ["espn-new"],
        lineups,
        depth,
        updates: [
          {
            rotowirePlayerId: "rw-starter",
            teamAbbr: "ATL",
            status,
            at: "2026-01-15T11:00:00.000Z",
          },
        ],
        crosswalk,
        now,
      })

      expect(picks).toEqual([])
    }
  })

  it("drops an OUT candidate and keeps a GTD rates breakout", () => {
    const gtd = player({
      id: "espn-new",
      seasonGames: 2,
      season: line(2, 30, 20),
      projection: line(70, 20, 10),
    })
    const picks = selectBreakouts({
      players: [gtd],
      availablePlayerIds: ["espn-new"],
      lineups: [],
      depth: { teams: [] },
      updates: [
        {
          rotowirePlayerId: "rw-new",
          teamAbbr: "ATL",
          status: "gtd",
          at: "2026-01-15T11:00:00.000Z",
        },
      ],
      crosswalk,
      now,
    })

    expect(picks).toEqual([{ playerId: "espn-new", reasons: ["rates"] }])

    const outPicks = selectBreakouts({
      players: [],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [
        {
          rotowirePlayerId: "rw-new",
          teamAbbr: "ATL",
          status: "out",
          at: "2026-01-15T11:00:00.000Z",
        },
      ],
      crosswalk,
      now,
    })

    expect(outPicks).toEqual([])
  })

  it("keeps both reasons on one row and skips an unmapped rank 1", () => {
    const both = player({
      id: "espn-new",
      seasonGames: 2,
      season: line(2, 30, 20),
      projection: line(70, 20, 10),
    })
    const picks = selectBreakouts({
      players: [both],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [],
      crosswalk,
      now,
    })

    expect(picks).toEqual([{ playerId: "espn-new", reasons: ["rates", "lineup"] }])

    const unmapped = selectBreakouts({
      players: [],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [],
      crosswalk: new Map([["rw-new", "espn-new"]]),
      now,
    })

    expect(unmapped).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/unit/breakoutSelection.test.ts`

Expected: FAIL on the new lineup cases. The rates cases still pass.

- [ ] **Step 3: Add the lineup path**

In `src/lib/injuries/breakout.ts`, import `canonicalTeam` from `./crosswalk`. Keep `ratesReason`. Replace `selectBreakouts` with the merge below.

```ts
const WINDOW_MS = 24 * 60 * 60 * 1000

const latestStatus = (
  updates: readonly InjuryUpdate[],
  rotowireId: string,
  now: Date,
): "out" | "gtd" | "other" | null => {
  let bestAt = Number.NEGATIVE_INFINITY
  let status: "out" | "gtd" | "other" | null = null
  for (const update of updates) {
    if (update.rotowirePlayerId !== rotowireId) continue
    const at = new Date(update.at).getTime()
    if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > WINDOW_MS) continue
    if (at >= bestAt) {
      bestAt = at
      status = update.status
    }
  }
  return status
}

const espnIsOut = (
  espnId: string,
  inputs: BreakoutSelectionInputs,
): boolean =>
  [...inputs.crosswalk.entries()].some(
    ([rotowireId, mappedEspnId]) =>
      mappedEspnId === espnId && latestStatus(inputs.updates, rotowireId, inputs.now) === "out",
  )

const lineupIds = (inputs: BreakoutSelectionInputs): string[] => {
  const ids: string[] = []
  for (const lineup of inputs.lineups) {
    const depthTeam = inputs.depth.teams.find(
      (team) => canonicalTeam(team.teamAbbr) === canonicalTeam(lineup.teamAbbr),
    )
    for (const starter of lineup.starters) {
      if (!starter.position) continue
      const starterEspn = inputs.crosswalk.get(starter.playerId)
      const rank1 = depthTeam?.positions.find((slot) => slot.position === starter.position)
        ?.playerIds[0]
      const rank1Espn = rank1 ? inputs.crosswalk.get(rank1) : undefined
      if (!starterEspn || !rank1Espn || starterEspn === rank1Espn) continue
      const rank1Status = latestStatus(inputs.updates, rank1 ?? "", inputs.now)
      if (rank1Status === "out" || rank1Status === "gtd") continue
      ids.push(starterEspn)
    }
  }
  return ids
}

export const selectBreakouts = (inputs: BreakoutSelectionInputs): BreakoutPick[] => {
  const available = new Set(inputs.availablePlayerIds)
  const reasons = new Map<string, BreakoutReason[]>()
  const add = (playerId: string, reason: BreakoutReason) => {
    if (!available.has(playerId) || espnIsOut(playerId, inputs)) return
    const current = reasons.get(playerId) ?? []
    if (!current.includes(reason)) current.push(reason)
    reasons.set(playerId, current)
  }

  for (const player of inputs.players) {
    if (ratesReason(player, inputs.players)) add(player.id, "rates")
  }
  for (const playerId of lineupIds(inputs)) add(playerId, "lineup")

  return [...reasons.entries()].map(([playerId, rowReasons]) => ({
    playerId,
    reasons: rowReasons,
  }))
}
```

Push `"rates"` before `"lineup"`, which this loop order already does.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/breakoutStats.test.ts tests/unit/breakoutSelection.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/breakout.ts tests/unit/breakoutSelection.test.ts
git -c user.name="cbh606-create" -c user.email="cbh606@gmail.com" commit -m "feat(injuries): select unexpected confirmed starters"
```
