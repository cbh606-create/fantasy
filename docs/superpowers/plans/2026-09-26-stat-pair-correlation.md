# Stat Pair Correlation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a collapsed 36-row stat-pair table on Matchup, from 2025-26 actuals and this season’s actual `seasonRates`, without changing streaming-plan add ranking.

**Architecture:** A pure pair builder turns per-game observations into Pearson `r` and a display penalty. ESPN import stores this season’s actual per-game line on `seasonRates` and projection overlay leaves it alone. A backfill writes `projectedGames` onto `stats_2025_26.json` from ESPN actual stat `"42"` without replacing totals. The matchup API attaches `statPairs` beside advice. The plan builder never reads that field.

**Tech Stack:** TypeScript, React, Vitest, existing ESPN map and matchup route.

**Spec:** `docs/superpowers/specs/2026-09-26-stat-pair-correlation-design.md`

## Global Constraints

- 36 pairs. Canonical order: `FG_PCT`, `FT_PCT`, `TPM`, `REB`, `AST`, `STL`, `BLK`, `TO`, `PTS`. Earlier id first.
- One observation per player-season. Both seasons → two rows. Do not rebalance seasons to 50% when counts differ.
- Counting stats per game. `FG_PCT` / `FT_PCT` stay rates. `TO` negated before `r`.
- Games played under 20: omit the row. `n < 40` or zero variance: `r = 0`, penalty `0`, `measured = false` (table em dash).
- Penalty: `r < 0` → `-r × 0.15`; otherwise `0`. Display `r` to 2 decimals, penalty to 3.
- `proj_2026_27` is not a sample row. Last-7 / last-15 / last-30 are not the current-season sample.
- Streaming plan chase, add rank, drops, spot caps, and schedule policy stay unchanged.
- Missing shooting keeps a finite percentage. Shooting with `FGA`/`FTA` 0 drops that percentage only.
- UI: collapsed `<details>`, summary `Stat pairs`, `aria-label="Stat pairs"`, under the lineup/plans grid and above Injury Alerts. Empty body: `No stat-pair sample yet`.
- Match the semicolons already used in each file you edit.
- Tests: `npx.cmd vitest run --maxWorkers=1 <file>`.
- Do not commit unless the user asked for a commit.

## File structure

- `src/lib/players/statPairCorrelation.ts` — observations, Pearson `r`, penalty, 36 rows. No filesystem, no streaming imports.
- `src/lib/players/loadStatPairs.ts` — read `stats_2025_26.json`, combine with `seasonRates`, call the pure builder.
- `src/lib/players/mergeActualGamesPlayed.ts` — set `projectedGames` from an actual-stat payload; leave totals untouched.
- `scripts/backfill-actual-games.ts` — live ESPN fetch that uses the merge. Not the projection refresh.
- `src/lib/season/types.ts` — `seasonRates` on `SeasonPlayer`.
- `src/lib/adapters/espnSeasonMap.ts` — copy actual per-game line into `seasonRates`.
- `src/lib/matchup/types.ts` — `StatPairRow` re-export is unnecessary; the row type lives in the player module. `MatchupAdvice` does not gain `statPairs`.
- `src/app/api/matchup/route.ts` — attach `statPairs` on the JSON response only.
- `src/components/matchup/StatPairTable.tsx` — collapsed table.
- `src/components/matchup/MatchupWorkspace.tsx` — render the table. Do not pass `statPairs` into plan builders.

---

### Task 1: Pair correlation

**Files:**
- Create: `src/lib/players/statPairCorrelation.ts`
- Test: `tests/unit/statPairCorrelation.test.ts`

**Interfaces:**
- Consumes: `CategoryId`, `ALL_CATEGORY_IDS` from `src/lib/domain/categories.ts`
- Produces:
  - `MIN_PAIR_GAMES = 20`, `MIN_PAIR_ROWS = 40`, `PAIR_PENALTY_SCALE = 0.15`
  - `StatPairObservation = { gamesPlayed: number; projections: Record<CategoryId, number>; shooting?: { FGM: number; FGA: number; FTM: number; FTA: number } }`
  - `StatPairRow = { categoryA: CategoryId; categoryB: CategoryId; r: number; penalty: number; n: number; measured: boolean }`
  - `pairPenalty(r: number, measured?: boolean): number`
  - `perGameObservation(gamesPlayed, totals, shooting?): StatPairObservation` divides counting stats and shooting by games. Leaves `FG_PCT` and `FT_PCT` as passed.
  - `observationFromPerGame(seasonRates): StatPairObservation` does not divide again.
  - `observationsForStatPairs({ lastSeason, currentSeason }): StatPairObservation[]`
  - `buildStatPairRows(observations: StatPairObservation[]): StatPairRow[]` returns `[]` when every observation has games under 20, otherwise 36 rows.

`lastSeason` items: `{ projectedGames?: number; projections: Record<CategoryId, number>; shooting?: StatPairObservation["shooting"] }` where counting `projections` are season totals.

`currentSeason` items: `{ seasonRates?: { gamesPlayed: number; projections: Record<CategoryId, number>; shooting: StatPairObservation["shooting"] } }`. Skip missing `seasonRates`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/statPairCorrelation.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import {
  MIN_PAIR_ROWS,
  buildStatPairRows,
  observationsForStatPairs,
  pairPenalty,
  perGameObservation,
} from "@/lib/players/statPairCorrelation"

const totals = (pts: number, assists: number, turnovers: number): Record<CategoryId, number> => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 0,
  REB: 0,
  AST: assists,
  STL: 0,
  BLK: 0,
  TO: turnovers,
  PTS: pts,
})

const counted = (count: number, fill: (index: number) => ReturnType<typeof perGameObservation>) =>
  Array.from({ length: count }, (_, index) => fill(index))

describe("pairPenalty", () => {
  it("charges 0.075 when r is -0.5", () => {
    expect(pairPenalty(-0.5)).toBeCloseTo(0.075)
  })

  it("charges nothing when r is zero or positive", () => {
    expect(pairPenalty(0)).toBe(0)
    expect(pairPenalty(0.4)).toBe(0)
  })

  it("charges nothing when the pair is unmeasured", () => {
    expect(pairPenalty(-0.5, false)).toBe(0)
  })
})

describe("observationsForStatPairs", () => {
  it("keeps one row per season for the same player", () => {
    const rows = observationsForStatPairs({
      lastSeason: [{ projectedGames: 70, projections: totals(1400, 700, 210) }],
      currentSeason: [{
        seasonRates: {
          gamesPlayed: 30,
          projections: totals(20, 10, 3),
          shooting: { FGM: 8, FGA: 16, FTM: 4, FTA: 5 },
        },
      }],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].projections.PTS).toBeCloseTo(20)
    expect(rows[1].projections.PTS).toBeCloseTo(20)
  })

  it("uses only last season when this season has no actuals", () => {
    const rows = observationsForStatPairs({
      lastSeason: [{ projectedGames: 70, projections: totals(1400, 700, 210) }],
      currentSeason: [{}],
    })
    expect(rows).toHaveLength(1)
  })

  it("drops a season under 20 games", () => {
    const rows = observationsForStatPairs({
      lastSeason: [{ projectedGames: 12, projections: totals(240, 120, 36) }],
      currentSeason: [],
    })
    expect(rows).toHaveLength(0)
  })
})

describe("buildStatPairRows", () => {
  it("negates turnovers and correlates them against assists", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(40, totals(20 * 40, (index + 1) * 40, (index + 1) * 40)),
    )
    const pair = buildStatPairRows(observations).find(
      (row) => row.categoryA === "AST" && row.categoryB === "TO",
    )
    expect(pair?.measured).toBe(true)
    expect(pair?.r).toBeCloseTo(-1)
    expect(pair?.penalty).toBeCloseTo(0.15)
  })

  it("leaves a positive pair unpenalized", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(40, {
        ...totals((index + 1) * 40, 0, 0),
        TPM: (index + 1) * 40,
      }),
    )
    const pair = buildStatPairRows(observations).find(
      (row) => row.categoryA === "TPM" && row.categoryB === "PTS",
    )
    expect(pair?.r).toBeCloseTo(1)
    expect(pair?.penalty).toBe(0)
  })

  it("drops a percentage with zero attempts and keeps the other categories", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(
        40,
        totals((index + 1) * 40, (index + 2) * 40, 40),
        { FGM: 0, FGA: 0, FTM: 4 * 40, FTA: 5 * 40 },
      ),
    )
    const fg = buildStatPairRows(observations).find((row) => row.categoryA === "FG_PCT")
    const ft = buildStatPairRows(observations).find(
      (row) => row.categoryA === "FT_PCT" && row.categoryB === "PTS",
    )
    expect(fg?.measured).toBe(false)
    expect(fg?.n).toBe(0)
    expect(ft?.n).toBe(MIN_PAIR_ROWS)
  })

  it("keeps a finite percentage when shooting is missing", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(40, {
        ...totals((index + 1) * 40, 40, 40),
        FG_PCT: 0.4 + index * 0.001,
      }),
    )
    const pair = buildStatPairRows(observations).find(
      (row) => row.categoryA === "FG_PCT" && row.categoryB === "PTS",
    )
    expect(pair?.n).toBe(MIN_PAIR_ROWS)
    expect(pair?.measured).toBe(true)
  })

  it("returns an unmeasured pair below 40 rows", () => {
    const observations = counted(10, (index) =>
      perGameObservation(40, totals((index + 1) * 40, (index + 1) * 40, 40)),
    )
    const pair = buildStatPairRows(observations).find(
      (row) => row.categoryA === "AST" && row.categoryB === "PTS",
    )
    expect(pair).toMatchObject({ r: 0, penalty: 0, n: 10, measured: false })
  })

  it("returns 36 pairs with measured rows before unmeasured rows", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(40, totals((index + 1) * 40, 40, 40)),
    )
    const rows = buildStatPairRows(observations)
    expect(rows).toHaveLength(36)
    const firstUnmeasured = rows.findIndex((row) => !row.measured)
    const lastMeasured = rows.findLastIndex((row) => row.measured)
    expect(firstUnmeasured).toBeGreaterThan(lastMeasured)
    const measured = rows.filter((row) => row.measured)
    const sorted = [...measured].sort((a, b) => a.r - b.r || `${a.categoryA}|${a.categoryB}`.localeCompare(`${b.categoryA}|${b.categoryB}`))
    expect(measured.map((row) => row.r)).toEqual(sorted.map((row) => row.r))
  })

  it("returns no rows when nobody qualifies", () => {
    expect(buildStatPairRows([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/statPairCorrelation.test.ts`

Expected: FAIL, cannot find module `@/lib/players/statPairCorrelation`.

- [ ] **Step 3: Implement the builder**

Create `src/lib/players/statPairCorrelation.ts`:

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"

export const MIN_PAIR_GAMES = 20
export const MIN_PAIR_ROWS = 40
export const PAIR_PENALTY_SCALE = 0.15

const COUNTING_IDS: CategoryId[] = ["TPM", "REB", "AST", "STL", "BLK", "TO", "PTS"]

export type StatPairShooting = {
  FGM: number
  FGA: number
  FTM: number
  FTA: number
}

export type StatPairObservation = {
  gamesPlayed: number
  projections: Record<CategoryId, number>
  shooting?: StatPairShooting
}

export type StatPairRow = {
  categoryA: CategoryId
  categoryB: CategoryId
  r: number
  penalty: number
  n: number
  measured: boolean
}

type LastSeasonLine = {
  projectedGames?: number
  projections: Record<CategoryId, number>
  shooting?: StatPairShooting
}

type CurrentSeasonLine = {
  seasonRates?: {
    gamesPlayed: number
    projections: Record<CategoryId, number>
    shooting: StatPairShooting
  }
}

export const pairPenalty = (r: number, measured = true): number => {
  if (!measured || r >= 0) return 0
  return -r * PAIR_PENALTY_SCALE
}

export const perGameObservation = (
  gamesPlayed: number,
  totals: Record<CategoryId, number>,
  shooting?: StatPairShooting,
): StatPairObservation => {
  const projections = { ...totals }
  for (const categoryId of COUNTING_IDS) {
    projections[categoryId] = totals[categoryId] / gamesPlayed
  }
  return {
    gamesPlayed,
    projections,
    shooting: shooting
      ? {
          FGM: shooting.FGM / gamesPlayed,
          FGA: shooting.FGA / gamesPlayed,
          FTM: shooting.FTM / gamesPlayed,
          FTA: shooting.FTA / gamesPlayed,
        }
      : undefined,
  }
}

export const observationFromPerGame = (
  seasonRates: NonNullable<CurrentSeasonLine["seasonRates"]>,
): StatPairObservation => ({
  gamesPlayed: seasonRates.gamesPlayed,
  projections: seasonRates.projections,
  shooting: seasonRates.shooting,
})

export const observationsForStatPairs = ({
  lastSeason,
  currentSeason,
}: {
  lastSeason: LastSeasonLine[]
  currentSeason: CurrentSeasonLine[]
}): StatPairObservation[] => {
  const rows: StatPairObservation[] = []
  for (const player of lastSeason) {
    if (player.projectedGames == null || player.projectedGames < MIN_PAIR_GAMES) continue
    rows.push(perGameObservation(player.projectedGames, player.projections, player.shooting))
  }
  for (const player of currentSeason) {
    if (!player.seasonRates || player.seasonRates.gamesPlayed < MIN_PAIR_GAMES) continue
    rows.push(observationFromPerGame(player.seasonRates))
  }
  return rows
}

const fantasyGood = (
  observation: StatPairObservation,
  categoryId: CategoryId,
): number | null => {
  if (categoryId === "FG_PCT") {
    if (observation.shooting && observation.shooting.FGA <= 0) return null
    const value = observation.projections.FG_PCT
    return Number.isFinite(value) ? value : null
  }
  if (categoryId === "FT_PCT") {
    if (observation.shooting && observation.shooting.FTA <= 0) return null
    const value = observation.projections.FT_PCT
    return Number.isFinite(value) ? value : null
  }
  const value = observation.projections[categoryId]
  if (!Number.isFinite(value)) return null
  return categoryId === "TO" ? -value : value
}

const pearson = (valuesA: number[], valuesB: number[]): { r: number; measured: boolean } => {
  const n = valuesA.length
  if (n < MIN_PAIR_ROWS) return { r: 0, measured: false }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / n
  const meanA = mean(valuesA)
  const meanB = mean(valuesB)
  let covariance = 0
  let varianceA = 0
  let varianceB = 0
  for (let index = 0; index < n; index += 1) {
    const deltaA = valuesA[index] - meanA
    const deltaB = valuesB[index] - meanB
    covariance += deltaA * deltaB
    varianceA += deltaA * deltaA
    varianceB += deltaB * deltaB
  }
  if (varianceA === 0 || varianceB === 0) return { r: 0, measured: false }
  return { r: covariance / Math.sqrt(varianceA * varianceB), measured: true }
}

const pairKey = (row: Pick<StatPairRow, "categoryA" | "categoryB">) =>
  `${row.categoryA}|${row.categoryB}`

export const buildStatPairRows = (
  observations: StatPairObservation[],
): StatPairRow[] => {
  const qualified = observations.filter((observation) => observation.gamesPlayed >= MIN_PAIR_GAMES)
  if (qualified.length === 0) return []

  const rows: StatPairRow[] = []
  for (let left = 0; left < ALL_CATEGORY_IDS.length; left += 1) {
    for (let right = left + 1; right < ALL_CATEGORY_IDS.length; right += 1) {
      const categoryA = ALL_CATEGORY_IDS[left]
      const categoryB = ALL_CATEGORY_IDS[right]
      const valuesA: number[] = []
      const valuesB: number[] = []
      for (const observation of qualified) {
        const a = fantasyGood(observation, categoryA)
        const b = fantasyGood(observation, categoryB)
        if (a == null || b == null) continue
        valuesA.push(a)
        valuesB.push(b)
      }
      const result = pearson(valuesA, valuesB)
      rows.push({
        categoryA,
        categoryB,
        r: result.r,
        penalty: pairPenalty(result.r, result.measured),
        n: valuesA.length,
        measured: result.measured,
      })
    }
  }

  return rows.sort((a, b) => {
    if (a.measured !== b.measured) return a.measured ? -1 : 1
    if (a.measured && a.r !== b.r) return a.r - b.r
    return pairKey(a).localeCompare(pairKey(b))
  })
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/statPairCorrelation.test.ts`

Expected: PASS.

---

### Task 2: Store this season’s actual line

**Files:**
- Modify: `src/lib/season/types.ts` (`SeasonPlayer`)
- Modify: `src/lib/adapters/espnSeasonMap.ts` (`playerFromEspn`)
- Modify: `tests/unit/espnSeasonMap.test.ts`
- Modify: `tests/unit/applyPoolProjections.test.ts`

**Interfaces:**
- Consumes: ESPN actual row `seasonId`, `statSourceId === 0`, `statSplitTypeId === 0`, `averageStats`, `stats["42"]`
- Produces: `SeasonPlayer.seasonRates?: { gamesPlayed: number; projections: Record<CategoryId, number>; shooting: SeasonPlayer["shooting"] }`
- `applyPoolProjections` already spreads the target before replacing `projections`. Do not delete `seasonRates` there.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/espnSeasonMap.test.ts`, import `mapEspnFreeAgentPlayers` (already imported) and add:

```ts
it("stores the actual per-game line on seasonRates", () => {
  const players = mapEspnFreeAgentPlayers(
    {
      players: [{
        status: "FREEAGENT",
        player: {
          id: 501,
          fullName: "Actual Wing",
          proTeamId: 1,
          defaultPositionId: 2,
          stats: [{
            seasonId: 2027,
            statSourceId: 0,
            statSplitTypeId: 0,
            stats: { "42": 24 },
            averageStats: {
              "0": 12,
              "1": 0.4,
              "2": 1,
              "3": 3,
              "6": 4,
              "11": 1.5,
              "13": 5,
              "14": 10,
              "15": 2,
              "16": 2,
              "17": 2,
              "19": 0.5,
              "20": 1,
            },
          }],
        },
      }],
    },
    2027,
  )

  expect(players[0].seasonRates).toEqual({
    gamesPlayed: 24,
    projections: {
      FG_PCT: 0.5,
      FT_PCT: 1,
      TPM: 2,
      REB: 4,
      AST: 3,
      STL: 1,
      BLK: 0.4,
      TO: 1.5,
      PTS: 12,
    },
    shooting: { FGM: 5, FGA: 10, FTM: 2, FTA: 2 },
  })
  expect(players[0].projections.PTS).toBeCloseTo(12 * 82)
})
```

In `tests/unit/applyPoolProjections.test.ts` add:

```ts
it("keeps seasonRates when the projection overlay replaces totals", () => {
  const target = seasonPlayer({
    seasonRates: {
      gamesPlayed: 24,
      projections: {
        FG_PCT: 0.45,
        FT_PCT: 0.8,
        TPM: 2,
        REB: 4,
        AST: 3,
        STL: 1,
        BLK: 0.2,
        TO: 1,
        PTS: 12,
      },
      shooting: { FGM: 5, FGA: 11, FTM: 2, FTA: 2 },
    },
  })
  const { players } = applyPoolProjections([target], pool)
  expect(players[0].projections.PTS).toBe(2144)
  expect(players[0].seasonRates).toEqual(target.seasonRates)
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/espnSeasonMap.test.ts tests/unit/applyPoolProjections.test.ts`

Expected: FAIL because `seasonRates` is undefined.

- [ ] **Step 3: Store seasonRates**

Add the optional field on `SeasonPlayer` in `src/lib/season/types.ts`.

In `espnSeasonMap.ts`, next to `recentRatesFromEspn`, find the actual season-to-date row (`seasonId`, `statSourceId === 0`, `statSplitTypeId === 0`). Read games from `row.stats?.["42"]`. Build projections and shooting with the existing `perGameRateSet(row.averageStats)`. Omit `seasonRates` when games played is missing or not a positive number, or when `averageStats` is missing. Attach it in `playerFromEspn` the same way as `recentRates`. Do not read split ids 1, 2, or 3 for this field.

Do not change `applyPoolProjections`. The spread of `target` already keeps `seasonRates`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/espnSeasonMap.test.ts tests/unit/applyPoolProjections.test.ts`

Expected: PASS.

---

### Task 3: Backfill 2025-26 games played

**Files:**
- Create: `src/lib/players/mergeActualGamesPlayed.ts`
- Create: `scripts/backfill-actual-games.ts`
- Test: `tests/unit/mergeActualGamesPlayed.test.ts`

**Interfaces:**
- Consumes: actual stat rows shaped `{ id?: string; seasonId?: number; statSourceId?: number; statSplitTypeId?: number; stats?: Record<string, number> }`
- Produces:
  - `actualGamesPlayed(rows, seasonId: number): number | null` from id `` `00${seasonId}` ``, else `seasonId` + `statSourceId === 0` + `statSplitTypeId === 0`, stat `"42"`
  - `mergeActualGamesPlayed(players, gamesByEspnId: Record<string, number>)` copies `projectedGames` onto matches and returns the same `projections` object contents

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  actualGamesPlayed,
  mergeActualGamesPlayed,
} from "@/lib/players/mergeActualGamesPlayed"

const projections = {
  FG_PCT: 0.57,
  FT_PCT: 0.83,
  TPM: 112,
  REB: 836,
  AST: 697,
  STL: 92,
  BLK: 53,
  TO: 243,
  PTS: 1799,
}

describe("mergeActualGamesPlayed", () => {
  it("reads games from the actual season row", () => {
    expect(actualGamesPlayed([
      { id: "102026", statSourceId: 1, stats: { "42": 70 } },
      { id: "002026", seasonId: 2026, statSourceId: 0, statSplitTypeId: 0, stats: { "42": 62 } },
    ], 2026)).toBe(62)
  })

  it("writes projectedGames and leaves counting totals", () => {
    const [player] = mergeActualGamesPlayed(
      [{ espnId: "3112335", projections }],
      { "3112335": 62 },
    )
    expect(player.projectedGames).toBe(62)
    expect(player.projections).toEqual(projections)
  })

  it("leaves a player with no actual games untouched", () => {
    const [player] = mergeActualGamesPlayed(
      [{ espnId: "1", projections: { ...projections } }],
      {},
    )
    expect(player.projectedGames).toBeUndefined()
    expect(player.projections.PTS).toBe(1799)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/mergeActualGamesPlayed.test.ts`

Expected: FAIL, module missing.

- [ ] **Step 3: Implement the merge and the script**

Implement the two functions. Prefer the actual id over a projected row that also has stat `"42"`. Ignore non-positive games.

`scripts/backfill-actual-games.ts` (run with `npx.cmd tsx`):

- Read `data/players/stats_2025_26.json`.
- Fetch `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2026/players?scoringPeriodId=0&view=kona_player_info` with header `x-fantasy-filter` set to the same filter object as `fetchEspnPlayers` in `scripts/refresh-players.mjs`.
- For each ESPN player, `actualGamesPlayed(player.stats ?? [], 2026)` and record it under `String(player.id)`.
- `mergeActualGamesPlayed` the file’s `players`.
- Write the file back with the existing `meta`, plus `projectedGamesSource: "espn_actual_stat_42"` and `projectedGamesUpdated` count. Do not replace `projections`.
- If the fetch fails, throw before `writeFile`.

Do not run `players:refresh` for this. That path prefers projections and would replace 2025-26 totals.

- [ ] **Step 4: Run the unit test**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/mergeActualGamesPlayed.test.ts`

Expected: PASS.

- [ ] **Step 5: Backfill the data file**

Run: `npx.cmd tsx scripts/backfill-actual-games.ts`

Expected: log a `projectedGamesUpdated` count greater than 0. Open `data/players/stats_2025_26.json` and confirm Nikola Jokic still has `PTS` `1799` and now has `projectedGames`. If the fetch fails, leave the JSON unchanged and stop this task with the error.

---

### Task 4: Attach pairs to the matchup response

**Files:**
- Create: `src/lib/players/loadStatPairs.ts`
- Modify: `src/app/api/matchup/route.ts` (the `NextResponse.json` return)
- Modify: `src/components/matchup/MatchupWorkspace.tsx` (the `MatchupResponse` type only in this task)
- Test: `tests/unit/loadStatPairs.test.ts`

**Interfaces:**
- Consumes: `buildStatPairRows`, `observationsForStatPairs`, `StatPairRow`
- Produces: `loadStatPairs(currentPlayers: { seasonRates?: ... }[]): Promise<StatPairRow[]>`
- Reads `data/players/stats_2025_26.json` directly. On a missing file or invalid JSON, return the rows built from current `seasonRates` only. Do not call `getPlayerPool` (that can fall back to `proj_2026_27`).
- `adviseMatchup` and `buildAllStreamingPlans` gain no parameter.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { loadStatPairs } from "@/lib/players/loadStatPairs"

describe("loadStatPairs", () => {
  it("returns pair rows from the last-season file without a current actual", async () => {
    const rows = await loadStatPairs([])
    expect(rows.length === 0 || rows.length === 36).toBe(true)
  })

  it("does not throw when current players have projections and no seasonRates", async () => {
    const rows = await loadStatPairs([{
      projections: {
        FG_PCT: 0.5, FT_PCT: 0.8, TPM: 100, REB: 100, AST: 100,
        STL: 10, BLK: 10, TO: 10, PTS: 1000,
      },
    }])
    expect(Array.isArray(rows)).toBe(true)
  })
})
```

The first test passes either `[]` (file has no `projectedGames` yet) or 36 rows. After Task 3’s backfill it should be 36. Assert `toHaveLength(36)` once `projectedGames` is present; if Step 5 of Task 3 did not write games, `[]` is the correct empty sample.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/loadStatPairs.test.ts`

Expected: FAIL, module missing.

- [ ] **Step 3: Load and attach**

`loadStatPairs` reads the JSON with `readFile`. Map `players[]` into the last-season argument (`projectedGames`, `projections`, optional `shooting`). Combine with `currentPlayers`. Return `buildStatPairRows(observationsForStatPairs(...))`. Catch read errors and continue with last season `[]`.

In `src/app/api/matchup/route.ts`, after `advice` is known not to have `error`:

```ts
let statPairs: StatPairRow[] = []
try {
  statPairs = await loadStatPairs(loaded.state.players)
} catch {
  statPairs = []
}
```

Add `statPairs` to the `NextResponse.json` object. Do not pass it into `adviseMatchup`.

Add `statPairs?: StatPairRow[]` to the local `MatchupResponse` type in `MatchupWorkspace.tsx`. Import the type from `@/lib/players/statPairCorrelation`.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/loadStatPairs.test.ts tests/unit/streamingPlans.test.ts`

Expected: `loadStatPairs` PASS. `streamingPlans.test.ts` PASS with the same expectations as before this plan.

---

### Task 5: Collapsed table

**Files:**
- Create: `src/components/matchup/StatPairTable.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx` (render site around the `mt-8` block)

**Interfaces:**
- Consumes: `StatPairRow`, `CATEGORY_SHORT_LABELS` from `src/lib/season/formatCategoryStat.ts`
- Produces: `StatPairTable({ rows }: { rows: StatPairRow[] })`

- [ ] **Step 1: Add the component**

`StatPairTable` renders `<details>` with no `open` attribute. `<summary aria-label="Stat pairs">Stat pairs</summary>`.

When `rows.length === 0`, the body is `<p>No stat-pair sample yet</p>`.

Otherwise a table with columns `Pair`, `r`, `Penalty`, `Rows`. Pair text is `` `${CATEGORY_SHORT_LABELS[categoryA]} · ${CATEGORY_SHORT_LABELS[categoryB]}` ``. `measured` false → `r` and penalty cells are `—`. Measured `r` uses `toFixed(2)`. Measured penalty uses `toFixed(3)`. Rows cell is `n`.

Use existing ink/mute color tokens and `text-sm`. The summary is a button-like control: `cursor-pointer`, keyboard focus via native `summary`.

- [ ] **Step 2: Render it on the matchup page**

Inside the `div` with `className="mt-8 space-y-8"`, before `<InjuryAlertsPanel>`, render:

```tsx
<StatPairTable rows={matchupData.statPairs ?? []} />
```

Do not pass `statPairs` into `StreamingPlansPanel`.

- [ ] **Step 3: Verify the page**

Start the app if it is not already running (`npm.cmd run dev`). Open a matchup league in the browser. Confirm:

- Streaming plan cards still render and a spot change still rebuilds plans.
- Below that grid, a collapsed `Stat pairs` control sits above Injury Alerts.
- Expanding it shows 36 pairs after the games backfill, lowest measured `r` first, or `No stat-pair sample yet` when the sample is empty.
- `r` shows two decimals or an em dash. Penalty shows three decimals or an em dash.

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/statPairCorrelation.test.ts tests/unit/espnSeasonMap.test.ts tests/unit/applyPoolProjections.test.ts tests/unit/mergeActualGamesPlayed.test.ts tests/unit/loadStatPairs.test.ts tests/unit/streamingPlans.test.ts`

Expected: PASS.
