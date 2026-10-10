# You-spot Rec from Opp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-select the You streaming spot (None / 1 / 2 / 3) with the highest `projectedCatWins` against the current Opp-spot assumption, and show Rec + Proj on the PlanBar.

**Architecture:** Score None against an opp-only `buildStreamingPlan({ youIdle: true })` daily, and score 1/2/3 against existing you+opp plans. Workspace auto-applies Rec unless the user pinned You. PlanBar only displays Rec/Proj.

**Tech Stack:** TypeScript, React, Vitest, existing `src/lib/matchup/*` board + streaming planner.

## Global Constraints

- Score = `projectedCatWins` on enabled board categories.
- Candidates = None, 1, 2, 3. Ties → fewer spots, then fewer `addsUsed` (None = 0).
- Auto-select on first scores and on Opp spots / Opp drop change. Pin on manual You click.
- Do not persist You/Opp. No opponent team → You None, no Rec.
- UI copy in English. No semicolons in TS/TSX.

---

### Task 1: pickRecommendedYouSpot

**Files:**
- Create: `src/lib/matchup/recommendYouSpot.ts`
- Test: `tests/unit/recommendYouSpot.test.ts`

**Interfaces:**
- Produces: `YouSpotCount`, `YouSpotScore`, `pickRecommendedYouSpot(scores)`, `scoreYouSpotPlans(...)`

- [ ] Write failing tests for max wins, None tie-break, fewer adds, empty → undefined
- [ ] Implement picker + scorer using `projectedCatWinsFromDaily` + `applyStreamingPlanPreview`
- [ ] Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/recommendYouSpot.test.ts`

### Task 2: youIdle opp-only plan

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (`BuildStreamingPlanInput.youIdle?`)
- Test: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: existing `buildStreamingPlan`
- Produces: `youIdle: true` keeps you `workingDaily` unchanged, `addsUsed` 0, still fills `opponentDaily`

- [ ] Write failing test: idle you does not seat you streamers; opp still adds
- [ ] Skip you hold/fill when `youIdle`
- [ ] Run streaming plan unit tests for that case

### Task 3: PlanBar Rec + Proj

**Files:**
- Modify: `src/components/matchup/MatchupPlanBar.tsx`
- Test: `tests/unit/MatchupPlanBar.test.tsx`

**Interfaces:**
- Consumes: `recommendedYouSpot?: YouSpotCount`, `youSpotScores?: YouSpotScore[]`
- Produces: You chip label `None Rec · 4.82` / `2-spot Rec · 4.82`; aria `You none recommended 4.82`

- [ ] Write failing test for Rec + Proj on the winning chip
- [ ] Render Rec/Proj; omit when no recommendation
- [ ] Run PlanBar tests

### Task 4: Workspace auto-select + None opp daily

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx` (`onPlansBuilt` payload)
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Test: `tests/unit/MatchupWorkspace.test.tsx`

**Interfaces:**
- Consumes: `onPlansBuilt({ plans, noneOpponentPlan })`
- Produces: unpin + apply Rec on Opp change; pin on You click; None uses `noneOpponentPlan` for board/strip

- [ ] Write failing tests: first plans auto-select Rec; You click pins; Opp change unpins
- [ ] Wire scores, pin, displayOppPlan
- [ ] Run workspace + PlanBar + recommendYouSpot tests
