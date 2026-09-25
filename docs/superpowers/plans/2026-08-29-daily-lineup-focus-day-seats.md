# Daily Lineup Focus-Day Seats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Daily lineup slot column fixed and re-seat occupants for the focused day (starts, Sit+game, PV+game, off-night fills) without writing `DailyLineups`.

**Architecture:** Extend `buildLineupDisplayRows` with an optional focus argument. Build today’s skeleton, then if focus inputs are present clear active/BE `playerId`s and fill with five passes. `DailyLineupPanel` passes `activeFocusDay`, `schedule`, player map, and the same `daily` it already uses for cells.

**Tech Stack:** TypeScript, Vitest, React Testing Library, existing `eligibleForSlot` / `gameWeightForTeamDate`.

## Global Constraints

- Slot column never reorders (PG → last BE → IL → leftover PV)
- Display-only: do not write off-night fills or PV-up into `DailyLineups`
- Pass 1: `daily[focusDay]` starts in engine slots; never displace them
- Pass 2: roster Sit + has game → empty eligible; prefer home slot
- Pass 3: PV + has game → empty eligible **active** only; keep preview chrome
- Pass 4: off-night roster → remaining empty eligible; prefer home
- Pass 5: leftover roster → remaining empty seats, BE first
- IL stays IL even with a game
- Missing `focusDay` / `schedule` / `playersById` / `daily` → today’s home-row builder
- Do not change `togglePlayerDay` or streaming add rules

---

## File map

| File | Role |
| --- | --- |
| `src/lib/matchup/dailyLineups.ts` | `LineupDisplayFocus` + seating passes in `buildLineupDisplayRows` |
| `src/components/matchup/DailyLineupPanel.tsx` | Pass focus into builder; weekly-home badge; subtitle |
| `tests/unit/matchupDailyLineups.test.ts` | Spec §6 unit cases |
| `tests/unit/DailyLineupPanel.test.tsx` | PV-up chrome + slot column stays fixed |

---

### Task 1: Focus-day seating in `buildLineupDisplayRows`

**Files:**
- Modify: `src/lib/matchup/dailyLineups.ts` (`buildLineupDisplayRows`)
- Test: `tests/unit/matchupDailyLineups.test.ts`

**Interfaces:**

```ts
export type LineupDisplayFocus = {
  focusDay?: string
  schedule?: ScheduleResponse
  playersById?: Record<string, SeasonPlayer>
  daily?: DailyLineups
}

export const buildLineupDisplayRows = (
  rosterEntries: SeasonRosterEntry[],
  extraPlayerIds?: string[],
  extraIlPlayerIds?: string[],
  focus?: LineupDisplayFocus,
): DailySlotRow[]
```

- [ ] **Step 1: Write the failing tests**

In `tests/unit/matchupDailyLineups.test.ts`, add a `describe("buildLineupDisplayRows focus-day seats")` that uses a small roster (PG A BOS, SG B NYK off Mon, SF C MIA, PF empty, C D ATL, UTIL E DET off, BE F SAS, IL Injured ORL) and preview Streamer SAS / PF. Monday games: BOS, MIA, ATL, SAS, ORL. `daily[Mon]` = A@PG, C@SF, D@C, F@UTIL.

Assert spec §6: slot labels fixed; F on UTIL not BE; Sit D on C when omitted from daily; off-night B on SG; Streamer on PF with no leftover PV; Streamer stays PV when all actives filled; IL stays IL; omit focus → home occupants.

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npx vitest run tests/unit/matchupDailyLineups.test.ts -t "focus-day seats"`

Expected: FAIL (unknown 4th arg / home-row occupants).

- [ ] **Step 3: Implement seating**

If `focusDay`, `schedule`, `playersById`, and `daily` are all present: build skeleton as today; clear active/BE ids; Pass 1–5; rebuild PV from unused extras. Has-game = `gameWeightForTeamDate > 0`. Prefer-home uses original `rosterEntries`. Started players whose engine slot is missing from the skeleton still get a seat (home / eligible active / any empty) so tests with a short `rosterEntries` do not drop them.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/unit/matchupDailyLineups.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (only if the user asked)

---

### Task 2: Wire `DailyLineupPanel`

**Files:**
- Modify: `src/components/matchup/DailyLineupPanel.tsx`
- Test: `tests/unit/DailyLineupPanel.test.tsx`

**Interfaces:**
- Consumes: `buildLineupDisplayRows(..., { focusDay, schedule, playersById, daily })`
- Produces: same table; occupants change with day-header click

- [ ] **Step 1: Write the failing panel tests**

1. Preview streamer with a Monday game and an empty eligible PF sits on PF with `preview` badge; no `PV` rowheader.
2. Clicking a second day keeps rowheaders PG → C → BE (order unchanged).
3. Keep “puts preview streamers on PV rows not PG” for the case where PG is the only seat and is already taken (full / ineligible).

- [ ] **Step 2: Run panel tests and confirm the new ones fail**

Run: `npx vitest run tests/unit/DailyLineupPanel.test.tsx`

- [ ] **Step 3: Pass focus into the builder; badge uses weekly home slot from `rosterEntries`, not the display row slot; subtitle: slots stay put, click a day to see that day’s seats**

- [ ] **Step 4: Re-run `DailyLineupPanel.test.tsx` and `matchupDailyLineups.test.ts`**

Expected: PASS

- [ ] **Step 5: Browser-check `/matchup/<leagueId>`: click a thin night vs a stacked night; slot labels stay; game-day names move; PV with a game can sit in an empty active with preview chrome**
