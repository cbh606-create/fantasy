# Past day actual swaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep matchup days before today locked and blank until the user records the real add and drop, then plan the rest of the week from those records.

**Architecture:** A small storage module owns the swap list and the daily-lineup replay. `buildStreamingPlan` uses that replay only when the caller passes the list, so opponent plans stay on the old path. The streaming grid reads and writes the list from `localStorage` and opens the existing add and drop controls for one past day at a time.

**Tech Stack:** TypeScript, Vitest, React, `localStorage`.

## Global Constraints

- A past day is a matchup date before `today`. Today and later dates stay the planning grid they are now.
- Past add and drop cells render `—` until a record exists. The day has one control, `실제 교체`. Opponent plans do not get it.
- Pressing `실제 교체` opens that day's existing add picker and drop box for every spot on the plan being viewed. Each change is stored immediately. Pressing it again locks the day.
- A spot with no added player shows `—` in the add cell and spends no acquisition. A player drop or `To IR` on that spot still applies. `open_slot` and `hold` remove nobody.
- A filled spot shows the recorded add name and the recorded drop label (no drop renders `—`, a player renders that name, `Open slot` and `To IR · <name>` stay as they do today).
- The existing Suggested button (`aria-label="Reset to suggested plan"`) clears today-and-later overrides only. It does not clear past records. The user clears a past spot by opening `실제 교체` and emptying that spot.
- Records are one list for the matchup week, shared by the 1-spot, 2-spot, and 3-spot plans. Each record is a date, a spot index, the added player id or empty, and the drop value (`hold`, `open_slot`, `ir:<playerId>`, or a player id).
- Store them in `localStorage` for that league and that matchup's start date. A refresh keeps them. The next matchup week does not reuse them. Today-and-later overrides stay in memory only.
- For every date before today on the user's plan, the planner creates no add and no drop of its own. A recorded add the stream rules would reject stays in that cell.
- The added player joins the roster from the add date forward, until a later recorded drop or a later planned drop removes them. A later past day with no record still renders `—`.
- Spot indexes above the plan on screen still count. A swap saved in spot 1 changes the roster and the acquisition count on the 1-spot plan.
- Do not edit opponent past days, read ESPN transactions, change how today is planned, or draw a suggested swap on a past day.
- Match the semicolon style of the file you edit. Commit with `git -c user.name=cbh606-create -c user.email=cbh606@gmail.com`. Never update git config. PowerShell does not accept `&&`. Do not stage `API Keys.txt`, `token code.txt`, `tmp-old-enumerate.ts`, or plan files.

---

### Task 1: Past swap records and roster replay

**Files:**
- Create: `src/lib/matchup/pastActualSwaps.ts`
- Test: `tests/unit/pastActualSwaps.test.ts`

**Interfaces:**
- Consumes: `DailyLineups` from `src/lib/matchup/dailyLineups.ts`, `StreamingPlanDayCell` from `src/lib/matchup/types.ts`
- Produces:
  - `PastActualSwap = { date: string; spotIndex: number; addedPlayerId: string | null; drop: string }`
  - `pastActualStorageKey(leagueId: string, matchupStart: string): string` returns `matchup-past-swaps:${leagueId}:${matchupStart}`
  - `parsePastActualSwaps(raw: string | null): PastActualSwap[]`
  - `readPastActualSwaps(leagueId: string, matchupStart: string, storage?: Pick<Storage, "getItem" | "setItem">): PastActualSwap[]`
  - `writePastActualSwaps(leagueId: string, matchupStart: string, swaps: readonly PastActualSwap[], storage?: Pick<Storage, "getItem" | "setItem">): void`
  - `upsertPastActualSwap(swaps: readonly PastActualSwap[], swap: PastActualSwap): PastActualSwap[]`
  - `clearPastActualSpot(swaps: readonly PastActualSwap[], date: string, spotIndex: number): PastActualSwap[]`
  - `pastActualCell(swap: PastActualSwap | undefined, spotIndex: number, nextAddIndex: number): StreamingPlanDayCell`
  - `applyPastSwapToDaily(daily: DailyLineups, swap: PastActualSwap, fromDate: string, days: readonly string[]): DailyLineups`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pastActualSwaps.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import {
  applyPastSwapToDaily,
  clearPastActualSpot,
  parsePastActualSwaps,
  pastActualCell,
  pastActualStorageKey,
  readPastActualSwaps,
  upsertPastActualSwap,
  writePastActualSwaps,
} from "@/lib/matchup/pastActualSwaps"

const memory = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe("pastActualSwaps", () => {
  it("keeps a record for one matchup week only", () => {
    const storage = memory()
    const swap = {
      date: "2026-10-20",
      spotIndex: 0,
      addedPlayerId: "fa-add",
      drop: "sit",
    }
    writePastActualSwaps("league-a", "2026-10-19", [swap], storage)

    expect(pastActualStorageKey("league-a", "2026-10-19")).toBe(
      "matchup-past-swaps:league-a:2026-10-19",
    )
    expect(readPastActualSwaps("league-a", "2026-10-19", storage)).toEqual([swap])
    expect(readPastActualSwaps("league-a", "2026-10-26", storage)).toEqual([])
    expect(parsePastActualSwaps("not-json")).toEqual([])
  })

  it("replaces the same date and spot and can clear it", () => {
    const first = {
      date: "2026-10-20",
      spotIndex: 0,
      addedPlayerId: "fa-add",
      drop: "sit",
    }
    const next = { ...first, addedPlayerId: "fa-other" }
    const saved = upsertPastActualSwap([first], next)
    expect(saved).toEqual([next])
    expect(clearPastActualSpot(saved, "2026-10-20", 0)).toEqual([])
  })

  it("builds an empty cell when nothing was added and a drop-add cell when someone was", () => {
    expect(pastActualCell(undefined, 0, 3)).toMatchObject({
      spotIndex: 0,
      playerId: null,
      action: "empty",
      addIndex: null,
      rosterDropKind: "none",
    })
    expect(
      pastActualCell(
        {
          date: "2026-10-20",
          spotIndex: 1,
          addedPlayerId: "fa-add",
          drop: "sit",
        },
        1,
        3,
      ),
    ).toMatchObject({
      spotIndex: 1,
      playerId: "fa-add",
      action: "drop_add",
      droppedPlayerId: "sit",
      rosterDropKind: "player",
      rosterDropPlayerId: "sit",
      addIndex: 4,
    })
    expect(
      pastActualCell(
        {
          date: "2026-10-20",
          spotIndex: 0,
          addedPlayerId: null,
          drop: "ir:sit",
        },
        0,
        3,
      ),
    ).toMatchObject({
      playerId: null,
      action: "empty",
      addIndex: null,
      rosterDropKind: "ir",
      rosterDropPlayerId: "sit",
    })
  })

  it("removes a dropped player and seats the add from that date forward", () => {
    const days = ["2026-10-20", "2026-10-21"]
    const lineup = [
      { slot: "SG" as const, playerId: "sit" },
      { slot: "IL" as const, playerId: null },
    ]
    const daily: DailyLineups = {
      [days[0]!]: lineup.map((entry) => ({ ...entry })),
      [days[1]!]: lineup.map((entry) => ({ ...entry })),
    }
    const next = applyPastSwapToDaily(
      daily,
      {
        date: days[0]!,
        spotIndex: 0,
        addedPlayerId: "fa-add",
        drop: "sit",
      },
      days[0]!,
      days,
    )

    expect(next[days[0]!]?.some((entry) => entry.playerId === "sit")).toBe(false)
    expect(next[days[0]!]?.some((entry) => entry.playerId === "fa-add")).toBe(true)
    expect(next[days[1]!]?.some((entry) => entry.playerId === "sit")).toBe(false)
    expect(next[days[1]!]?.some((entry) => entry.playerId === "fa-add")).toBe(true)
  })

  it("parks a To IR drop on IL and does not remove anyone for hold", () => {
    const days = ["2026-10-20"]
    const daily: DailyLineups = {
      [days[0]!]: [
        { slot: "SG", playerId: "sit" },
        { slot: "IL", playerId: null },
      ],
    }
    const parked = applyPastSwapToDaily(
      daily,
      {
        date: days[0]!,
        spotIndex: 0,
        addedPlayerId: "fa-add",
        drop: "ir:sit",
      },
      days[0]!,
      days,
    )
    expect(parked[days[0]!]?.find((entry) => entry.slot === "IL")?.playerId).toBe("sit")
    expect(parked[days[0]!]?.some((entry) => entry.slot !== "IL" && entry.playerId === "sit")).toBe(false)

    const held = applyPastSwapToDaily(
      daily,
      {
        date: days[0]!,
        spotIndex: 0,
        addedPlayerId: null,
        drop: "hold",
      },
      days[0]!,
      days,
    )
    expect(held[days[0]!]?.find((entry) => entry.slot === "SG")?.playerId).toBe("sit")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/pastActualSwaps.test.ts --reporter=verbose`

Expected: FAIL because `@/lib/matchup/pastActualSwaps` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/matchup/pastActualSwaps.ts`. Do not use semicolons. `pastActualCell` sets `droppedPlayerId` to the player id only when `drop` is a raw player id. `ir:` and `hold` and `open_slot` set `droppedPlayerId` to null. `action` is `drop_add` only when there is an added player and a raw player drop. Otherwise an added player is `add`. No added player is `empty` and `addIndex` is null. An added player uses `nextAddIndex + 1`.

`applyPastSwapToDaily` copies `daily`. For each date in `days` that is greater than or equal to `fromDate`:

- When `drop` starts with `ir:` and the rest is non-empty, set the empty `IL` entry to that id when `IL` is empty or already that id, and set every other entry with that id to null.
- When `drop` is not `hold`, not `open_slot`, and not an `ir:` value, set every entry with that player id to null.
- When `addedPlayerId` is set and no entry already has it, write it into the first entry whose `playerId` is null and whose `slot` is not `IL` or `BE`.

`upsertPastActualSwap` replaces the record with the same `date` and `spotIndex`. `clearPastActualSpot` removes it. `parsePastActualSwaps` returns `[]` for null, invalid JSON, or a non-array. `readPastActualSwaps` and `writePastActualSwaps` use `pastActualStorageKey`. Default the storage argument to `localStorage` only inside the function body, so importing the module does not touch `window`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/pastActualSwaps.test.ts --reporter=verbose`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/pastActualSwaps.ts tests/unit/pastActualSwaps.test.ts
git -c user.name=cbh606-create -c user.email=cbh606@gmail.com commit -m "feat(matchup): store actual swaps for a matchup week"
```

---

### Task 2: User plans skip invented past swaps

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (`BuildStreamingPlanInput` and the spot loop that starts near `for (let spotIndex = 0`)
- Test: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: `PastActualSwap`, `applyPastSwapToDaily`, `pastActualCell` from Task 1
- Produces: `BuildStreamingPlanInput.pastActualSwaps?: readonly PastActualSwap[]`. When the array is passed, dates before `today` write only those records. When it is omitted, past days keep their current behavior. Opponent plan builds omit the field.

- [ ] **Step 1: Write the failing test**

Inside `describe("buildStreamingPlan")` in `tests/unit/streamingPlans.test.ts`, add this test. Reuse `player`, `tinyState`, `tinySchedule`, and `emptyBoardLosingStl` from that file.

```ts
it("leaves past days empty unless an actual swap was recorded", () => {
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
  const blank = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    addLimit: 4,
    today: "2026-10-21",
    pastActualSwaps: [],
  })

  expect(blank.days[0]!.cells[0]).toMatchObject({
    playerId: null,
    action: "empty",
  })

  const recorded = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    addLimit: 4,
    today: "2026-10-21",
    pastActualSwaps: [
      {
        date: "2026-10-20",
        spotIndex: 0,
        addedPlayerId: "fa-out",
        drop: "sit",
      },
    ],
  })

  expect(recorded.days[0]!.cells[0]).toMatchObject({
    playerId: "fa-out",
    action: "drop_add",
    rosterDropPlayerId: "sit",
    addIndex: 1,
  })
  expect(recorded.addsUsed).toBeGreaterThanOrEqual(1)
})

it("counts a past swap stored on a higher spot", () => {
  const days = ["2026-10-20", "2026-10-21"]
  const sit = player("sit", "BOS", { positions: ["SG"] })
  const add = player("fa-add", "NYK", {
    positions: ["SG"],
    projections: { ...baseProjections(), STL: 200 },
  })
  const state = tinyState([sit, add], ["fa-add"])
  state.teams[0]!.entries = [{ slot: "SG", playerId: "sit" }]
  const schedule = tinySchedule(days, [
    { date: "2026-10-20", homeAbbr: "NYK", awayAbbr: "CHI" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    addLimit: 4,
    today: "2026-10-21",
    pastActualSwaps: [
      {
        date: "2026-10-20",
        spotIndex: 1,
        addedPlayerId: "fa-add",
        drop: "hold",
      },
    ],
  })

  expect(plan.days[0]!.cells[0]).toMatchObject({ playerId: null, action: "empty" })
  expect(plan.addsUsed).toBeGreaterThanOrEqual(1)
})
```

`fa-out` is not in `state.players`. That is the point: the cell keeps the recorded id even though the stream rules cannot pick that player.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/streamingPlans.test.ts -t "leaves past days empty unless an actual swap was recorded|counts a past swap stored on a higher spot" --reporter=verbose`

Expected: FAIL because `pastActualSwaps` is not an input, or the past day still has a generated player.

- [ ] **Step 3: Write the minimal implementation**

Add `pastActualSwaps?: readonly PastActualSwap[]` to `BuildStreamingPlanInput` and destructure it next to `today`. Import `applyPastSwapToDaily` and `pastActualCell` from `./pastActualSwaps`.

At the first line inside `for (let spotIndex = 0; spotIndex < spotCount; spotIndex++)`, before `forcedToday` and before any hold, insert:

```ts
if (pastActualSwaps && today && date < today) {
  const swap = pastActualSwaps.find(
    (item) => item.date === date && item.spotIndex === spotIndex,
  )
  const cell = pastActualCell(swap, spotIndex, addsUsed)
  if (swap?.addedPlayerId) {
    addsUsed += 1
    addsBySpot[spotIndex]! += 1
  }
  if (swap) {
    workingDaily = applyPastSwapToDaily(
      workingDaily,
      swap,
      date,
      schedule.matchup.days,
    )
  }
  occupants[spotIndex] = null
  cells[spotIndex] = cell
  continue
}
```

After that spot loop, still inside the day loop, apply records the visible plan has no cell for:

```ts
if (pastActualSwaps && today && date < today) {
  for (const swap of pastActualSwaps) {
    if (swap.date !== date || swap.spotIndex < spotCount) continue
    if (swap.addedPlayerId) addsUsed += 1
    workingDaily = applyPastSwapToDaily(
      workingDaily,
      swap,
      date,
      schedule.matchup.days,
    )
  }
}
```

Do not pass `pastActualSwaps` into `buildOpponentSelfPlan`'s inner `buildStreamingPlan` call. Do not change the `youIdle` path except for this early continue, which runs only when the array is present.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/streamingPlans.test.ts -t "leaves past days empty unless an actual swap was recorded|counts a past swap stored on a higher spot" --reporter=verbose`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git -c user.name=cbh606-create -c user.email=cbh606@gmail.com commit -m "feat(matchup): plan the week from recorded past swaps"
```

---

### Task 3: Record a past day from the streaming grid

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx` (`AddCell`, `DropCell`, the date header, the three `buildStreamingPlan` calls, `handleResetToSuggested`)
- Test: `tests/unit/StreamingPlansPanel.test.tsx`

**Interfaces:**
- Consumes: `readPastActualSwaps`, `writePastActualSwaps`, `upsertPastActualSwap`, `clearPastActualSpot`, `PastActualSwap` from Task 1. `BuildStreamingPlanInput.pastActualSwaps` from Task 2.
- Produces: the user's three plans receive the same stored list. The Suggested button does not write an empty list over it.

- [ ] **Step 1: Write the failing test**

In `tests/unit/StreamingPlansPanel.test.tsx`, add this test inside `describe("StreamingPlansPanel")`. Reuse `board`, `dropState`, and `dropSchedule`. Extend the schedule to two days inside the test.

```ts
it("keeps a past day blank until the actual swap is recorded", async () => {
  const storage = window.localStorage
  storage.clear()
  const past = "2025-11-03"
  const today = "2025-11-04"
  const twoDaySchedule: ScheduleResponse = {
    ...dropSchedule,
    matchup: {
      ...dropSchedule.matchup,
      startDate: past,
      endDate: today,
      days: [past, today],
    },
  }

  render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg-past"
      playersById={{}}
      schedule={twoDaySchedule}
      state={dropState}
      today={today}
    />,
  )

  const pastDropName = new RegExp(
    `roster drop ${formatMatchupDayLabel(past)}`,
    "i",
  )
  expect(screen.queryByRole("combobox", { name: pastDropName })).toBeNull()
  fireEvent.click(screen.getAllByRole("button", { name: "실제 교체" })[0]!)

  const drop = await screen.findByRole("combobox", { name: pastDropName })
  fireEvent.change(drop, { target: { value: "you-idle" } })
  fireEvent.click(screen.getAllByRole("button", { name: "실제 교체" })[0]!)
  expect(screen.queryByRole("combobox", { name: pastDropName })).toBeNull()

  cleanup()
  render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg-past"
      playersById={{}}
      schedule={twoDaySchedule}
      state={dropState}
      today={today}
    />,
  )
  expect(screen.getAllByText("No Game Cut").length).toBeGreaterThan(0)

  fireEvent.click(screen.getByRole("button", { name: "Reset to suggested plan" }))
  expect(screen.getAllByText("No Game Cut").length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/StreamingPlansPanel.test.tsx -t "keeps a past day blank until the actual swap is recorded" --reporter=verbose`

Expected: FAIL because there is no button named `실제 교체`.

- [ ] **Step 3: Write the minimal implementation**

Load swaps with `readPastActualSwaps(leagueId, schedule.matchup.startDate)` into state. Write them back with `writePastActualSwaps` whenever that state changes.

Pass `pastActualSwaps` into each of the three user `buildStreamingPlan` calls. Do not pass it into an opponent build.

Keep `recording` as `{ spotCount: 1 | 2 | 3; date: string } | null`. In the date header, when `date < today`, render a button:

```tsx
<button
  type="button"
  aria-label="실제 교체"
  onClick={() =>
    setRecording((current) =>
      current?.spotCount === plan.spotCount && current.date === date
        ? null
        : { spotCount: plan.spotCount, date },
    )
  }
>
  실제 교체
</button>
```

Pass `recordingPast={recording?.spotCount === plan.spotCount && recording.date === date}` into `AddCell` and `DropCell`.

In both cells, when `isPastStreamingDate(date, today)` and `recordingPast` is false, render the locked label. Add label is `cell.playerId`'s name or `—`. Drop label is the existing `dropPlanLabel`. When `recordingPast` is true, render the same picker and select used for today.

Changing the past drop calls `upsertPastActualSwap` for that date and spot. The added player id stays whatever is already stored. Changing the past add does the same with the new player id and the stored drop, defaulting the drop to `hold`. Emptying the add and setting the drop to `hold` calls `clearPastActualSpot`. Do not call `handleAddSelect` or `handleForcedRosterDropChange` for a past date.

`handleResetToSuggested` stays as it is. It does not call `writePastActualSwaps` with `[]`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/StreamingPlansPanel.test.tsx -t "keeps a past day blank until the actual swap is recorded" --reporter=verbose`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/StreamingPlansPanel.tsx tests/unit/StreamingPlansPanel.test.tsx
git -c user.name=cbh606-create -c user.email=cbh606@gmail.com commit -m "feat(matchup): record an actual swap on a locked past day"
```
