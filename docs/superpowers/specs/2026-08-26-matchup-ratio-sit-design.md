# Matchup Ratio Sit Recommendations — Design Spec

**Date:** 2026-08-26  
**Status:** Approved for implementation planning  
**Product:** Recommend sitting a started player on a specific day (empty slot) to improve losing/tied FG%, FT%, or TO — without flipping currently won counting categories  
**Builds on:** Matchup daily lineups, `buildMatchupBoard` / `youTotalsFromDaily`, existing Sit/Start (weekly bench↔active swaps — stays separate)  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

Managers often win counting cats but lose FG%, FT%, or TO because a poor shooter / high-TO player still starts on a game day. The advisor should suggest **day-level empty-slot sits** that improve those ratio categories **only when** already-won counting categories stay won after the sit.

### Success criteria

- Pure engine proposes sits: `{ playerId, date, targetCategoryId, deltaWinProb, reason }` (plus any small fields needed for Apply).
- Candidates are **started players on a specific matchup day** with a game; Apply leaves that day’s slot empty (no replacement).
- Only target **FG_PCT, FT_PCT, TO** when baseline outcome is **L or T**, and sit **strictly increases** that category’s `winProb`.
- Every counting category that was **W** at baseline remains **W** after the sit (no flip to T/L). Counting cats: TPM, REB, AST, STL, BLK, PTS; TO is treated as a **ratio target** when L/T, not as a protected counting W in that case.
- UI: separate **Ratio sits** panel on Matchup (not mixed into weekly Sit/Start); Apply updates Daily lineup for that day.
- Unit tests cover: improves FG% when counting W preserved; rejects sit that flips a counting W; ignores sits when ratio cats already W; empty list when no candidates.

### Non-goals

- Replacing the sat player with another rostered player the same day
- Optimizing already-won FG%/FT%/TO (margin padding)
- Opponent day-by-day simulation
- Changing weekly Sit/Start swap algorithm
- Auto-applying sits without user click
- Streaming-plan preview inventing ratio sits (engine may run on `displayDaily`; no special preview-only logic required in MVP)

---

## 2. Approach (locked)

**A — Daily-lineup-based ratio sit engine + dedicated panel.**

Evaluate each (day, started player) by cloning daily, clearing that player that day, recomputing you totals vs opp board, applying gates above. Surface top N in a Ratio sits panel; Apply uses existing daily sit/toggle path.

Rejected: folding into weekly Sit/Start list; board-only hints without Apply.

---

## 3. Engine rules

### Inputs

- `daily: DailyLineups` (the lineups feeding the live board — saved or preview display)
- You roster players + shooting/projections
- Opponent weekly totals (same as current board opp side)
- Schedule / matchup days
- Enabled category ids

### Baseline

Compute you totals from `daily` (existing `youTotalsFromDaily`), build board vs opp. Record per-category outcome and `winProb`.

### Candidate generation

For each matchup `date`, for each player started that day:

1. Skip if player has no game that day (should not be started meaningfully; still safe-guard).
2. Build `daily'` = deep copy with that `playerId` cleared from `date` only.
3. Recompute you totals + board.
4. **Ratio gate:** For each target in `{ FG_PCT, FT_PCT, TO }` that is enabled and baseline outcome is `L` or `T`: if `winProb' > winProb`, consider that target (pick the best delta among targets for this sit, or emit one suggestion per improving target — **MVP: one suggestion per (player, date) using the target with largest `deltaWinProb`**).
5. **Counting protection:** For every enabled counting category in `{ TPM, REB, AST, STL, BLK, PTS }` (and **TO only if it was baseline W and is not the chosen ratio target**): if baseline outcome was `W`, require outcome' === `W`. Else discard candidate.
6. If no ratio target improved under protection, discard.

### Ranking

1. Descending `deltaWinProb` for the chosen target  
2. Tie-break: larger minimum margin among protected counting W cats (optional but preferred)  
3. Tie-break: `playerId`, `date`

Return top **N = 5** (constant, same spirit as `MAX_SIT_START`).

### Reason string (indicative)

`Sit on Wed · helps FG% (+0.12) · counting W preserved`

---

## 4. UI / Apply

- New panel below or beside existing Sit/Start: title **Ratio sits**, muted helper: empty-slot sits to help FG%/FT%/TO without giving back counting wins.
- Row: player name, day label, target cat short label, delta, **Apply**.
- Apply: sit that player on that day via the same Daily lineup mutation used by the daily grid (toggle off / clear seat). Refresh board from updated daily. Disable while applying; ignore stale if already sat.
- Empty: `No ratio sits right now.`
- Preview mode: if `displayDaily` is preview-derived, suggestions reflect preview; Apply follows existing preview sit rules for roster players (or no-op with message if Apply is disallowed in preview — **MVP: Apply only when not in streaming-plan preview**; show panel as read-only or hide Apply while previewing). Prefer: **hide Apply during preview**, still show suggestions computed on `displayDaily` if cheap; if awkward, hide entire panel during preview.

**MVP lock:** Hide Ratio sits panel (or disable Apply) while streaming plan preview is active to avoid conflicting overlays.

---

## 5. Testing

- Unit: engine with fixture daily + players — FG% L improves after sitting brick; counting PTS W stays W.
- Unit: sitting star flips PTS W → L → not suggested.
- Unit: all ratio cats already W → empty.
- UI smoke (optional): panel renders a suggestion and Apply calls handler with playerId+date.

---

## 6. Out of scope / follow-ups

- Multi-sit combinations (sit two players same week)
- Soft margins (“W by 0.1 might be risky”) beyond hard W preservation
- User toggles for which cats to protect
- Streaming-plan integration of ratio sits
