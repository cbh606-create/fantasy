# Matchup Streaming Plans Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Matchup Streaming plans readable as a horizontal day×spot calendar, with explicit virtual-spot drops and roster drop / open-slot lines on every Add.

**Architecture:** Extend `StreamingPlanDayCell` with drop fields; teach the existing greedy planner in `streamingPlans.ts` to fill them; hydrate new ids in `/api/matchup`; rewrite `StreamingPlansPanel` to a calendar grid. Do not rewrite FA pick scoring or the 7-add budget.

**Tech Stack:** TypeScript, Vitest, Testing Library, existing Matchup React components.

## Global Constraints

- Weekly budget remains **7 adds only**; drops never consume the budget
- Always emit plans for spot counts **1, 2, and 3**
- Spots stay **virtual**
- Roster drop ranking: **no game that day** → fewer **remaining week game-days** → lower **weak-cat contribution** → `id` tie-break; exclude **IL**; no same-day roster-drop reuse
- Open-slot detection uses **current** perspective roster only (do **not** simulate earlier plan Adds filling slots)
- No semicolons in TS; Matchup styling tokens; waivers link for Add FA only
- Spec: `docs/superpowers/specs/2026-08-24-matchup-streaming-plans-clarity-design.md`

## File map

| File | Responsibility |
|---|---|
| `src/lib/matchup/types.ts` | Extend `StreamingPlanDayCell` + `StreamingPlanRosterDropKind` |
| `src/lib/matchup/streamingPlans.ts` | Set `droppedPlayerId` / roster drop fields while building cells |
| `src/app/api/matchup/route.ts` | Collect drop + roster-drop ids into `playersById` |
| `src/components/matchup/StreamingPlansPanel.tsx` | Calendar grid UI + Drop/Add/Roster copy |
| `tests/unit/streamingPlans.test.ts` | Planner coverage for new fields |
| `tests/api/matchup.test.ts` | Assert drop ids hydrate in `playersById` |
| `tests/unit/StreamingPlansPanel.test.tsx` | Calendar + Drop/Roster strings |
| `tests/unit/MatchupWorkspace.test.tsx` | Keep mocks shape-compatible if cells appear |

---

### Task 1: Extend cell types (and fix fixtures)

**Files:**
- Modify: `src/lib/matchup/types.ts`
- Modify: `tests/unit/StreamingPlansPanel.test.tsx` (cell fixtures)
- Modify: any other test mocks that construct `StreamingPlanDayCell` without the new fields (search `action: "add"` / `drop_add`)

**Interfaces:**
- Produces:
  - `StreamingPlanRosterDropKind = "player" | "open_slot" | "none"`
  - `StreamingPlanDayCell` fields:
    - `droppedPlayerId: string | null`
    - `rosterDropPlayerId: string | null`
    - `rosterDropKind: StreamingPlanRosterDropKind`

- [ ] **Step 1: Write a failing type-level / fixture compile check via unit test import**

Add to `tests/unit/streamingPlans.test.ts` (top-level describe ok):

```ts
import type { StreamingPlanDayCell } from "@/lib/matchup/types"

const assertCellShape = (cell: StreamingPlanDayCell) => cell

it("StreamingPlanDayCell requires drop fields", () => {
  const cell = assertCellShape({
    spotIndex: 0,
    playerId: "fa-a",
    action: "add",
    droppedPlayerId: null,
    rosterDropPlayerId: null,
    rosterDropKind: "open_slot",
  })
  expect(cell.rosterDropKind).toBe("open_slot")
})
```

- [ ] **Step 2: Run test — expect TypeScript/build fail or test fail until types exist**

Run: `npx vitest run tests/unit/streamingPlans.test.ts`
Expected: FAIL (missing properties on type or import errors in other files once types update)

- [ ] **Step 3: Update types**

In `src/lib/matchup/types.ts` replace `StreamingPlanDayCell` with:

```ts
export type StreamingPlanRosterDropKind = "player" | "open_slot" | "none"

export type StreamingPlanDayCell = {
  spotIndex: number
  playerId: string | null
  action: StreamingPlanAction
  droppedPlayerId: string | null
  rosterDropPlayerId: string | null
  rosterDropKind: StreamingPlanRosterDropKind
}
```

- [ ] **Step 4: Update all cell literals in tests/mocks**

For hold/empty defaults:

```ts
droppedPlayerId: null,
rosterDropPlayerId: null,
rosterDropKind: "none",
```

For temporary Add fixtures in panel tests (until Task 5), use `"open_slot"` or `"none"` as needed so files compile.

Temporarily make `buildStreamingPlan` compile by pushing the new fields on every `cells.push` (use `"none"` / nulls) — full logic comes in Tasks 2–3. Example stub at push site:

```ts
cells.push({
  spotIndex,
  playerId,
  action,
  droppedPlayerId: null,
  rosterDropPlayerId: null,
  rosterDropKind: "none",
})
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/streamingPlans.test.ts`
Expected: PASS (existing planner tests + new shape test)

- [ ] **Step 6: Commit**

```bash
git add src/lib/matchup/types.ts src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts tests/unit/StreamingPlansPanel.test.tsx
git commit -m "feat(matchup): extend streaming plan cells with drop fields"
```

---

### Task 2: Set `droppedPlayerId` on Drop→Add

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts`
- Test: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: existing `buildStreamingPlan` loop (`previousId`, `action === "drop_add"`)
- Produces: `cell.droppedPlayerId === previousId` when `action === "drop_add"`; else `null`

- [ ] **Step 1: Write failing test**

```ts
it("drop_add records droppedPlayerId as the previous spot occupant", () => {
  const days = ["2025-11-03", "2025-11-04"]
  const faA = player("fa-a", "BOS", {
    projections: { ...baseProjections(), STL: 180 },
  })
  const faB = player("fa-b", "NYK", {
    projections: { ...baseProjections(), STL: 160 },
  })
  const state = tinyState([faA, faB], ["fa-a", "fa-b"])
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
    { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
  ])
  const board = emptyBoardLosingStl()

  const plan = buildStreamingPlan({ spotCount: 1, state, schedule, board })

  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "add",
    playerId: "fa-a",
    droppedPlayerId: null,
  })
  expect(plan.days[1]!.cells[0]).toMatchObject({
    action: "drop_add",
    playerId: "fa-b",
    droppedPlayerId: "fa-a",
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/unit/streamingPlans.test.ts -t "droppedPlayerId"`
Expected: FAIL — `droppedPlayerId` still null on day 1

- [ ] **Step 3: Implement**

When building the cell for a replacement:

```ts
let droppedPlayerId: string | null = null
// ...
} else if (addsUsed < addLimit) {
  const best = pickBestFa(...)
  if (best) {
    playerId = best.id
    if (previousId) {
      action = "drop_add"
      droppedPlayerId = previousId
    } else {
      action = "add"
    }
    addsUsed += 1
    seatedToday.add(best.id)
  }
}
// ...
cells.push({
  spotIndex,
  playerId,
  action,
  droppedPlayerId,
  rosterDropPlayerId: null,
  rosterDropKind: "none",
})
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/unit/streamingPlans.test.ts -t "droppedPlayerId"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): record droppedPlayerId on streaming drop_add"
```

---

### Task 3: Roster drop / open_slot on Add actions

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts`
- Test: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: `state.perspectiveTeamIndex`, team `entries`, `schedule`, `weakCats`, `playsOn`, `remainingGameDays`
- Produces: on `add` / `drop_add`:
  - empty non-IL slot → `rosterDropKind: "open_slot"`, `rosterDropPlayerId: null`
  - else ranked player → `rosterDropKind: "player"`, id set
  - else → `"none"`
  - hold/empty → `"none"`
  - same calendar day: do not reuse a `rosterDropPlayerId` across spots

- [ ] **Step 1: Write failing tests**

```ts
it("uses open_slot when perspective roster has an empty non-IL slot", () => {
  const days = ["2025-11-03"]
  const faA = player("fa-a", "BOS", {
    projections: { ...baseProjections(), STL: 180 },
  })
  const rostered = player("you-1", "LAL", {
    projections: { ...baseProjections(), STL: 10 },
  })
  const state = tinyState([faA, rostered], ["fa-a"])
  state.teams[0]!.entries = [
    { slot: "UTIL", playerId: "you-1" },
    { slot: "BE", playerId: null },
  ]
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
  })
  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "add",
    rosterDropKind: "open_slot",
    rosterDropPlayerId: null,
  })
})

it("picks roster drop by no-game then volume then weak-cat; no same-day reuse", () => {
  const days = ["2025-11-03"]
  const faA = player("fa-a", "BOS", {
    projections: { ...baseProjections(), STL: 180 },
  })
  const faB = player("fa-b", "NYK", {
    projections: { ...baseProjections(), STL: 160 },
  })
  const noGameHighStl = player("you-idle", "CHI", {
    projections: { ...baseProjections(), STL: 200 },
  })
  const playsLowStl = player("you-play", "ATL", {
    projections: { ...baseProjections(), STL: 5 },
  })
  const state = tinyState(
    [faA, faB, noGameHighStl, playsLowStl],
    ["fa-a", "fa-b"],
  )
  state.teams[0]!.entries = [
    { slot: "UTIL", playerId: "you-idle" },
    { slot: "BE", playerId: "you-play" },
  ]
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
    { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "MIA" },
    { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 2,
    state,
    schedule,
    board: emptyBoardLosingStl(),
  })
  const drops = plan.days[0]!.cells.map((c) => c.rosterDropPlayerId)
  expect(drops[0]).toBe("you-idle")
  expect(drops[1]).toBe("you-play")
  expect(new Set(drops).size).toBe(2)
  expect(plan.days[0]!.cells.every((c) => c.rosterDropKind === "player")).toBe(
    true,
  )
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/unit/streamingPlans.test.ts -t "roster"`
Expected: FAIL — still `"none"` / null

- [ ] **Step 3: Implement helpers + wire into cell build**

Add helpers in `streamingPlans.ts` (same file; keep local, YAGNI export):

```ts
const isIlSlot = (slot: SeasonRosterEntry["slot"]) => slot === "IL"

const hasOpenNonIlSlot = (entries: SeasonRosterEntry[]) =>
  entries.some((entry) => !isIlSlot(entry.slot) && entry.playerId === null)

const weakCatScoreForGames = (
  player: SeasonPlayer,
  games: number,
  weakCats: CategoryId[],
) =>
  weakCats.reduce((sum, categoryId) => {
    if (!STREAMER_COUNTING_CATEGORIES.includes(categoryId)) return sum
    return sum + categoryContribution(player, games, categoryId)
  }, 0)

const pickRosterDrop = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  alreadyDropped: Set<string>,
): { kind: StreamingPlanRosterDropKind; playerId: string | null } => {
  if (hasOpenNonIlSlot(entries)) {
    return { kind: "open_slot", playerId: null }
  }

  const candidates = entries
    .filter((entry) => !isIlSlot(entry.slot) && entry.playerId)
    .map((entry) => playersById.get(entry.playerId!))
    .filter((p): p is SeasonPlayer => Boolean(p))
    .filter((p) => !alreadyDropped.has(p.id))
    .map((p) => ({
      player: p,
      noGame: playsOn(p, date, schedule) ? 0 : 1,
      volume: remainingGameDays(p, date, schedule),
      weak: weakCatScoreForGames(p, 1, weakCats),
    }))
    .sort((left, right) => {
      if (right.noGame !== left.noGame) return right.noGame - left.noGame
      if (left.volume !== right.volume) return left.volume - right.volume
      if (left.weak !== right.weak) return left.weak - right.weak
      return left.player.id.localeCompare(right.player.id)
    })

  const best = candidates[0]
  if (!best) return { kind: "none", playerId: null }
  return { kind: "player", playerId: best.player.id }
}
```

Import `SeasonRosterEntry` type and `StreamingPlanRosterDropKind`.

Inside the day loop, keep `const rosterDroppedToday = new Set<string>()` alongside `seatedToday`.

When `action` is `add` or `drop_add`, call `pickRosterDrop(...)`; if kind `"player"` and id set, add id to `rosterDroppedToday`. For hold/empty keep none.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/unit/streamingPlans.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): suggest roster drop or open slot on plan adds"
```

---

### Task 4: Hydrate drop ids in matchup API

**Files:**
- Modify: `src/app/api/matchup/route.ts` (`collectReferencedPlayerIds`)
- Test: `tests/api/matchup.test.ts`

**Interfaces:**
- Consumes: `advice.streamingPlans[].days[].cells[]`
- Produces: `playersById` includes every non-null `playerId`, `droppedPlayerId`, `rosterDropPlayerId`

- [ ] **Step 1: Extend existing plan hydration assertion**

In the GET matchup success test that already walks `streamingPlans`, also collect drop ids:

```ts
for (const plan of payload.streamingPlans as Array<{
  days: Array<{
    cells: Array<{
      playerId: string | null
      droppedPlayerId?: string | null
      rosterDropPlayerId?: string | null
    }>
  }>
}>) {
  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (cell.playerId) planPlayerIds.add(cell.playerId)
      if (cell.droppedPlayerId) planPlayerIds.add(cell.droppedPlayerId)
      if (cell.rosterDropPlayerId) planPlayerIds.add(cell.rosterDropPlayerId)
    }
  }
}
for (const playerId of planPlayerIds) {
  expect(payload.playersById[playerId]).toMatchObject({ id: playerId })
}
```

- [ ] **Step 2: Run test — may PASS if fixture has no drop ids yet; force a unit-style check**

Also add a focused pure assertion by exporting nothing — instead patch collector in route and add:

```ts
// after building payload, soft check shape exists on first add-like cell if any
const sample = (payload.streamingPlans as Array<{ days: Array<{ cells: Array<Record<string, unknown>> }> }>)
  .flatMap((p) => p.days.flatMap((d) => d.cells))
  .find((c) => c.action === "add" || c.action === "drop_add")
if (sample) {
  expect(sample).toHaveProperty("droppedPlayerId")
  expect(sample).toHaveProperty("rosterDropKind")
}
```

- [ ] **Step 3: Update collector**

```ts
for (const plan of advice.streamingPlans) {
  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (cell.playerId) ids.add(cell.playerId)
      if (cell.droppedPlayerId) ids.add(cell.droppedPlayerId)
      if (cell.rosterDropPlayerId) ids.add(cell.rosterDropPlayerId)
    }
  }
}
```

- [ ] **Step 4: Run API test**

Run: `npx vitest run tests/api/matchup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/matchup/route.ts tests/api/matchup.test.ts
git commit -m "fix(matchup): include streaming drop ids in playersById"
```

---

### Task 5: Calendar-grid StreamingPlansPanel

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Modify: `tests/unit/StreamingPlansPanel.test.tsx`

**Interfaces:**
- Consumes: extended `StreamingPlan` / cells; `playersById`
- Produces: day columns × spot rows; Drop/Add/Roster copy; waivers links on Add FA only

- [ ] **Step 1: Rewrite panel test for calendar + explicit drops**

Replace the second test with something like:

```ts
it("renders day column headers and Drop / Add / Roster lines", () => {
  const rostered: SeasonPlayer = {
    id: "you-1",
    name: "Roster Cut",
    teamAbbr: "CHI",
    positions: ["PF"],
    projections,
    shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
  }

  render(
    <StreamingPlansPanel
      leagueId="lg1"
      playersById={{
        "fa-a": streamerA,
        "fa-b": streamerB,
        "you-1": rostered,
      }}
      plans={[
        {
          spotCount: 1,
          addLimit: 7,
          addsUsed: 2,
          gameStarts: 3,
          days: [
            {
              date: "2025-11-03",
              cells: [
                {
                  spotIndex: 0,
                  playerId: "fa-a",
                  action: "add",
                  droppedPlayerId: null,
                  rosterDropPlayerId: "you-1",
                  rosterDropKind: "player",
                },
              ],
            },
            {
              date: "2025-11-04",
              cells: [
                {
                  spotIndex: 0,
                  playerId: "fa-a",
                  action: "hold",
                  droppedPlayerId: null,
                  rosterDropPlayerId: null,
                  rosterDropKind: "none",
                },
              ],
            },
            {
              date: "2025-11-05",
              cells: [
                {
                  spotIndex: 0,
                  playerId: "fa-b",
                  action: "drop_add",
                  droppedPlayerId: "fa-a",
                  rosterDropPlayerId: null,
                  rosterDropKind: "open_slot",
                },
              ],
            },
          ],
        },
        { spotCount: 2, addLimit: 7, addsUsed: 0, gameStarts: 0, days: [] },
        { spotCount: 3, addLimit: 7, addsUsed: 0, gameStarts: 0, days: [] },
      ]}
    />,
  )

  expect(screen.getByText(/Mon/i)).toBeInTheDocument()
  expect(screen.getByText(/Spot 1/i)).toBeInTheDocument()
  expect(screen.getByText(/Add/i)).toBeInTheDocument()
  expect(screen.getByText(/Drop/i)).toBeInTheDocument()
  expect(screen.getByText(/Roster: drop Roster Cut/i)).toBeInTheDocument()
  expect(screen.getByText(/Roster: open slot/i)).toBeInTheDocument()
  expect(
    screen.getByRole("link", { name: /Streamer A/i }),
  ).toHaveAttribute("href", "/waivers/lg1?addPlayerId=fa-a")
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/unit/StreamingPlansPanel.test.tsx`
Expected: FAIL — missing Spot/Roster copy (or path encoding fail on this machine — if jsdom path fails, run from a path without broken Unicode or skip env note in Task 6)

- [ ] **Step 3: Implement panel**

Structure sketch:

```tsx
// For each plan:
// - find union of dates from plan.days (preserve order)
// - for spotIndex in 0..spotCount-1, row of cells by date lookup
<table>
  <thead>
    <tr>
      <th>Spot</th>
      {dates.map((d) => <th key={d}>{formatDayLabel(d)}</th>)}
    </tr>
  </thead>
  <tbody>
    {Array.from({ length: plan.spotCount }, (_, spotIndex) => (
      <tr key={spotIndex}>
        <th scope="row">Spot {spotIndex + 1}</th>
        {dates.map((date) => {
          const cell = plan.days.find((d) => d.date === date)?.cells.find(
            (c) => c.spotIndex === spotIndex,
          )
          // render Hold / Add / Drop+Add / empty + roster line
        })}
      </tr>
    ))}
  </tbody>
</table>
```

Cell copy rules from spec §5. Wrap Add FA name in Link; Drop name is plain text. Roster line muted.

Remove old `Drop→Add` single-label style; show separate Drop / Add lines.

- [ ] **Step 4: Run panel test — expect PASS**

Run: `npx vitest run tests/unit/StreamingPlansPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/StreamingPlansPanel.tsx tests/unit/StreamingPlansPanel.test.tsx
git commit -m "feat(matchup): render streaming plans as calendar grid with drops"
```

---

### Task 6: Verification pass

**Files:**
- Read-only verification; fix only breakages from Tasks 1–5

- [ ] **Step 1: Run planner + API suites**

Run: `npx vitest run tests/unit/streamingPlans.test.ts tests/api/matchup.test.ts tests/unit/matchupStreamers.test.ts`
Expected: PASS

- [ ] **Step 2: Run panel test if path encoding allows**

Run: `npx vitest run tests/unit/StreamingPlansPanel.test.tsx`
Expected: PASS (or document known OneDrive Unicode jsdom failure and rely on Task 5 agent evidence)

- [ ] **Step 3: Manual smoke checklist (for human)**

- Matchup → Streaming plans: days as columns, Spot rows
- Drop→Add cell shows previous FA name
- Add cell shows `Roster: drop …` or `Roster: open slot`
- Waiver link still works for Add FA

- [ ] **Step 4: Commit only if verification required fixes**

```bash
git status
# commit only if you fixed breakages
```

---

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| Horizontal calendar (days columns, spots rows) | 5 |
| Name previous FA on Drop→Add (`droppedPlayerId`) | 2, 5 |
| Roster drop ranking + same-day exclusion | 3 |
| Always show roster line; `open_slot` when empty non-IL | 3, 5 |
| `playersById` includes drop ids | 4 |
| Keep 1/2/3 plans + 7-add greedy FA fill | unchanged; 1–3 only extend cells |
| Tests for planner / API / panel | 2–5, 6 |

## Placeholder / type consistency check

- Field names match throughout: `droppedPlayerId`, `rosterDropPlayerId`, `rosterDropKind`
- Kinds: `"player" | "open_slot" | "none"` only
- No TBD / “similar to Task N” gaps
