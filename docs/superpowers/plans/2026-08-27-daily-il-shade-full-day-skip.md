# Daily IL Cell Shade + Full-Day Skip Adds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use TDD.

**Goal:** Shade only IL players’ **game cells** (IR badge, block clicks); skip streaming plan add spends on days where Daily lineup is full (10 game-day actives).

**Architecture:** Export `isDailyLineupFullForDate` mirroring `togglePlayerDay` open-slot logic; pass `ilPlayerIds` into Daily UI; pass base `daily` into `buildStreamingPlan`.

**Tech stack:** Existing React/Vitest matchup modules.

---

### Task 1: `isDailyLineupFullForDate` + streaming gate

**Files:**
- Modify: `src/lib/matchup/dailyLineups.ts`
- Modify: `src/lib/matchup/streamingPlans.ts`
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Test: `tests/unit/matchupDailyLineups.test.ts`, `tests/unit/streamingPlans.test.ts`

- [ ] **Step 1:** Failing tests for full/not-full helper and “full day → no add”
- [ ] **Step 2:** Implement helper + optional `daily` on `BuildStreamingPlanInput`; skip add/drop_add/early-swap spends when full
- [ ] **Step 3:** Wire base `daily` from workspace → panel → planner
- [ ] **Step 4:** Commit `feat(matchup): skip streaming adds when daily lineup is full`

### Task 2: Daily IL game-cell shade + block toggle

**Files:**
- Modify: `src/components/matchup/DailyLineupPanel.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Test: `tests/unit/DailyLineupPanel.test.tsx`

- [ ] **Step 1:** Failing test — IL player game cell shows IR / shaded; click does not call toggle
- [ ] **Step 2:** Prop `ilPlayerIds`; shade game cells only; block click + hint
- [ ] **Step 3:** Commit `feat(matchup): shade IL game cells and block start/sit`

### Task 3: Verify

- [ ] Run focused vitest suites; fix leftovers; commit if needed
