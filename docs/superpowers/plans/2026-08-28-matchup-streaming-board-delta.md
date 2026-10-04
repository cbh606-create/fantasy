# Matchup Streaming Board-Delta Adds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spend a streaming add/swap only when the drop+add pair raises rest-of-week `projectedCatWins`, among schedule-filtered FAs.

**Architecture:** Extract open-slot seating (`seatStreamerIfOpen` / `applyStreamerMoveToDaily`) so preview and the planner share one rule (no displacing game-day starters). `buildStreamingPlan` threads `workingDaily`, scores each candidate with that overlay, and picks max delta `> 0`. Delete 1-spot off-night always-cover accept.

**Tech Stack:** TypeScript, Vitest, existing matchup Daily lineup + board helpers.

## Global Constraints

- Metric: rest-of-week `projectedCatWins` via `youTotalsFromDaily` + `board.categories` opponent totals
- Schedule/strategy gates still filter the FA pool; board delta only ranks/gates that pool
- Drop + add is one move; do not search alternate roster drops
- 1-spot off-night always-cover accept is removed
- After the drop, skip the candidate if add-day is still full (`isDailyLineupFullForDate`)
- Seat only into empty or off-night slots; never displace a game-day starter
- Missing `daily` → `initDailyLineups` from roster + schedule, then still gate
- Summary reason: `Adds only when the board improves` (replaces `Maximizing starts within add budget`; still max 3 reasons)
- Alternatives: next-best board-delta ids from the same schedule-filtered pool (max 3, same position-family filter)
- Tests: `npx vitest run tests/unit/streamerMove.test.ts tests/unit/applyStreamingPlanPreview.test.ts tests/unit/streamingPlans.test.ts tests/unit/StreamingPlansPanel.test.tsx`
- Do not commit unrelated WIP (branding, layout-only matchup diffs)

---

## File map

| File | Role |
| --- | --- |
| `src/lib/matchup/streamerMove.ts` | Open-slot seat, rest-of-week overlay, board-delta score, pick-best |
| `src/lib/matchup/applyStreamingPlanPreview.ts` | Use `seatStreamerIfOpen`; delete displace fallback |
| `src/lib/matchup/streamingPlans.ts` | `workingDaily`, pick by delta, remove always-cover accept, summary/alternatives |
| `tests/unit/streamerMove.test.ts` | Overlay + score cases |
| `tests/unit/applyStreamingPlanPreview.test.ts` | Full night + no drop does not displace |
| `tests/unit/streamingPlans.test.ts` | Spec §7 planner cases; invert always-cover |
| `tests/unit/StreamingPlansPanel.test.tsx` | New summary copy |

---

### Task 1: Open-slot seating (planner = preview)

**Files:**
- Create: `src/lib/matchup/streamerMove.ts`
- Modify: `src/lib/matchup/applyStreamingPlanPreview.ts`
- Test: `tests/unit/streamerMove.test.ts`, `tests/unit/applyStreamingPlanPreview.test.ts`

**Interfaces:**
- Consumes: `DailyLineups`, `eligibleForSlot`, `gameWeightForTeamDate`, `isDailyLineupFullForDate`
- Produces:

```ts
export type StreamerMoveDrop = {
  kind: "none" | "player"
  playerId: string | null
}

export const seatStreamerIfOpen = (
  entries: SeasonRosterEntry[] | undefined,
  playerId: string,
  date: string,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): boolean

export const applyStreamerMoveToDaily = (
  daily: DailyLineups,
  fromDate: string,
  addPlayerId: string,
  drop: StreamerMoveDrop,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): { daily: DailyLineups; seatedGameDays: number }
```

- [ ] **Step 1: Write failing tests**

Create `tests/unit/streamerMove.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { applyStreamerMoveToDaily } from "@/lib/matchup/streamerMove"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

const DAY = "2025-11-03"
const DAY2 = "2025-11-04"

const emptyActive = (): SeasonRosterEntry[] =>
  (["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL"] as const).map(
    (slot) => ({ slot, playerId: null }),
  )

const player = (id: string, teamAbbr: string, positions: SeasonPlayer["positions"] = ["C"]): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  positions,
  projections: {
    FG_PCT: 0.5, FT_PCT: 0.8, TPM: 1, REB: 5, AST: 2, STL: 1, BLK: 1, TO: 2, PTS: 10,
  },
  shooting: { FGM: 4, FGA: 8, FTM: 2, FTA: 2.5 },
})

describe("applyStreamerMoveToDaily", () => {
  it("clears a roster drop from fromDate onward and seats the FA on open game days", () => {
    const dropP = player("bench", "NYK", ["PF"])
    const fa = player("fa-bos", "BOS", ["C"])
    const d1 = emptyActive()
    d1[3] = { slot: "PF", playerId: "bench" }
    const d2 = emptyActive()
    d2[3] = { slot: "PF", playerId: "bench" }
    const daily: DailyLineups = { [DAY]: d1, [DAY2]: d2 }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY2, days: [DAY, DAY2] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY2, homeAbbr: "BOS", awayAbbr: "MIA" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "ATL" },
        { date: DAY2, homeAbbr: "NYK", awayAbbr: "ORL" },
      ],
    }
    const playersById = { bench: dropP, "fa-bos": fa }
    const result = applyStreamerMoveToDaily(
      daily,
      DAY,
      "fa-bos",
      { kind: "player", playerId: "bench" },
      playersById,
      schedule,
    )
    expect(result.seatedGameDays).toBe(2)
    expect(result.daily[DAY]!.some((e) => e.playerId === "bench")).toBe(false)
    expect(result.daily[DAY2]!.some((e) => e.playerId === "bench")).toBe(false)
    expect(result.daily[DAY]!.some((e) => e.playerId === "fa-bos")).toBe(true)
    expect(result.daily[DAY2]!.some((e) => e.playerId === "fa-bos")).toBe(true)
  })

  it("does not displace a game-day starter when the add-day is full", () => {
    const roster = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"].map(
      (id, i) => player(id, ["NYK", "LAL", "PHX", "MIL", "ATL", "DEN", "GSW", "MIA", "CHI", "BOS"][i]!, ["UTIL"]),
    )
    const entries = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: roster[index]!.id,
    }))
    const fa = player("fa-was", "WAS", ["C"])
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "MIA" },
        { date: DAY, homeAbbr: "LAL", awayAbbr: "GSW" },
        { date: DAY, homeAbbr: "PHX", awayAbbr: "DEN" },
        { date: DAY, homeAbbr: "MIL", awayAbbr: "ATL" },
        { date: DAY, homeAbbr: "WAS", awayAbbr: "TOR" },
      ],
    }
    const playersById = Object.fromEntries([
      ...roster.map((p) => [p.id, p] as const),
      ["fa-was", fa] as const,
    ])
    const result = applyStreamerMoveToDaily(
      { [DAY]: entries },
      DAY,
      "fa-was",
      { kind: "none", playerId: null },
      playersById,
      schedule,
    )
    expect(result.seatedGameDays).toBe(0)
    expect(result.daily[DAY]!.some((e) => e.playerId === "fa-was")).toBe(false)
    expect(result.daily[DAY]!.map((e) => e.playerId)).toEqual(entries.map((e) => e.playerId))
  })
})
```

In `tests/unit/applyStreamingPlanPreview.test.ts`, change the example `"seats a streamer on a full game-day lineup when roster drop is none"` to:

```ts
  it("does not displace a game-day starter on a full night when roster drop is none", () => {
    // keep the same packed 10-man fixture as today
    const preview = applyStreamingPlanPreview(/* same args as the old test */)
    expect(playerIdsOn(preview, DAYS[0])).not.toContain("fa-was")
    expect(playerIdsOn(preview, DAYS[0])).toHaveLength(10)
  })
```

Keep the existing packed-roster fixture body; only invert the FA assertion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/streamerMove.test.ts tests/unit/applyStreamingPlanPreview.test.ts -t "displace|applyStreamerMoveToDaily|full night|full game-day"`

Expected: FAIL (`streamerMove` not found; old preview still contains `fa-was`).

- [ ] **Step 3: Implement seating**

`src/lib/matchup/streamerMove.ts`:

```ts
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import {
  isDailyLineupFullForDate,
  type DailyLineups,
} from "./dailyLineups"
import { eligibleForSlot } from "./eligibility"
import { gameWeightForTeamDate } from "./games"

export type StreamerMoveDrop = {
  kind: "none" | "player"
  playerId: string | null
}

const resolvePlayer = (
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  playerId: string,
): SeasonPlayer | undefined =>
  playersById instanceof Map ? playersById.get(playerId) : playersById[playerId]

const cloneDaily = (daily: DailyLineups): DailyLineups =>
  Object.fromEntries(
    Object.entries(daily).map(([day, entries]) => [
      day,
      entries.map((entry) => ({ ...entry })),
    ]),
  )

const occupantHasNoGame = (
  playerId: string,
  date: string,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): boolean => {
  const occupant = resolvePlayer(playersById, playerId)
  if (!occupant?.teamAbbr) return true
  return gameWeightForTeamDate(occupant.teamAbbr, date, schedule) === 0
}

export const seatStreamerIfOpen = (
  entries: SeasonRosterEntry[] | undefined,
  playerId: string,
  date: string,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): boolean => {
  if (!entries) return false
  if (entries.some((entry) => entry.playerId === playerId)) return true

  const player = resolvePlayer(playersById, playerId)
  if (!player) return false

  const slotIsOpen = (entry: SeasonRosterEntry): boolean => {
    if (entry.playerId === null) return true
    return occupantHasNoGame(entry.playerId, date, playersById, schedule)
  }

  const index = entries.findIndex(
    (entry) => slotIsOpen(entry) && eligibleForSlot(player, entry.slot),
  )
  if (index < 0) return false
  const slot = entries[index]
  if (!slot) return false
  entries[index] = { ...slot, playerId }
  return true
}

const clearPlayerFromDay = (
  entries: SeasonRosterEntry[] | undefined,
  playerId: string,
): void => {
  if (!entries) return
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry?.playerId === playerId) {
      entries[index] = { ...entry, playerId: null }
    }
  }
}

export const applyStreamerMoveToDaily = (
  daily: DailyLineups,
  fromDate: string,
  addPlayerId: string,
  drop: StreamerMoveDrop,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): { daily: DailyLineups; seatedGameDays: number } => {
  const next = cloneDaily(daily)
  const days = Object.keys(next).sort().filter((day) => day >= fromDate)

  if (drop.kind === "player" && drop.playerId) {
    for (const day of days) {
      clearPlayerFromDay(next[day], drop.playerId)
    }
  }

  const addPlayer = resolvePlayer(playersById, addPlayerId)
  if (!addPlayer?.teamAbbr) return { daily: next, seatedGameDays: 0 }

  if (isDailyLineupFullForDate(next, fromDate, playersById, schedule)) {
    return { daily: next, seatedGameDays: 0 }
  }

  let seatedGameDays = 0
  for (const day of days) {
    if (gameWeightForTeamDate(addPlayer.teamAbbr, day, schedule) === 0) continue
    if (seatStreamerIfOpen(next[day], addPlayerId, day, playersById, schedule)) {
      seatedGameDays += 1
    }
  }

  return { daily: next, seatedGameDays }
}
```

In `applyStreamingPlanPreview.ts`: import `seatStreamerIfOpen`. Replace `seatPlayer` (including the displace loop) with `seatStreamerIfOpen(...)`. Keep drop-from-date and `omitSeats` behavior.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/streamerMove.test.ts tests/unit/applyStreamingPlanPreview.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamerMove.ts src/lib/matchup/applyStreamingPlanPreview.ts tests/unit/streamerMove.test.ts tests/unit/applyStreamingPlanPreview.test.ts
git commit -m "feat(matchup): seat streamers only in open daily slots"
```

---

### Task 2: Board-delta scorer

**Files:**
- Modify: `src/lib/matchup/streamerMove.ts`
- Test: `tests/unit/streamerMove.test.ts`

**Interfaces:**
- Consumes: Task 1 `applyStreamerMoveToDaily`, `buildMatchupBoard`, `youTotalsFromDaily`, `MatchupBoard`
- Produces:

```ts
export const oppTotalsFromBoard = (
  board: MatchupBoard,
): Record<CategoryId, number>

export const categoryIdsFromBoard = (board: MatchupBoard): CategoryId[]

export const scoreStreamerMove = (
  workingDaily: DailyLineups,
  fromDate: string,
  addPlayerId: string,
  drop: StreamerMoveDrop,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
): { delta: number; seatedGameDays: number; nextDaily: DailyLineups } | null

export const pickBestStreamerMove = (
  candidateIds: string[],
  workingDaily: DailyLineups,
  fromDate: string,
  drop: StreamerMoveDrop,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  isCompatibleAlternative: (chosenId: string, otherId: string) => boolean,
): {
  playerId: string
  delta: number
  nextDaily: DailyLineups
  alternativePlayerIds: string[]
} | null
```

`scoreStreamerMove` returns `null` when `seatedGameDays === 0`. `delta` is `projectedCatWins(next) - projectedCatWins(workingDaily)`. Empty `board.categories` → empty category list (both wins 0, delta 0, treat as not `> 0`).

`pickBestStreamerMove`: score each id; ignore `null`; winner is max `delta` among `delta > 0`; ties keep `candidateIds` order. Alternatives: remaining scored ids (including `delta <= 0`) sorted by delta desc, then `candidateIds` order, filtered by `isCompatibleAlternative`, slice 3.

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/streamerMove.test.ts`:

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { pickBestStreamerMove, scoreStreamerMove } from "@/lib/matchup/streamerMove"
import type { MatchupBoard } from "@/lib/matchup/types"

const losingBlkBoard = (): MatchupBoard => ({
  categories: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    you: categoryId === "BLK" ? 1 : 50,
    opp: categoryId === "BLK" ? 8 : 10,
    outcome: categoryId === "BLK" ? "L" : "W",
    winProb: categoryId === "BLK" ? 0.1 : 0.9,
  })),
  wins: 8,
  losses: 1,
  ties: 0,
  projectedCatWins: 7,
})

it("scoreStreamerMove is null when the FA cannot sit", () => {
  const roster = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"].map(
    (id, i) =>
      player(id, ["NYK", "LAL", "PHX", "MIL", "ATL", "DEN", "GSW", "MIA", "CHI", "BOS"][i]!, [
        "UTIL",
      ]),
  )
  const entries = emptyActive().map((entry, index) => ({
    ...entry,
    playerId: roster[index]!.id,
  }))
  const fa = player("fa-was", "WAS", ["C"])
  const schedule: ScheduleResponse = {
    source: "fixture",
    matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
    games: [
      { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: DAY, homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: DAY, homeAbbr: "LAL", awayAbbr: "GSW" },
      { date: DAY, homeAbbr: "PHX", awayAbbr: "DEN" },
      { date: DAY, homeAbbr: "MIL", awayAbbr: "ATL" },
      { date: DAY, homeAbbr: "WAS", awayAbbr: "TOR" },
    ],
  }
  const scored = scoreStreamerMove(
    { [DAY]: entries },
    DAY,
    "fa-was",
    { kind: "none", playerId: null },
    [...roster, fa],
    schedule,
    losingBlkBoard(),
  )
  expect(scored).toBeNull()
})

it("pickBestStreamerMove prefers the FA that raises projectedCatWins over more remaining games", () => {
  const volume = player("fa-vol", "BOS", ["C"])
  volume.projections = { ...volume.projections, BLK: 0, PTS: 2000 }
  const quality = player("fa-q", "NYK", ["C"])
  quality.projections = { ...quality.projections, BLK: 400, PTS: 10 }
  const daily: DailyLineups = { [DAY]: emptyActive(), [DAY2]: emptyActive() }
  const schedule: ScheduleResponse = {
    source: "fixture",
    matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY2, days: [DAY, DAY2] },
    games: [
      { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: DAY2, homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: DAY, homeAbbr: "NYK", awayAbbr: "ATL" },
    ],
  }
  const picked = pickBestStreamerMove(
    ["fa-vol", "fa-q"],
    daily,
    DAY,
    { kind: "none", playerId: null },
    [volume, quality],
    schedule,
    losingBlkBoard(),
    () => true,
  )
  expect(picked?.playerId).toBe("fa-q")
  expect(picked!.delta).toBeGreaterThan(0)
})
```

Keep expected winner `fa-q`. If sigmoid scale makes volume win, increase `quality.projections.BLK` (do not change the expected id).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/streamerMove.test.ts -t "pickBestStreamerMove|scoreStreamerMove"`

Expected: FAIL (exports missing).

- [ ] **Step 3: Implement scoring**

Add to `streamerMove.ts`:

```ts
import type { CategoryId } from "@/lib/domain/types"
import { buildMatchupBoard } from "./board"
import { youTotalsFromDaily } from "./dailyLineups"
import type { MatchupBoard } from "./types"

export const oppTotalsFromBoard = (
  board: MatchupBoard,
): Record<CategoryId, number> =>
  Object.fromEntries(
    board.categories.map((row) => [row.categoryId, row.opp]),
  ) as Record<CategoryId, number>

export const categoryIdsFromBoard = (board: MatchupBoard): CategoryId[] =>
  board.categories.map((row) => row.categoryId)

const projectedCatWinsFromDaily = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
): number => {
  const categoryIds = categoryIdsFromBoard(board)
  if (categoryIds.length === 0) return 0
  const you = youTotalsFromDaily(daily, players, schedule)
  const opp = oppTotalsFromBoard(board)
  return buildMatchupBoard(you, opp, categoryIds).projectedCatWins
}

export const scoreStreamerMove = (
  workingDaily: DailyLineups,
  fromDate: string,
  addPlayerId: string,
  drop: StreamerMoveDrop,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
): { delta: number; seatedGameDays: number; nextDaily: DailyLineups } | null => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const applied = applyStreamerMoveToDaily(
    workingDaily,
    fromDate,
    addPlayerId,
    drop,
    playersById,
    schedule,
  )
  if (applied.seatedGameDays === 0) return null
  const before = projectedCatWinsFromDaily(workingDaily, players, schedule, board)
  const after = projectedCatWinsFromDaily(applied.daily, players, schedule, board)
  return {
    delta: after - before,
    seatedGameDays: applied.seatedGameDays,
    nextDaily: applied.daily,
  }
}

export const pickBestStreamerMove = (
  candidateIds: string[],
  workingDaily: DailyLineups,
  fromDate: string,
  drop: StreamerMoveDrop,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  isCompatibleAlternative: (chosenId: string, otherId: string) => boolean,
): {
  playerId: string
  delta: number
  nextDaily: DailyLineups
  alternativePlayerIds: string[]
} | null => {
  const scored = candidateIds.flatMap((playerId, index) => {
    const result = scoreStreamerMove(
      workingDaily,
      fromDate,
      playerId,
      drop,
      players,
      schedule,
      board,
    )
    if (!result) return []
    return [{ playerId, index, ...result }]
  })
  const positive = scored
    .filter((row) => row.delta > 0)
    .sort((left, right) => {
      if (right.delta !== left.delta) return right.delta - left.delta
      return left.index - right.index
    })
  const winner = positive[0]
  if (!winner) return null

  const alternativePlayerIds = scored
    .filter((row) => row.playerId !== winner.playerId)
    .sort((left, right) => {
      if (right.delta !== left.delta) return right.delta - left.delta
      return left.index - right.index
    })
    .filter((row) => isCompatibleAlternative(winner.playerId, row.playerId))
    .slice(0, 3)
    .map((row) => row.playerId)

  return {
    playerId: winner.playerId,
    delta: winner.delta,
    nextDaily: winner.nextDaily,
    alternativePlayerIds,
  }
}
```

Do not import `ALL_CATEGORY_IDS` into scoring when the board is empty.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/streamerMove.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamerMove.ts tests/unit/streamerMove.test.ts
git commit -m "feat(matchup): score streaming moves by board delta"
```

---

### Task 3: Planner uses board delta

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts`
- Test: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: `initDailyLineups`, `rosterSlotsFor`, `pickBestStreamerMove`, `applyStreamerMoveToDaily`
- Produces: `buildStreamingPlan` behavior per spec (no new export required)

At start of `buildStreamingPlan`:

```ts
const youTeam = state.teams[state.perspectiveTeamIndex]
const rosterSlots = rosterSlotsFor(state)
let workingDaily: DailyLineups =
  daily ??
  initDailyLineups(
    schedule.matchup.days,
    youTeam?.entries ?? [],
    rosterSlots,
    state.players,
    schedule,
  )
```

Empty-spot fill: build `candidateIds` from `listTodayBlocks` (and thin `rankEligibleFas` fallback) **without** taking `[0]` as the add. Resolve roster drop **once** (`pendingAdds` logic moves **before** pick: for a true empty fill, `resolveRosterDrop` first). `drop` is `{ kind: "player", playerId }` or `{ kind: "none", playerId: null }` for `open_slot` / `none`. Then:

```ts
const picked = pickBestStreamerMove(
  candidateIds,
  workingDaily,
  date,
  drop,
  state.players,
  schedule,
  board,
  (chosenId, otherId) => {
    const chosen = playersById.get(chosenId)
    const other = playersById.get(otherId)
    return Boolean(chosen && other && isCompatibleStreamerAlternative(chosen, other))
  },
)
if (!picked) { /* empty / keep previous occupant null */ }
else {
  workingDaily = picked.nextDaily
  // set cell action add or drop_add, alternativePlayerIds: picked.alternativePlayerIds
}
```

Early-swap: keep existing **when** gates (density, multi-spot off-night late/behind). **Delete** the `isOneSpotAlwaysCover` accept branch (`if (isOneSpotAlwaysCover) { // Accept any today-playing FA }`). Candidate list is still `listTodayBlocks` plus the same thin fallbacks as today **except** 1-spot off-night no longer bypasses gates. Score with drop `{ kind: "player", playerId: heldId }` (held streamer). Only commit if `pickBestStreamerMove` returns non-null.

`canSpendWeeklyAdd`: keep `addsUsed < addLimit`. Do **not** block on `lineupFull` before scoring a move that includes a roster drop; `applyStreamerMoveToDaily` already returns 0 seats if still full after drop. For fills with `drop.kind === "none"`, skip calling pick when `isDailyLineupFullForDate(workingDaily, date, ...)`.

`buildSummaryReasons`: replace `"Maximizing starts within add budget"` with `"Adds only when the board improves"`. Keep density + ADP lines. Cap 3.

- [ ] **Step 1: Write failing tests**

In `tests/unit/streamingPlans.test.ts`:

1. Replace describe `"1-spot off-night always cover"` example `"covers off night even when upgrade has fewer remaining games"` with:

```ts
  it("does not cover a 1-spot off night when the upgrade would not raise projectedCatWins", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200, BLK: 80 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 0, BLK: 0, TO: 400, FG_PCT: 0.3 },
      shooting: { FGM: 2, FGA: 20, FTM: 1, FTA: 2 },
    })
    const state = tinyState([bos, chi], ["fa-bos", "fa-chi"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
    ])
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        you: categoryId === "TO" || categoryId === "FG_PCT" ? 20 : 50,
        opp: categoryId === "TO" || categoryId === "FG_PCT" ? 8 : 10,
        outcome: categoryId === "TO" || categoryId === "FG_PCT" ? "L" : "W",
        winProb: 0.2,
      })),
      wins: 7,
      losses: 2,
      ties: 0,
      projectedCatWins: 6,
    }
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      strategyMode: "aggressive",
      addLimit: 7,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({ action: "add", playerId: "fa-bos" })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-bos",
    })
  })
```

2. Add (spec §7.1): 1-spot, two FAs both play day 1; volume BOS plays 4 days with `BLK: 0`; quality NYK plays only day 1 with `BLK: 400`; board losing only BLK (`losingBlkBoard` pattern). Expect `playerId: "fa-q"` on day 0.

3. Add (spec §7.3): roster `BE` player `"star"` with huge STL started on every day in `daily`; FA with small STL; `adpByPlayerId` leaves `"star"` droppable. Expect no add (or add that does not drop star if an open_slot exists — `tinyState` UTIL empty should `open_slot`; **force** a full 10-man `daily` plus `forcedRosterDrops` / filled UTIL so the picker must drop `star`). Concrete: pass `daily` with 10 game-day starters including `star` on UTIL, `state.teams[0].entries` include `{ slot: "BE", playerId: "star" }` and 9 other actives, `forcedRosterDrops` not needed if `pickRosterDrop` prefers off-night — put `star` as the only droppable (others ADP 10). Expect skip add.

4. Add (spec §7.4): two-day week; first add `fa-a` (BOS both days, huge BLK); day 2 candidate `fa-b` (NYK day 2 only, 0 BLK, huge TO). After first overlay, day 2 pick must hold `fa-a` (second add would not raise board).

5. Add (spec §7.5): packed 10-man `daily` all with games; roster drop `bench-off` has a game; after drop a UTIL opens. FA with huge BLK. Expect add with `rosterDropPlayerId: "bench-off"` when that drop is chosen.

6. Add (spec §7.6): `strategyMode: "conservative"`, thin 1-game FA only, early week (day 0 of 7). Expect no add even if BLK would help.

7. Change `expect(plan.summaryReasons).toContain("Maximizing starts within add budget")` to `"Adds only when the board improves"`.

Keep `"swaps on off night when upgrade has strictly more remaining games"` if that upgrade still has `delta > 0` (STL board); if it fails after the gate, assert `hold` instead — do not resurrect always-cover.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/streamingPlans.test.ts -t "board|off night|Adds only when"`

Expected: FAIL (old always-cover / old summary / new examples not satisfied).

- [ ] **Step 3: Implement planner wiring**

Follow the Interfaces block. Remove `isOneSpotAlwaysCover` accept. Thread `workingDaily` after every committed add/swap via `picked.nextDaily` (or `applyStreamerMoveToDaily` with the same drop/add — must match pick).

Soft-cap: do not skip `pickBestStreamerMove` solely because `addsBySpot[i]` is high while `addsUsed < addLimit`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/streamingPlans.test.ts`

Expected: PASS. Fix any remaining examples that assumed always-cover or “always spend remaining adds” so they assert board-gated behavior, not the old counts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): gate streaming adds on projected cat wins"
```

---

### Task 4: Panel summary copy

**Files:**
- Modify: `tests/unit/StreamingPlansPanel.test.tsx` only if the panel reads `plan.summaryReasons` (it does). No panel logic change if reasons come from the planner.

**Interfaces:**
- Consumes: Task 3 `summaryReasons`
- Produces: UI shows `Adds only when the board improves`

- [ ] **Step 1: Update the panel test**

Replace `/Maximizing starts within add budget/` with `/Adds only when the board improves/`.

- [ ] **Step 2: Run the test to verify it fails if copy was not wired**

Run: `npx vitest run tests/unit/StreamingPlansPanel.test.tsx`

Expected: PASS if Task 3 already changed `buildSummaryReasons`; FAIL only if the panel hardcodes the old string — then switch that string to the new copy.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/StreamingPlansPanel.test.tsx src/components/matchup/StreamingPlansPanel.tsx
git commit -m "test(matchup): expect board-delta streaming summary copy"
```

If `git status` shows no panel file change, commit the test file only.

---

## Spec coverage

| Spec | Task |
| --- | --- |
| Open-slot seat / no displace / preview agree | Task 1 |
| Rest-of-week overlay + drop from date | Task 1 |
| `projectedCatWins` delta, empty board cats | Task 2 |
| Max delta `> 0` among schedule-filtered FAs | Task 2–3 |
| One drop, no drop search | Task 3 |
| Always-cover removed | Task 3 |
| `workingDaily` for later days | Task 3 |
| Full night after drop | Task 1 + Task 3 §7.5 |
| Missing `daily` → `initDailyLineups` | Task 3 |
| Summary + alternatives | Task 3–4 |
| Conservative thin still filters | Task 3 §7.6 |
| Soft-cap must not block board-positive add | Task 3 implement step |
