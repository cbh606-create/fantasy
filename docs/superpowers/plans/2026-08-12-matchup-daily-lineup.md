# Matchup Daily Lineup Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Day-by-day active-slot dropdowns on Matchup with localStorage persistence and live H2H board recompute.

**Architecture:** Pure helpers in `src/lib/matchup/dailyLineups.ts`; `DailyLineupPanel` UI; `MatchupWorkspace` owns state and passes recomputed board. Include `schedule` on GET `/api/matchup`. No server persist for days.

**Tech Stack:** Next.js 15, TypeScript, Tailwind, Vitest. Branch `feat/matchup-advisor` worktree `.worktrees/feat-season-roster`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-matchup-daily-lineup-design.md`
- Active slots only (10); BE/IL are candidate pool only
- Storage key `matchup-days:{leagueId}`
- Opp weekly model unchanged; Sit/Start/streamers stay week-based
- No `@/lib/sim` / draft imports; no semicolons
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>`

---

### Task 1: dailyLineups helpers + tests

**Files:**
- Create: `src/lib/matchup/dailyLineups.ts`
- Create: `tests/unit/matchupDailyLineups.test.ts`

**Produces:**
- `initDailyLineups(days, activeEntries): DailyLineups`
- `read/writeDailyLineups(leagueId, value)` (window.localStorage; SSR-safe no-ops)
- `effectiveGamesByPlayerId(daily, players, schedule): Map<string, number>`
- `youTotalsFromDaily(daily, players, schedule): Record<CategoryId, number>`
- `setSlotPlayer(daily, day, slotIndex, playerId): DailyLineups` — clears duplicate

- [ ] TDD per spec cases
- [ ] Commit: `feat(matchup): add daily lineup projection helpers`

---

### Task 2: API returns schedule + board recompute in workspace

**Files:**
- Modify: `src/app/api/matchup/route.ts` — add `schedule` to JSON
- Modify: `tests/api/matchup.test.ts` — assert `schedule.matchup.days`
- Modify: `src/components/matchup/MatchupWorkspace.tsx` — load/persist daily; recompute board
- Create: `src/components/matchup/DailyLineupPanel.tsx`
- Test: `tests/unit/DailyLineupPanel.test.tsx` or extend `MatchupWorkspace.test.tsx`

- [ ] Wire panel below board; reset button
- [ ] Commit: `feat(matchup): add day-by-day lineup controls`

---

### Task 3: Verification

- [ ] lint + focused vitest
- [ ] Commit fixes only if needed
