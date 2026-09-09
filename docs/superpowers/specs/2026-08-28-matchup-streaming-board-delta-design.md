# Matchup Streaming Plans — Board-Delta Adds — Design Spec

**Date:** 2026-08-28  
**Status:** Draft (awaiting user review)  
**Product:** Matchup streaming plans — spend an add/swap only when it raises projected category wins  
**Builds on:** streaming plans (1–3 spots), schedule sophistication, starts-max / protected drops, 1-spot off-night cover (this spec **removes** the always-cover accept rule), plan → daily preview  
**Branch context:** `feat/published-nba-schedule`  
**Related:** [Daily Lineup ESPN Roster Grid](./2026-08-28-daily-lineup-espn-roster-grid-design.md) (display only; not changed here)

---

## 1. Goal

Streaming plans still rank free agents by **schedule** (density blocks, remaining games). Category quality is only a weak tie-break, so a high-volume FA can win a spot even when the H2H board gets worse. Sit/Start already scores moves by `projectedCatWins`. Streaming should use the **same board**.

### Success criteria

- An add or `drop_add` runs only if the **drop + add pair**, applied for the **rest of the matchup week**, raises `projectedCatWins` vs the current `workingDaily` board.
- Among FAs that pass **existing schedule/strategy gates**, pick the **largest positive** delta. If the best delta is `≤ 0`, skip (hold or leave empty).
- 1-spot off-night **always-cover is restored** for accept (see [1-spot off-night cover](./2026-08-29-onespot-offnight-always-cover-design.md)). Board delta still ranks **who**. Empty first adds still require `delta > 0`.
- Preview overlay and planner scoring **agree**: streamers sit only in open / off-night slots after the planned drop; they do not displace other game-day starters.
- Unit tests cover the cases in §7.

### Non-goals

- Full-week DP / choosing the 1/2/3-spot plan with the best board
- Trying several roster-drop candidates per add (keep today’s drop picker)
- Per-cell category delta badges in the Streaming Plans table
- Changing Daily lineup row identity (ESPN roster grid)
- ESPN lineup writeback
- Persisting strategy mode on the server
- Live injury APIs

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Success metric | Rest-of-week `projectedCatWins` (Sit/Start / live board) |
| Who among FAs | Schedule/strategy filter first; then max board delta |
| Off-night 1-spot | Board gate everywhere; no always-cover accept |
| Drop cost | One drop from today’s picker + FA = **one move**; no drop search |
| Loop | Keep greedy day-by-day: hold → fill empties → early-swap |
| Full night | After the drop, skip if that date still has no open/off-night seat |
| UI chrome | Unchanged except summary reason + alternative FA order |
| Missing `daily` | `initDailyLineups` from roster + schedule, then still gate |

Rejected: weak-cat heuristic only; whole-plan search; FA-only scoring that ignores the drop.

---

## 3. Approach (locked)

**Greedy + real board delta** on the existing two-pass planner.

1. Start `workingDaily` from input `daily`, or `initDailyLineups` for the matchup days.
2. Each day: existing hold-through, then empty-spot fills, then early-swap — same order as today.
3. For each potential spend: schedule-filter candidates → resolve **one** drop → score each remaining FA by overlaying drop+seats on a copy of `workingDaily` → take max delta `> 0`.
4. Commit the winning overlay into `workingDaily` so later days see it.
5. Stop 1-spot off-night from auto-accepting a today-playing FA.

---

## 4. Scoring

### Inputs

`buildStreamingPlan` already receives `board` and (from the panel) `daily`.

- **Opponent totals** and **category ids** come from `board.categories` (`opp`, `categoryId`). Same helper idea as `oppTotalsFromBoard` in Matchup workspace.
- **You totals** always come from `youTotalsFromDaily(workingDaily, …)`, not from `board.you` (that board is roster-weekly, not daily).
- Enabled cats: `board.categories` ids. If the board has no rows, score with an empty category list (`projectedCatWins` stays 0 → no cat-driven adds). Do not invent `ALL_CATEGORY_IDS` opponent totals.

`adviseMatchup` does not need a new DTO field. The **client rebuild** in `StreamingPlansPanel` (already passes `daily`) is the source of truth. Server-built plans should pass `daily` when the API has it; otherwise `initDailyLineups`.

### One move

Given `date`, `spotIndex`, a candidate `playerId`, and a resolved drop:

1. Clone `workingDaily`.
2. If the drop is a **roster player**, clear that id from `date` through the last matchup day (same as preview).
3. If the drop is a **held streamer**, stop seating that id from `date` onward on the clone (they are not rostered; they only exist from earlier committed overlays). Also clear them from clone days `≥ date` if present.
4. **Add-day fullness:** after step 2–3, if `isDailyLineupFullForDate` is still true for `date`, the candidate is ineligible.
5. Seat the FA on every remaining matchup day `≥ date` where they have a game **and** an eligible slot is open (empty or occupant has no game that day). **Do not** displace a game-day starter. Days that stay full are left unchanged.
6. If the FA is seated on **zero** game days, ineligible (`expectedStarts`-style).
7. `delta = projectedCatWins(clone) - projectedCatWins(workingDaily)` using `buildMatchupBoard(youTotalsFromDaily(…), oppTotals, categoryIds)`.
8. Eligible candidates: `delta > 0`. Winner: max delta. Ties: existing schedule rank (remaining games, stretch/density, weak-cat, `playerId`).

Roster drop for an empty-spot first add is resolved **once** with `resolveRosterDrop` / `pickRosterDrop` **before** scoring FAs. Forced drops (`forcedRosterDrops`) still win when valid. Do not try alternate drops if the pair loses.

### Early-swap

Keep **when** we consider a swap:

- On-game: existing density-tier early-swap gates (`allowsEarlySwap` / `allowsMultiSpotEarlySwap`).
- 2/3-spot off-night: existing late-week / budget-behind / multi-spot off-night gates.
- 1-spot off-night: **no auto-accept**. The held player may be replaced only if a schedule-filtered upgrade has `delta > 0`.

Among upgrades that pass those gates **and** play today with remaining games `> 0`, pick max board delta. Drop for scoring is the held streamer (`droppedPlayerId`).

### Budget and pace

- Hard ceiling: `addsUsed ≤ addLimit`.
- 2/3-spot daily swap pace unchanged.
- Per-spot soft-cap must **not** block a board-positive add while weekly budget remains.
- `isDailyLineupFullForDate` on `workingDaily` still blocks spending when the add-day is full **before** considering candidates that need no drop; after a drop, re-check as in step 4.

---

## 5. Seating alignment (planner = preview)

Today `applyStreamingPlanPreview` may **displace** the last eligible game-day occupant so a streamer still appears on a packed night. That made preview disagree with “full-day skip” and would disagree with this gate.

**Change:** preview seating uses the same open/off-night rule as the scorer. Packed nights without a drop do not show a started streamer. Streaming-plan **PV** rows may still list the player for that date; the Daily cell stays Sit/`—` for the rostered starter.

Extract a shared helper (name indicative): `applyStreamerMoveToDaily` used by scoring, `workingDaily` commit, and preview.

---

## 6. UI

No layout change. Streaming plans table, budget, strategy toggle, preview selector stay.

- Summary reasons: include `Adds only when the board improves` (keep existing density / ADP lines; still cap at 3 — this line replaces a less relevant one when present, e.g. drop the generic “Maximizing starts…” line).
- Alternative FAs on an Add/`Drop→Add` cell: next-best **board-delta** candidates from the same schedule-filtered pool (still max 3, same position-family filter as today).

Live H2H board under preview remains the user-facing check.

---

## 7. Tests

Unit tests on the planner (and seating helper), not a new visual snapshot.

1. Higher remaining-games FA vs a lower-volume FA that raises `projectedCatWins` → pick the latter.
2. All schedule-eligible candidates have `delta ≤ 0` → no add, including **1-spot off-night**.
3. FA-only would look positive, but the resolved roster drop makes the pair `delta ≤ 0` → skip.
4. Second add is scored on `workingDaily` that already contains the first add’s overlay.
5. Add-day is full until the roster drop; after drop a slot opens → candidate may be scored/accepted if delta `> 0`.
6. Conservative (or equivalent) thin/density gates still exclude FAs the schedule layer would reject; they never reach the board sort.
7. Preview apply no longer displaces a game-day starter when the night is full and there is no drop.

---

## 8. Implementation sketch

- Helper module next to `applyStreamingPlanPreview.ts` (or extend that file) for clone + drop-from-date + open-slot seat + `projectedCatWins` delta.
- `buildStreamingPlan`: thread `workingDaily`; replace “take `rankedBlocks[0]`” with “score pool, pick max delta `> 0`”; delete `isOneSpotAlwaysCover` accept branch.
- `StreamingPlansPanel`: already has `daily` / `board`; pass through. Rebuild alternatives from scored pool.
- Keep `WEEKLY_ADD_LIMIT`, strategy knobs, ADP drop protection as they are.

---

## 9. Out of scope leftovers

Category **integer W/L flip** (instead of sigmoid `projectedCatWins`) is not this round. Tiny positive deltas may still spend an add; that matches Sit/Start.
