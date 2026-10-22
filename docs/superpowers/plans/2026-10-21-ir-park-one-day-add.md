# IR park one-day add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user park a no-game active player on an empty IR slot from the streaming drop box, then add a one-day streamer into the seat that player leaves.

**Architecture:** A pure helper builds `ir:<playerId>` options. The drop select stores that value as a forced roster drop. `buildStreamingPlan` records `rosterDropKind: "ir"` and does not waive the player. `applyStreamingPlanPreview` keeps them on IR through the week and leaves their former active seat empty after the add date.

**Tech Stack:** TypeScript, Vitest, React select in `StreamingPlansPanel`.

## Global Constraints

- Option label is `To IR · <player name>`. Value is `ir:<playerId>`.
- Show the option only when IR is empty, the player has no game that date, and the player is in an active slot that day.
- A non-OUT player’s option reads `To IR · <player name> (after OUT)`. An OUT player has no parenthetical.
- A stored `ir:` value that no longer qualifies becomes Hold. Nobody is parked.
- The add spends one weekly acquisition. Parking is not a drop.
- Preview: parked player is on IR from the chosen date through the shown week. The add sits only on the chosen date. Later dates leave that vacated active index empty. No bench promotion into it. No automatic next add. No automatic return.
- The automatic planner never chooses `ir` by itself.
- Opponent plans do not offer this option.
- Match the existing file’s semicolon style in these matchup files.

---

### Task 1: IR park drop options

**Files:**
- Modify: `src/lib/matchup/types.ts` (`StreamingPlanRosterDropKind`)
- Modify: `src/lib/matchup/streamingDropOptions.ts`
- Test: `tests/unit/streamingDropOptions.test.ts`

**Interfaces:**
- Consumes: `SeasonRosterEntry`, `SeasonPlayer`, `playerHasGameOnDate` from `src/lib/matchup/games.ts`, `isActiveSlot` from `src/lib/matchup/constants.ts`
- Produces:
  - `irParkDropValue(playerId: string): string` returns `ir:${playerId}`
  - `parkedPlayerIdFromDropValue(value: string): string | null`
  - `irParkDropOptions(input): { value: string; label: string }[]`
  - `resolveStoredIrParkValue(value: string, options: { value: string }[]): string` returns `value` when it is still listed, otherwise `"hold"`
  - `StreamingPlanRosterDropKind` includes `"ir"`
  - Active candidates come from `entries` whose slot passes `isActiveSlot`. A `BE` or `IL` entry is never an option.

- [ ] **Step 1: Write the failing test**

Add this describe to `tests/unit/streamingDropOptions.test.ts`. Import the new functions. Reuse the local `player()` helper. Give Alpha `teamAbbr: "BOS"` (already the helper default) and a game only on 2026-10-21. Beta has no game on 2026-10-20. Gamma is OUT and has no game.

```ts
import { irParkDropOptions, irParkDropValue, resolveStoredIrParkValue } from "@/lib/matchup/streamingDropOptions"
import type { ScheduleResponse } from "@/lib/season/types"

const schedule = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-10-20",
    endDate: "2026-10-21",
    days: ["2026-10-20", "2026-10-21"],
  },
  games: [{ date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "NYK" }],
} satisfies ScheduleResponse

describe("irParkDropOptions", () => {
  it("lists a no-game active player and marks a non-OUT sitter", () => {
    const options = irParkDropOptions({
      entries: [
        { slot: "SG", playerId: "b" },
        { slot: "IL", playerId: null },
      ],
      playersById: {
        b: { ...player("b", "Beta"), teamAbbr: "NYK" },
      },
      date: "2026-10-20",
      schedule,
    })

    expect(options).toEqual([
      { value: "ir:b", label: "To IR · Beta (after OUT)" },
    ])
    expect(irParkDropValue("b")).toBe("ir:b")
  })

  it("omits the parenthetical when the sitter is already OUT", () => {
    const options = irParkDropOptions({
      entries: [
        { slot: "SG", playerId: "c" },
        { slot: "IL", playerId: null },
      ],
      playersById: {
        c: { ...player("c", "Gamma"), teamAbbr: "NYK", injuryStatus: "out" },
      },
      date: "2026-10-20",
      schedule,
    })

    expect(options).toEqual([{ value: "ir:c", label: "To IR · Gamma" }])
  })

  it("hides a bench player, a player with a game, and every option when IR is occupied", () => {
    const playersById = {
      a: player("a", "Alpha"),
      b: { ...player("b", "Beta"), teamAbbr: "NYK" },
      bench: { ...player("bench", "Bench"), teamAbbr: "NYK" },
    }
    expect(
      irParkDropOptions({
        entries: [
          { slot: "BE", playerId: "bench" },
          { slot: "IL", playerId: null },
        ],
        playersById,
        date: "2026-10-20",
        schedule,
      }),
    ).toEqual([])
    expect(
      irParkDropOptions({
        entries: [
          { slot: "SG", playerId: "b" },
          { slot: "IL", playerId: "kept" },
        ],
        playersById,
        date: "2026-10-20",
        schedule,
      }),
    ).toEqual([])
    expect(
      irParkDropOptions({
        entries: [
          { slot: "SG", playerId: "a" },
          { slot: "IL", playerId: null },
        ],
        playersById,
        date: "2026-10-21",
        schedule,
      }),
    ).toEqual([])
  })

  it("reverts a stale IR choice to Hold", () => {
    expect(resolveStoredIrParkValue("ir:b", [{ value: "ir:b", label: "To IR · Beta" }])).toBe("ir:b")
    expect(resolveStoredIrParkValue("ir:b", [])).toBe("hold")
    expect(resolveStoredIrParkValue("hold", [])).toBe("hold")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/streamingDropOptions.test.ts -t "irParkDropOptions" --reporter=verbose`

Expected: FAIL because `irParkDropOptions` is not exported.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/matchup/types.ts`, change the kind to:

```ts
export type StreamingPlanRosterDropKind = "player" | "open_slot" | "ir" | "none"
```

In `src/lib/matchup/streamingDropOptions.ts` add:

```ts
import { isActiveSlot } from "@/lib/matchup/constants"
import { playerHasGameOnDate } from "@/lib/matchup/games"
import type { ScheduleResponse } from "@/lib/season/types"

export const irParkDropValue = (playerId: string): string => `ir:${playerId}`

export const parkedPlayerIdFromDropValue = (value: string): string | null =>
  value.startsWith("ir:") && value.length > 3 ? value.slice(3) : null

export const irParkDropOptions = (input: {
  entries: SeasonRosterEntry[]
  playersById: Record<string, SeasonPlayer>
  date: string
  schedule: ScheduleResponse
}): { value: string; label: string }[] => {
  const irOccupied = input.entries.some(
    (entry) => entry.slot === "IL" && entry.playerId != null,
  )
  if (irOccupied) return []

  const options: { value: string; label: string }[] = []
  for (const entry of input.entries) {
    if (!isActiveSlot(entry.slot) || !entry.playerId) continue
    const player = input.playersById[entry.playerId]
    if (!player) continue
    if (playerHasGameOnDate(player, input.date, input.schedule)) continue
    const note = player.injuryStatus === "out" ? "" : " (after OUT)"
    options.push({
      value: irParkDropValue(entry.playerId),
      label: `To IR · ${player.name}${note}`,
    })
  }
  return options.sort((left, right) => left.label.localeCompare(right.label))
}

export const resolveStoredIrParkValue = (
  value: string,
  options: readonly { value: string }[],
): string => {
  if (!parkedPlayerIdFromDropValue(value)) return value
  return options.some((option) => option.value === value) ? value : "hold"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/streamingDropOptions.test.ts -t "irParkDropOptions" --reporter=verbose`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/types.ts src/lib/matchup/streamingDropOptions.ts tests/unit/streamingDropOptions.test.ts
git commit -m "feat(matchup): list To IR choices for no-game active players"
```

---

### Task 2: Drop select stores an IR park

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx` (`DropCell`, around the `ensureOptions` and `dropPlanLabel` functions)
- Test: `tests/unit/StreamingPlansPanel.test.tsx` only if an existing roster-drop select test is nearby. Otherwise the Task 1 unit test covers the label and the stale value. Do not add a new render test if the panel test file has no drop-select example.

**Interfaces:**
- Consumes: `irParkDropOptions`, `parkedPlayerIdFromDropValue`, `resolveStoredIrParkValue` from Task 1. The panel already has `rosterEntries`, `playersById`, and the matchup `schedule` in `StreamingPlansPanel` props. Thread `schedule` into `DropCell`.
- Produces: selecting `To IR · Name` calls `onForcedRosterDropChange(key, "ir:<playerId>")`. A closed cell with `rosterDropKind === "ir"` renders `To IR · <name>`.

- [ ] **Step 1: Write the failing behavior into the existing options path**

No new test file. The failure mode is the select never listing `ir:` values. Confirm Task 1 tests still pass before editing the panel.

- [ ] **Step 2: Pass schedule into DropCell and append IR options**

`DropCell` gains `schedule: ScheduleResponse`. At the call site that renders `DropCell`, pass `schedule={schedule}` from the panel props.

Compute `irOptions` once in `DropCell` from the roster entries. `irParkDropOptions` already skips bench and IR entries.

```ts
const irOptions = irParkDropOptions({
  entries: rosterEntries,
  playersById,
  date,
  schedule,
})
const nextValue = resolveStoredIrParkValue(value, irOptions)
if (nextValue !== value) onForcedRosterDropChange(key, "hold")
```

Inside `ensureOptions`, return the existing `rosterDropSelectOptions(...)` list followed by `irOptions`.

`handleChange` already forwards unknown strings, so `ir:<id>` is stored without a new branch. Add an early return only so `ir:` is not passed through `playerName` for the closed label:

```ts
const closedLabel = parkedPlayerIdFromDropValue(value)
  ? (irOptions.find((option) => option.value === value)?.label ??
    `To IR · ${playerName(parkedPlayerIdFromDropValue(value) ?? "", playersById)}`)
  : value === "hold"
    ? "Hold"
    : value === "open_slot"
      ? "Open slot"
      : playerName(value, playersById)
```

Compute `irOptions` once above `closedLabel`, not only inside `ensureOptions`, using the same inputs. `dropPlanLabel` for a past date:

```ts
if (cell.rosterDropKind === "ir" && cell.rosterDropPlayerId) {
  const player = playersById[cell.rosterDropPlayerId]
  const note = player?.injuryStatus === "out" ? "" : " (after OUT)"
  return `To IR · ${playerName(cell.rosterDropPlayerId, playersById)}${note}`
}
```

- [ ] **Step 3: Run the drop-option tests**

Run: `npx vitest run tests/unit/streamingDropOptions.test.ts --reporter=dot`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/matchup/StreamingPlansPanel.tsx
git commit -m "feat(matchup): offer To IR in the streaming drop box"
```

---

### Task 3: Honor the IR park in the plan and preview

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (forced-drop branch near the `forced === "open_slot"` check, about line 2720, and the forced-add branch near line 1712)
- Modify: `src/lib/matchup/applyStreamingPlanPreview.ts`
- Test: `tests/unit/streamingPlans.test.ts`
- Test: `tests/unit/applyStreamingPlanPreview.test.ts`

**Interfaces:**
- Consumes: `parkedPlayerIdFromDropValue` from Task 1. `StreamingPlanRosterDropKind` `"ir"`. `forcedRosterDrops` values may be `ir:<playerId>`.
- Produces: a cell with `rosterDropKind: "ir"`, `rosterDropPlayerId` set to the parked id, `droppedPlayerId: null`, and an add on that date. Preview daily lineups place that id on `IL` from that date forward and leave the vacated active index empty on later dates.

- [ ] **Step 1: Write the failing planner test**

In `tests/unit/streamingPlans.test.ts`, inside `describe("buildStreamingPlan")`, add a test that uses `tinyState`, `player`, `tinySchedule`, and `emptyBoardLosingStl` already in that file. Roster: one active `SG` player `sit` on BOS who plays only 2026-10-21, empty `IL`, and free agent `fa-add` on NYK who plays 2026-10-20. Force the drop `ir:sit` on the first day.

```ts
it("parks a no-game active player on IR when the drop value says so", () => {
  const days = ["2026-10-20", "2026-10-21"]
  const sit = player("sit", "BOS", { positions: ["SG"] })
  const add = player("fa-add", "NYK", {
    positions: ["SG"],
    projections: { ...baseProjections(), STL: 200 },
  })
  const state = tinyState([sit, add], ["fa-add"])
  state.teams[0]!.entries = [
    { slot: "SG", playerId: "sit" },
    { slot: "IL", playerId: null },
  ]
  const schedule = tinySchedule(days, [
    { date: "2026-10-20", homeAbbr: "NYK", awayAbbr: "CHI" },
    { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "CHI" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    addLimit: 2,
    forcedRosterDrops: { "2026-10-20:0": "ir:sit" },
  })

  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "add",
    playerId: "fa-add",
    droppedPlayerId: null,
    rosterDropKind: "ir",
    rosterDropPlayerId: "sit",
  })
  expect(plan.days[1]!.cells[0]!.playerId).toBeNull()
})
```

- [ ] **Step 2: Run the planner test to verify it fails**

Run: `npx vitest run tests/unit/streamingPlans.test.ts -t "parks a no-game active player on IR" --reporter=verbose`

Expected: FAIL. `rosterDropKind` is not `"ir"`.

- [ ] **Step 3: Teach the planner the `ir:` drop**

Import `parkedPlayerIdFromDropValue` into `streamingPlans.ts`.

In both forced-drop sites (the forced-add block that checks `forcedDrop === "open_slot"`, and the fill loop that checks `forced === "open_slot"`), handle `ir:` before any player-id drop check:

```ts
const parkedId = typeof forced === "string" ? parkedPlayerIdFromDropValue(forced) : null
if (parkedId) {
  const parked = playersById.get(parkedId)
  const irOccupied = (youTeam?.entries ?? []).some(
    (entry) => entry.slot === "IL" && entry.playerId != null,
  )
  const onActiveRoster = (youTeam?.entries ?? []).some(
    (entry) => isActiveSlot(entry.slot) && entry.playerId === parkedId,
  )
  const sitsOut = Boolean(
    parked && !playerHasGameOnDate(parked, date, schedule),
  )
  if (!parked || irOccupied || !onActiveRoster || !sitsOut) {
    action = "hold"
    playerId = previousId
  } else {
    rosterDrop = { kind: "none", playerId: null }
    rosterDropKind = "ir"
    rosterDropPlayerId = parkedId
    picked = tryMove({ kind: "none", playerId: null }, false)
  }
}
```

Use the local variable names of each site (`forced` vs `forcedDrop`). On the forced-add site, an invalid park pushes the lock onto `rejectedAddLocks` and `continue`s, matching the open-slot rejection there. Do not add `parkedId` to `weekDroppedPlayers`.

When the cell is written, `rosterDropKind === "ir"` must survive the later assignment that copies `rosterDrop.kind`. If that copy overwrites `"ir"` with `"none"`, set `rosterDropKind = "ir"` and `rosterDropPlayerId = parkedId` again immediately before `cells[spotIndex] = { ... }`.

- [ ] **Step 4: Write the failing preview test**

In `tests/unit/applyStreamingPlanPreview.test.ts`, add this test inside `describe("applyStreamingPlanPreview")`. Reuse `player`, `emptyCell`, `plan`, and `DAYS` from that file. `withStarter` fills `PG` and has no `IL` row, so append an empty `IL` entry.

```ts
it("parks the IR player through the week and leaves the next day empty", () => {
  const sit = player("sit", "NYK")
  const add = player("fa-add", "BOS", { projections: { STL: 5, PTS: 20 } })
  const schedule: ScheduleResponse = {
    source: "fixture",
    matchup: {
      scoringPeriodId: 1,
      startDate: DAYS[0],
      endDate: DAYS[1],
      days: [DAYS[0], DAYS[1]],
    },
    games: [
      { date: DAYS[0], homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: DAYS[1], homeAbbr: "MEM", awayAbbr: "NYK" },
    ],
  }
  const lineup = (): SeasonRosterEntry[] => [
    ...withStarter("sit"),
    { slot: "IL", playerId: null },
  ]
  const baseDaily: DailyLineups = {
    [DAYS[0]]: lineup(),
    [DAYS[1]]: lineup(),
  }
  const previewPlan = plan(1, [
    {
      date: DAYS[0],
      cells: [
        {
          spotIndex: 0,
          playerId: "fa-add",
          action: "add",
          droppedPlayerId: null,
          rosterDropPlayerId: "sit",
          rosterDropKind: "ir",
          addIndex: 1,
          alternativePlayerIds: [],
          targetCategoryIds: [],
        },
      ],
    },
    { date: DAYS[1], cells: [emptyCell(0)] },
  ])

  const preview = applyStreamingPlanPreview(
    baseDaily,
    previewPlan,
    { sit, "fa-add": add },
    schedule,
  )

  const day0 = preview[DAYS[0]]!
  const day1 = preview[DAYS[1]]!
  expect(day0.find((entry) => entry.slot === "IL")?.playerId).toBe("sit")
  expect(day0.some((entry) => entry.slot !== "IL" && entry.playerId === "fa-add")).toBe(true)
  expect(day0.some((entry) => entry.slot !== "IL" && entry.playerId === "sit")).toBe(false)
  expect(day1.find((entry) => entry.slot === "IL")?.playerId).toBe("sit")
  expect(day1[0]?.playerId).toBeNull()
  expect(day1.some((entry) => entry.slot !== "IL" && entry.playerId === "sit")).toBe(false)
  expect(day1.some((entry) => entry.playerId === "fa-add")).toBe(false)
})
```

- [ ] **Step 5: Run the preview test to verify it fails**

Run: `npx vitest run tests/unit/applyStreamingPlanPreview.test.ts -t "parks the IR player through the week" --reporter=verbose`

Expected: FAIL because `sit` is still in `SG`.

- [ ] **Step 6: Park the player in the preview**

In `applyStreamingPlanPreview`, before `seatPlayingRosterOnDate` runs for later days, collect IR parks:

```ts
const blockedActiveIndexes = new Set<string>()
for (const day of plan.days) {
  for (const cell of day.cells) {
    if (cell.rosterDropKind !== "ir" || !cell.rosterDropPlayerId) continue
    const parkedId = cell.rosterDropPlayerId
    for (const date of matchupDays) {
      if (date < day.date) continue
      const entries = next[date] ?? []
      let vacatedIndex: number | null = null
      const irOpen = entries.some((entry) => entry.slot === "IL" && entry.playerId == null)
      if (!irOpen && !entries.some((entry) => entry.slot === "IL" && entry.playerId === parkedId)) {
        continue
      }
      next[date] = entries.map((entry, index) => {
        if (entry.slot === "IL") {
          return entry.playerId == null || entry.playerId === parkedId
            ? { ...entry, playerId: parkedId }
            : entry
        }
        if (entry.playerId !== parkedId) return entry
        vacatedIndex = index
        return { ...entry, playerId: null }
      })
      if (date > day.date && vacatedIndex != null) {
        blockedActiveIndexes.add(`${date}:${vacatedIndex}`)
      }
    }
  }
}
```

When `seatPlayingRosterOnDate` and the later streamer seat loops write into `next[date]`, skip an index whose `${date}:${index}` is in `blockedActiveIndexes`. Also skip seating a parked player id on any date on or after their park date, including a later date when that player has a game. The chosen add date is not index-blocked, so the add can take the vacated seat that day. The parked id stays on `IL` only.

- [ ] **Step 7: Run both new tests**

Run: `npx vitest run tests/unit/streamingPlans.test.ts tests/unit/applyStreamingPlanPreview.test.ts -t "parks a no-game active player on IR|parks the IR player through the week" --reporter=verbose`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts src/lib/matchup/applyStreamingPlanPreview.ts tests/unit/streamingPlans.test.ts tests/unit/applyStreamingPlanPreview.test.ts
git commit -m "feat(matchup): park a sitter on IR for a one-day add"
```
