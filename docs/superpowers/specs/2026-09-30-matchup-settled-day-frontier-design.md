# Matchup settled-day frontier

**Date:** 2026-09-30  
**Status:** Approved for implementation  
**Product:** Matchup — lock settled matchup days to ESPN actuals as soon as their scoring period closes, and replan from the first still-open day (`frontierDate`)

**Supersedes (when it runs):** the calendar-morning cut in `2026-09-25-matchup-morning-check-design.md`. Closed-day contents, day comparison, summary facts, and id-freeze rules from that spec still apply unless this doc says otherwise.

## Goal

When a matchup week is in progress, do not wait for calendar “tomorrow morning.” As soon as ESPN marks a matchup day’s scoring period closed, that day locks to actual 9-category totals. The week board, streaming plans, and sit/start recompute from the first matchup day that is still open (`frontierDate`).

Day-level close only. No live blend of in-progress games.

## Locked decisions

### When a day closes

- Close unit: whole matchup calendar day.
- Close signal: ESPN `scoringPeriodId < currentScoringPeriod` for that day’s period (`pairClosedScoringPeriods` / day box fetch). No NBA live scoreboard in v1.
- A game day without ESPN actuals (and without a prior closed record) stays **open** (still projected), even if some tips that calendar night already finished.
- A no-NBA-game matchup day closes at zero when it sits before the first still-open game day, or when it already has a previous closed record.
- First close freezes startable player ids. Later syncs may refresh actual totals; they do not replace those ids.

### Frontier and remaining week

- `frontierDate` = first `schedule.matchup.days` entry that is not closed. If every day is closed, remaining projection/streaming schedules are empty.
- Week board = actuals of closed days + projections for `frontierDate` through the last matchup day.
- Streaming plans and sit/start use a schedule filtered to `date >= frontierDate`.
- Persistence field names stay `morningCheckJson` / morning check types; product language is settled days / frontier.

### When the check runs

- Each matchup page load may consult ESPN status.
- Fetch day boxes for ESPN-closed periods among the matchup days (not `date < calendar today`).
- Reuse saved boxes when the ESPN-closed date set is already covered by the saved closed days and nothing is pending. Refetch when a new period closes — **same calendar day is allowed**.
- Do not gate on `checkedOn === calendar today`.

### Unchanged from morning-check design

- Day comparison under the scoreboard for closed days (projection above actual).
- Summary facts: flips, opponent roster diffs, Out / DNP; at most 3 recommendation changes when facts exist.
- Failure: ESPN sync fail keeps last saved check and can mark stale; missing final for an expected closed period can surface pending copy where still used.
- Out of scope: live in-game actuals, NBA Final polling, renaming the DB column, ESPN writeback.

## Tests

- A game day with ESPN actuals closes even when the clock date equals that day; `frontierDate` is the next open matchup day.
- A game day with no actuals and no previous record stays open; it is not skipped only because of calendar today.
- A no-game day before the first open game day closes at zero.
- API/advice cache refreshes when a new ESPN-closed date appears on the same calendar day.
