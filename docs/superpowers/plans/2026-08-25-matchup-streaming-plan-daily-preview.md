# Streaming Plan → Daily Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the manager preview a 1/2/3-spot streaming plan on the Daily lineup grid and H2H board via a virtual `DailyLineups`, without mutating saved localStorage state.

**Architecture:** Pure `applyStreamingPlanPreview` builds `previewDaily` from saved daily + plan. `MatchupWorkspace` holds `previewSpotCount`, computes `displayDaily`, feeds board + Daily panel. `StreamingPlansPanel` exposes None/1/2/3 selector. Daily toggles disabled while previewing.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, existing `dailyLineups` / `streamingPlans` / `buildMatchupBoard`.

## Global Constraints

- Preview only — never `writeDailyLineups` for preview
- Default selection `None`
- Drop roster player from add-day through week end
- Seat streamers only on NBA game days
- Slot fill: empty → drop-freed → no-game occupant; never displace game-day starter in MVP
- Disable daily toggles while preview active
- Resolve streamer names via enriched `playersById`

## File map

| File | Role |
|------|------|
| `src/lib/matchup/applyStreamingPlanPreview.ts` | Pure preview apply |
| `tests/unit/applyStreamingPlanPreview.test.ts` | Unit tests |
| `src/components/matchup/MatchupWorkspace.tsx` | Selection state, displayDaily, board |
| `src/components/matchup/StreamingPlansPanel.tsx` | Preview selector UI |
| `src/components/matchup/DailyLineupPanel.tsx` | Overlay rows, disabled toggles, banner |
| `tests/unit/StreamingPlansPanel.test.tsx` and/or workspace/daily tests | UI smoke |

---

### Task 1: `applyStreamingPlanPreview` + unit tests

**Files:**
- Create: `src/lib/matchup/applyStreamingPlanPreview.ts`
- Create: `tests/unit/applyStreamingPlanPreview.test.ts`

**Interfaces:**

```ts
export const applyStreamingPlanPreview = (
  baseDaily: DailyLineups,
  plan: StreamingPlan,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): DailyLineups
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest"
import { applyStreamingPlanPreview } from "@/lib/matchup/applyStreamingPlanPreview"
import { youTotalsFromDaily } from "@/lib/matchup/dailyLineups"
// use tiny fixtures: base daily with JJJ started all days;
// plan day0 add streamer + rosterDrop JJJ; day1 hold streamer with game
// assert JJJ absent from day0..end; streamer present on game days only;
// youTotalsFromDaily PTS (or STL) increases vs base when streamer has games
```

Include:

1. Roster drop clears player from add-day onward  
2. Streamer not seated on off night  
3. Multi-spot two different FAs same day when both have games  
4. Base daily not mutated (reference inequality / deep clone)

- [ ] **Step 2: Run — RED**

```bash
npm test -- tests/unit/applyStreamingPlanPreview.test.ts
```

- [ ] **Step 3: Implement**

Deep-copy `baseDaily`. Walk `plan.days` in order:

```ts
for (const day of plan.days) {
  const date = day.date
  for (const cell of day.cells) {
    if (cell.action === "add" && cell.rosterDropKind === "player" && cell.rosterDropPlayerId) {
      for (const d of matchupDays.filter((x) => x >= date)) {
        clearPlayerFromDay(next[d], cell.rosterDropPlayerId)
      }
    }
  }
  for (const cell of day.cells) {
    if (!cell.playerId) continue
    if (cell.action === "empty") continue
    const player = resolve(playersById, cell.playerId)
    if (!player?.teamAbbr || gameWeightForTeamDate(...) === 0) continue
    seatPlayer(next[date], cell.playerId, /* rules */)
  }
}
```

Use `ACTIVE` / roster slot list consistent with `dailyLineups` (same active entries array length as base day).

- [ ] **Step 4: GREEN**

```bash
npm test -- tests/unit/applyStreamingPlanPreview.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/applyStreamingPlanPreview.ts tests/unit/applyStreamingPlanPreview.test.ts
git commit -m "feat(matchup): apply streaming plan preview onto daily lineups"
```

---

### Task 2: Workspace wiring + panel selector + Daily overlay

**Files:**
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Modify: `src/components/matchup/DailyLineupPanel.tsx`
- Modify: `tests/unit/StreamingPlansPanel.test.tsx` (and/or new `DailyLineupPanel` preview test)

**Interfaces:**

```ts
// StreamingPlansPanel
previewSpotCount: 1 | 2 | 3 | null
onPreviewSpotCountChange: (spot: 1 | 2 | 3 | null) => void

// DailyLineupPanel
previewActive?: boolean
previewPlayerIds?: Set<string> | string[]
droppedPlayerIds?: Set<string> | string[]
extraPlayers?: SeasonPlayer[] // streamers not on roster
```

- [ ] **Step 1: Failing UI tests**

- StreamingPlansPanel: buttons None/1/2/3; clicking 1-spot calls `onPreviewSpotCountChange(1)`  
- DailyLineupPanel: when `previewActive`, toggle does not call `onTogglePlayerDay`; shows banner text / preview badge

- [ ] **Step 2: RED**

```bash
npm test -- tests/unit/StreamingPlansPanel.test.tsx
```

(and daily panel test file if added)

- [ ] **Step 3: Implement**

**Workspace:**

```ts
const [previewSpotCount, setPreviewSpotCount] = useState<1 | 2 | 3 | null>(null)
const plans = buildAllStreamingPlans({ ... }) // or get from panel — prefer build once in workspace OR pass plan from panel callback

// Prefer: panel builds plans internally today; either
// (a) lift buildAllStreamingPlans to workspace, or
// (b) panel calls onPreviewSpotCountChange and onPreviewPlan(plan | null)
// Locked: (b) panel passes selected plan upward:
onPreviewPlanChange: (plan: StreamingPlan | null) => void
```

```ts
const displayDaily =
  daily && previewPlan
    ? applyStreamingPlanPreview(daily, previewPlan, playersMap, schedule)
    : daily

const liveBoard = buildMatchupBoard(
  youTotalsFromDaily(displayDaily, playersForTotals, schedule),
  ...
)
// playersForTotals = state.players + any preview streamers from playersById
```

**StreamingPlansPanel:** preview control; when spot selected, find plan with `plan.spotCount === spot` and `onPreviewPlanChange(plan)`; None → null.

**DailyLineupPanel:** banner; merge `extraPlayers` into rows; style preview/dropped; if `previewActive`, no-op toggles.

- [ ] **Step 4: GREEN** focused tests + `matchupDailyLineups` regression if needed

```bash
npm test -- tests/unit/applyStreamingPlanPreview.test.ts tests/unit/StreamingPlansPanel.test.tsx tests/unit/matchupDailyLineups.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/MatchupWorkspace.tsx src/components/matchup/StreamingPlansPanel.tsx src/components/matchup/DailyLineupPanel.tsx tests/unit/
git commit -m "feat(matchup): preview streaming plan on daily lineup and board"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| `applyStreamingPlanPreview` rules | Task 1 |
| Board from preview daily | Task 2 |
| Selector None/1/2/3 | Task 2 |
| Daily overlay + disabled toggles | Task 2 |
| No localStorage write for preview | Task 2 |
| Clear restores saved | Task 2 |

## Self-review notes

- Prefer panel callback `(plan \| null)` so workspace does not duplicate budget/strategy state; panel already owns those controls.
- `youTotalsFromDaily` must see streamer `SeasonPlayer` objects — merge into players array for totals when previewing.
