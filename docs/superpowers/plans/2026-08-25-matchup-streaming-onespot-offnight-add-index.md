# 1-Spot Off-Night Net-Starts & Add Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On 1-spot streaming plans, swap held streamers on off nights only when a FA has strictly more remaining week games; stamp each add/`drop_add` with a plan-wide `addIndex` and show it in the panel.

**Architecture:** Extend `StreamingPlanDayCell` with `addIndex`. In `buildStreamingPlan`, assign indices whenever an add is spent, and add a 1-spot-only off-night branch beside the existing early-swap loop that accepts upgrades when `remainingGameDays(upgrade) > remainingGameDays(held)`. `StreamingPlansPanel` renders a muted ordinal next to add names.

**Tech Stack:** TypeScript, Vitest, React Testing Library, existing `streamingPlans` / `StreamingPlansPanel`.

## Global Constraints

- Off-night net-starts swap: **1-spot only**
- Accept iff `remainingGameDays(upgrade, date) > remainingGameDays(held, date)`
- Held must **not** play today; must still have `remainingGameDays > 0`
- Existing on-game early-swap (`allowsEarlySwap` tier gate) unchanged for all spot counts
- 2-spot / 3-spot must not gain this off-night rule
- `addIndex` is 1-based, plan-wide (not per-spot); `null` on `hold` / `empty`
- Do not implement Approach B (budget-aware re-acquire) or C (always churn)

## File map

| File | Role |
|------|------|
| `src/lib/matchup/types.ts` | Add `addIndex: number \| null` on `StreamingPlanDayCell` |
| `src/lib/matchup/streamingPlans.ts` | Stamp `addIndex`; 1-spot off-night net-starts swap |
| `src/components/matchup/StreamingPlansPanel.tsx` | Render ordinal on add cells |
| `tests/unit/streamingPlans.test.ts` | Planner unit tests |
| `tests/unit/StreamingPlansPanel.test.tsx` | UI ordinal test |

---

### Task 1: `addIndex` on cells + planner stamping

**Files:**
- Modify: `src/lib/matchup/types.ts`
- Modify: `src/lib/matchup/streamingPlans.ts`
- Modify: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Produces: `StreamingPlanDayCell.addIndex: number | null`
- Produces: every `add` / `drop_add` cell gets chronological 1-based index; `hold` / `empty` get `null`

- [ ] **Step 1: Write failing tests**

In `tests/unit/streamingPlans.test.ts`, update the shape assert and add a sequencing test:

```ts
it("StreamingPlanDayCell requires drop fields", () => {
  const cell = assertCellShape({
    spotIndex: 0,
    playerId: "fa-a",
    action: "add",
    droppedPlayerId: null,
    rosterDropPlayerId: null,
    rosterDropKind: "open_slot",
    addIndex: 1,
  })
  expect(cell.addIndex).toBe(1)
})

it("stamps chronological addIndex on add and drop_add cells", () => {
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
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    strategyMode: "aggressive",
  })

  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "add",
    playerId: "fa-a",
    addIndex: 1,
  })
  expect(plan.days[1]!.cells[0]).toMatchObject({
    action: "drop_add",
    playerId: "fa-b",
    addIndex: 2,
  })
  // hold cells (if any in other fixtures) must use addIndex: null — covered in Task 2
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from physical worktree if jsdom/`@fs` flakes under junction):

```bash
npm test -- tests/unit/streamingPlans.test.ts
```

Expected: FAIL — `addIndex` missing on type/objects and/or undefined on cells.

- [ ] **Step 3: Minimal implementation**

1. In `types.ts`, add to `StreamingPlanDayCell`:

```ts
addIndex: number | null
```

2. In `streamingPlans.ts`, whenever constructing a cell:
   - `hold` / `empty` → `addIndex: null`
   - on each successful add spend (`addsUsed += 1` for early-swap or needFill), set `addIndex: addsUsed` **after** increment (so first add is `1`)

Helper pattern at each write site:

```ts
addsUsed += 1
addsBySpot[spotIndex]! += 1
// ...
addIndex: addsUsed,
```

Update **all** cell object literals in the builder (hold, early-swap drop_add, needFill add/drop_add/empty).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/streamingPlans.test.ts
```

Expected: PASS (including existing cases once `addIndex` is present; update any strict object fixtures that construct cells without `addIndex`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/types.ts src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): stamp plan-wide addIndex on streaming add cells"
```

---

### Task 2: 1-spot off-night net-starts swap

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (early-swap loop ~384–426)
- Modify: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: `remainingGameDays`, `playsOn`, `pickTodayBlock`, `addsUsed` / `addIndex` from Task 1
- Produces: on 1-spot off nights, `drop_add` when upgrade remaining games strictly exceed held

- [ ] **Step 1: Write failing tests**

```ts
describe("1-spot off-night net-starts swap", () => {
  const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]

  it("swaps on off night when upgrade has strictly more remaining games", () => {
    // Held BOS: Mon, Wed, Thu → Tue off, remaining from Tue = 2
    // Upgrade NYK: Tue, Wed, Thu → remaining from Tue = 3
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const nyk = player("fa-nyk", "NYK", {
      projections: { ...baseProjections(), STL: 190 },
    })
    const state = tinyState([bos, nyk], ["fa-bos", "fa-nyk"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-06", homeAbbr: "NYK", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-bos",
      addIndex: 1,
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-nyk",
      droppedPlayerId: "fa-bos",
      addIndex: 2,
    })
  })

  it("keeps hold on off night when upgrade has fewer or equal remaining games", () => {
    // Held BOS: Mon, Wed, Thu → Tue remaining = 2
    // Thin CHI: Tue only → remaining = 1 → no swap
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const state = tinyState([bos, chi], ["fa-bos", "fa-chi"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-bos",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-bos",
      addIndex: null,
    })
  })

  it("does not apply off-night net-starts rule on 2-spot", () => {
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const nyk = player("fa-nyk", "NYK", {
      projections: { ...baseProjections(), STL: 190 },
    })
    const state = tinyState([bos, nyk], ["fa-bos", "fa-nyk"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-06", homeAbbr: "NYK", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      addLimit: 7,
    })

    // Spot 0 may hold BOS through Tue; must not drop_add to NYK solely via 1-spot off-night rule
    const tueSpot0 = plan.days[1]!.cells[0]
    expect(tueSpot0?.action === "drop_add" && tueSpot0.droppedPlayerId === "fa-bos").toBe(
      false,
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/streamingPlans.test.ts
```

Expected: FAIL on swap case (Tue still `hold` on `fa-bos`).

- [ ] **Step 3: Minimal implementation**

In the early-swap loop in `streamingPlans.ts`, after loading `occupant` / budget checks, branch:

```ts
const heldPlaysToday = playsOn(occupant, date, schedule)
const heldRemaining = remainingGameDays(occupant, date, schedule)

const upgrade = pickTodayBlock(
  blocks,
  date,
  seatedToday,
  playersById,
  weakCats,
  strategyMode,
  dayIndex,
  dayCount,
)
if (!upgrade) continue
const upgradePlayer = playersById.get(upgrade.playerId)
if (!upgradePlayer || !playsOn(upgradePlayer, date, schedule)) continue
const upgradeRemaining = remainingGameDays(upgradePlayer, date, schedule)
if (upgradeRemaining <= 0) continue

const isOffNightNetStarts =
  spotCount === 1 &&
  !heldPlaysToday &&
  heldRemaining > 0 &&
  upgradeRemaining > heldRemaining

if (!isOffNightNetStarts) {
  // existing on-game early swap
  if (!heldPlaysToday) continue
  const held = blockFromDate(occupant, date, schedule)
  const heldRank = held ? densityTierRank(held.tier) : 0
  if (!allowsEarlySwap(strategyMode, heldRank, densityTierRank(upgrade.tier))) {
    continue
  }
}

// shared mutate: drop_add, addsUsed++, addIndex: addsUsed, ...
```

Keep cell writes identical to current early-swap success path (plus `addIndex` from Task 1).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/streamingPlans.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): 1-spot off-night swap when upgrade has more remaining starts"
```

---

### Task 3: Panel ordinal UI

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx` (`AddCell`)
- Modify: `tests/unit/StreamingPlansPanel.test.tsx`

**Interfaces:**
- Consumes: `cell.addIndex: number | null`
- Produces: muted small ordinal next to add / drop_add names

- [ ] **Step 1: Write failing test**

```ts
it("shows add ordinal next to streamer adds", () => {
  render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg1"
      playersById={{}}
      schedule={schedule}
      state={state}
    />,
  )

  const link = screen.getAllByRole("link", { name: /Streamer A/i })[0]
  const row = link?.closest("td")
  expect(row?.textContent).toMatch(/1/)
})
```

(If the fixture only has one add on day 1, assert a dedicated `aria-label` or class instead — prefer rendering:)

```tsx
{cell.addIndex != null ? (
  <span className="ml-0.5 text-[0.65rem] tabular-nums text-[var(--color-mute)]">
    {cell.addIndex}
  </span>
) : null}
```

and query:

```ts
expect(screen.getAllByText("1", { selector: "span" }).length).toBeGreaterThan(0)
```

Prefer a stable hook: `aria-label={`Add ${cell.addIndex}`}` on the ordinal span, then:

```ts
expect(screen.getAllByLabelText(/^Add \d+$/).length).toBeGreaterThan(0)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/StreamingPlansPanel.test.tsx
```

Expected: FAIL — missing `Add N` label.

- [ ] **Step 3: Minimal UI**

In `AddCell`, after the name `Link` / name `span` (for hold no ordinal), when `isAddAction(cell.action) && cell.addIndex != null`:

```tsx
<span
  aria-label={`Add ${cell.addIndex}`}
  className="ml-0.5 text-[0.65rem] tabular-nums text-[var(--color-mute)]"
>
  {cell.addIndex}
</span>
```

Place between name and `meta`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/StreamingPlansPanel.test.tsx tests/unit/streamingPlans.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/StreamingPlansPanel.tsx tests/unit/StreamingPlansPanel.test.tsx
git commit -m "feat(matchup): show streaming plan add ordinals in panel"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| 1-spot off-night `remaining(upgrade) > remaining(held)` | Task 2 |
| 2/3-spot unchanged for this rule | Task 2 (2-spot test) |
| On-game early-swap unchanged | Task 2 (branch preserves tier gate) |
| `addIndex` on add/drop_add; null on hold/empty | Task 1 |
| Panel small ordinal | Task 3 |
| No Approach B/C | Not implemented |

## Placeholder / consistency self-review

- No TBD steps; `addIndex` naming consistent across tasks.
- Off-night branch uses same `pickTodayBlock` as early-swap (strategy still filters candidates).
