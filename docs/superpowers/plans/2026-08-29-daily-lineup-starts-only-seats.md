# Daily Lineup Starts-Only Seats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily lineup active rows show that day’s starts only; Sit, plan-drops, and off-nights go to BE (BE may grow); unstarted preview stays PV; name strikethrough follows the focus day.

**Architecture:** Change the focus-day branch of `buildLineupDisplayRows` so Pass 1 (starts) still fills engine slots, then leftover non-IL roster ids go only to BE (append rows if the three template BE seats are full). Delete Pass 2–4 that placed Sit / PV / off-night into empty actives. `DailyLineupPanel` name strikethrough uses `focusDay >= droppedFrom`. Do not change `togglePlayerDay`.

**Tech Stack:** TypeScript, Vitest, React Testing Library, existing `eligibleForSlot` / `gameWeightForTeamDate`.

## Global Constraints

- Slot labels never reorder: PG → last UTIL, then BE (3 or more), then IL, then leftover PV
- Active occupants = `daily[focusDay]` starts only; empty actives stay empty
- Sit / plan-drop / off-night roster ids → BE; weekly roster-entry order
- IL stays IL even with a game
- Unstarted preview extras → PV under IL; started preview → engine slot + preview badge
- Display-only: do not write BE parking or PV rows into `DailyLineups`
- Missing `focusDay` / `schedule` / `playersById` / `daily` → today’s home-row builder
- Do not change `togglePlayerDay`, streaming plans, or ESPN writeback
- Name strikethrough: `droppedFrom && focusDay >= droppedFrom` (cell lock stays `day >= droppedFrom`)

---

## File map

| File | Role |
| --- | --- |
| `src/lib/matchup/dailyLineups.ts` | Focus-day seating: starts only; leftover roster → BE |
| `src/components/matchup/DailyLineupPanel.tsx` | Focus-day name strikethrough |
| `tests/unit/matchupDailyLineups.test.ts` | Spec §6 seating cases |
| `tests/unit/DailyLineupPanel.test.tsx` | Sit-to-BE, PV-not-up, strikethrough vs focus day |

`LineupDisplayFocus` and `buildLineupDisplayRows(...)` signatures stay the same. No new files.

---

### Task 1: Starts-only seating in `buildLineupDisplayRows`

**Files:**
- Modify: `src/lib/matchup/dailyLineups.ts` (`buildLineupDisplayRows` focus branch, after Pass 1)
- Test: `tests/unit/matchupDailyLineups.test.ts` (`describe("buildLineupDisplayRows focus-day seats")`)

**Interfaces:**

```ts
export type LineupDisplayFocus = {
  focusDay?: string
  schedule?: ScheduleResponse
  playersById?: Record<string, SeasonPlayer>
  daily?: DailyLineups
}

export const buildLineupDisplayRows = (
  rosterEntries: SeasonRosterEntry[],
  extraPlayerIds?: string[],
  extraIlPlayerIds?: string[],
  focus?: LineupDisplayFocus,
): DailySlotRow[]
```

- Consumes: existing `mondayStarts` / `roster` / `focus` fixtures already in that describe
- Produces: same function; leftover roster on BE; empty actives stay `null`

- [ ] **Step 1: Replace the focus-day seating tests**

In `tests/unit/matchupDailyLineups.test.ts`, keep the existing `describe("buildLineupDisplayRows focus-day seats")` fixtures (`mon`, `tue`, `focusSchedule`, `player`, `players`, `roster`, `mondayStarts`, `focus`, `occupant`). Replace the tests inside that describe with:

```ts
  it("seats only Monday starts on actives; leftovers go to BE; PV stays under IL", () => {
    const rows = buildLineupDisplayRows(roster, ["streamer"], [], focus)

    expect(rows.map((row) => row.slot)).toEqual([
      "PG",
      "SG",
      "SF",
      "PF",
      "C",
      "UTIL",
      "BE",
      "BE",
      "IL",
      "PV",
    ])
    expect(occupant(rows, "PG")).toBe("a")
    expect(occupant(rows, "SG")).toBeNull()
    expect(occupant(rows, "SF")).toBe("c")
    expect(occupant(rows, "PF")).toBeNull()
    expect(occupant(rows, "C")).toBe("d")
    expect(occupant(rows, "UTIL")).toBe("f")
    expect(rows.filter((row) => row.slot === "BE").map((row) => row.playerId)).toEqual([
      "b",
      "e",
    ])
    expect(occupant(rows, "IL")).toBe("injured")
    expect(rows.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])
  })

  it("puts a Sit player with a game on BE and leaves the home active empty", () => {
    const daily: DailyLineups = {
      [mon]: mondayStarts[mon]!.map((entry) =>
        entry.slot === "C" ? { ...entry, playerId: null } : entry,
      ),
    }
    const rows = buildLineupDisplayRows(roster, [], [], { ...focus, daily })
    expect(occupant(rows, "C")).toBeNull()
    expect(rows.filter((row) => row.slot === "BE").map((row) => row.playerId)).toContain("d")
    expect(daily[mon]?.find((entry) => entry.slot === "C")?.playerId).toBeNull()
  })

  it("does not put a plan-dropped-style roster id on an active when they are not started", () => {
    const daily: DailyLineups = {
      [mon]: mondayStarts[mon]!.map((entry) =>
        entry.slot === "PG" ? { ...entry, playerId: null } : entry,
      ),
    }
    const rows = buildLineupDisplayRows(roster, [], [], { ...focus, daily })
    expect(occupant(rows, "PG")).toBeNull()
    expect(rows.find((row) => row.playerId === "a")?.slot).toBe("BE")
  })

  it("re-seats from Tuesday starts when focusDay changes", () => {
    const daily: DailyLineups = {
      ...mondayStarts,
      [tue]: [
        { slot: "PG", playerId: null },
        { slot: "SG", playerId: "b" },
        { slot: "SF", playerId: null },
        { slot: "PF", playerId: "e" },
        { slot: "C", playerId: null },
        { slot: "UTIL", playerId: null },
      ],
    }
    const rows = buildLineupDisplayRows(roster, ["streamer"], [], {
      ...focus,
      focusDay: tue,
      daily,
    })
    expect(occupant(rows, "SG")).toBe("b")
    expect(occupant(rows, "PF")).toBe("e")
    expect(occupant(rows, "PG")).toBeNull()
    expect(occupant(rows, "UTIL")).toBeNull()
    expect(rows.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])
  })

  it("keeps a started preview on the engine slot and a full-day preview on PV", () => {
    const daily: DailyLineups = {
      [mon]: [
        { slot: "PG", playerId: "a" },
        { slot: "SG", playerId: "b" },
        { slot: "SF", playerId: "c" },
        { slot: "PF", playerId: "e" },
        { slot: "C", playerId: "d" },
        { slot: "UTIL", playerId: "f" },
      ],
    }
    const full = buildLineupDisplayRows(roster, ["streamer"], [], {
      ...focus,
      daily,
    })
    expect(occupant(full, "PF")).toBe("e")
    expect(full.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])

    const withStart = buildLineupDisplayRows(roster, ["streamer"], [], {
      ...focus,
      daily: {
        [mon]: [
          { slot: "PG", playerId: "a" },
          { slot: "SG", playerId: null },
          { slot: "SF", playerId: "c" },
          { slot: "PF", playerId: "streamer" },
          { slot: "C", playerId: "d" },
          { slot: "UTIL", playerId: "f" },
        ],
      },
    })
    expect(occupant(withStart, "PF")).toBe("streamer")
    expect(withStart.filter((row) => row.slot === "PV")).toHaveLength(0)
  })

  it("keeps IL on the IL row even when that player has a game", () => {
    const rows = buildLineupDisplayRows(roster, [], [], focus)
    expect(rows.find((row) => row.playerId === "injured")?.slot).toBe("IL")
  })

  it("leaves home-row occupants when focus inputs are omitted", () => {
    const rows = buildLineupDisplayRows(roster, ["streamer"])
    expect(occupant(rows, "PG")).toBe("a")
    expect(occupant(rows, "SG")).toBe("b")
    expect(occupant(rows, "PF")).toBeNull()
    expect(occupant(rows, "UTIL")).toBe("e")
    expect(occupant(rows, "BE")).toBe("f")
    expect(rows.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])
  })
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npx vitest run tests/unit/matchupDailyLineups.test.ts -t "focus-day seats"`

Expected: FAIL. Current Pass 2–4 still put `b` on SG, `streamer` on PF, and Sit `d` on C.

- [ ] **Step 3: Implement starts-only leftover seating**

In `src/lib/matchup/dailyLineups.ts` `buildLineupDisplayRows`, keep skeleton + Pass 1 (engine slots, then `placeSitOrStart` / any-empty **only for `startedIds`**).

Delete the three loops that:

1. place roster Sit + `playerHasGame` via `placeSitOrStart`
2. place `extraPlayerIds` + game via `placeEligibleActive`
3. place off-night roster via home / `placeEligibleActive`

Replace the final leftover roster loop so it **never** uses `firstEmpty(() => true)` (that dumps leftovers onto empty PG). Only BE:

```ts
  for (const entry of rosterEntries) {
    if (entry.slot === "IL" || !entry.playerId) continue
    if (placed.has(entry.playerId)) continue
    if (placeOn(firstEmpty((row) => row.slot === "BE"), entry.playerId)) {
      placed.add(entry.playerId)
      continue
    }
    rows.push({
      slot: "BE",
      playerId: entry.playerId,
      slotOccurrence: rows.filter((row) => row.slot === "BE").length,
    })
    placed.add(entry.playerId)
  }

  return [...rows, ...ilRows, ...previewFromExtras(placed)]
```

Remove helpers that become unused (`playerHasGame` if nothing else calls it). Keep `placeSitOrStart` / `placeEligibleActive` / `homeRowFor` for unmatched **starts** only.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/unit/matchupDailyLineups.test.ts`

Expected: PASS (all cases in that file).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/matchupDailyLineups.test.ts src/lib/matchup/dailyLineups.ts
git commit -m "feat(matchup): seat daily lineup starts only"
```

---

### Task 2: Panel chrome — Sit/PV stay down; strikethrough is focus-day

**Files:**
- Modify: `src/components/matchup/DailyLineupPanel.tsx` (name `isPlanDropped`)
- Test: `tests/unit/DailyLineupPanel.test.tsx`

**Interfaces:**

- Consumes: `buildLineupDisplayRows` from Task 1; `droppedFromDateByPlayerId`; `activeFocusDay`
- Produces: name class `line-through` only when `droppedFrom && activeFocusDay >= droppedFrom`

- [ ] **Step 1: Rewrite the panel tests that assume old seating / week-long strikethrough**

In `tests/unit/DailyLineupPanel.test.tsx`:

1. Replace `it("keeps a sitting PG on the PG row")` with:

```ts
  it("puts a sitting PG on BE and leaves the PG row empty", () => {
    render(
      <DailyLineupPanel
        daily={{
          "2025-11-03": [{ slot: "C", playerId: "c-1" }],
          "2025-11-04": [{ slot: "C", playerId: "c-1" }],
        }}
        days={days}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        rosterEntries={[
          { slot: "PG", playerId: "pg-1" },
          { slot: "C", playerId: "c-1" },
          { slot: "BE", playerId: "be-1" },
          { slot: "BE", playerId: "be-2" },
          { slot: "BE", playerId: "be-3" },
        ]}
        rosterPlayers={[pg, bench, center]}
        schedule={schedule}
      />,
    )

    const pgRow = screen.getAllByRole("row").find((row) => {
      const header = row.querySelector("th")
      return header?.textContent === "PG"
    })
    expect(pgRow?.textContent).not.toContain("Point Guard")
    expect(
      screen.getAllByRole("row").some(
        (row) =>
          row.querySelector("th")?.textContent === "BE" &&
          row.textContent?.includes("Point Guard"),
      ),
    ).toBe(true)
  })
```

2. Replace `it("seats a preview streamer with a game into an empty eligible slot")` with:

```ts
  it("keeps an unstarted preview streamer on PV when an active is empty", () => {
    render(
      <DailyLineupPanel
        daily={{
          "2025-11-03": [{ slot: "PG", playerId: "you-1" }],
          "2025-11-04": [{ slot: "PG", playerId: "you-1" }],
        }}
        days={days}
        extraPlayers={[streamer]}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        previewActive
        previewPlayerIds={["fa-a"]}
        previewSpotCount={1}
        rosterEntries={[
          { slot: "PG", playerId: "you-1" },
          { slot: "SG", playerId: null },
        ]}
        rosterPlayers={[rostered]}
        schedule={schedule}
      />,
    )

    const sgRow = screen.getAllByRole("row").find((row) => {
      const header = row.querySelector("th")
      return header?.textContent === "SG"
    })
    expect(sgRow?.textContent).not.toContain("Streamer A")
    expect(screen.getByRole("rowheader", { name: "PV" })).toBeInTheDocument()
    expect(screen.getByText("Streamer A")).toBeInTheDocument()
  })
```

3. Replace `it("mutes dropped roster names during preview")` so default focus (`days[0]` = `2025-11-03`) does **not** strike a drop that starts `2025-11-04`, and striking happens after clicking the Tue header:

```ts
  it("mutes a dropped roster name only on or after the focus day", () => {
    render(
      <DailyLineupPanel
        daily={daily}
        days={days}
        droppedFromDateByPlayerId={{ "you-1": "2025-11-04" }}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        previewActive
        previewSpotCount={2}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
      />,
    )

    expect(screen.getByText("Roster Cut").className).not.toMatch(/line-through/)

    fireEvent.click(screen.getByRole("button", { name: /Tue/i }))
    expect(screen.getByText("Roster Cut").className).toMatch(/line-through/)
  })
```

If the Tue header name does not match `/Tue/i`, use the same `formatMatchupDayLabel` accessible name the file already uses for day headers (the pressed chip for `2025-11-04`).

- [ ] **Step 2: Run panel tests and confirm the strikethrough case fails**

Run: `npx vitest run tests/unit/DailyLineupPanel.test.tsx -t "mutes a dropped"`

Expected: FAIL. Current `isPlanDropped` is `Boolean(droppedFromDateByPlayerId[id])` (week-global). Seating tests may already pass from Task 1.

- [ ] **Step 3: Focus-day strikethrough**

In `src/components/matchup/DailyLineupPanel.tsx`, change the name flag from “any drop date” to the focus day:

```ts
              const droppedFrom = namePlayer
                ? droppedFromDateByPlayerId[namePlayer.id]
                : undefined
              const isPlanDropped = Boolean(
                droppedFrom && activeFocusDay >= droppedFrom,
              )
```

Do not change per-cell `isDropped` (`day >= droppedFrom`).

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/unit/DailyLineupPanel.test.tsx tests/unit/matchupDailyLineups.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/DailyLineupPanel.tsx tests/unit/DailyLineupPanel.test.tsx
git commit -m "fix(matchup): strike dropped names on the focus day"
```

---

## Self-review

| Spec requirement | Task |
| --- | --- |
| Active = starts only; empty stay empty | Task 1 |
| Sit / drop / off-night → BE; grow BE | Task 1 |
| IL under BE | Task 1 (existing IL test) |
| Unstarted PV under IL; started PV on engine slot | Task 1 + Task 2 PV test |
| `togglePlayerDay` unchanged | No task edits that function |
| Display not written to `daily` | Task 1 Sit test asserts `daily` C still null |
| Name strikethrough vs focus day | Task 2 |
| Omit focus → home-row | Task 1 last test |
