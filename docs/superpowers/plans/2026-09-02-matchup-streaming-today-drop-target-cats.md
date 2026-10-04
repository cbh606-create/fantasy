# Matchup Today Drop + Target Cats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick today's streaming drop (including Hold), show a hover suggestion for the weakest contested-cat roster player, and label each add with the cats it hunts — then Preview keeps Daily + board in sync.

**Architecture:** Pure contested-cat / target-cat / drop-suggestion math in `streamingDropExplain.ts`. Planner accepts `today` plus forced value `"hold"`, skips auto-drop on today when Hold, and does not stamp future drop names. Panel injects `today`, renders a `<select>` only on that date, and shows chips + tooltips.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS 4, Vitest. Branch `feat/published-nba-schedule`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-02-matchup-streaming-today-drop-target-cats-design.md`
- UI copy English: `Hold`, `Suggested drop: {name} — weakest for {CAT, CAT}`, `Helps STL, BLK`
- Chip labels from `CATEGORY_SHORT_LABELS` in `src/lib/season/formatCategoryStat.ts`
- Do not search drop+add pairs; do not add a week-level Stream-off control
- Do not stub `Date` globally — inject `today: string` into panel and planner
- No semicolons; `handle*` handlers; tests: `npx.cmd vitest run --maxWorkers=1 <path>`
- Windows PowerShell: no `&&`; commit via here-string, not bash HEREDOC

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/matchup/streamingDropExplain.ts` | Contested rows, drop suggestion, target cat ids, tooltip copy |
| `src/lib/matchup/types.ts` | `targetCategoryIds` on `StreamingPlanDayCell` |
| `src/lib/matchup/streamingPlans.ts` | `today`, forced `"hold"`, no future drop names, stamp target cats |
| `src/lib/matchup/streamingDropOptions.ts` | Hold option; today's list includes ADP-protected |
| `src/components/matchup/StreamingPlansPanel.tsx` | Today-only `<select>`, hover, chips |
| `tests/unit/streamingDropExplain.test.ts` | Scoring |
| `tests/unit/streamingPlans.test.ts` | Hold / today / future drop cells |
| `tests/unit/streamingDropOptions.test.ts` | Hold + no ADP filter |
| `tests/unit/StreamingPlansPanel.test.tsx` | Dropdown / tooltip / chips / preview |

---

### Task 1: Contested cats, drop suggestion, target chips (pure)

**Files:**
- Create: `src/lib/matchup/streamingDropExplain.ts`
- Create: `tests/unit/streamingDropExplain.test.ts`

**Interfaces:**
- Consumes: `MatchupBoard`, `MatchupCategoryRow`, `CategoryId`, `SeasonPlayer`, `DailyLineups`, `ScheduleResponse`, `applyStreamerMoveToDaily` / `youTotalsFromDaily` / `buildMatchupBoard` / `oppTotalsFromBoard` / `categoryIdsFromBoard`
- Produces:
  - `isContestedCategoryRow(row: MatchupCategoryRow): boolean` — `L` or `T`, or `W` with `winProb < 0.65`
  - `targetCategoryIdsFromBoards(before: MatchupBoard, after: MatchupBoard): CategoryId[]` — at most 3; contested (or L/T→W); sort by `after.winProb - before.winProb` desc; omit rows that were already `W` and `winProb >= 0.65`
  - `suggestStreamingDrop(input): { playerId: string; categoryIds: CategoryId[] } | null`
  - `formatSuggestedDropTooltip(name: string, categoryIds: CategoryId[]): string` — `Suggested drop: {name} — weakest for STL, BLK`
  - `formatHelpsCatsLine(categoryIds: CategoryId[]): string` — `Helps STL, BLK`

`suggestStreamingDrop` input:

```ts
type SuggestStreamingDropInput = {
  rosterPlayerIds: string[]
  players: SeasonPlayer[]
  workingDaily: DailyLineups
  fromDate: string
  schedule: ScheduleResponse
  board: MatchupBoard
}
```

For each roster id, clone daily, clear that player from `fromDate` onward (reuse `applyStreamerMoveToDaily` with a dummy add that seats 0 games, **or** clear-only helper). Prefer a small `removePlayerFromDailyFromDate(daily, playerId, fromDate)` in this file if `applyStreamerMoveToDaily` requires an add. Score `projectedCatWins` on **contested rows only** (sum of `winProb` on contested-before rows, or rebuild board and sum winProb where `isContestedCategoryRow(beforeRow)`). Pick the player with the largest positive contested-winProb delta. If none positive, pick the player with the worst (most negative) contested counting contribution this week via `weeklyPlayerStats` on contested cat ids (TO inverted). Always return that player + the contested cat ids they are weakest on (up to 3). Return `null` only when `rosterPlayerIds` is empty.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/streamingDropExplain.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { buildMatchupBoard } from "@/lib/matchup/board"
import {
  formatHelpsCatsLine,
  formatSuggestedDropTooltip,
  isContestedCategoryRow,
  targetCategoryIdsFromBoards,
} from "@/lib/matchup/streamingDropExplain"
import type { MatchupCategoryRow } from "@/lib/matchup/types"

const row = (
  categoryId: MatchupCategoryRow["categoryId"],
  outcome: MatchupCategoryRow["outcome"],
  winProb: number,
): MatchupCategoryRow => ({
  categoryId,
  you: 1,
  opp: 1,
  outcome,
  winProb,
})

describe("streamingDropExplain", () => {
  it("treats L, T, and fragile W as contested", () => {
    expect(isContestedCategoryRow(row("STL", "L", 0.2))).toBe(true)
    expect(isContestedCategoryRow(row("BLK", "T", 0.5))).toBe(true)
    expect(isContestedCategoryRow(row("PTS", "W", 0.64))).toBe(true)
    expect(isContestedCategoryRow(row("REB", "W", 0.65))).toBe(false)
  })

  it("picks up to 3 hunted cats and skips blowout wins", () => {
    const before = buildMatchupBoard(
      {
        FG_PCT: 0.5,
        FT_PCT: 0.8,
        TPM: 10,
        REB: 40,
        AST: 20,
        STL: 2,
        BLK: 2,
        TO: 10,
        PTS: 100,
      },
      {
        FG_PCT: 0.49,
        FT_PCT: 0.79,
        TPM: 10,
        REB: 40,
        AST: 20,
        STL: 8,
        BLK: 8,
        TO: 10,
        PTS: 100,
      },
      ALL_CATEGORY_IDS,
    )
    const after = buildMatchupBoard(
      {
        FG_PCT: 0.55,
        FT_PCT: 0.8,
        TPM: 10,
        REB: 40,
        AST: 20,
        STL: 9,
        BLK: 9,
        TO: 10,
        PTS: 100,
      },
      {
        FG_PCT: 0.49,
        FT_PCT: 0.79,
        TPM: 10,
        REB: 40,
        AST: 20,
        STL: 8,
        BLK: 8,
        TO: 10,
        PTS: 100,
      },
      ALL_CATEGORY_IDS,
    )
    expect(targetCategoryIdsFromBoards(before, after)).toEqual(["STL", "BLK"])
  })

  it("formats tooltip and helps line with short labels", () => {
    expect(formatSuggestedDropTooltip("Roster Cut", ["STL", "BLK"])).toBe(
      "Suggested drop: Roster Cut — weakest for STL, BLK",
    )
    expect(formatHelpsCatsLine(["STL", "BLK"])).toBe("Helps STL, BLK")
  })
})
```

Also add one `suggestStreamingDrop` test: two roster players, one with high STL on a board losing STL; removing the low-STL player should be suggested. Build a 1-day `DailyLineups` + schedule like `tests/unit/streamingPlans.test.ts` helpers (copy a minimal `player` / `tinySchedule` locally — do not import from that file).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingDropExplain.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation** in `src/lib/matchup/streamingDropExplain.ts` matching the interfaces above. Use `CATEGORY_SHORT_LABELS` for copy.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingDropExplain.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/lib/matchup/streamingDropExplain.ts tests/unit/streamingDropExplain.test.ts
git commit -m "feat(matchup): score streaming drop suggestions and target cats"
```

---

### Task 2: Planner — today Hold, no future drop names, stamp target cats

**Files:**
- Modify: `src/lib/matchup/types.ts` — add `targetCategoryIds: CategoryId[]` to `StreamingPlanDayCell` (default `[]` on every cell the planner builds)
- Modify: `src/lib/matchup/streamingPlans.ts` — `BuildStreamingPlanInput` and `resolveRosterDrop` / cell stamping
- Modify: `tests/unit/streamingPlans.test.ts` — cell shape + Hold / future drop
- Modify: any `StreamingPlanDayCell` object literals in tests that TypeScript now requires (`targetCategoryIds: []`)

**Interfaces:**
- Consumes: `targetCategoryIdsFromBoards`, `buildMatchupBoard`, `youTotalsFromDaily`, `oppTotalsFromBoard`
- Produces:
  - `BuildStreamingPlanInput.today?: string`
  - `forcedRosterDrops?: Record<string, string | "open_slot" | "hold">`
  - Today + `"hold"` → do **not** auto-pick a drop and do **not** spend an add that day for that spot
  - Days **after** `today` (when `today` is set): stamp `rosterDropKind: "none"`, `rosterDropPlayerId: null` even if an add is tentative
  - Forced player drop **may** be ADP-protected (`isValidForcedPlayerDrop` returns true for protected ids)
  - Add / `drop_add` cells set `targetCategoryIds` from before/after boards of that move; Hold / empty / hold-action cells use `[]`

- [ ] **Step 1: Write the failing test** in `tests/unit/streamingPlans.test.ts`

```ts
it("today hold spends no add and leaves future drops unnamed", () => {
  const days = ["2025-11-03", "2025-11-04"]
  const faA = player("fa-a", "BOS", {
    projections: { ...baseProjections(), STL: 180 },
  })
  const you = player("you-1", "CHI")
  const state = tinyState([faA, you], ["fa-a"], [
    { slot: "UTIL", playerId: "you-1" },
  ])
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    strategyMode: "aggressive",
    today: "2025-11-03",
    forcedRosterDrops: { "2025-11-03:0": "hold" },
  })
  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "hold",
    rosterDropKind: "none",
    targetCategoryIds: [],
  })
  expect(plan.days[1]!.cells[0]?.rosterDropPlayerId).toBeNull()
  expect(plan.days[1]!.cells[0]?.rosterDropKind).toBe("none")
})

it("forced protected player is an allowed today drop", () => {
  const days = ["2025-11-03"]
  const faA = player("fa-a", "BOS", {
    projections: { ...baseProjections(), STL: 180 },
  })
  const star = player("star", "CHI")
  const state = tinyState([faA, star], ["fa-a"], [
    { slot: "UTIL", playerId: "star" },
  ])
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "ORL" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    strategyMode: "aggressive",
    today: "2025-11-03",
    forcedRosterDrops: { "2025-11-03:0": "star" },
    adpByPlayerId: { star: 25 },
  })
  expect(plan.days[0]!.cells[0]?.rosterDropPlayerId).toBe("star")
  expect(plan.days[0]!.cells[0]?.targetCategoryIds?.length).toBeGreaterThan(0)
})
```

Adjust `tinyState` argument shape to match the existing helper in this file (read the current `tinyState` signature before writing).

Update the existing `StreamingPlanDayCell requires drop fields` object to include `targetCategoryIds: []`.

- [ ] **Step 2: Run** `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts`

Expected: FAIL (unknown `today` / `"hold"` / missing `targetCategoryIds`)

- [ ] **Step 3: Implement**

In `resolveRosterDrop`: if `forced === "hold"` return `{ kind: "none", playerId: null, didProtect: false }`. In the add loop, when `kind === "none"` **and** `forced === "hold"` for that key, skip spending an add (treat as hold). When `today` is set and `date > today`, after building the cell force `rosterDropPlayerId: null` and `rosterDropKind: "none"` (keep `playerId` / `action` for tentative adds). When stamping an add cell, compute boards from `workingDaily` before vs after the committed move and set `targetCategoryIds`. Relax `isValidForcedPlayerDrop` to allow ADP-protected ids.

- [ ] **Step 4: Re-run** `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/lib/matchup/types.ts src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): honor today hold and stamp add target cats"
```

---

### Task 3: Drop option lists — Hold + no ADP filter

**Files:**
- Modify: `src/lib/matchup/streamingDropOptions.ts`
- Modify: `tests/unit/streamingDropOptions.test.ts`

**Interfaces:**
- Consumes: existing `eligibleRosterDropPlayerIds`
- Produces:
  - `eligibleRosterDropPlayerIds(..., options?: { includeProtected?: boolean })` — when `includeProtected` is true (today's UI), skip `isProtectedRosterPlayer` filter
  - `rosterDropSelectOptions` prepends `{ value: "hold", label: "Hold" }` when `includeHold: true`

```ts
export const rosterDropSelectOptions = (input: {
  eligiblePlayerIds: string[]
  earlierDroppedIds: string[]
  allowOpenSlot: boolean
  includeHold?: boolean
  playersById: Record<string, SeasonPlayer>
}): { value: string; label: string }[]
```

Order: Hold (if requested), Open slot (if allowed), then names A–Z (existing).

- [ ] **Step 1: Write failing tests** in `tests/unit/streamingDropOptions.test.ts`

```ts
it("can prepend Hold", () => {
  const options = rosterDropSelectOptions({
    eligiblePlayerIds: ["a"],
    earlierDroppedIds: [],
    allowOpenSlot: false,
    includeHold: true,
    playersById,
  })
  expect(options[0]).toEqual({ value: "hold", label: "Hold" })
})
```

Add a test that `eligibleRosterDropPlayerIds` with `includeProtected: true` keeps an ADP≤60 player. Need entries + `adpByPlayerId`. Read the current function signature and pass the new options arg last so old callers stay valid.

- [ ] **Step 2: Run** `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingDropOptions.test.ts` — FAIL
- [ ] **Step 3: Implement** the optional flags
- [ ] **Step 4: Re-run** — PASS
- [ ] **Step 5: Commit**

```
git add src/lib/matchup/streamingDropOptions.ts tests/unit/streamingDropOptions.test.ts
git commit -m "feat(matchup): add Hold and unfiltered roster drop options"
```

---

### Task 4: Panel UI — today select, hover, chips, preview

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Modify: `tests/unit/StreamingPlansPanel.test.tsx`

**Interfaces:**
- Consumes: `today?: string` on `StreamingPlansPanel` (tests pass `"2025-11-03"`; production default = local `YYYY-MM-DD` via `const localIsoDate = () => { const d = new Date(); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }`)
- Consumes: Task 1 formatters + `suggestStreamingDrop`; Task 2 plan cells; Task 3 options
- Produces: today-only `aria-label={`Roster drop ${formatMatchupDayLabel(date)} spot ${n}`}` `<select>` with Hold + unfiltered roster; future cells show `—` with tooltip `Suggested drop:`; add chips from `targetCategoryIds`; `forcedRosterDrops` values include `"hold"`

`handleForcedRosterDropChange` must accept `"hold"` (extend the state type `Record<string, string | "open_slot" | "hold">`). Default today key to `"hold"` so the planner does not auto-drop today (set this when building `buildStreamingPlan` inputs: if `today` is in `days` and that key is unset, pass `"hold"`).

DropCell rules:
- `date === today` → `<select value={hold | open_slot | playerId}>`
- `date > today` → `<span>—</span>` + hover tooltip (reuse AddCellHoverTip portal pattern or a small `DropSuggestTip`)
- `date < today` → muted label of recorded drop / `Hold` / `—`, no select
- `today` not in matchup days → no select on any day; future-style `—` + tooltip is OK

Add cell: after name/meta, map `cell.targetCategoryIds` to mute chips using `CATEGORY_SHORT_LABELS`. Add hover line `formatHelpsCatsLine(...)`.

Update existing test `rebuilds with adpByPlayerId so ADP≤60 roster drops stay protected`: pass `today="2025-11-03"`. Expect `getByRole("combobox", { name: /Roster drop/i })` to include option `Star`. Summary text `Protected ADP ≤ 60` may still appear for planner auto-logic on other spots — if today Hold means no auto drop, do **not** assert Star is absent from the document; assert Star is an `<option>`.

- [ ] **Step 1: Write failing tests** in `tests/unit/StreamingPlansPanel.test.tsx`

```ts
it("shows a Hold dropbox only on today and chips on a chosen drop", () => {
  render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg1"
      playersById={{}}
      schedule={schedule}
      state={state}
      today="2025-11-03"
    />,
  )
  const todaySelect = screen.getAllByRole("combobox", {
    name: /Roster drop.*spot 1/i,
  })
  expect(todaySelect.length).toBeGreaterThan(0)
  expect(todaySelect[0]).toHaveDisplayValue("Hold")
  expect(
    screen.queryByRole("combobox", {
      name: new RegExp(formatMatchupDayLabel("2025-11-04"), "i"),
    }),
  ).not.toBeInTheDocument()

  fireEvent.change(todaySelect[0]!, { target: { value: "you-1" } })
  expect(screen.getAllByText("STL").length).toBeGreaterThan(0)
})

it("lists ADP-protected players in today's dropbox", () => {
  // reuse protectedState / protectedSchedule from the existing ADP test
  render(
    <StreamingPlansPanel
      adpByPlayerId={{ star: 25, scrub: 200 }}
      board={board}
      leagueId="lg1"
      playersById={{}}
      schedule={protectedSchedule}
      state={protectedState}
      today="2025-11-03"
    />,
  )
  const select = screen.getAllByRole("combobox", { name: /Roster drop/i })[0]
  expect(select).toHaveTextContent("Star")
})
```

Extend the existing preview test (or add one): Preview 1-spot + change today drop → `onPreviewPlanChange` called again with a plan whose today cell drop matches.

If `getByRole("combobox")` fails because native `<select>` names differ, use `getByLabelText(/Roster drop/i)`.

- [ ] **Step 2: Run** `npx.cmd vitest run --maxWorkers=1 tests/unit/StreamingPlansPanel.test.tsx`

Expected: FAIL (no `today` prop / no Hold default)

- [ ] **Step 3: Implement panel + DropCell + chips + tooltip**
- [ ] **Step 4: Re-run panel tests plus** `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts tests/unit/streamingDropExplain.test.ts tests/unit/streamingDropOptions.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/components/matchup/StreamingPlansPanel.tsx tests/unit/StreamingPlansPanel.test.tsx
git commit -m "feat(matchup): today-only dropbox, hold, and add cat chips"
```

---

## Spec coverage

| Spec § | Task |
|---|---|
| Today-only `<select>`, default Hold | 4 (UI), 2 (planner skip add) |
| All non-IL names, no ADP filter | 3, 2 forced protected, 4 test |
| Hover suggestion, not pre-selected | 1 + 4 |
| Future `—`, past read-only | 2 stamp + 4 render |
| Target cat chips + Helps line | 1 + 2 stamp + 4 |
| Preview follows today drop | 4 |
| No Stream-off, no pair search | none added |

## Placeholder scan

No TBD / “implement later” / “similar to Task N” without code.

## Type consistency

- Forced drop value: `string | "open_slot" | "hold"` in planner input, panel state, and `handleForcedRosterDropChange`
- Cell field: `targetCategoryIds: CategoryId[]`
- Injected date: `today?: string` on `buildStreamingPlan` and `StreamingPlansPanel`
