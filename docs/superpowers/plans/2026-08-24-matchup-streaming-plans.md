# Matchup Streaming Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Matchup Streamers list with 1-/2-/3-spot weekly streaming plans that schedule FA adds day-by-day under a 7-add budget.

**Architecture:** Pure planner in `src/lib/matchup/streamingPlans.ts` builds three greedy plans from FA pool + schedule + matchup board weak cats. `adviseMatchup` attaches `streamingPlans` to advice. New `StreamingPlansPanel` renders the three plans; Sit/Start stays below and compact.

**Tech Stack:** TypeScript, Vitest, existing Matchup React components, Next.js Matchup workspace.

## Global Constraints

- Weekly budget: **7 adds only** (`WEEKLY_ADD_LIMIT = 7`); drops never consume the budget
- Always emit plans for spot counts **1, 2, and 3**
- Spots are **virtual** (not bound to BE/UTIL indices)
- Display games as **integers**; B2B as `· N B2B` (no fractional `2.75`)
- Candidates: `state.availablePlayerIds` only
- No semicolons in TS; match existing Matchup styling tokens
- Spec: `docs/superpowers/specs/2026-08-24-matchup-streaming-plans-design.md`

## File map

| File | Responsibility |
|---|---|
| `src/lib/matchup/constants.ts` | `WEEKLY_ADD_LIMIT = 7` |
| `src/lib/matchup/types.ts` | `StreamingPlan*` types; extend `MatchupAdvice` |
| `src/lib/matchup/streamingPlans.ts` | Greedy planner + `buildAllStreamingPlans` |
| `src/lib/matchup/streamers.ts` | Reuse scoring helpers if exported; keep `suggestStreamers` for back-compat |
| `src/lib/matchup/advise.ts` | Attach `streamingPlans` |
| `src/components/matchup/StreamingPlansPanel.tsx` | UI for three plans |
| `src/components/matchup/MatchupWorkspace.tsx` | Swap Streamers → Streaming plans |
| `tests/unit/streamingPlans.test.ts` | Planner unit tests |
| `tests/unit/matchupStreamers.test.ts` / Matchup tests | Advice + UI expectations |

---

### Task 1: Types + add-limit constant

**Files:**
- Modify: `src/lib/matchup/constants.ts`
- Modify: `src/lib/matchup/types.ts`
- Test: `tests/unit/streamingPlans.test.ts` (create; import types/constant only first)

**Interfaces:**
- Produces:
  - `WEEKLY_ADD_LIMIT` number constant `7`
  - Types: `StreamingPlanSpotCount`, `StreamingPlanAction`, `StreamingPlanDayCell`, `StreamingPlanDay`, `StreamingPlan`
  - `MatchupAdvice.streamingPlans: StreamingPlan[]`

- [ ] **Step 1: Write failing test that imports the constant**

Create `tests/unit/streamingPlans.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { WEEKLY_ADD_LIMIT } from "@/lib/matchup/constants"

describe("WEEKLY_ADD_LIMIT", () => {
  it("is 7 ESPN-style weekly acquisitions", () => {
    expect(WEEKLY_ADD_LIMIT).toBe(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/streamingPlans.test.ts`
Expected: FAIL — `WEEKLY_ADD_LIMIT` not exported

- [ ] **Step 3: Add constant and types**

In `src/lib/matchup/constants.ts` add:

```ts
export const WEEKLY_ADD_LIMIT = 7
```

In `src/lib/matchup/types.ts` add (after `StreamerSuggestion`):

```ts
export type StreamingPlanSpotCount = 1 | 2 | 3

export type StreamingPlanAction = "hold" | "add" | "drop_add" | "empty"

export type StreamingPlanDayCell = {
  spotIndex: number
  playerId: string | null
  action: StreamingPlanAction
}

export type StreamingPlanDay = {
  date: string
  cells: StreamingPlanDayCell[]
}

export type StreamingPlan = {
  spotCount: StreamingPlanSpotCount
  addLimit: typeof WEEKLY_ADD_LIMIT | number
  addsUsed: number
  gameStarts: number
  days: StreamingPlanDay[]
}
```

Prefer `addLimit: number` with runtime value `WEEKLY_ADD_LIMIT` to avoid circular imports — **do not** import `WEEKLY_ADD_LIMIT` into `types.ts`. Use:

```ts
export type StreamingPlan = {
  spotCount: StreamingPlanSpotCount
  addLimit: number
  addsUsed: number
  gameStarts: number
  days: StreamingPlanDay[]
}
```

Extend `MatchupAdvice`:

```ts
export type MatchupAdvice = {
  opponentTeamIndex: number
  scoringPeriod: {
    scoringPeriodId: number
    startDate: string
    endDate: string
    days: string[]
  }
  board: MatchupBoard
  sitStart: SitStartSuggestion[]
  streamers: StreamerSuggestion[]
  streamingPlans: StreamingPlan[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/streamingPlans.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/constants.ts src/lib/matchup/types.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): add streaming plan types and weekly add limit"
```

---

### Task 2: Greedy planner — 1-spot add budget + hold/drop rules

**Files:**
- Create: `src/lib/matchup/streamingPlans.ts`
- Modify: `tests/unit/streamingPlans.test.ts`
- Optionally export a thin score helper from `src/lib/matchup/streamers.ts` if needed

**Interfaces:**
- Consumes: `WEEKLY_ADD_LIMIT`, `StreamingPlan` types, `ScheduleResponse`, `SeasonLeagueState`, `MatchupBoard`, `gameWeightForTeamDate` / presence via schedule games, integer game-day checks
- Produces:
  - `buildStreamingPlan(input): StreamingPlan`
  - Input shape:

```ts
export type BuildStreamingPlanInput = {
  spotCount: 1 | 2 | 3
  state: SeasonLeagueState
  schedule: ScheduleResponse
  board: MatchupBoard
  addLimit?: number // default WEEKLY_ADD_LIMIT
}
```

**Algorithm reminder (from spec):** each day, drop no-game occupants (free), then fill empty spots with best FA who plays that day if adds remain; hold if occupant plays.

- [ ] **Step 1: Write failing tests for 1-spot budget and hold**

Append to `tests/unit/streamingPlans.test.ts` a minimal fixture (2–3 FA, 3 days) and:

```ts
import { buildStreamingPlan } from "@/lib/matchup/streamingPlans"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { MatchupBoard } from "@/lib/matchup/types"
import type { ScheduleResponse, SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

// helpers: player(), emptyBoardLosingStl(), tinyState(), tinySchedule()
// FA a plays Mon+Wed, FA b plays Tue; both available

it("1-spot never exceeds add limit and charges 1 add for drop then add", () => {
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board,
    addLimit: 7,
  })
  expect(plan.addsUsed).toBeLessThanOrEqual(7)
  expect(plan.addLimit).toBe(7)
  // Mon Add A, Tue Drop→Add B (1 add), Wed Drop→Add A (1 add) → addsUsed === 3
  expect(plan.addsUsed).toBe(3)
  expect(plan.days[0].cells[0]).toMatchObject({ action: "add", playerId: "fa-a" })
  expect(plan.days[1].cells[0].action).toBe("drop_add")
})

it("holds a player across consecutive game days without spending adds", () => {
  // schedule where fa-a plays Mon and Tue
  const plan = buildStreamingPlan({ spotCount: 1, state, schedule, board })
  expect(plan.days[0].cells[0].action).toBe("add")
  expect(plan.days[1].cells[0]).toMatchObject({ action: "hold", playerId: "fa-a" })
  expect(plan.addsUsed).toBe(1)
})
```

Use concrete fixture data in the test file (full players/projections/shooting stubs matching other matchup tests).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/streamingPlans.test.ts`
Expected: FAIL — `buildStreamingPlan` missing

- [ ] **Step 3: Implement `buildStreamingPlan`**

Create `src/lib/matchup/streamingPlans.ts`:

- Resolve FA list from `state.availablePlayerIds`
- `playsOn(player, day)` via schedule games home/away match on `teamAbbr`
- Weak cats from board L/T (same idea as `streamers.ts`)
- Score FA with counting-cat contribution using `weeklyPlayerStats(player, 1)` for same-day pick, or reuse exported helpers from streamers if you export `streamerScore`-like function — prefer **local copy of weak-cat score** to avoid large refactors
- Per day loop as spec; actions:
  - occupied + plays → `hold`
  - occupied + no play → drop (clear), then if add available pick replacement → `drop_add`, else `empty`
  - empty + add available + candidate → `add`
  - else `empty`
- `gameStarts` = cells with `playerId` and plays that day
- Return `{ spotCount, addLimit, addsUsed, gameStarts, days }`

Do not use B2B 0.75 for seating decisions; presence is boolean.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/streamingPlans.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): greedy 1-spot streaming plan builder"
```

---

### Task 3: Multi-spot plans + `buildAllStreamingPlans`

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts`
- Modify: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Produces: `buildAllStreamingPlans(inputOmitSpotCount): StreamingPlan[]` → exactly `[1,2,3]` spot plans

- [ ] **Step 1: Write failing tests**

```ts
it("2-spot can seat two different FAs on the same day using two adds", () => {
  const plan = buildStreamingPlan({ spotCount: 2, state, schedule, board })
  const day0 = plan.days[0].cells
  expect(day0).toHaveLength(2)
  expect(new Set(day0.map((c) => c.playerId)).size).toBe(2)
  expect(plan.addsUsed).toBeGreaterThanOrEqual(2)
})

it("buildAllStreamingPlans returns spot counts 1, 2, and 3", () => {
  const plans = buildAllStreamingPlans({ state, schedule, board })
  expect(plans.map((p) => p.spotCount)).toEqual([1, 2, 3])
  for (const plan of plans) {
    expect(plan.addsUsed).toBeLessThanOrEqual(WEEKLY_ADD_LIMIT)
  }
})
```

- [ ] **Step 2: Run tests — expect FAIL** on `buildAllStreamingPlans` / 2-spot behavior if incomplete

- [ ] **Step 3: Implement multi-spot filling**

Same-day: fill spot 0 then 1 then 2; skip FA already chosen for another spot that day; each new seat costs one add.

```ts
export const buildAllStreamingPlans = (
  input: Omit<BuildStreamingPlanInput, "spotCount">,
): StreamingPlan[] =>
  ([1, 2, 3] as const).map((spotCount) =>
    buildStreamingPlan({ ...input, spotCount }),
  )
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): build 1-3 spot streaming plans"
```

---

### Task 4: Wire `adviseMatchup`

**Files:**
- Modify: `src/lib/matchup/advise.ts`
- Modify: `tests/unit/matchupStreamers.test.ts` (advise assertions)

**Interfaces:**
- Consumes: `buildAllStreamingPlans`
- Produces: `MatchupAdvice.streamingPlans` length 3

- [ ] **Step 1: Extend advise test**

In `tests/unit/matchupStreamers.test.ts` inside `returns board sitStart streamers for valid opponent`:

```ts
expect(advice.streamingPlans).toHaveLength(3)
expect(advice.streamingPlans.map((p) => p.spotCount)).toEqual([1, 2, 3])
```

- [ ] **Step 2: Run test — expect FAIL** (missing field)

- [ ] **Step 3: Update `adviseMatchup`**

```ts
import { buildAllStreamingPlans } from "./streamingPlans"

// after board computed:
const streamingPlans = buildAllStreamingPlans({ state, schedule, board })

return {
  opponentTeamIndex,
  scoringPeriod: schedule.matchup,
  board,
  sitStart,
  streamers, // keep for back-compat
  streamingPlans,
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/matchupStreamers.test.ts` — PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/advise.ts tests/unit/matchupStreamers.test.ts
git commit -m "feat(matchup): include streamingPlans in matchup advice"
```

---

### Task 5: `StreamingPlansPanel` UI

**Files:**
- Create: `src/components/matchup/StreamingPlansPanel.tsx`
- Create: `tests/unit/StreamingPlansPanel.test.tsx`
- Optionally leave `StreamersPanel.tsx` unused until Task 6

**Interfaces:**
- Consumes: `StreamingPlan[]`, `playersById`, `leagueId`
- Produces: section labeled “Streaming plans” with three subsections

- [ ] **Step 1: Write component test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { StreamingPlansPanel } from "@/components/matchup/StreamingPlansPanel"

it("renders 1-spot 2-spot and 3-spot plan headings with add summary", () => {
  render(
    <StreamingPlansPanel
      leagueId="lg1"
      playersById={{ "fa-a": { id: "fa-a", name: "Streamer A", teamAbbr: "BOS", positions: ["SG"], projections: {} as never, shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 } } }}
      plans={[
        { spotCount: 1, addLimit: 7, addsUsed: 3, gameStarts: 5, days: [] },
        { spotCount: 2, addLimit: 7, addsUsed: 5, gameStarts: 8, days: [] },
        { spotCount: 3, addLimit: 7, addsUsed: 7, gameStarts: 10, days: [] },
      ]}
    />,
  )
  expect(screen.getByRole("heading", { name: /streaming plans/i })).toBeInTheDocument()
  expect(screen.getByText(/1-spot/i)).toBeInTheDocument()
  expect(screen.getByText(/Adds 3\/7/i)).toBeInTheDocument()
})
```

Fill `projections` with real category keys if the type requires them (copy from matchupStreamers test helpers).

- [ ] **Step 2: Run — expect FAIL** (module missing)

- [ ] **Step 3: Implement panel**

UI requirements:
- H2: `Streaming plans`
- Short mute blurb: weekly add budget 7; drops free
- For each plan: heading `N-spot`, summary `Adds {addsUsed}/{addLimit} · {gameStarts} starts`
- Days table: date label + per-spot cell with name · positions · team, action label `Hold` / `Add` / `Drop→Add` / `—`
- If `action` is `add` or `drop_add` and `playerId`, wrap name in `Link` to `/waivers/${leagueId}?addPlayerId=${playerId}`

Match existing Matchup typography (`text-lg`, mute tokens, hairline borders). Keep visually lighter than Daily lineup.

- [ ] **Step 4: Run component test — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/StreamingPlansPanel.tsx tests/unit/StreamingPlansPanel.test.tsx
git commit -m "feat(matchup): add StreamingPlansPanel UI"
```

---

### Task 6: Wire MatchupWorkspace; retire Streamers panel from UI

**Files:**
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Modify: `tests/unit/MatchupWorkspace.test.tsx` if it asserts Streamers
- Keep `StreamersPanel.tsx` file unless unused-import lint forces delete — prefer delete only if nothing imports it

**Interfaces:**
- Matchup response type must include `streamingPlans` (already on `MatchupAdvice`)

- [ ] **Step 1: Update workspace test expectations**

Replace Streamers heading assertion with Streaming plans:

```ts
expect(screen.getByRole("heading", { name: /streaming plans/i })).toBeInTheDocument()
```

If the test mocks matchup JSON, add `streamingPlans: []` or three stub plans so render does not crash.

- [ ] **Step 2: Run MatchupWorkspace test — expect FAIL**

- [ ] **Step 3: Swap panel in workspace**

```tsx
import { StreamingPlansPanel } from "@/components/matchup/StreamingPlansPanel"

// in the lower stack, above SitStartPanel:
<StreamingPlansPanel
  leagueId={leagueId}
  playersById={matchupData.playersById}
  plans={matchupData.streamingPlans}
/>
<InjuryAlertsPanel ... />
<SitStartPanel ... />
```

Order per latest product preference: Injury → Streaming plans → Sit/Start (or Streaming plans then Injury then Sit/Start). Spec: streaming plans replace Streamers; Sit/Start stays below muted. Use:

`DailyLineup` → `InjuryAlerts` → `StreamingPlans` → `SitStart`.

Extend local `MatchupResponse` if needed so `streamingPlans` is required.

- [ ] **Step 4: Run** `npx vitest run tests/unit/MatchupWorkspace.test.tsx tests/unit/streamingPlans.test.ts tests/unit/matchupStreamers.test.ts` — PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/MatchupWorkspace.tsx tests/unit/MatchupWorkspace.test.tsx
git commit -m "feat(matchup): show streaming plans instead of streamer list"
```

---

### Task 7: Verification pass

- [ ] **Step 1: Run focused suite**

```bash
npx vitest run tests/unit/streamingPlans.test.ts tests/unit/StreamingPlansPanel.test.tsx tests/unit/matchupStreamers.test.ts tests/unit/MatchupWorkspace.test.tsx
```

Expected: all PASS

- [ ] **Step 2: Manual smoke (if dev server available)**

Open a Matchup league → confirm three plans, Adds x/7, day rows, Sit/Start still at bottom.

- [ ] **Step 3: Final commit only if verification fixed leftovers**

Otherwise done.

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| 1/2/3-spot plans | 3, 4, 6 |
| Add limit 7; drops free | 1, 2 |
| Day-by-day Hold/Add/Drop→Add | 2, 5 |
| Summary adds + starts | 2, 5 |
| FA pool + schedule | 2 |
| Integer games / B2B note (optional on cells) | 5 (action labels; B2B optional annotation via existing `formatStreamerGamesLabel` if easy) |
| Replace Streamers UI; Sit/Start compact below | 6 |
| Advise payload `streamingPlans` | 4 |

## Placeholder scan

No TBD/TODO steps; commands and types named explicitly.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-24-matchup-streaming-plans.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks  

**2. Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
