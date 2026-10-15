# Streaming Add Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user replace one recommended streaming add, hold that player through a clicked day, and read category deltas against the untouched recommendation.

**Architecture:** A small pure module filters search results and computes category deltas. `buildStreamingPlan` accepts per-spot locks and keeps each locked player through `holdUntil`. The streaming panel stores locks per spot count, replans only the on-screen count, and the matchup board renders deltas from the baseline plan versus the locked plan.

**Tech Stack:** TypeScript, React, Next.js, Vitest, existing matchup board and streaming plan helpers.

## Global Constraints

- Matchup streaming grid only. Do not change drop ranking, add pacing, the ADP protection threshold, or opponent streaming.
- Locks are per spot count. One replan honors every lock for that spot count.
- A roster drop is recorded only on the same cell as an add or drop-add.
- From the add date through the hold end, inclusive, that spot shows the locked player, including off nights. The 4-day week-end replacement does not run inside that range.
- The day after the hold end, normal streaming rules apply, including dropping that player.
- Default hold end is `streamingHoldUntil` for that player, add date, and spot count.
- Search is free agents with a game on the add date, excluding anyone already locked on that date, including a hold carried from an earlier add. Typing does not rebuild a plan.
- If there is no open non-IL slot and every other roster player is ADP-protected, reject the lock, keep the recommendation, and show one sentence: `Can't add this player.`
- The baseline plan stays in memory. A lock replans only the spot count on screen.
- Locks survive punt toggles and stat-window changes. Locks clear when the matchup week, the opponent, or the add budget changes.
- Delta is locked projected `you` total minus baseline projected `you` total. Show it only when non-zero, in the category row's existing units. Clear deltas when every lock for the on-screen spot count is gone.
- Tests assert structure. Do not name real players or pin a fixture to one ESPN id.
- Lib files under `src/lib/matchup` use semicolons, matching `streamingPlans.ts`. TSX and `streamingPlans.test.ts` omit semicolons.

---

### Task 1: Search filter and category deltas

**Files:**
- Create: `src/lib/matchup/streamingAddOverride.ts`
- Test: `tests/unit/streamingAddOverride.test.ts`

**Interfaces:**
- Consumes: `SeasonPlayer`, `ScheduleResponse`, `MatchupBoard`, `CategoryId`, `playerHasGameOnDate`
- Produces:
  - `export type StreamingAddLock = { date: string; spotIndex: number; playerId: string; holdUntil: string }`
  - `export const playersLockedOnDate = (locks: readonly StreamingAddLock[], date: string): Set<string>`
  - `export const addOverrideCandidates = (input: { players: readonly SeasonPlayer[]; availableIds: ReadonlySet<string>; date: string; schedule: ScheduleResponse; locks: readonly StreamingAddLock[]; query: string }): SeasonPlayer[]`
  - `export const categoryTotalDeltas = (locked: MatchupBoard, baseline: MatchupBoard): Partial<Record<CategoryId, number>>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/streamingAddOverride.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import type { MatchupBoard } from "@/lib/matchup/types"
import {
  addOverrideCandidates,
  categoryTotalDeltas,
  playersLockedOnDate,
} from "@/lib/matchup/streamingAddOverride"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const player = (id: string, teamAbbr: string): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  availability: "fa",
  positions: ["PG"],
  projections: {
    FG_PCT: 0.48,
    FT_PCT: 0.78,
    TPM: 1,
    REB: 1,
    AST: 1,
    STL: 1,
    BLK: 1,
    TO: 1,
    PTS: 1,
  },
  shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 2 },
})

const schedule = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-10-19",
    endDate: "2026-10-21",
    days: ["2026-10-19", "2026-10-20", "2026-10-21"],
  },
  games: [
    { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2026-10-20", homeAbbr: "DET", awayAbbr: "PHI" },
  ],
} satisfies ScheduleResponse

const board = (
  youPts: number,
  youReb: number,
): MatchupBoard => ({
  wins: 1,
  losses: 0,
  ties: 0,
  projectedCatWins: 1,
  categories: [
    {
      categoryId: "PTS" as CategoryId,
      you: youPts,
      opp: 10,
      outcome: "W",
      winProb: 0.6,
    },
    {
      categoryId: "REB" as CategoryId,
      you: youReb,
      opp: 10,
      outcome: "T",
      winProb: 0.5,
    },
  ],
})

describe("streaming add override helpers", () => {
  it("keeps a locked player on every date inside the hold", () => {
    const locks = [
      {
        date: "2026-10-19",
        spotIndex: 0,
        playerId: "wire-a",
        holdUntil: "2026-10-21",
      },
    ]
    expect(playersLockedOnDate(locks, "2026-10-20").has("wire-a")).toBe(true)
    expect(playersLockedOnDate(locks, "2026-10-22").has("wire-a")).toBe(false)
  })

  it("searches free agents with a game that day, skipping players already locked", () => {
    const bos = player("wire-bos", "BOS")
    const det = player("wire-det", "DET")
    const idle = player("wire-idle", "SAC")
    const found = addOverrideCandidates({
      players: [bos, det, idle],
      availableIds: new Set(["wire-bos", "wire-det", "wire-idle"]),
      date: "2026-10-20",
      schedule,
      locks: [
        {
          date: "2026-10-19",
          spotIndex: 1,
          playerId: "wire-bos",
          holdUntil: "2026-10-20",
        },
      ],
      query: "det",
    })
    expect(found.map((item) => item.id)).toEqual(["wire-det"])
  })

  it("returns only categories whose you total changed", () => {
    expect(categoryTotalDeltas(board(12, 10), board(10, 10))).toEqual({
      PTS: 2,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingAddOverride.test.ts`

Expected: FAIL because `@/lib/matchup/streamingAddOverride` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/matchup/streamingAddOverride.ts`:

```ts
import type { CategoryId } from "@/lib/domain/types"
import type { MatchupBoard } from "@/lib/matchup/types"
import { playerHasGameOnDate } from "@/lib/matchup/games"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

export type StreamingAddLock = {
  date: string
  spotIndex: number
  playerId: string
  holdUntil: string
}

export const playersLockedOnDate = (
  locks: readonly StreamingAddLock[],
  date: string,
): Set<string> => {
  const ids = new Set<string>()
  for (const lock of locks) {
    if (date >= lock.date && date <= lock.holdUntil) ids.add(lock.playerId)
  }
  return ids
}

export const addOverrideCandidates = (input: {
  players: readonly SeasonPlayer[]
  availableIds: ReadonlySet<string>
  date: string
  schedule: ScheduleResponse
  locks: readonly StreamingAddLock[]
  query: string
}): SeasonPlayer[] => {
  const locked = playersLockedOnDate(input.locks, input.date)
  const needle = input.query.trim().toLowerCase()
  return input.players.filter((player) => {
    if (!input.availableIds.has(player.id)) return false
    if (locked.has(player.id)) return false
    if (!playerHasGameOnDate(player, input.date, input.schedule)) return false
    if (!needle) return true
    return player.name.toLowerCase().includes(needle)
  })
}

export const categoryTotalDeltas = (
  locked: MatchupBoard,
  baseline: MatchupBoard,
): Partial<Record<CategoryId, number>> => {
  const deltas: Partial<Record<CategoryId, number>> = {}
  for (const row of locked.categories) {
    const base = baseline.categories.find(
      (item) => item.categoryId === row.categoryId,
    )
    if (!base) continue
    const delta = row.you - base.you
    if (delta !== 0) deltas[row.categoryId] = delta
  }
  return deltas
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingAddOverride.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingAddOverride.ts tests/unit/streamingAddOverride.test.ts
git commit -m "feat(matchup): filter streaming add overrides and category deltas"
```

---

### Task 2: Honor add locks inside the streaming plan

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (export `streamingHoldUntil`; add `forcedAdds` on `BuildStreamingPlanInput`; add `rejectedAddLocks` on `StreamingPlan`)
- Modify: `src/lib/matchup/types.ts` (`rejectedAddLocks` on `StreamingPlan`)
- Test: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: `StreamingAddLock` from Task 1. Existing `pickAutoRosterCut`, `rankRosterDropPlayerIds`, `hasOpenNonIlSlot`, `pickBestStreamerMove`, `isAdpProtected`, `streamingAddDropKey`.
- Produces:
  - `export const streamingHoldUntil` (already declared, add `export`)
  - `BuildStreamingPlanInput.forcedAdds?: readonly StreamingAddLock[]`
  - `StreamingPlan.rejectedAddLocks: StreamingAddLock[]`

- [ ] **Step 1: Write the failing test**

Append this describe to `tests/unit/streamingPlans.test.ts`. Use the file's existing `player`, `tinyState`, `tinySchedule`, `emptyBoardLosingStl`, `baseProjections`, and `ALL_CATEGORY_IDS` helpers.

```ts
describe("forced streaming adds", () => {
  const week = [
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
  ]

  it("holds the locked player through holdUntil and drops only on an add cell", () => {
    for (const spotCount of [1, 2, 3] as const) {
      for (const scoringMode of ["each_category", "most_categories"] as const) {
        const locked = player("wire-lock", "BOS", {
          projections: { ...baseProjections(), STL: 40, BLK: 40 },
        })
        const later = player("wire-later", "NYK", {
          projections: { ...baseProjections(), STL: 30, BLK: 30 },
        })
        const bench = player("bench-cut", "ATL")
        const state = tinyState(
          [locked, later, bench],
          ["wire-lock", "wire-later"],
        )
        state.scoringMode = scoringMode
        state.teams[0]!.entries = [
          { slot: "UTIL", playerId: "bench-cut" },
          { slot: "BE", playerId: null },
        ]
        const schedule = tinySchedule(week, [
          { date: week[0]!, homeAbbr: "BOS", awayAbbr: "DET" },
          { date: week[3]!, homeAbbr: "NYK", awayAbbr: "ORL" },
        ])
        const plan = buildStreamingPlan({
          spotCount,
          state,
          schedule,
          board: emptyBoardLosingStl(),
          addLimit: 4,
          forcedAdds: [
            {
              date: week[0]!,
              spotIndex: 0,
              playerId: "wire-lock",
              holdUntil: week[2]!,
            },
          ],
        })
        for (let index = 0; index <= 2; index += 1) {
          const cell = plan.days[index]!.cells[0]!
          expect(cell.playerId).toBe("wire-lock")
          if (index === 0) {
            expect(cell.action === "add" || cell.action === "drop_add").toBe(
              true,
            )
          } else {
            expect(cell.action).toBe("hold")
          }
        }
        for (const day of plan.days) {
          for (const cell of day.cells) {
            if (cell.rosterDropKind !== "player") continue
            expect(cell.action === "add" || cell.action === "drop_add").toBe(
              true,
            )
          }
        }
        expect(plan.rejectedAddLocks).toEqual([])
      }
    }
  })

  it("rejects a lock when no open slot and every other player is ADP-protected", () => {
    const locked = player("wire-lock", "BOS", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const anchor = player("anchor", "CHI")
    const state = tinyState([locked, anchor], ["wire-lock"])
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: "anchor" }]
    const schedule = tinySchedule(week.slice(0, 2), [
      { date: week[0]!, homeAbbr: "BOS", awayAbbr: "DET" },
      { date: week[0]!, homeAbbr: "CHI", awayAbbr: "ORL" },
    ])
    const shared = {
      spotCount: 2 as const,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 4,
      adpByPlayerId: { anchor: 20 },
    }
    const baseline = buildStreamingPlan(shared)
    const lockedPlan = buildStreamingPlan({
      ...shared,
      forcedAdds: [
        {
          date: week[0]!,
          spotIndex: 0,
          playerId: "wire-lock",
          holdUntil: week[0]!,
        },
      ],
    })
    expect(lockedPlan.rejectedAddLocks).toEqual([
      {
        date: week[0]!,
        spotIndex: 0,
        playerId: "wire-lock",
        holdUntil: week[0]!,
      },
    ])
    expect(lockedPlan.days.map((day) => day.cells[0])).toEqual(
      baseline.days.map((day) => day.cells[0]),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts -t "forced streaming adds"`

Expected: FAIL because `forcedAdds` is not accepted and `rejectedAddLocks` is missing.

- [ ] **Step 3: Write minimal implementation**

Export the existing `streamingHoldUntil` function.

Add to `BuildStreamingPlanInput`:

```ts
forcedAdds?: readonly StreamingAddLock[]
```

Add to `StreamingPlan` in `src/lib/matchup/types.ts`:

```ts
rejectedAddLocks: StreamingAddLock[]
```

Import `StreamingAddLock` from `./streamingAddOverride` in both files.

Inside `buildStreamingPlan`, after reading other inputs:

```ts
const forcedAdds = input.forcedAdds ?? []
const rejectedAddLocks: StreamingAddLock[] = []
const lockForSpotOnDate = (spotIndex: number, date: string) =>
  forcedAdds.find(
    (lock) =>
      lock.spotIndex === spotIndex &&
      date >= lock.date &&
      date <= lock.holdUntil,
  )
```

Set `plan.rejectedAddLocks = rejectedAddLocks` on the returned plan. Every existing return path of a `StreamingPlan` in this function must include `rejectedAddLocks` (the main return, and any early opponent-only plan object if it constructs a `StreamingPlan`).

At the start of each matchup day, before the spot loop that writes cells, apply locks whose `date` is today:

```ts
const forcedToday = new Set<number>()
for (const lock of forcedAdds) {
  if (lock.date !== date || lock.spotIndex >= spotCount) continue
  const added = playersById.get(lock.playerId)
  if (!added || !playsOn(added, date, schedule)) {
    rejectedAddLocks.push(lock)
    continue
  }
  const open = hasOpenNonIlSlot(youTeam?.entries ?? [])
  let drop: StreamerMoveDrop = { kind: "none", playerId: null }
  if (!open) {
    const dropId =
      pickAutoRosterCut({
        date,
        days: schedule.matchup.days,
        teamEntries: youTeam?.entries ?? [],
        players: state.players,
        schedule,
        seatedTonight: holeLineup,
        adpByPlayerId,
        board,
        statWindow: window,
      }) ??
      rankRosterDropPlayerIds(
        youTeam?.entries ?? [],
        playersById,
        date,
        schedule,
        weakCats,
        new Set([lock.playerId]),
        adpByPlayerId,
        injuryOutDaysByPlayerId,
        board,
        false,
        false,
        window,
        true,
      ).find((id) => !isAdpProtected(adpByPlayerId?.[id]))
    if (!dropId) {
      rejectedAddLocks.push(lock)
      continue
    }
    drop = { kind: "player", playerId: dropId }
  }
  const moved = pickBestStreamerMove(
    [lock.playerId],
    workingDaily,
    date,
    drop,
    state.players,
    schedule,
    board,
    isCompatibleAlternative,
    ourPickOptions(false),
  )
  if (!moved) {
    rejectedAddLocks.push(lock)
    continue
  }
  workingDaily = moved.nextDaily
  occupants[lock.spotIndex] = lock.playerId
  addedOnBySpot[lock.spotIndex] = date
  holdUntilBySpot[lock.spotIndex] = lock.holdUntil
  rosteredStreamerIds.add(lock.playerId)
  addsUsed += 1
  addsBySpot[lock.spotIndex]! += 1
  if (drop.kind === "player" && drop.playerId) {
    weekDroppedPlayers.add(drop.playerId)
    markDropped(drop.playerId, date)
  }
  cells[lock.spotIndex] = {
    spotIndex: lock.spotIndex,
    playerId: lock.playerId,
    action: "add",
    droppedPlayerId: null,
    rosterDropPlayerId: drop.kind === "player" ? drop.playerId : null,
    rosterDropKind: drop.kind === "player" ? "player" : "none",
    addIndex: addsUsed,
    alternativePlayerIds: [],
    targetCategoryIds: [],
  }
  forcedToday.add(lock.spotIndex)
}
```

At the top of the existing `for (let spotIndex = 0; spotIndex < spotCount; spotIndex++)` cell loop, skip spots already forced today:

```ts
if (forcedToday.has(spotIndex)) continue
```

In `openMultiDayHold` and `releaseLongWeekEndHold`, return `false` immediately when `lockForSpotOnDate(spotIndex, date)` is defined and `date <=` that lock's `holdUntil`. That stops the 4-day replacement from cutting a user hold, including the add date if a later pass sees the occupant.

On later days inside the hold (`date > lock.date && date <= lock.holdUntil`), before the normal hold/empty branches, write a hold cell for `lock.playerId`, set `occupants[spotIndex]`, and `continue`. Do not clear the player and do not attach a roster drop. On the first day after `holdUntil`, do not force that occupant. Leave the spot to the normal day loop so the player can be dropped.

Do not change opponent streaming. Do not pass `forcedAdds` into the opponent-only `buildStreamingPlan` call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts`

Expected: PASS, including the previous streaming plan tests. `rejectedAddLocks` defaults to `[]` on plans that have no locks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts src/lib/matchup/types.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): hold a forced streaming add through the chosen day"
```

---

### Task 3: Picker, hold-end clicks, and one-spot replan

**Files:**
- Create: `src/components/matchup/AddOverridePicker.tsx`
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Test: `tests/unit/streamingAddOverride.test.ts` (lock-clear rule only if a pure helper is added; the picker behavior is covered by the planner tests plus the helper tests)

**Interfaces:**
- Consumes: `StreamingAddLock`, `addOverrideCandidates`, `playersLockedOnDate`, exported `streamingHoldUntil`, `buildStreamingPlan`, `StreamingPlan.rejectedAddLocks`
- Produces: panel state `addLocksBySpotCount`, displayed plans where only `previewSpotCount` is rebuilt with `forcedAdds`, and `onPlansBuilt` payload `{ plans, baselinePlans, noneOpponentPlan }`

- [ ] **Step 1: Write the failing test**

Extend `tests/unit/streamingAddOverride.test.ts` with the lock identity the panel will use when the user picks the current recommendation:

```ts
import { lockAfterPick } from "@/lib/matchup/streamingAddOverride"

it("clears the lock when the picked player is already the recommendation", () => {
  const current = [
    {
      date: "2026-10-20",
      spotIndex: 0,
      playerId: "wire-a",
      holdUntil: "2026-10-22",
    },
  ]
  expect(
    lockAfterPick(current, {
      date: "2026-10-20",
      spotIndex: 0,
      playerId: "wire-rec",
      holdUntil: "2026-10-22",
      recommendedPlayerId: "wire-rec",
    }),
  ).toEqual([])
  expect(
    lockAfterPick(current, {
      date: "2026-10-20",
      spotIndex: 0,
      playerId: "wire-other",
      holdUntil: "2026-10-21",
      recommendedPlayerId: "wire-rec",
    }),
  ).toEqual([
    {
      date: "2026-10-20",
      spotIndex: 0,
      playerId: "wire-other",
      holdUntil: "2026-10-21",
    },
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingAddOverride.test.ts`

Expected: FAIL because `lockAfterPick` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `streamingAddOverride.ts`:

```ts
export const lockAfterPick = (
  locks: readonly StreamingAddLock[],
  pick: StreamingAddLock & { recommendedPlayerId: string | null },
): StreamingAddLock[] => {
  const rest = locks.filter(
    (lock) => lock.date !== pick.date || lock.spotIndex !== pick.spotIndex,
  )
  if (pick.playerId === pick.recommendedPlayerId) return rest
  return [
    ...rest,
    {
      date: pick.date,
      spotIndex: pick.spotIndex,
      playerId: pick.playerId,
      holdUntil: pick.holdUntil,
    },
  ]
}
```

Create `src/components/matchup/AddOverridePicker.tsx` without semicolons. Props:

```ts
type AddOverridePickerProps = {
  alternatives: SeasonPlayer[]
  results: SeasonPlayer[]
  query: string
  error: string | null
  canRevert: boolean
  onQueryChange: (value: string) => void
  onPick: (playerId: string) => void
  onRevert: () => void
  onClose: () => void
}
```

Render a `div` with `role="dialog"` and `aria-label="Replace add"`. List alternatives first as buttons. Then an `input` with `aria-label="Search free agents"` whose `onChange` only calls `onQueryChange`. Then the filtered `results`, excluding ids already shown as alternatives. If `error` is set, show that sentence. If `canRevert` is set, show a button labeled `Use recommendation` that calls `onRevert`. A close button calls `onClose`.

In `StreamingPlansPanel.tsx`:

- Keep the existing `plans` memo as the baseline, built without `forcedAdds`.
- State: `addLocksBySpotCount: Partial<Record<1 | 2 | 3, StreamingAddLock[]>>`, `picker: { date: string; spotIndex: number } | null`, `query: string`, `addOverrideError: string | null`.
- Clear `addLocksBySpotCount` when `addBudget`, `opponentTeamIndex`, or `schedule.matchup.days.join()` changes. Do not clear it when `puntCategoryIds` or `statWindow` changes.
- `lockedPlan` memo: when `previewSpotCount` is set and that count has locks, call `buildStreamingPlan` once with the same arguments as the baseline plus `forcedAdds`. Replace only that spot count inside the plans array passed to `onPlansBuilt`.
- Extend `onPlansBuilt` payload with `baselinePlans: StreamingPlan[]`. Pass baseline plans as `plans` when the on-screen count has no locks.
- After `lockedPlan` is computed, if `rejectedAddLocks` contains a lock still in state, remove those locks and set `addOverrideError` to `Can't add this player.` Leave the picker open.
- Add-cell click for an add or drop-add opens the picker. Drop rows do not.
- On a locked spot, a click on a later matchup day from the day after the add through the week end updates that lock's `holdUntil` and does not open the picker. Clicking the add date opens the picker.
- `onPick` uses `lockAfterPick`. `holdUntil` is `streamingHoldUntil(player, date, previewSpotCount, schedule)` unless a lock for that cell already has a later `holdUntil`, in which case keep the existing `holdUntil` when only the player changes if it is still on or after the add date. A new pick with no prior lock uses `streamingHoldUntil`.
- `onRevert` removes the lock for that date and spot.
- `query` is not an input to `buildStreamingPlan`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingAddOverride.test.ts tests/unit/streamingPlans.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingAddOverride.ts src/components/matchup/AddOverridePicker.tsx src/components/matchup/StreamingPlansPanel.tsx tests/unit/streamingAddOverride.test.ts
git commit -m "feat(matchup): pick a streaming add and choose its hold end"
```

---

### Task 4: Show category deltas on the matchup board

**Files:**
- Modify: `src/components/matchup/MatchupBoard.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Test: `tests/unit/MatchupBoard.test.tsx`

**Interfaces:**
- Consumes: `categoryTotalDeltas`, `formatCategoryStatDelta`, `onPlansBuilt` payload `{ plans, baselinePlans, noneOpponentPlan }`
- Produces: `MatchupBoard` prop `categoryDeltas?: Partial<Record<CategoryId, number>>`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/MatchupBoard.test.tsx` inside the existing describe:

```tsx
it("shows a category delta only when one is passed", () => {
  render(<MatchupBoard board={board} categoryDeltas={{ PTS: 2, TO: -1 }} />)
  expect(screen.getByText("+2.0")).toBeInTheDocument()
  expect(screen.getByText("-1.0")).toBeInTheDocument()
  expect(screen.queryByText("+0.0")).not.toBeInTheDocument()
})
```

The fixture `board` in that file already has PTS and TO rows. `formatCategoryStatDelta` renders `+2.0` and `-1.0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupBoard.test.tsx`

Expected: FAIL because `categoryDeltas` is ignored and `+2.0` is absent.

- [ ] **Step 3: Write minimal implementation**

`MatchupBoard` accepts optional `categoryDeltas`. Under the You total for a category, when `categoryDeltas[row.categoryId]` is a non-zero number, render:

```tsx
<span className="mt-0.5 block text-[0.625rem] text-[var(--color-mute)]">
  {formatCategoryStatDelta(row.categoryId, categoryDeltas[row.categoryId]!)}
</span>
```

In `MatchupWorkspace`, store `baselinePlans` from `onPlansBuilt`. When the on-screen spot count has at least one add lock, build a second board from the baseline plan for that spot count with the same `applyStreamingPlanPreview` path as `liveBoard`, then pass `categoryTotalDeltas(liveBoard, baselineLiveBoard)`. When that count has no locks, pass `categoryDeltas={undefined}`.

Update the `handlePlansBuilt` payload type to include `baselinePlans: StreamingPlan[]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupBoard.test.tsx tests/unit/streamingAddOverride.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/MatchupBoard.tsx src/components/matchup/MatchupWorkspace.tsx tests/unit/MatchupBoard.test.tsx
git commit -m "feat(matchup): show streaming override deltas on the board"
```
