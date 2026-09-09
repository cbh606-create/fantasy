# Matchup Streaming Starts-Max & Protected Drops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maximize streaming-plan game-starts within the weekly add budget, relax strategy gates, and stop suggesting healthy ADP≤60 roster cuts (with long-term injury + IL comparison exceptions).

**Architecture:** Soften `streamingStrategy` thresholds; add `streamingDropPolicy` for ADP/injury/IL rules; teach `buildStreamingPlan` to rank adds by expected starts and to call the drop policy. Keep the existing block finder and panel toggle.

**Tech Stack:** TypeScript, Vitest, existing Matchup streaming modules.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-25-matchup-streaming-starts-max-protected-drops-design.md`
- `addsUsed ≤ addLimit` always; soft-cap must not block starts-positive adds while budget remains
- `STREAMING_PROTECTED_ADP_MAX = 60`
- Long-term injury: `expectedOutDays >= 14` (defaults: `out`→21, `gtd`→3)
- Underperformance exception stub always returns `false`
- No semicolons in TS; do not redesign calendar UI beyond summaryReasons
- Strategy toggle remains

## File map

| File | Responsibility |
|---|---|
| `src/lib/matchup/streamingStrategy.ts` | Relaxed gates + suggest `≤0.15` |
| `src/lib/matchup/constants.ts` | `STREAMING_PROTECTED_ADP_MAX` |
| `src/lib/injuries/types.ts` | optional `expectedOutDays` |
| `src/lib/matchup/streamingDropPolicy.ts` | ADP protect, injury, IL vs new |
| `src/lib/matchup/streamingPlans.ts` | Starts-max ranking, soft-cap priority, use drop policy |
| `src/components/matchup/StreamingPlansPanel.tsx` | summaryReasons already rendered; ensure new strings show |
| `tests/unit/streamingStrategy.test.ts` | Threshold updates |
| `tests/unit/streamingDropPolicy.test.ts` | New |
| `tests/unit/streamingPlans.test.ts` | Starts-max + protected drop integration |

---

### Task 1: Relax strategy helpers

**Files:**
- Modify: `src/lib/matchup/streamingStrategy.ts`
- Modify: `tests/unit/streamingStrategy.test.ts`

**Interfaces:**
- Produces updated behavior for:
  - `suggestStreamingStrategyMode` — conservative only when `behindRatio ≤ 0.15`
  - `allowsAddForTier("conservative", …)` — `ok`+ (`elite`/`strong`/`ok`)
  - `allowsThinFill` — Conservative last 3 days; Balanced last 3 days; Aggressive unchanged
  - `allowsEarlySwap` — Conservative now allowed at `delta ≥ 2` (was never)

- [ ] **Step 1: Update failing tests**

In `tests/unit/streamingStrategy.test.ts`:

```ts
it("suggests conservative only when behindRatio <= 0.15", () => {
  // 1 L of 9 → ~0.111 → conservative
  expect(suggestStreamingStrategyMode(boardWithOutcomes(1, 0))).toBe(
    "conservative",
  )
  // 2 L of 9 → ~0.222 → balanced (no longer conservative)
  expect(suggestStreamingStrategyMode(boardWithOutcomes(2, 0))).toBe(
    "balanced",
  )
})

it("Conservative allows ok tier and thin on last 3 days", () => {
  expect(allowsAddForTier("conservative", "ok")).toBe(true)
  expect(allowsAddForTier("conservative", "thin")).toBe(false)
  expect(allowsThinFill("conservative", 4, 7)).toBe(false)
  expect(allowsThinFill("conservative", 4, 7)).toBe(false)
  // dayIndex 4 of 7 is 5th day → not in last 3 (indices 4,5,6) wait:
  // last 3 days: dayIndex >= dayCount - 3 → >= 4 for count 7
  expect(allowsThinFill("conservative", 4, 7)).toBe(true)
  expect(allowsThinFill("balanced", 4, 7)).toBe(true)
})

it("Conservative early-swaps at +2 tiers", () => {
  expect(allowsEarlySwap("conservative", 0, 2)).toBe(true)
  expect(allowsEarlySwap("conservative", 0, 1)).toBe(false)
})
```

Fix the duplicated assertion in the thin-fill example when implementing — use:

```ts
expect(allowsThinFill("conservative", 3, 7)).toBe(false)
expect(allowsThinFill("conservative", 4, 7)).toBe(true)
```

Update existing tests that assumed `behindRatio ≤ 0.25` → conservative (e.g. 2 L of 9).

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/unit/streamingStrategy.test.ts`  
Expected: FAIL on new thresholds

- [ ] **Step 3: Implement**

```ts
if (behindRatio >= 0.5) return "aggressive"
if (behindRatio <= 0.15) return "conservative"
return "balanced"
```

```ts
export const allowsThinFill = (
  mode: StreamingStrategyMode,
  dayIndex: number,
  dayCount: number,
): boolean => {
  if (mode === "aggressive") return true
  // conservative + balanced: last 3 matchup days
  return dayIndex >= Math.max(0, dayCount - 3)
}

export const allowsAddForTier = (
  mode: StreamingStrategyMode,
  tier: StreamingDensityTier,
): boolean => {
  if (mode === "conservative") return tier !== "thin"
  if (mode === "balanced") return true // ok + thin (all)
  return true
}

export const allowsEarlySwap = (
  mode: StreamingStrategyMode,
  heldRank: number,
  newRank: number,
): boolean => {
  const delta = newRank - heldRank
  if (mode === "aggressive") return delta >= 1
  // balanced + conservative
  return delta >= 2
}
```

Note: Balanced thin anytime vs last-3 only — **spec says Balanced thin on last 3 days**. So:

```ts
export const allowsAddForTier = (...) => {
  if (mode === "conservative") return tier === "elite" || tier === "strong" || tier === "ok"
  // balanced + aggressive: all tiers; thin still gated by allowsThinFill
  return true
}

export const allowsThinFill = (...) => {
  if (mode === "aggressive") return true
  return dayIndex >= Math.max(0, dayCount - 3)
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/unit/streamingStrategy.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingStrategy.ts tests/unit/streamingStrategy.test.ts
git commit -m "feat(matchup): relax streaming strategy gates for more adds"
```

---

### Task 2: Drop policy module (ADP + injury + IL)

**Files:**
- Modify: `src/lib/matchup/constants.ts` — add `STREAMING_PROTECTED_ADP_MAX = 60`
- Modify: `src/lib/injuries/types.ts` — `expectedOutDays?: number` on `InjuryEvent`
- Create: `src/lib/matchup/streamingDropPolicy.ts`
- Create: `tests/unit/streamingDropPolicy.test.ts`

**Interfaces:**
- Produces:
  - `resolveExpectedOutDays(event: { status: "out" | "gtd"; expectedOutDays?: number }): number`
  - `isLongTermInjuryException(outDays: number): boolean` — `outDays >= 14`
  - `isUnderperformingDropException(_player: SeasonPlayer): boolean` — always `false`
  - `isAdpProtected(adp: number | null | undefined): boolean` — `adp != null && adp <= 60`
  - `chooseIlVersusNewInjuredDrop(input: { il: { playerId: string; adp: number | null; outDays: number } | null; newlyInjured: { playerId: string; adp: number | null; outDays: number } | null }): string | null` — playerId to drop, or null
  - `AdpLookup = Map<string, number>` keyed by season player id
  - `buildAdpLookupFromPlayers(rows: { id: string; adp?: number; name?: string; teamAbbr?: string }[]): AdpLookup` — id→adp; for MVP tests inject Map directly

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest"
import {
  chooseIlVersusNewInjuredDrop,
  isAdpProtected,
  isLongTermInjuryException,
  isUnderperformingDropException,
  resolveExpectedOutDays,
} from "@/lib/matchup/streamingDropPolicy"
import { STREAMING_PROTECTED_ADP_MAX } from "@/lib/matchup/constants"

describe("streamingDropPolicy", () => {
  it("protects ADP at or below 60", () => {
    expect(STREAMING_PROTECTED_ADP_MAX).toBe(60)
    expect(isAdpProtected(60)).toBe(true)
    expect(isAdpProtected(61)).toBe(false)
    expect(isAdpProtected(null)).toBe(false)
  })

  it("defaults out/gtd out-days and long-term at >= 14", () => {
    expect(resolveExpectedOutDays({ status: "out" })).toBe(21)
    expect(resolveExpectedOutDays({ status: "gtd" })).toBe(3)
    expect(resolveExpectedOutDays({ status: "out", expectedOutDays: 10 })).toBe(10)
    expect(isLongTermInjuryException(14)).toBe(true)
    expect(isLongTermInjuryException(13)).toBe(false)
  })

  it("underperformance stub is always false", () => {
    expect(
      isUnderperformingDropException({
        id: "x",
        name: "x",
        projections: {} as never,
        shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
      }),
    ).toBe(false)
  })

  it("IL vs new: longer absence dropped; tie breaks to worse ADP", () => {
    expect(
      chooseIlVersusNewInjuredDrop({
        il: { playerId: "il-guy", adp: 80, outDays: 10 },
        newlyInjured: { playerId: "star", adp: 20, outDays: 30 },
      }),
    ).toBe("star")

    expect(
      chooseIlVersusNewInjuredDrop({
        il: { playerId: "il-guy", adp: 80, outDays: 21 },
        newlyInjured: { playerId: "star", adp: 20, outDays: 21 },
      }),
    ).toBe("il-guy")
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/unit/streamingDropPolicy.test.ts`

- [ ] **Step 3: Implement module + constant + type field**

`constants.ts`:

```ts
export const STREAMING_PROTECTED_ADP_MAX = 60
```

`InjuryEvent`:

```ts
expectedOutDays?: number
```

`streamingDropPolicy.ts` — implement helpers per interfaces; `chooseIlVersusNewInjuredDrop`:

```ts
if (!il && !newlyInjured) return null
if (!il) return newlyInjured!.playerId
if (!newlyInjured) return il.playerId
if (newlyInjured.outDays !== il.outDays) {
  return newlyInjured.outDays > il.outDays
    ? newlyInjured.playerId
    : il.playerId
}
const ilAdp = il.adp ?? Number.POSITIVE_INFINITY
const newAdp = newlyInjured.adp ?? Number.POSITIVE_INFINITY
// worse ADP = higher number
return newAdp > ilAdp ? newlyInjured.playerId : il.playerId
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/constants.ts src/lib/injuries/types.ts src/lib/matchup/streamingDropPolicy.ts tests/unit/streamingDropPolicy.test.ts
git commit -m "feat(matchup): add streaming roster drop protection policy"
```

---

### Task 3: Wire starts-max + protected drops into planner

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts`
- Modify: `tests/unit/streamingPlans.test.ts`
- Optionally: `BuildStreamingPlanInput` gains `adpByPlayerId?: Record<string, number>` and `injuryOutDaysByPlayerId?: Record<string, number>` for tests (server can pass empty and resolve later, or resolve inside from a sync lookup table injected in tests)

**Interfaces:**
- Consumes: strategy helpers (Task 1), drop policy (Task 2), `remainingGameDays` / blocks
- Change soft-cap check: if `addsUsed < addLimit` and best candidate has `expectedStarts > 0`, allow add even when `addsBySpot[spot] >= softCap`
- Replace `pickRosterDrop` body to filter protected players; when IL+new injured both long-term, prefer `chooseIlVersusNewInjuredDrop` result if that id is on the roster

- [ ] **Step 1: Failing integration tests**

Append to `streamingPlans.test.ts`:

```ts
it("uses more than one add when multiple start-positive blocks exist (balanced)", () => {
  // Build a week where several FAs each have 1–2 games on different days
  // strategyMode: "balanced", addLimit: 7, spotCount: 1
  // Expect addsUsed >= 2 and gameStarts >= 2
})

it("does not roster-drop a healthy low-ADP player on first add", () => {
  // Perspective roster full; include player id "star" with adpByPlayerId star=25
  // First add day: star has no game (would have been old heuristic cut)
  // Pass adpByPlayerId: { star: 25, scrub: 200 }
  // Expect rosterDropPlayerId !== "star" (scrub or open_slot/none)
})

it("may roster-drop low-ADP player when marked long-term out", () => {
  // Same as above but injuryOutDaysByPlayerId: { star: 21 }
  // Expect rosterDropPlayerId === "star" OR chooseIl path as applicable
})
```

Fill fixtures concretely using existing `tinyState` / `tinySchedule` / `player()` helpers; pass new optional input fields.

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/unit/streamingPlans.test.ts`

- [ ] **Step 3: Implement wiring**

1. Extend `BuildStreamingPlanInput`:

```ts
adpByPlayerId?: Record<string, number>
injuryOutDaysByPlayerId?: Record<string, number>
```

2. When ranking FA for fill, sort by `remainingGameDays` (expectedStarts) first among strategy-allowed candidates (already partially volume-sorted — make it explicit and skip `expectedStarts === 0`).

3. Soft-cap:

```ts
const underSoftCap = addsBySpot[spotIndex]! < softCap
const canAdd =
  addsUsed < addLimit &&
  (underSoftCap || /* starts-positive escape */ true)
```

Implement escape as: if over soft-cap but `addsUsed < addLimit` and candidate `expectedStarts > 0`, still allow.

4. `pickRosterDrop`:  
   - Build eligible list excluding `isAdpProtected(adp) && !isLongTermInjuryException(outDays) && !isUnderperformingDropException(p)`  
   - If IL occupant and a long-term injured non-IL player exist, set drop to `chooseIlVersusNewInjuredDrop(...)` when that id is eligible  
   - Else previous sort among eligible

5. `buildSummaryReasons`: always include `"Maximizing starts within add budget"`; include `"Protected ADP ≤ 60"` when any protected player was skipped (track a boolean `didProtect`).

- [ ] **Step 4: Run strategy + drop + plans tests**

Run: `npm test -- tests/unit/streamingStrategy.test.ts tests/unit/streamingDropPolicy.test.ts tests/unit/streamingPlans.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): maximize streaming starts and protect high-ADP drops"
```

---

### Task 4: Advise wiring + panel reasons + regression

**Files:**
- Modify: `src/lib/matchup/advise.ts` — if easy, pass `adpByPlayerId` built from `state.players` when `adp` exists; otherwise leave empty (protection inactive until ADP map supplied). Prefer: add optional `adp?: number` on players in tests only; for production, load a static id→adp map from `data/players/proj_2026_27.json` in advise **or** a small `loadAdpByEspnId` helper. **Locked MVP:** in `adviseMatchup`, build map by matching `state.players` name+teamAbbr to proj pool `adp` (read JSON via `fs` on server only). Client panel rebuild won't have ADP unless we pass map through advice response — **simpler MVP:** attach `adp?: number` onto players when creating manual leagues later; for Matchup advise, server-side lookup in `advise.ts` / route and pass into `buildAllStreamingPlans`.

**Pragmatic MVP for this task:**

- Add `resolveAdpByPlayerId(players: SeasonPlayer[]): Record<string, number>` in `streamingDropPolicy.ts` that reads proj JSON **only when `typeof window === "undefined"`** OR accept precomputed map from advise.
- `adviseMatchup` computes map and passes to `buildAllStreamingPlans`.
- Client `StreamingPlansPanel` rebuild: pass the same map if present on advice, or recompute via API-free name match if we embed `adp` on serialized players.

**Simplest path that works in UI:** extend season fixture players is heavy. Instead store ADP map on `MatchupAdvice` as `adpByPlayerId` and have the panel pass it into `buildAllStreamingPlans`.

- Modify: `src/lib/matchup/types.ts` — `MatchupAdvice.adpByPlayerId?: Record<string, number>`
- Modify: `advise.ts` + `StreamingPlansPanel.tsx` + `MatchupWorkspace.tsx` to thread the map
- Modify: injury fixture optional field (no required data change)
- Tests: panel still shows summary reasons containing “Maximizing starts” / “Protected ADP” when present; `tests/api/matchup.test.ts` smoke

- [ ] **Step 1: Failing test — advice includes adp map and panel rebuild uses it**

Minimal: unit-test `adviseMatchup` (or helper) returns non-empty `adpByPlayerId` for fixture players that match proj names; panel test asserts summaryReasons text.

- [ ] **Step 2: Implement threading + server ADP resolve**

- [ ] **Step 3: Regression run**

```bash
npm test -- tests/unit/streamingStrategy.test.ts tests/unit/streamingDropPolicy.test.ts tests/unit/streamingPlans.test.ts tests/unit/StreamingPlansPanel.test.tsx tests/api/matchup.test.ts
```

(Panel from physical worktree if jsdom `@fs` fails.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/matchup src/components/matchup tests
git commit -m "feat(matchup): thread ADP into streaming plans for drop protection"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| Starts-max ranking / soft-cap escape | 3 |
| Strategy relaxation + suggest 0.15 | 1 |
| ADP≤60 protect + missing ADP unprotected | 2–3 |
| Long-term injury defaults + exception | 2–3 |
| IL vs new compare | 2–3 |
| Underperformance stub | 2 |
| Summary reasons | 3–4 |
| Advise/UI ADP availability | 4 |

## Self-review notes

- Balanced thin gated by `allowsThinFill` (last 3), not “thin anytime”.
- Conservative early-swap enabled at +2 per updated table.
- Soft-cap escape must still respect `addLimit`.
