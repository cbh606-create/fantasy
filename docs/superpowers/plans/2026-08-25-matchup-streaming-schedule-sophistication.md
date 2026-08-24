# Matchup Streaming Schedule Sophistication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefer dense streaming blocks (3-in-4 / B2B), gate adds and early swaps by Aggressive/Balanced/Conservative strategy (board-suggested default), and expose a strategy toggle in the Streaming plans panel.

**Architecture:** Extract strategy helpers + a pass-1 block finder; keep the existing day-by-day greedy filler in `streamingPlans.ts` but gate add / early-swap / soft-cap with block tiers and mode policy. Client rebuilds plans when mode or add budget changes (same pattern as today’s budget control).

**Tech Stack:** TypeScript, Vitest, Testing Library, existing Matchup React components.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-25-matchup-streaming-schedule-sophistication-design.md`
- Weekly `addLimit` is a **hard ceiling** in every mode (Aggressive soft-cap +1 never exceeds it)
- Always emit plans for spot counts **1, 2, and 3**
- Preserve Hold-through-off-nights, soft-cap balancing, Add/Drop calendar UI, roster drop only on first `add`
- Category **score deltas** are out of scope; weak-cat remains tie-break + board suggestion only
- No semicolons in TS; Matchup styling tokens
- Block window = **4** matchup days; tiers: elite=3, strong=2, ok=1, thin=0

## File map

| File | Responsibility |
|---|---|
| `src/lib/matchup/types.ts` | `StreamingStrategyMode`; plan meta fields |
| `src/lib/matchup/streamingStrategy.ts` | Suggest mode, tier ranks, mode policy helpers |
| `src/lib/matchup/streamingBlocks.ts` | Pass-1 block finder |
| `src/lib/matchup/streamingPlans.ts` | Pass-2: use blocks + strategy gates; summary reasons |
| `src/lib/matchup/advise.ts` | No required API change if omitted mode → suggest (verify) |
| `src/components/matchup/StreamingPlansPanel.tsx` | Strategy toggle + summary reasons |
| `tests/unit/streamingStrategy.test.ts` | Suggest + policy helpers |
| `tests/unit/streamingBlocks.test.ts` | Tier / dedup coverage |
| `tests/unit/streamingPlans.test.ts` | Mode gates, early swap, regression |
| `tests/unit/StreamingPlansPanel.test.tsx` | Toggle rebuild + Suggested label |

---

### Task 1: Types + strategy helpers

**Files:**
- Modify: `src/lib/matchup/types.ts`
- Create: `src/lib/matchup/streamingStrategy.ts`
- Create: `tests/unit/streamingStrategy.test.ts`

**Interfaces:**
- Produces:
  - `StreamingStrategyMode = "aggressive" | "balanced" | "conservative"`
  - `StreamingPlan` fields: `strategyMode`, `suggestedStrategyMode`, `summaryReasons: string[]`
  - `suggestStreamingStrategyMode(board: MatchupBoard): StreamingStrategyMode`
  - `normalizeStreamingStrategyMode(value: unknown): StreamingStrategyMode`
  - `densityTierRank(tier: StreamingDensityTier): number`
  - `StreamingDensityTier = "elite" | "strong" | "ok" | "thin"`
  - `softCapForSpot(addLimit: number, spotCount: number, mode: StreamingStrategyMode): number`
  - `allowsThinFill(mode: StreamingStrategyMode, dayIndex: number, dayCount: number): boolean`
  - `allowsAddForTier(mode: StreamingStrategyMode, tier: StreamingDensityTier): boolean`
  - `allowsEarlySwap(mode: StreamingStrategyMode, heldRank: number, newRank: number): boolean`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/streamingStrategy.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { MatchupBoard } from "@/lib/matchup/types"
import {
  allowsEarlySwap,
  allowsThinFill,
  normalizeStreamingStrategyMode,
  softCapForSpot,
  suggestStreamingStrategyMode,
} from "@/lib/matchup/streamingStrategy"

const boardWithOutcomes = (losses: number, ties: number): MatchupBoard => {
  const total = ALL_CATEGORY_IDS.length
  const behind = losses + ties
  return {
    categories: ALL_CATEGORY_IDS.map((categoryId, index) => {
      let outcome: "W" | "L" | "T" = "W"
      if (index < losses) outcome = "L"
      else if (index < behind) outcome = "T"
      return {
        categoryId,
        you: 1,
        opp: 2,
        outcome,
        winProb: 0.4,
      }
    }),
    wins: total - behind,
    losses,
    ties,
    projectedCatWins: total - behind,
  }
}

describe("suggestStreamingStrategyMode", () => {
  it("suggests aggressive when behindRatio >= 0.5", () => {
    // 5 L of 9 cats → ~0.556
    expect(suggestStreamingStrategyMode(boardWithOutcomes(5, 0))).toBe(
      "aggressive",
    )
  })

  it("suggests conservative when behindRatio <= 0.25", () => {
    // 2 L of 9 → ~0.222
    expect(suggestStreamingStrategyMode(boardWithOutcomes(2, 0))).toBe(
      "conservative",
    )
  })

  it("suggests balanced otherwise", () => {
    expect(suggestStreamingStrategyMode(boardWithOutcomes(3, 0))).toBe(
      "balanced",
    )
  })

  it("suggests balanced for empty categories", () => {
    expect(
      suggestStreamingStrategyMode({
        categories: [],
        wins: 0,
        losses: 0,
        ties: 0,
        projectedCatWins: 0,
      }),
    ).toBe("balanced")
  })
})

describe("normalizeStreamingStrategyMode", () => {
  it("falls back to balanced for invalid values", () => {
    expect(normalizeStreamingStrategyMode("nope")).toBe("balanced")
    expect(normalizeStreamingStrategyMode(undefined)).toBe("balanced")
  })
})

describe("mode policy helpers", () => {
  it("Conservative never allows thin fill", () => {
    expect(allowsThinFill("conservative", 6, 7)).toBe(false)
  })

  it("Balanced allows thin only on last 2 days", () => {
    expect(allowsThinFill("balanced", 4, 7)).toBe(false)
    expect(allowsThinFill("balanced", 5, 7)).toBe(true)
    expect(allowsThinFill("balanced", 6, 7)).toBe(true)
  })

  it("Aggressive always allows thin when days remain", () => {
    expect(allowsThinFill("aggressive", 0, 7)).toBe(true)
  })

  it("early swap slack is +2 balanced / +1 aggressive", () => {
    expect(allowsEarlySwap("balanced", 0, 1)).toBe(false)
    expect(allowsEarlySwap("balanced", 0, 2)).toBe(true)
    expect(allowsEarlySwap("aggressive", 0, 1)).toBe(true)
    expect(allowsEarlySwap("conservative", 0, 3)).toBe(false)
  })

  it("Aggressive soft-cap is ceil(addLimit/spotCount)+1", () => {
    expect(softCapForSpot(7, 3, "balanced")).toBe(3)
    expect(softCapForSpot(7, 3, "aggressive")).toBe(4)
    expect(softCapForSpot(7, 3, "conservative")).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm test -- tests/unit/streamingStrategy.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Add types**

In `src/lib/matchup/types.ts`, add:

```ts
export type StreamingStrategyMode =
  | "aggressive"
  | "balanced"
  | "conservative"

export type StreamingDensityTier = "elite" | "strong" | "ok" | "thin"
```

Extend `StreamingPlan`:

```ts
export type StreamingPlan = {
  spotCount: StreamingPlanSpotCount
  addLimit: number
  addsUsed: number
  gameStarts: number
  days: StreamingPlanDay[]
  strategyMode: StreamingStrategyMode
  suggestedStrategyMode: StreamingStrategyMode
  summaryReasons: string[]
}
```

- [ ] **Step 4: Implement `streamingStrategy.ts`**

Create `src/lib/matchup/streamingStrategy.ts`:

```ts
import type {
  MatchupBoard,
  StreamingDensityTier,
  StreamingStrategyMode,
} from "./types"

const MODES: StreamingStrategyMode[] = [
  "aggressive",
  "balanced",
  "conservative",
]

export const normalizeStreamingStrategyMode = (
  value: unknown,
): StreamingStrategyMode =>
  typeof value === "string" &&
  (MODES as string[]).includes(value)
    ? (value as StreamingStrategyMode)
    : "balanced"

export const suggestStreamingStrategyMode = (
  board: MatchupBoard,
): StreamingStrategyMode => {
  const total = board.categories.length
  if (total === 0) return "balanced"
  const behind = board.categories.filter(
    (row) => row.outcome === "L" || row.outcome === "T",
  ).length
  const behindRatio = behind / total
  if (behindRatio >= 0.5) return "aggressive"
  if (behindRatio <= 0.25) return "conservative"
  return "balanced"
}

export const densityTierRank = (tier: StreamingDensityTier): number => {
  switch (tier) {
    case "elite":
      return 3
    case "strong":
      return 2
    case "ok":
      return 1
    case "thin":
      return 0
  }
}

export const softCapForSpot = (
  addLimit: number,
  spotCount: number,
  mode: StreamingStrategyMode,
): number => {
  const base = Math.ceil(addLimit / spotCount)
  return mode === "aggressive" ? base + 1 : base
}

export const allowsThinFill = (
  mode: StreamingStrategyMode,
  dayIndex: number,
  dayCount: number,
): boolean => {
  if (mode === "conservative") return false
  if (mode === "aggressive") return true
  return dayIndex >= Math.max(0, dayCount - 2)
}

export const allowsAddForTier = (
  mode: StreamingStrategyMode,
  tier: StreamingDensityTier,
): boolean => {
  if (mode === "conservative") return tier === "elite" || tier === "strong"
  if (mode === "balanced") return tier !== "thin"
  return true
}

export const allowsEarlySwap = (
  mode: StreamingStrategyMode,
  heldRank: number,
  newRank: number,
): boolean => {
  if (mode === "conservative") return false
  const delta = newRank - heldRank
  if (mode === "aggressive") return delta >= 1
  return delta >= 2
}
```

Note: export `StreamingDensityTier` from types (alias name must match — use `StreamingDensityTier` everywhere, not `StreamingDensityTier` typo). If Task 1 Interfaces said `StreamingDensityTier`, use that exact name in types.

- [ ] **Step 5: Run tests — expect pass**

Run: `npm test -- tests/unit/streamingStrategy.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/matchup/types.ts src/lib/matchup/streamingStrategy.ts tests/unit/streamingStrategy.test.ts
git commit -m "feat(matchup): add streaming strategy mode helpers"
```

---

### Task 2: Block finder (pass 1)

**Files:**
- Create: `src/lib/matchup/streamingBlocks.ts`
- Create: `tests/unit/streamingBlocks.test.ts`
- Modify: `src/lib/matchup/streamingPlans.ts` (export or reuse `playsOn` — prefer moving `playsOn` / schedule helpers into a tiny shared place **or** duplicate `playsOn` in `streamingBlocks.ts` to avoid a big refactor; YAGNI: copy the small `playsOn` helper into `streamingBlocks.ts`)

**Interfaces:**
- Consumes: `ScheduleResponse`, `SeasonPlayer`, `StreamingDensityTier`
- Produces:
  - `StreamingBlock = { playerId, startDate, endDate, gameDates: string[], tier: StreamingDensityTier, gamesInWindow: number, remainingWeekGames: number }`
  - `findStreamingBlocks(players: SeasonPlayer[], schedule: ScheduleResponse): StreamingBlock[]`
  - `bestBlockStartingOn(blocks: StreamingBlock[], playerId: string, date: string): StreamingBlock | null`
  - `bestRemainingBlock(player: SeasonPlayer, fromDate: string, schedule: ScheduleResponse): StreamingBlock | null`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/streamingBlocks.test.ts` (reuse `player` / schedule helpers inline or import patterns from `streamingPlans.test.ts`):

```ts
import { describe, expect, it } from "vitest"
import { findStreamingBlocks } from "@/lib/matchup/streamingBlocks"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const projections = {
  FG_PCT: 0.48,
  FT_PCT: 0.78,
  TPM: 80,
  REB: 300,
  AST: 250,
  STL: 60,
  BLK: 30,
  TO: 100,
  PTS: 1400,
}
const shooting = { FGM: 500, FGA: 1040, FTM: 200, FTA: 260 }

const player = (id: string, teamAbbr: string): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  availability: "fa",
  projections,
  shooting,
})

const schedule = (
  days: string[],
  games: ScheduleResponse["games"],
): ScheduleResponse => ({
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: days[0]!,
    endDate: days[days.length - 1]!,
    days,
  },
  games,
})

describe("findStreamingBlocks", () => {
  it("labels 3-in-4 as elite", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const fa = player("fa-a", "BOS")
    const blocks = findStreamingBlocks(
      [fa],
      schedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
      ]),
    )
    const best = blocks.find((b) => b.playerId === "fa-a" && b.startDate === "2025-11-03")
    expect(best?.tier).toBe("elite")
    expect(best?.gamesInWindow).toBe(3)
  })

  it("labels 2-game B2B as strong", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const fa = player("fa-a", "BOS")
    const blocks = findStreamingBlocks(
      [fa],
      schedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
      ]),
    )
    expect(
      blocks.find((b) => b.startDate === "2025-11-03")?.tier,
    ).toBe("strong")
  })

  it("labels single game as thin", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const fa = player("fa-a", "BOS")
    const blocks = findStreamingBlocks(
      [fa],
      schedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      ]),
    )
    expect(
      blocks.find((b) => b.startDate === "2025-11-03")?.tier,
    ).toBe("thin")
  })

  it("dedups overlapping windows to the best start per player", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const fa = player("fa-a", "BOS")
    const blocks = findStreamingBlocks(
      [fa],
      schedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
      ]),
    )
    const forPlayer = blocks.filter((b) => b.playerId === "fa-a")
    expect(forPlayer).toHaveLength(1)
    expect(forPlayer[0]!.startDate).toBe("2025-11-03")
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/unit/streamingBlocks.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement block finder**

Create `src/lib/matchup/streamingBlocks.ts` with logic:

1. For each player with `teamAbbr`, for each matchup day `startDate` where the player plays that day, take the next up-to-4 matchup days window.
2. Collect `gameDates` in window; skip if empty (should not happen if start requires a game).
3. Detect B2B: any two `gameDates` that are adjacent in `schedule.matchup.days` (consecutive indices).
4. Tier: games≥3 → elite; games===2 && b2b → strong; games===2 → ok; else thin.
5. `remainingWeekGames` = games on days ≥ startDate in full matchup.
6. Sort all raw blocks by: `densityTierRank` desc → `gamesInWindow` desc → `remainingWeekGames` desc → `playerId` asc → `startDate` asc.
7. Dedup: keep first block per `playerId` only (best overall). Spec says overlapping windows keep best start — one block per player for planning assignment is enough for MVP; additionally export `blocksStartingOn(date)` from the **pre-dedup** list filtered to `startDate === date` OR keep all starts that are “local maxima”.  

**Locked MVP rule for implementers:** Keep **all** candidate starts where the player plays on `startDate`, then when consuming for a given day prefer the best block with `startDate === today`. Dedup only removes worse windows that **share the same startDate** for the same player. Update the dedup test accordingly if needed:

```ts
it("keeps one block per player per startDate", () => {
  // same start cannot appear twice
})
```

Replace the overlapping-dedup test expectation with: multiple starts may exist; `findStreamingBlocks` returns sorted candidates; helper `bestBlockForPlayerOnDate(blocks, playerId, date)` returns the best with that start.

Implement:

```ts
export type StreamingBlock = {
  playerId: string
  startDate: string
  endDate: string
  gameDates: string[]
  tier: StreamingDensityTier
  gamesInWindow: number
  remainingWeekGames: number
}

export const findStreamingBlocks = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): StreamingBlock[] => { /* ... */ }

export const bestRemainingBlock = (
  player: SeasonPlayer,
  fromDate: string,
  schedule: ScheduleResponse,
): StreamingBlock | null => {
  const blocks = findStreamingBlocks([player], {
    ...schedule,
    matchup: {
      ...schedule.matchup,
      days: schedule.matchup.days.filter((d) => d >= fromDate),
    },
  })
  return blocks[0] ?? null
}
```

For `bestRemainingBlock`, simpler: build the single window starting at `fromDate` (4 days) even if player does not play `fromDate` — use games in that window only; if gamesInWindow===0 return null; else tier from those games. This matches spec “recompute held player’s best remaining window starting today”.

```ts
export const blockFromDate = (
  player: SeasonPlayer,
  fromDate: string,
  schedule: ScheduleResponse,
): StreamingBlock | null => {
  const days = schedule.matchup.days.filter((d) => d >= fromDate)
  const window = days.slice(0, 4)
  if (window.length === 0) return null
  const gameDates = window.filter((d) => playsOn(player, d, schedule))
  if (gameDates.length === 0) return null
  // tier + remainingWeekGames as above
  return { ... }
}
```

Use `blockFromDate` for held-tier; use `findStreamingBlocks` for FA candidates (only starts where player plays on startDate).

- [ ] **Step 4: Adjust tests to match locked MVP** (one block per player-start; `blockFromDate` unit test optional)

- [ ] **Step 5: Run — expect pass**

Run: `npm test -- tests/unit/streamingBlocks.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/matchup/streamingBlocks.ts tests/unit/streamingBlocks.test.ts
git commit -m "feat(matchup): add streaming block finder"
```

---

### Task 3: Wire blocks + strategy into `buildStreamingPlan`

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts`
- Modify: `tests/unit/streamingPlans.test.ts`
- Modify: any test that constructs `StreamingPlan` without new fields (search `gameStarts:`)

**Interfaces:**
- Consumes: `findStreamingBlocks`, `blockFromDate`, strategy helpers, `suggestStreamingStrategyMode`
- Produces: `BuildStreamingPlanInput.strategyMode?: StreamingStrategyMode`; plans include meta fields

- [ ] **Step 1: Write failing behavioral tests**

Append to `tests/unit/streamingPlans.test.ts`:

```ts
import { suggestStreamingStrategyMode } from "@/lib/matchup/streamingStrategy"

describe("strategy-aware streaming plans", () => {
  it("Conservative skips thin one-game streams when a denser block exists later", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
    ]
    // Thin FA plays only Mon; elite FA plays Wed/Thu/Fri
    const thin = player("fa-thin", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const elite = player("fa-elite", "BOS", {
      projections: { ...baseProjections(), STL: 100 },
    })
    const state = tinyState([thin, elite], ["fa-thin", "fa-elite"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-07", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])
    const board = emptyBoardLosingStl()

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      strategyMode: "conservative",
    })

    expect(plan.strategyMode).toBe("conservative")
    expect(plan.days[0]!.cells[0]!.action).toBe("empty")
    const eliteAdd = plan.days.find((d) =>
      d.cells.some((c) => c.playerId === "fa-elite" && c.action === "add"),
    )
    expect(eliteAdd?.date).toBe("2025-11-05")
  })

  it("Aggressive can add thin on day 1", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const thin = player("fa-thin", "NYK")
    const state = tinyState([thin], ["fa-thin"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
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
      playerId: "fa-thin",
    })
  })

  it("omitted strategyMode uses board suggestion", () => {
    const days = ["2025-11-03"]
    const fa = player("fa-a", "BOS")
    const state = tinyState([fa], ["fa-a"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
    ])
    const board = emptyBoardLosingStl() // 1 L of 9 → balanced
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
    })
    expect(plan.suggestedStrategyMode).toBe(
      suggestStreamingStrategyMode(board),
    )
    expect(plan.strategyMode).toBe(plan.suggestedStrategyMode)
    expect(plan.summaryReasons.length).toBeGreaterThan(0)
  })
})
```

Add an early-swap test: hold thin streamer with 1 remaining game later in week; on a day that starts an elite FA block, Aggressive `drop_add`s; Conservative does not (holds until remaining 0).

```ts
  it("Aggressive early-swaps into a much denser block; Conservative does not", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const held = player("fa-held", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const elite = player("fa-elite", "BOS", {
      projections: { ...baseProjections(), STL: 50 },
    })
    // held: game Mon + Thu (so remaining > 0 on Tue); elite: Tue Wed Thu = elite window from Tue
    const state = tinyState([held, elite], ["fa-held", "fa-elite"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "NYK", awayAbbr: "DET" },
    ])
    const board = emptyBoardLosingStl()

    const aggressive = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      strategyMode: "aggressive",
      addLimit: 7,
    })
    const conservative = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      strategyMode: "conservative",
      addLimit: 7,
    })

    expect(aggressive.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-elite",
      droppedPlayerId: "fa-held",
    })
    expect(conservative.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-held",
    })
  })
```

Tune fixture dates if hold/early-swap interaction needs a one-day tweak during implementation — keep the assertions’ intent.

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/unit/streamingPlans.test.ts`  
Expected: FAIL (missing strategy fields / wrong thin behavior)

- [ ] **Step 3: Implement wiring in `streamingPlans.ts`**

Update `BuildStreamingPlanInput`:

```ts
export type BuildStreamingPlanInput = {
  spotCount: StreamingPlanSpotCount
  state: SeasonLeagueState
  schedule: ScheduleResponse
  board: MatchupBoard
  addLimit?: number
  strategyMode?: StreamingStrategyMode
}
```

At start of `buildStreamingPlan`:

```ts
const suggestedStrategyMode = suggestStreamingStrategyMode(board)
const strategyMode = normalizeStreamingStrategyMode(
  inputStrategy ?? suggestedStrategyMode,
)
const blocks = findStreamingBlocks(freeAgents, schedule)
const softCap = softCapForSpot(addLimit, spotCount, strategyMode)
```

**Empty-spot fill algorithm (replace pure `pickBestFa` gate):**

1. Among FA not seated, consider blocks with `startDate === date`, sorted as block finder sort + weak-cat.
2. Take best block whose `allowsAddForTier(mode, tier)`; if tier is `thin`, also require `allowsThinFill(mode, dayIndex, dayCount)`.
3. If none, optionally fall back to same-day game FA only when mode allows thin (Aggressive / Balanced late week) using existing volume sort.
4. Mark that FA seated; increment adds.

**Early swap (after Hold pass, before or during fill):**

For each occupied spot where occupant has `remainingGameDays > 0`:
- Compute `held = blockFromDate(occupant, date, schedule)` → `heldRank`
- Find best unassigned block starting today for another FA
- If `allowsEarlySwap(mode, heldRank, newRank)` and under soft-cap/addLimit and new FA plays today: emit `drop_add`, free previous streamer id into `droppedPlayerId`, no roster drop fields

**summaryReasons** (1–3 strings), examples:

```ts
const summaryReasons: string[] = [
  "Prioritized 3-in-4 / B2B blocks",
]
if (strategyMode === suggestedStrategyMode && strategyMode === "aggressive") {
  summaryReasons.push("Board behind → aggressive")
}
if (strategyMode === "conservative") {
  summaryReasons.push("Skipped thin one-game streams")
}
```

Return meta on the plan object.

Update `buildAllStreamingPlans` to pass `strategyMode` through.

Fix existing tests that assert plan shape if they snapshot full objects — add `expect(plan.strategyMode).toBeDefined()` only where needed; most tests can ignore new fields.

- [ ] **Step 4: Run unit tests**

Run: `npm test -- tests/unit/streamingPlans.test.ts tests/unit/streamingStrategy.test.ts tests/unit/streamingBlocks.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): gate streaming plans with blocks and strategy"
```

---

### Task 4: Strategy toggle UI

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Modify: `tests/unit/StreamingPlansPanel.test.tsx`

**Interfaces:**
- Consumes: `buildAllStreamingPlans`, `suggestStreamingStrategyMode`, `StreamingStrategyMode`
- Produces: panel state `strategyMode` defaulting to board suggestion

- [ ] **Step 1: Write failing panel tests**

In `tests/unit/StreamingPlansPanel.test.tsx`, add:

```ts
it("defaults strategy to board suggestion and rebuilds on toggle", () => {
  render(
    <StreamingPlansPanel
      leagueId="lg1"
      state={state}
      schedule={schedule}
      board={board}
      playersById={{}}
    />,
  )

  expect(screen.getByRole("button", { name: "Balanced" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  fireEvent.click(screen.getByRole("button", { name: "Aggressive" }))
  expect(screen.getByRole("button", { name: "Aggressive" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  expect(screen.getByText(/Suggested:/i)).toBeInTheDocument()
})

it("shows summary reasons under a plan header", () => {
  render(
    <StreamingPlansPanel
      leagueId="lg1"
      state={state}
      schedule={schedule}
      board={board}
      playersById={{}}
    />,
  )
  expect(
    screen.getAllByText(/Prioritized 3-in-4|blocks|Skipped thin|Board/i)
      .length,
  ).toBeGreaterThan(0)
})
```

Use the panel fixture’s `board` (1 L of 9 → balanced). If copy differs slightly, assert `getByText("Suggested: Balanced")` only after switching away from default.

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/unit/StreamingPlansPanel.test.tsx`  
Expected: FAIL (no strategy buttons)

Note: if jsdom `@fs` fails under the `fantasy-dev` junction, run from the worktree 8.3 path  
`C:\Users\cbh60\OneDrive\바탕화~1\fantasy\.worktrees\feat-season-roster`  
(same as prior panel tests).

- [ ] **Step 3: Implement UI**

In `StreamingPlansPanel.tsx`:

```ts
import {
  normalizeStreamingStrategyMode,
  suggestStreamingStrategyMode,
} from "@/lib/matchup/streamingStrategy"
import type { StreamingStrategyMode } from "@/lib/matchup/types"

const STRATEGY_OPTIONS: { id: StreamingStrategyMode; label: string }[] = [
  { id: "aggressive", label: "Aggressive" },
  { id: "balanced", label: "Balanced" },
  { id: "conservative", label: "Conservative" },
]

// inside component:
const suggested = suggestStreamingStrategyMode(board)
const [strategyMode, setStrategyMode] =
  useState<StreamingStrategyMode>(suggested)

const plans = buildAllStreamingPlans({
  state,
  schedule,
  board,
  addLimit: addBudget,
  strategyMode,
})
```

Render a toggle group next to weekly add budget (second controls row is fine):

```tsx
<div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
  <span className="text-[var(--color-mute)]">Strategy</span>
  {STRATEGY_OPTIONS.map((option) => (
    <button
      key={option.id}
      type="button"
      aria-pressed={strategyMode === option.id}
      className={/* pressed = ink border; else mute */}
      onClick={() => setStrategyMode(option.id)}
    >
      {option.label}
    </button>
  ))}
  {strategyMode !== suggested ? (
    <span className="text-[var(--color-mute)]">
      Suggested:{" "}
      {STRATEGY_OPTIONS.find((o) => o.id === suggested)?.label ?? suggested}
    </span>
  ) : null}
</div>
```

Under each plan’s `Adds k/n · starts` line, render:

```tsx
{plan.summaryReasons.length > 0 ? (
  <p className="mt-0.5 text-[0.75rem] text-[var(--color-mute)]">
    {plan.summaryReasons.join(" · ")}
  </p>
) : null}
```

Do not remove add budget controls or calendar layout.

- [ ] **Step 4: Run panel + plan tests**

Run: `npm test -- tests/unit/StreamingPlansPanel.test.tsx tests/unit/streamingPlans.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/StreamingPlansPanel.tsx tests/unit/StreamingPlansPanel.test.tsx
git commit -m "feat(matchup): add streaming strategy mode toggle"
```

---

### Task 5: Advise path + regression sweep

**Files:**
- Modify: `src/lib/matchup/advise.ts` only if needed (usually none — omitted mode → suggest)
- Modify: `tests/api/matchup.test.ts` if response assertions require new plan fields
- Grep fixtures constructing `StreamingPlan` without new fields

- [ ] **Step 1: Grep for incomplete plan literals**

Run: `rg "gameStarts:" -g "*.ts" -g "*.tsx"`  
Update any hand-built `StreamingPlan` mocks with:

```ts
strategyMode: "balanced",
suggestedStrategyMode: "balanced",
summaryReasons: [],
```

- [ ] **Step 2: Run focused + API tests**

Run:

```bash
npm test -- tests/unit/streamingStrategy.test.ts tests/unit/streamingBlocks.test.ts tests/unit/streamingPlans.test.ts tests/unit/StreamingPlansPanel.test.tsx tests/api/matchup.test.ts
```

Expected: PASS

- [ ] **Step 3: Manual sanity (optional but recommended)**

`npm run dev` → open a matchup → confirm Strategy defaults, Aggressive fills more thin streams, Conservative leaves early thin days empty when a denser block exists later.

- [ ] **Step 4: Commit if any advise/test fixture fixes remain**

```bash
git add -A src/lib/matchup tests
git commit -m "test(matchup): align fixtures with streaming strategy fields"
```

(Skip empty commit if nothing left.)

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| Two-pass hybrid | 2 + 3 |
| Density tiers + ranks | 1 + 2 |
| Strategy modes + soft-cap / thin / early-swap | 1 + 3 |
| Board suggested mode | 1 + 3 + 4 |
| Plan meta + summaryReasons | 3 + 4 |
| Client rebuild on mode | 4 |
| Preserve clarity UI / hold / soft-cap / roster drop | 3 + 4 + 5 |
| No cat delta simulation | (explicit non-goal) |
| Tests listed in spec §9 | 1–5 |

## Self-review notes

- No TBD placeholders; type name is `StreamingDensityTier` (and `StreamingStrategyMode`) consistently.
- `allowsAddForTier` vs thin + `allowsThinFill` both required for thin adds.
- Early swap does not set roster drop fields (`rosterDropKind: "none"`).
