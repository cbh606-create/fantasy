# Roster + Matchup Positions Implementation Plan

> **For agentic workers:** Execute task-by-task. Checkboxes track progress.

**Goal:** Show player positions on Roster and Matchup; allow weekly slot assignment (PG…IR) on both; label IL as IR in UI.

**Architecture:** Shared `slotDisplayLabel` + `formatPlayerPositions` helpers; enhance `PlayerRosterTable`; embed it on Matchup as Weekly lineup wired to existing lineup PATCH.

**Tech Stack:** Next.js, React, TypeScript, existing season lineup API

## Global Constraints

- Slots: `PG, SG, SF, PF, C, G, F, UTIL×3, BE×3, IL×1` (display IR for IL)
- Block ineligible slot assignment on save via `eligibleForSlot`
- No slot customizer UI; no drag-and-drop
- Spec: `docs/superpowers/specs/2026-08-24-roster-matchup-positions-design.md`
- No semicolons; Windows `npm.cmd`

---

### Task 1: Shared label helpers + tests

**Files:** Create `src/lib/season/slotLabels.ts`; Test `tests/unit/slotLabels.test.ts`

- [ ] `slotDisplayLabel(slot)` → IR for IL
- [ ] `formatPlayerPositions(player)` → joined positions or "—"
- [ ] Commit

### Task 2: Enhance PlayerRosterTable

**Files:** `src/components/season/PlayerRosterTable.tsx`; optional unit/render test

- [ ] Pos column; IR labels; group "IR"; dropdown `Name · Pos · TEAM`
- [ ] Filter or mark ineligible options using `eligibleForSlot`
- [ ] Commit

### Task 3: Matchup Weekly lineup + daily Pos

**Files:** `MatchupWorkspace.tsx`, `DailyLineupPanel.tsx`; reuse SeasonRosterWorkspace lineup save pattern

- [ ] Weekly lineup section with PlayerRosterTable + save via lineup API
- [ ] Daily grid shows positions under name
- [ ] Commit

### Task 4: Spec Implemented + verify

- [ ] Mark spec Implemented; run focused tests; commit
