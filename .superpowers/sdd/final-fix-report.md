# Final-review fix report

**Status:** DONE — all requested Important issues fixed
**Commit:** None (per request)

## Hole-calendar Important fixes (2026-09-17)

1. `buildHoleDayLineup` now treats `savedDay` as the complete lineup truth and only nulls plan-cut player IDs. The roster repack path remains unchanged when no saved day exists.
2. The planner seats each confirmed hold/add into the mutable hole lineup, preventing later stream spots from claiming an already-used positional hole.
3. Streamers cleared on packed nights now call `markDropped`; the packed-night regression verifies the default two-matchup-day waiver before re-add.
4. Opponent forced/range spot indices are de-duplicated before applying `streamerCap`.
5. `gameStarts` is computed from `applyStreamingPlanPreview` over the base daily lineup and completed plan, so preview flex seating and the plan header use the same count.
6. `playerHasEligibleHole` mirrors default add seating: when any specific slot is empty, only an eligible specific slot counts. This preserves the Ellis rule and prevents a guard from claiming UTIL beside an unplayable specific hole.

### Added/updated coverage

- Saved daily lineup with a playable bench player does not create phantom holes.
- Two PG-only streamers cannot share one later PG hole.
- Packed-night release observes waiver cooldown before re-add.
- Three opponent holes remain three distinct fillable spots when spot 1 is forced.
- Overlay-only UTIL seating contributes to `gameStarts`.
- Hole eligibility refuses UTIL while an incompatible specific slot is empty.

### Verification

Required command: **8 test files passed, 200 tests passed, 0 failed** (56.67s).

`git diff --check` passed for all four touched source/test files. A repository-wide `tsc --noEmit` remains red on pre-existing unrelated type errors (including `RecPanel`, API fixtures, and older test fixtures); no new error pointed to the changed production files.

---

## Earlier final-review pass

## What changed

1. **Critical — compile `MATCHUP_WEEK_STREAMING_DAY_COL_CLASS`.** Staged uncommitted `src/lib/matchup/weekCalendarLayout.ts` so a clean checkout compiles. Panel still imports the streaming day-col class.
2. **Critical — selected opponent.** `buildStreamingPlan` accepts optional `opponentTeamIndex`. When set, opponent daily/days come from `team.teamIndex === opponentTeamIndex`. When omitted, first-non-perspective fallback is unchanged. Panel and workspace thread the selected index.
3. **Important #3 — Scoreboard Opp basis.** No code change (accepted spec follow-up).
4. **Important — hoist `before`.** `pickBestStreamerMove` computes `projectedCatWinsFromDaily` once and reuses it via `scoreStreamerMoveWithBefore`. Public `scoreStreamerMove` signature unchanged.
5. **Important — type fixtures.** Preview `plan()` now includes `opponentDays: []` and `opponentDaily: {}`. Planner fixtures no longer use `"UTIL"` as a `SeasonPosition`.
6. **Important — `handlePlansBuilt`.** Wrapped in `useCallback` so the panel effect does not depend on an unstable function identity.

## Covering tests

- `tests/unit/streamingPlans.test.ts` — `uses the selected opponent roster when opponentTeamIndex is set` (TDD: failed first with `first-opp` seated, then passed after the resolve change). Existing two-team / omitted-index cases still pass.
- `tests/unit/applyStreamingPlanPreview.test.ts` — fixture type completeness.
- `tests/unit/streamerMove.test.ts` — ranking behavior unchanged after `before` hoist.
- `tests/unit/StreamingPlansPanel.test.tsx`, `tests/unit/MatchupWorkspace.test.tsx`, `tests/unit/OpponentWeekStrip.test.tsx` — panel/workspace wiring.

## Commands and output

```
npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts
```

```
 Test Files  1 passed (1)
      Tests  62 passed (62)
   Duration  2.28s
```

RED (before implement, `-t "uses the selected opponent roster"`):

```
 FAIL  ... uses the selected opponent roster when opponentTeamIndex is set
 AssertionError: expected [ 'first-opp' ] to include 'selected-opp'
 Tests  1 failed | 61 skipped (62)
```

```
npx.cmd vitest run --maxWorkers=1 tests/unit/streamerMove.test.ts
```

```
 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  1.91s
```

```
npx.cmd vitest run --maxWorkers=1 tests/unit/StreamingPlansPanel.test.tsx
```

```
 Test Files  1 passed (1)
      Tests  27 passed (27)
   Duration  16.87s
```

```
npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupWorkspace.test.tsx
```

```
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  13.18s
```

```
npx.cmd vitest run --maxWorkers=1 tests/unit/applyStreamingPlanPreview.test.ts
```

```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  2.22s
```

```
npx.cmd vitest run --maxWorkers=1 tests/unit/OpponentWeekStrip.test.tsx
```

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  8.83s
```

All listed commands exited 0.

## Concerns

- Scoreboard Opp vs frozen board (`ratioSits` / `weakCats` / target chips) left as the accepted spec follow-up. No “no streams ⇒ totals match old weekly Opp” test added.
- Roster / ESPN / cookie worktree WIP was left unstaged.
