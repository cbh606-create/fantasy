# Streaming budget-behind ranking, surplus drops, Opp strip

**Date:** 2026-09-08  
**Status:** Approved  
**Branch:** `feat/published-nba-schedule`

## Locked decisions

- No default Hold on today / first matchup day. Hold only if the user picks Hold.
- `budgetBehind` = remaining adds ≥ remaining matchup days.
- When behind: rank FAs by weak-cat / board help first (density / B2B is tiebreak). Allow thin fills. Swap a held streamer even if they play today, if another FA raises `projectedCatWins`.
- When not behind: keep density-first ranking and hold-if-they-play.
- Surplus cats = board `W` and `winProb >= 0.7`. When behind, prefer dropping a roster player with high surplus-cat contribution and low L/T contribution, even if they play that day.
- **ADP ≤ 60 is not a drop shield.** Planner and dropbox treat those players like anyone else.
- Empty / expired stream spots still fill the best FA even if `projectedCatWins` does not rise. Roster-player drops are skipped when the drop+add would lose cat wins; the next cheaper drop is tried instead. Early swaps of a held game-day streamer still require a positive delta.
- Opp week strip sits **under Daily lineup**, same day columns. Per spot per day: **drop → add**, hold name, or —.

## Out of scope

- Persisting Opp spots
- Predicted vs actual 9-cat
- Changing weekly add limit UI
