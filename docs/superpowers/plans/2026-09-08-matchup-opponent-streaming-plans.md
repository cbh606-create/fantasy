# Matchup Opponent Streaming Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score our streaming adds against a simulated opponent who also streams from the same FA pool, and show that as Scoreboard Opp + a compact Opp week strip.

**Architecture:** Opt-in `oppSpotCount` on `buildStreamingPlan` runs an opponent fill after our turn each day, consuming leftover FAs. `scoreStreamerMove` can take a live `oppDaily` so both sides see a moving board. Workspace owns `Opp spots` (Auto/1/2/3) and reads `plan.opponentDays` / `plan.opponentDaily` from the preview plan, or the 1-spot plan when Preview is None.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS 4, Vitest. Branch `feat/published-nba-schedule`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-08-matchup-opponent-streaming-plans-design.md`
- UI copy English: `Opp spots`, `Auto · N open`, `Opp: {name}`, strip leading `Opp` or opponent team name
- `buildStreamingPlan` runs the opponent turn **only** when `oppSpotCount` is `1 | 2 | 3`. Omit it in existing tests so frozen-Opp behavior stays
- Do not stub `Date` globally — keep injecting `today: string`
- No semicolons; `handle*` event handlers; Tailwind only
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>`
- Windows PowerShell: no `&&`; chain with `;`. Commit with a PowerShell here-string, not bash HEREDOC
- Out of scope: predicted vs actual 9-cat, opponent PG–BE grid, full opponent 1/2/3 calendars, ESPN remaining-add / waiver order, persisting `oppSpotChoice`

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/matchup/opponentStreaming.ts` | Empty-seat Auto resolve; opponent day summary helpers |
| `src/lib/matchup/streamerMove.ts` | Optional live `oppDaily` when scoring a move |
| `src/lib/matchup/types.ts` | `OppSpotChoice`, `OpponentStreamDay`, fields on `StreamingPlan` |
| `src/lib/matchup/streamingPlans.ts` | Interleaved opponent fill; attach `opponentDays` / `opponentDaily` |
| `src/components/matchup/StreamingPlansPanel.tsx` | `oppSpotCount` + `onPlansBuilt`; `Opp: Name` on Add cells |
| `src/components/matchup/OpponentWeekStrip.tsx` | Compact week row + `Opp spots` control |
| `src/components/matchup/MatchupWorkspace.tsx` | Session `oppSpotChoice`; strip under Scoreboard; live Opp totals from sim |
| `tests/unit/opponentStreaming.test.ts` | Auto clamp |
| `tests/unit/streamerMove.test.ts` | Live-opp delta shrinks |
| `tests/unit/streamingPlans.test.ts` | Collision + opponentDays |
| `tests/unit/StreamingPlansPanel.test.tsx` | Hint + dropbox regression |
| `tests/unit/OpponentWeekStrip.test.tsx` | Strip + control |
| `tests/unit/MatchupWorkspace.test.tsx` | Control wiring / Preview None uses 1-spot sim |

---

### Task 1: Auto opponent spot count

**Files:**
- Create: `src/lib/matchup/opponentStreaming.ts`
- Create: `tests/unit/opponentStreaming.test.ts`
- Modify: `src/lib/matchup/types.ts` (add `OppSpotChoice` only)

**Interfaces:**
- Consumes: `SeasonRosterEntry` (`slot`, `playerId`)
- Produces:
  - `export type OppSpotChoice = "auto" | 1 | 2 | 3` in `types.ts`
  - `emptyNonIlSeatCount(entries: SeasonRosterEntry[]): number` — `slot !== "IL"` and `playerId == null`
  - `resolveOppSpotCount(choice: OppSpotChoice, entries: SeasonRosterEntry[]): 1 | 2 | 3` — if `choice !== "auto"` return `choice`; else `open === 0 ? 1 : clamp(open, 1, 3)`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/opponentStreaming.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  emptyNonIlSeatCount,
  resolveOppSpotCount,
} from "@/lib/matchup/opponentStreaming"

describe("resolveOppSpotCount", () => {
  it("uses two empty non-IL seats as Auto 2", () => {
    const entries = [
      { slot: "UTIL" as const, playerId: "opp-1" },
      { slot: "BE" as const, playerId: null },
      { slot: "BE" as const, playerId: null },
      { slot: "IL" as const, playerId: null },
    ]
    expect(emptyNonIlSeatCount(entries)).toBe(2)
    expect(resolveOppSpotCount("auto", entries)).toBe(2)
  })

  it("uses 1 spot when Auto and every non-IL seat is filled", () => {
    const entries = [
      { slot: "UTIL" as const, playerId: "opp-1" },
      { slot: "IL" as const, playerId: null },
    ]
    expect(emptyNonIlSeatCount(entries)).toBe(0)
    expect(resolveOppSpotCount("auto", entries)).toBe(1)
  })

  it("honors a manual 3 override", () => {
    expect(resolveOppSpotCount(3, [{ slot: "UTIL", playerId: "opp-1" }])).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/opponentStreaming.test.ts`

Expected: FAIL — cannot find module `@/lib/matchup/opponentStreaming`

- [ ] **Step 3: Write minimal implementation**

`src/lib/matchup/types.ts` — add next to `StreamingPlanSpotCount`:

```ts
export type OppSpotChoice = "auto" | 1 | 2 | 3
```

`src/lib/matchup/opponentStreaming.ts`:

```ts
import type { SeasonRosterEntry } from "@/lib/season/types"
import type { OppSpotChoice } from "./types"

export const emptyNonIlSeatCount = (entries: SeasonRosterEntry[]): number =>
  entries.filter((entry) => entry.slot !== "IL" && entry.playerId == null).length

export const resolveOppSpotCount = (
  choice: OppSpotChoice,
  entries: SeasonRosterEntry[],
): 1 | 2 | 3 => {
  if (choice !== "auto") return choice
  const open = emptyNonIlSeatCount(entries)
  if (open <= 0) return 1
  if (open >= 3) return 3
  return open as 1 | 2
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/opponentStreaming.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/lib/matchup/types.ts src/lib/matchup/opponentStreaming.ts tests/unit/opponentStreaming.test.ts
git commit -m @"
feat(matchup): resolve Auto opponent streamer spots from empty seats
"@
```

---

### Task 2: Score our add against live opponent daily

**Files:**
- Modify: `src/lib/matchup/streamerMove.ts` (`projectedCatWinsFromDaily`, `scoreStreamerMove`, `pickBestStreamerMove`)
- Modify: `tests/unit/streamerMove.test.ts` (append cases; create the file if missing)

**Interfaces:**
- Consumes: `youTotalsFromDaily`, `oppTotalsFromBoard`, `buildMatchupBoard`
- Produces: optional last arg / options field `oppDaily?: DailyLineups` on `scoreStreamerMove` and `pickBestStreamerMove`
  - When `oppDaily` is set, opponent totals = `youTotalsFromDaily(oppDaily, players, schedule)`
  - When omitted, keep `oppTotalsFromBoard(board)` (existing tests)

`scoreStreamerMove` signature after this task:

```ts
export const scoreStreamerMove = (
  workingDaily: DailyLineups,
  fromDate: string,
  addPlayerId: string,
  drop: StreamerMoveDrop,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  oppDaily?: DailyLineups,
): { delta: number; seatedGameDays: number; nextDaily: DailyLineups } | null
```

`pickBestStreamerMove` `options` gains `oppDaily?: DailyLineups` and passes it through.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/streamerMove.test.ts` (or create with the same vitest jsdom-free style as other lib tests). Reuse patterns from that file if present; otherwise:

```ts
import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import { scoreStreamerMove } from "@/lib/matchup/streamerMove"
import type { MatchupBoard } from "@/lib/matchup/types"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 16,
}
const shooting = { FGM: 1, FGA: 2, FTM: 1, FTA: 1 }

describe("scoreStreamerMove live oppDaily", () => {
  it("shrinks STL add delta after opponent already seats an STL streamer", () => {
    const faYou: SeasonPlayer = {
      id: "fa-you",
      name: "You STL",
      teamAbbr: "BOS",
      positions: ["SG"],
      projections: { ...projections, STL: 200 },
      shooting,
    }
    const faOpp: SeasonPlayer = {
      id: "fa-opp",
      name: "Opp STL",
      teamAbbr: "NYK",
      positions: ["PG"],
      projections: { ...projections, STL: 180 },
      shooting,
    }
    const players = [faYou, faOpp]
    const days = ["2025-11-03", "2025-11-04"]
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: days[0]!,
        endDate: days[1]!,
        days,
      },
      games: [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "WAS" },
      ],
    }
    const emptyDaily: DailyLineups = {
      "2025-11-03": [{ slot: "UTIL", playerId: null }],
      "2025-11-04": [{ slot: "UTIL", playerId: null }],
    }
    const oppDailyWithStreamer: DailyLineups = {
      "2025-11-03": [{ slot: "UTIL", playerId: "fa-opp" }],
      "2025-11-04": [{ slot: "UTIL", playerId: "fa-opp" }],
    }
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        you: categoryId === "STL" ? 1 : 10,
        opp: categoryId === "STL" ? 5 : 8,
        outcome: categoryId === "STL" ? "L" : "W",
        winProb: categoryId === "STL" ? 0.2 : 0.8,
      })),
      wins: 8,
      losses: 1,
      ties: 0,
      projectedCatWins: 7,
    }
    const frozen = scoreStreamerMove(
      emptyDaily,
      "2025-11-03",
      "fa-you",
      { kind: "none", playerId: null },
      players,
      schedule,
      board,
    )
    const live = scoreStreamerMove(
      emptyDaily,
      "2025-11-03",
      "fa-you",
      { kind: "none", playerId: null },
      players,
      schedule,
      board,
      oppDailyWithStreamer,
    )
    expect(frozen).not.toBeNull()
    expect(live).not.toBeNull()
    expect(live!.delta).toBeLessThan(frozen!.delta)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamerMove.test.ts`

Expected: FAIL — 8th argument ignored / `live.delta` equals `frozen.delta`

- [ ] **Step 3: Write minimal implementation**

In `projectedCatWinsFromDaily`, add optional `oppDaily`:

```ts
const projectedCatWinsFromDaily = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  oppDaily?: DailyLineups,
): number => {
  const categoryIds = categoryIdsFromBoard(board)
  if (categoryIds.length === 0) return 0
  const you = youTotalsFromDaily(daily, players, schedule)
  const opp = oppDaily
    ? youTotalsFromDaily(oppDaily, players, schedule)
    : oppTotalsFromBoard(board)
  return buildMatchupBoard(you, opp, categoryIds).projectedCatWins
}
```

Thread `oppDaily` through `scoreStreamerMove` (both before/after calls) and `pickBestStreamerMove` via `options?.oppDaily`.

- [ ] **Step 4: Run tests**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamerMove.test.ts`

Expected: PASS (including older cases that omit `oppDaily`)

- [ ] **Step 5: Commit**

```powershell
git add src/lib/matchup/streamerMove.ts tests/unit/streamerMove.test.ts
git commit -m @"
feat(matchup): score streamer adds against live opponent daily
"@
```

---

### Task 3: Interleaved opponent turn on the planner

**Files:**
- Modify: `src/lib/matchup/types.ts` (`OpponentStreamDay`, `StreamingPlan`)
- Modify: `src/lib/matchup/streamingPlans.ts` (`BuildStreamingPlanInput`, day loop, return value)
- Modify: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: `resolveRosterDrop` (existing in `streamingPlans.ts`), `pickBestStreamerMove` + `options.oppDaily`, `initDailyLineups`, `rosterSlotsFor`, `hasOpenNonIlRosterSlot` if already imported
- Produces:

```ts
export type OpponentStreamDay = {
  date: string
  streamerPlayerId: string | null
  rosterGameCount: number
}

export type StreamingPlan = {
  // existing fields
  opponentDays: OpponentStreamDay[]
  opponentDaily: DailyLineups
}

export type BuildStreamingPlanInput = {
  // existing fields
  oppSpotCount?: 1 | 2 | 3
}
```

When `oppSpotCount` is omitted: do not run opponent fill; return `opponentDays` with one row per matchup day `{ date, streamerPlayerId: null, rosterGameCount: 0 }` and `opponentDaily: {}`.

When set:

1. Init `oppWorkingDaily` with `initDailyLineups(days, opponentTeam.entries, rosterSlotsFor(state), state.players, schedule)`.
2. Track `oppOccupants: (string | null)[]` of length `oppSpotCount`, `oppAddsUsed`, `oppWeekDropped`.
3. After our day's cells are committed and `workingDaily` updated, **before** `days.push`:
   - `takenToday` = our cell `playerId`s for this date plus FAs already added either side this week
   - Fill opponent spots with the same hold/empty/add idea as us, but:
     - `forcedRosterDrops` always undefined
     - `pickBestStreamerMove(..., options: { recipes, oppDaily: youWorkingDaily })` so their `workingDaily` is `oppWorkingDaily` and live “opp” of that score is **our** daily
     - Candidate ids = schedule-gated FAs minus `takenToday` minus ids already in `oppOccupants`
     - Cap with the same `addLimit`
   - `streamerPlayerId` = the occupant (any spot) who plays that date, else the player just added, else `null`
   - `rosterGameCount` = number of `oppWorkingDaily[date]` entries with a `playerId` whose team has `gameWeightForTeamDate > 0`
4. Push `{ date, streamerPlayerId, rosterGameCount }` and continue. After the week, return `opponentDaily: oppWorkingDaily`.

Pass `oppDaily: oppWorkingDaily` into **our** `pickBestStreamerMove` calls when `oppSpotCount` is set (opponent streams from prior days already sit in `oppWorkingDaily`).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/streamingPlans.test.ts` using existing `player`, `tinyState`, `tinySchedule`, `emptyBoardLosingStl`, `baseProjections`:

```ts
it("keeps our FA on collision and gives the opponent the next STL FA", () => {
  const days = ["2025-11-03"]
  const faA = player("fa-a", "BOS", {
    projections: { ...baseProjections(), STL: 200 },
  })
  const faB = player("fa-b", "NYK", {
    projections: { ...baseProjections(), STL: 160 },
  })
  const you = player("you-1", "CHI")
  const opp = player("opp-1", "ATL")
  const state = tinyState([faA, faB, you, opp], ["fa-a", "fa-b"])
  state.teams[0]!.entries = [{ slot: "UTIL", playerId: "you-1" }]
  state.teams[1]!.entries = [{ slot: "UTIL", playerId: "opp-1" }]
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
    { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "DET" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    strategyMode: "aggressive",
    oppSpotCount: 1,
  })
  expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-a")
  expect(plan.opponentDays[0]!.streamerPlayerId).toBe("fa-b")
  expect(plan.opponentDays[0]!.streamerPlayerId).not.toBe(
    plan.days[0]!.cells[0]!.playerId,
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts -t "keeps our FA on collision"`

Expected: FAIL — `oppSpotCount` unused / `opponentDays` undefined

- [ ] **Step 3: Write minimal implementation**

1. Add types on `StreamingPlan` / `BuildStreamingPlanInput`.
2. Always return `opponentDays` + `opponentDaily` (empty sim when no `oppSpotCount`).
3. Inside the day loop, after our `pickBestStreamerMove` uses, pass `oppDaily: oppWorkingDaily` when simulating.
4. After our `dayCells` are built, if `oppSpotCount` is set, run opponent fill (hold occupants with remaining games; else `resolveRosterDrop(oppTeam.entries, ...)` with no forced map; `pickBestStreamerMove` on leftover FAs with `oppDaily: workingDaily`).
5. Record `OpponentStreamDay`.

Keep opponent fill as a function in `streamingPlans.ts` named `fillOpponentSpotsForDate` (same file, not a second planner) so the day loop stays readable. Do not invent a combinatorial search.

- [ ] **Step 4: Run tests**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts`

Expected: PASS including older plans tests (they omit `oppSpotCount`)

- [ ] **Step 5: Commit**

```powershell
git add src/lib/matchup/types.ts src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m @"
feat(matchup): interleave opponent streaming from leftover FAs
"@
```

---

### Task 4: Panel — pass spots, `Opp: Name`, keep dropbox rules

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Modify: `tests/unit/StreamingPlansPanel.test.tsx`

**Interfaces:**
- Consumes: `StreamingPlan.opponentDays`, `resolveOppSpotCount` (if resolving inside the panel — **do not**; parent passes resolved `1|2|3`)
- Produces:
  - Props: `oppSpotCount?: 1 | 2 | 3`, `onPlansBuilt?: (plans: StreamingPlan[]) => void`
  - `buildStreamingPlan({ ..., oppSpotCount })` when the prop is set
  - Add cell extra: if `plan.opponentDays` has `streamerPlayerId` for that date, muted `Opp: {name}` after existing meta/chips
  - `useEffect` that calls `onPlansBuilt(plans)` when `plans` change

- [ ] **Step 1: Write the failing test**

In `StreamingPlansPanel.test.tsx`, reuse `board`, `schedule`, `state`, Aggressive click:

```ts
it("shows Opp: name on add cells when the plan has opponentDays", () => {
  render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg1"
      oppSpotCount={1}
      playersById={{}}
      schedule={schedule}
      state={state}
      today="2025-11-03"
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: "Aggressive" }))
  expect(screen.getAllByText(/Opp:/).length).toBeGreaterThan(0)
})

it("still exposes a dropbox only on the first day of a future week", () => {
  render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg1"
      oppSpotCount={1}
      playersById={{}}
      schedule={schedule}
      state={state}
      today="2025-10-01"
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: "Aggressive" }))
  const dropRow = screen.getAllByRole("rowheader", { name: /^Drop$/i })[0]!.closest(
    "tr",
  )!
  expect(dropRow.querySelectorAll("td")[0]!.querySelector("select")).not.toBeNull()
  expect(dropRow.querySelectorAll("td")[1]!.querySelector("select")).toBeNull()
  expect(dropRow.querySelectorAll("td")[1]!.textContent?.trim()).not.toBe("—")
})
```

If the first test is flaky because opponent never adds in this fixture, set `state.teams[1].entries` to an empty UTIL and give the schedule NYK/BOS games already on `schedule`, or pass `onPlansBuilt` and assert `plans[0].opponentDays` is defined (still require the `Opp:` text when `streamerPlayerId` is set). Prefer asserting via `onPlansBuilt`:

```ts
it("passes built plans with opponentDays to onPlansBuilt", () => {
  const onPlansBuilt = vi.fn()
  render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg1"
      onPlansBuilt={onPlansBuilt}
      oppSpotCount={1}
      playersById={{}}
      schedule={schedule}
      state={state}
      today="2025-11-03"
    />,
  )
  expect(onPlansBuilt).toHaveBeenCalled()
  const plans = onPlansBuilt.mock.calls.at(-1)?.[0] as StreamingPlan[]
  expect(plans).toHaveLength(3)
  expect(plans[0]!.opponentDays).toHaveLength(schedule.matchup.days.length)
})
```

Keep the dropbox test as a regression.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/StreamingPlansPanel.test.tsx -t "onPlansBuilt|dropbox only on the first"`

Expected: FAIL — `oppSpotCount` / `onPlansBuilt` not in props

- [ ] **Step 3: Write minimal implementation**

Add props. In `useMemo` `buildStreamingPlan`, pass `oppSpotCount`. After `plans` is computed, `useEffect(() => { onPlansBuilt?.(plans) }, [plans, onPlansBuilt])`.

In `AddCell`, add optional `oppStreamerName?: string | null`. When truthy, after `meta`:

```tsx
<span className="mt-0.5 block text-[0.625rem] text-[var(--color-mute)]">
  Opp: {oppStreamerName}
</span>
```

Look up `plan.opponentDays.find((day) => day.date === date)?.streamerPlayerId` at the call site.

- [ ] **Step 4: Run tests**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/StreamingPlansPanel.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/components/matchup/StreamingPlansPanel.tsx tests/unit/StreamingPlansPanel.test.tsx
git commit -m @"
feat(matchup): thread opponent spots into streaming plans panel
"@
```

---

### Task 5: Opp week strip, spots control, live Scoreboard Opp

**Files:**
- Create: `src/components/matchup/OpponentWeekStrip.tsx`
- Create: `tests/unit/OpponentWeekStrip.test.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Modify: `tests/unit/MatchupWorkspace.test.tsx`

**Interfaces:**
- Consumes: `OppSpotChoice`, `emptyNonIlSeatCount`, `resolveOppSpotCount`, `StreamingPlan.opponentDays`, `StreamingPlan.opponentDaily`, `youTotalsFromDaily`, `buildMatchupBoard`
- Produces:

```tsx
export const OpponentWeekStrip = ({
  days,
  opponentName,
  opponentDays,
  openSeatCount,
  oppSpotChoice,
  onOppSpotChoiceChange,
  playersById,
}: {
  days: string[]
  opponentName: string
  opponentDays: OpponentStreamDay[]
  openSeatCount: number
  oppSpotChoice: OppSpotChoice
  onOppSpotChoiceChange: (choice: OppSpotChoice) => void
  playersById: Record<string, SeasonPlayer>
}) => JSX.Element
```

Copy: label `Opp spots`; Auto button text `Auto · ${openSeatCount} open`; numbered buttons `1` `2` `3`; `aria-pressed` on the selected choice; per-day `aria-label` like `Opp Mon 11/3: 2 games, Streamer A`.

Workspace:

```ts
const [oppSpotChoice, setOppSpotChoice] = useState<OppSpotChoice>("auto")
const [builtPlans, setBuiltPlans] = useState<StreamingPlan[]>([])
const oppTeam = state.teams.find((team) => team.teamIndex === opponentTeamIndex)
const oppSpotCount = oppTeam
  ? resolveOppSpotCount(oppSpotChoice, oppTeam.entries)
  : undefined
const displayOppPlan =
  previewPlan ??
  builtPlans.find((plan) => plan.spotCount === 1) ??
  builtPlans[0] ??
  null
```

`liveBoard` Opp totals: if `displayOppPlan?.opponentDaily` has keys, `youTotalsFromDaily(displayOppPlan.opponentDaily, playersForTotals, schedule)`; else `oppTotalsFromBoard(matchupData.board)`.

Render `<OpponentWeekStrip />` immediately under `<MatchupBoard />` only when `oppTeam` exists. Hide the control (and strip) when there is no opponent team.

Pass `oppSpotCount={oppSpotCount}` and `onPlansBuilt={handlePlansBuilt}` into `StreamingPlansPanel`. Reset `oppSpotChoice` is **not** required on opponent change; resolving Auto against new entries is enough.

- [ ] **Step 1: Write the failing strip test**

`tests/unit/OpponentWeekStrip.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OpponentWeekStrip } from "@/components/matchup/OpponentWeekStrip"

describe("OpponentWeekStrip", () => {
  afterEach(() => cleanup())

  it("shows streamer name, dash on empty nights, and Auto open count", () => {
    const onOppSpotChoiceChange = vi.fn()
    render(
      <OpponentWeekStrip
        days={["2025-11-03", "2025-11-04"]}
        opponentName="Them"
        opponentDays={[
          {
            date: "2025-11-03",
            streamerPlayerId: "fa-b",
            rosterGameCount: 2,
          },
          {
            date: "2025-11-04",
            streamerPlayerId: null,
            rosterGameCount: 1,
          },
        ]}
        openSeatCount={2}
        oppSpotChoice="auto"
        onOppSpotChoiceChange={onOppSpotChoiceChange}
        playersById={{
          "fa-b": {
            id: "fa-b",
            name: "Opp Streamer",
            positions: ["PG"],
            projections: {
              FG_PCT: 0.5,
              FT_PCT: 0.8,
              TPM: 1,
              REB: 1,
              AST: 1,
              STL: 1,
              BLK: 1,
              TO: 1,
              PTS: 1,
            },
            shooting: { FGM: 1, FGA: 1, FTM: 1, FTA: 1 },
          },
        }}
      />,
    )
    expect(screen.getByText("Them")).toBeInTheDocument()
    expect(screen.getByText("Opp Streamer")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Auto · 2 open/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    fireEvent.click(screen.getByRole("button", { name: /^3$/ }))
    expect(onOppSpotChoiceChange).toHaveBeenCalledWith(3)
  })
})
```

- [ ] **Step 2: Run strip test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/OpponentWeekStrip.test.tsx`

Expected: FAIL — module not found

- [ ] **Step 3: Implement strip + wire workspace**

`OpponentWeekStrip`: `section` `aria-label="Opponent week"`. Flex row, `overflow-x-auto`, day cells `w-20` to match `MATCHUP_WEEK_DAY_COL_CLASS`. Game count as `tabular-nums`, name `truncate text-[0.7rem]`.

`MatchupWorkspace`: state + `handlePlansBuilt` + `handleOppSpotChoiceChange`. Place strip under Scoreboard. Update `liveBoard` opp totals as specified.

Add/adjust a MatchupWorkspace test: after plans load, `getByLabelText("Opponent week")` exists; clicking `3` is pressed (if fetch mock already renders StreamingPlans). If the workspace test is too heavy, asserting the strip via `OpponentWeekStrip` plus a thin workspace test that `oppSpotCount` is passed is enough — still add one `getByLabelText("Opponent week")` in `MatchupWorkspace.test.tsx` on the existing happy-path render.

- [ ] **Step 4: Run tests**

Run:

```
npx.cmd vitest run --maxWorkers=1 tests/unit/OpponentWeekStrip.test.tsx
npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupWorkspace.test.tsx
npx.cmd vitest run --maxWorkers=1 tests/unit/StreamingPlansPanel.test.tsx
npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/components/matchup/OpponentWeekStrip.tsx src/components/matchup/MatchupWorkspace.tsx tests/unit/OpponentWeekStrip.test.tsx tests/unit/MatchupWorkspace.test.tsx
git commit -m @"
feat(matchup): show opponent week strip and spots control
"@
```

---

## Self-review (spec coverage)

| Spec item | Task |
|---|---|
| Interleaved we-first FA pool | 3 |
| Collision: we keep FA, they next-best | 3 |
| Auto empty seats, 0 → 1, manual 1/2/3 | 1, 5 |
| Session-only choice | 5 (`useState`) |
| Live Opp board + You stays Daily/Preview | 2, 5 |
| Opp week strip games + streamer | 5 |
| `Opp: Name` on our Add | 4 |
| Dropbox today / first day; later planned labels | 4 regression |
| Preview None → 1-spot opponent sim | 5 `displayOppPlan` |
| Same add budget | 3 (shared `addLimit`) |
| No opponent turn unless `oppSpotCount` | 3 |
| Missing opponent hides strip | 5 |
| Pred vs actual 9-cat | not scheduled |
| Tests §7.1–7.6 | 3, 1, 2, 5, 4, 5 |

No TBD/TODO placeholders. Names: `OppSpotChoice`, `resolveOppSpotCount`, `emptyNonIlSeatCount`, `OpponentStreamDay`, `oppSpotCount`, `onPlansBuilt`, `OpponentWeekStrip`.
