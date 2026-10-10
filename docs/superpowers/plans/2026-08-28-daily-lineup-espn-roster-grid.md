# Daily Lineup ESPN Roster Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Matchup Daily lineup rows follow weekly roster seats (ESPN stats-style) so off-nights and Sits do not dump players onto Bench.

**Architecture:** Rebuild `buildLineupDisplayRows` from `SEASON_ROSTER_SLOTS` + `rosterEntries` (ignore focus-day occupants). Preview streamers become `PV` extra rows. Panel copy, focus-day column highlight, and started-slot badge follow the spec. Do not change `togglePlayerDay` or `buildStreamingPlan`.

**Tech Stack:** TypeScript, React, Vitest, existing matchup Daily lineup modules.

## Global Constraints

- Rows = weekly roster seats; never pack sitters onto BE
- Off-night and Sit stay on the home row; only the day cell changes
- Day header highlights the column; does not reorder rows
- Preview streamers: extra `PV` rows under IL, not PG/C/UTIL occupants
- `DailyLineups` / `togglePlayerDay` / streaming planner unchanged
- Tests: `npx vitest run tests/unit/matchupDailyLineups.test.ts tests/unit/DailyLineupPanel.test.tsx`

---

## File map

| File | Role |
| --- | --- |
| `src/lib/matchup/dailyLineups.ts` | `DailySlotRow.slot` may be `"PV"`; `buildLineupDisplayRows(rosterEntries, extraPlayerIds?, extraIlPlayerIds?)` |
| `src/components/matchup/DailyLineupPanel.tsx` | Call new builder; `PV` label; subtitle; focus-day column; badge only when started slot ≠ home |
| `tests/unit/matchupDailyLineups.test.ts` | Row-builder cases from spec §7 |
| `tests/unit/DailyLineupPanel.test.tsx` | Replace bench-packing UI tests; preview extra-row test |

---

### Task 1: Roster-home `buildLineupDisplayRows`

**Files:**
- Modify: `src/lib/matchup/dailyLineups.ts`
- Test: `tests/unit/matchupDailyLineups.test.ts`

**Interfaces:**
- Consumes: `SEASON_ROSTER_SLOTS`, `SeasonRosterEntry`
- Produces:

```ts
export type LineupDisplaySlot = SeasonSlot | "PV"

export type DailySlotRow = {
  slot: LineupDisplaySlot
  playerId: string | null
  slotOccurrence: number
}

export const buildLineupDisplayRows = (
  rosterEntries: SeasonRosterEntry[],
  extraPlayerIds?: string[],
  extraIlPlayerIds?: string[],
): DailySlotRow[]
```

- [ ] **Step 1: Replace the old `buildLineupDisplayRows` describe with failing tests**

In `tests/unit/matchupDailyLineups.test.ts`, delete the example that expects sitters on expandable BE. Add:

```ts
describe("buildLineupDisplayRows", () => {
  const roster: SeasonRosterEntry[] = [
    { slot: "PG", playerId: "pg-1" },
    { slot: "C", playerId: "c-1" },
    { slot: "BE", playerId: "be-1" },
    { slot: "BE", playerId: "be-2" },
    { slot: "BE", playerId: "be-3" },
  ]

  it("keeps off-night and sit players on roster home slots", () => {
    const rows = buildLineupDisplayRows(roster)
    expect(rows.find((row) => row.slot === "PG")?.playerId).toBe("pg-1")
    expect(rows.find((row) => row.slot === "C")?.playerId).toBe("c-1")
    expect(rows.filter((row) => row.slot === "BE").map((row) => row.playerId)).toEqual([
      "be-1",
      "be-2",
      "be-3",
    ])
    expect(rows.filter((row) => row.slot === "PG")).toHaveLength(1)
    expect(rows.filter((row) => row.slot === "UTIL")).toHaveLength(3)
  })

  it("does not reorder when extra args look like a different focus day", () => {
    const first = buildLineupDisplayRows(roster)
    const second = buildLineupDisplayRows(roster, [], [])
    expect(first.map((row) => row.playerId)).toEqual(second.map((row) => row.playerId))
  })

  it("renders empty active seats as empty rows", () => {
    const rows = buildLineupDisplayRows([
      { slot: "PG", playerId: null },
      { slot: "C", playerId: "c-1" },
    ])
    expect(rows.find((row) => row.slot === "PG")?.playerId).toBeNull()
    expect(rows.find((row) => row.slot === "C")?.playerId).toBe("c-1")
    expect(rows.filter((row) => row.slot === "BE")).toHaveLength(3)
  })

  it("appends preview streamers as PV rows and does not put them in PG", () => {
    const rows = buildLineupDisplayRows(roster, ["fa-a"])
    expect(rows.find((row) => row.slot === "PG")?.playerId).toBe("pg-1")
    const preview = rows.filter((row) => row.slot === "PV")
    expect(preview.map((row) => row.playerId)).toEqual(["fa-a"])
    expect(rows.at(-1)?.slot).toBe("PV")
  })
})
```

If anything still calls `buildLineupDisplayRows(daily, focusDay, entries, ...)`, TypeScript should fail — that is intended.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/matchupDailyLineups.test.ts -t "buildLineupDisplayRows"`

Expected: FAIL (old signature / sitters-on-BE behavior).

- [ ] **Step 3: Implement the builder**

In `src/lib/matchup/dailyLineups.ts`:

- Import `SEASON_ROSTER_SLOTS` from `@/lib/season/slots`.
- Change `DailySlotRow.slot` to `LineupDisplaySlot`.
- Remove `ACTIVE_SLOT_TEMPLATE`, `MIN_BENCH_ROWS`, and the focus-day occupant / sitter packing.
- Walk `SEASON_ROSTER_SLOTS` in order. For each slot, take the next unused `rosterEntries` item with that `slot` (or `playerId: null` if none). That yields 10 actives, 3 BE, 1 IL from the template.
- Collect IL ids from roster IL seats plus `extraIlPlayerIds`. If more than one IL occupant, extra IL rows after the template IL (same as today: one row per IL id, or one empty IL if none).
- After roster/IL rows, for each id in `extraPlayerIds` not already on a row, append `{ slot: "PV", playerId, slotOccurrence }`.
- Do not grow BE past the three template seats. Ignore a 4th `BE` roster entry.

Sketch:

```ts
export type LineupDisplaySlot = SeasonSlot | "PV"

export const buildLineupDisplayRows = (
  rosterEntries: SeasonRosterEntry[],
  extraPlayerIds: string[] = [],
  extraIlPlayerIds: string[] = [],
): DailySlotRow[] => {
  const unused = [...rosterEntries]
  const takeNext = (slot: SeasonSlot): SeasonRosterEntry | undefined => {
    const index = unused.findIndex((entry) => entry.slot === slot)
    if (index < 0) return undefined
    return unused.splice(index, 1)[0]
  }

  const rows: DailySlotRow[] = []
  const seen: Partial<Record<SeasonSlot, number>> = {}
  for (const slot of SEASON_ROSTER_SLOTS) {
    if (slot === "IL") break
    const slotOccurrence = seen[slot] ?? 0
    seen[slot] = slotOccurrence + 1
    const entry = takeNext(slot)
    rows.push({
      slot,
      playerId: entry?.playerId ?? null,
      slotOccurrence,
    })
  }

  const ilIds = [
    ...rosterEntries.flatMap((entry) =>
      entry.slot === "IL" && entry.playerId ? [entry.playerId] : [],
    ),
    ...extraIlPlayerIds,
  ].filter((id, index, all) => all.indexOf(id) === index)

  const ilRows: DailySlotRow[] =
    ilIds.length > 0
      ? ilIds.map((playerId, slotOccurrence) => ({
          slot: "IL" as const,
          playerId,
          slotOccurrence,
        }))
      : [{ slot: "IL", playerId: null, slotOccurrence: 0 }]

  const placed = new Set(
    [...rows, ...ilRows].flatMap((row) => (row.playerId ? [row.playerId] : [])),
  )
  const previewRows: DailySlotRow[] = extraPlayerIds
    .filter((playerId) => !placed.has(playerId))
    .filter((playerId, index, all) => all.indexOf(playerId) === index)
    .map((playerId, slotOccurrence) => ({
      slot: "PV" as const,
      playerId,
      slotOccurrence,
    }))

  return [...rows, ...ilRows, ...previewRows]
}
```

Loop `SEASON_ROSTER_SLOTS` but skip `IL` in the first loop so IL occupancy can expand. Include PG…BE from the template (stop before IL).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/matchupDailyLineups.test.ts`

Expected: PASS. Fix any other file still using the old 5-arg signature (only `DailyLineupPanel.tsx` should).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/dailyLineups.ts tests/unit/matchupDailyLineups.test.ts src/components/matchup/DailyLineupPanel.tsx
git commit -m "feat(matchup): pin daily lineup rows to roster slots"
```

If Task 2 still needs the panel compile, keep the panel signature update in Task 2 and only commit `dailyLineups.ts` + unit tests here. Then this step’s panel touch is a temporary call-site fix:

```ts
buildLineupDisplayRows(
  rosterEntries,
  (extraPlayers ?? []).map((player) => player.id),
  [...onIlIds],
)
```

Prefer passing **preview ids** in Task 2; for this commit, extra player ids as extras is OK so TypeScript builds.

---

### Task 2: Panel copy, PV label, focus column, slot badge

**Files:**
- Modify: `src/components/matchup/DailyLineupPanel.tsx`

**Interfaces:**
- Consumes: `buildLineupDisplayRows(rosterEntries, extraPlayerIds, extraIlPlayerIds)`
- Produces: UI only

- [ ] **Step 1: Wire extras from preview ids**

```ts
const slotRows = buildLineupDisplayRows(
  rosterEntries,
  [...previewIds],
  [...onIlIds],
)
```

`extraPlayers` still merge into `playersById` for names.

- [ ] **Step 2: Slot label + home-slot badge + column highlight**

```ts
const slotLabel = (slot: DailySlotRow["slot"]) =>
  slot === "BE" ? "BE" : slot === "PV" ? "PV" : slotDisplayLabel(slot)
```

`renderDayCell(player, day, onIl, homeSlot)`:

- Add `homeSlot: DailySlotRow["slot"]`.
- Started-slot badge only when `started && startedSlot && startedSlot !== homeSlot` (not on every started cell).
- On every day `th` / day `td` (including Games and empty `—` cells), append a focus class when `day === activeFocusDay`, e.g. `bg-[var(--color-soft-cloud)]/80`.
- Day header `aria-label`: `Highlight ${formatMatchupDayLabel(day)}` (keep existing button pressed styles).

Subtitle:

```
Roster slots stay put for the week. Click a day to highlight it; click a game cell to start or sit.
```

- [ ] **Step 3: Run panel tests (expect some old packing tests to fail)**

Run: `npx vitest run tests/unit/DailyLineupPanel.test.tsx`

Expected: FAIL on “grows bench rows for sitters…” and possibly “Show lineup for” / Center-in-C-from-daily tests.

- [ ] **Step 4: Commit UI if tests will be fixed immediately in Task 3; otherwise wait and commit with Task 3**

If committing UI alone would leave CI red, skip this commit and finish Task 3 in the same change-set.

---

### Task 3: Panel tests + verify

**Files:**
- Modify: `tests/unit/DailyLineupPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1–2 behavior
- Produces: spec §7 UI coverage

- [ ] **Step 1: Rewrite packing tests**

Replace `grows bench rows for sitters instead of mixing them into empty actives` with:

```ts
it("keeps a sitting PG on the PG row", () => {
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

  expect(screen.getAllByRole("rowheader", { name: "BE" })).toHaveLength(3)
  const pgRow = screen.getAllByRole("row").find((row) => {
    const header = row.querySelector("th")
    return header?.textContent === "PG"
  })
  expect(pgRow?.textContent).toContain("Point Guard")
})
```

Update `keeps fixed PG→Bench slot rows even when only a later slot is filled`:

- Put `c-1` on the **C roster seat**, not only in `daily` / `extraPlayers`.
- After clicking a day header, PG row still empty, C row still “The Center”.
- Header button name: `/Highlight /i` matching Task 2 `aria-label`.

Add:

```ts
it("puts preview streamers on PV rows not PG", () => {
  render(
    <DailyLineupPanel
      daily={daily}
      days={days}
      extraPlayers={[streamer]}
      onReset={vi.fn()}
      onTogglePlayerDay={vi.fn()}
      previewActive
      previewPlayerIds={["fa-a"]}
      previewSpotCount={1}
      rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
      rosterPlayers={[rostered]}
      schedule={schedule}
    />,
  )

  const pgRow = screen.getAllByRole("row").find((row) => {
    const header = row.querySelector("th")
    return header?.textContent === "PG"
  })
  expect(pgRow?.textContent).toContain("Roster Cut")
  expect(pgRow?.textContent).not.toContain("Streamer A")
  expect(screen.getByRole("rowheader", { name: "PV" })).toBeInTheDocument()
  expect(screen.getByText("Streamer A")).toBeInTheDocument()
})
```

Keep `shows weekly PG before Bench without packing sitters to the top` — PG name still before Bench Wing.

- [ ] **Step 2: Run both suites**

Run: `npx vitest run tests/unit/matchupDailyLineups.test.ts tests/unit/DailyLineupPanel.test.tsx`

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matchup/dailyLineups.ts src/components/matchup/DailyLineupPanel.tsx tests/unit/matchupDailyLineups.test.ts tests/unit/DailyLineupPanel.test.tsx
git commit -m "feat(matchup): show ESPN-style roster grid on daily lineup"
```

If Task 1 already committed the builder, this commit is panel + tests only.

---

## Spec coverage

| Spec | Task |
| --- | --- |
| §4 Rows from roster template, 3 BE, no sitter packing | 1 |
| §4 Preview `PV` extra rows | 1, 3 |
| §4 Sit/off-night stay on home row | 1, 3 |
| §4 Focus-day column highlight | 2 |
| §4 Started-slot badge if ≠ home | 2 |
| §4 Subtitle copy | 2 |
| §5 `togglePlayerDay` unchanged | (no code) |
| §6 Preview does not steal PG display | 1, 3 |
| §7 five tests | 1, 3 |
| Streaming algorithm | out of scope |

## Placeholder / type check

- `LineupDisplaySlot` / `buildLineupDisplayRows` names are consistent across tasks.
- No `togglePlayerDay` or `buildStreamingPlan` edits.
