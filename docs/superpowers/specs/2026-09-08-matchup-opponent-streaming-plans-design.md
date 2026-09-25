# Matchup Streaming Plans — Opponent Streaming — Design Spec

**Date:** 2026-09-08  
**Status:** Draft (awaiting user review)  
**Product:** Matchup streaming plans — score our adds against an opponent who also streams from the same FA pool  
**Builds on:** board-delta adds, today/first-day dropbox, planned future drop labels, 1–3 spot plans, Daily preview  
**Branch context:** `feat/published-nba-schedule`  
**Follow-up (out of scope):** day-by-day predicted vs actual 9-cat You/Opp comparison

---

## 1. Goal

Our plans treat opponent category totals as frozen. In a real H2H week the opponent also adds and drops, often from the same free-agent pool, so we overstate how much a streamer moves the board.

The planner must **simulate opponent streaming** in the same day loop: they spend their own add budget, hunt their weak cats, and cannot take a player we already picked that day. The Matchup page still centers **our** 1/2/3-spot calendars. Opponent activity shows as updated Scoreboard Opp totals, a compact week strip, and a small `Opp: Name` hint on our Add cells.

### Success criteria

- Building each of our 1/2/3-spot plans runs an interleaved opponent turn the same day, from the **remaining FA pool**.
- Opponent spot count is `Auto | 1 | 2 | 3`. Auto = opponent empty non-IL roster seats, clamped to 1–3; **0 empty seats → 1** (they stream by dropping).
- User can override Auto after watching how the opponent actually streams. Choice is session-only (not persisted on the server).
- Our recommended FA is kept on collision; opponent takes the next-best unique player that still raises **their** rest-of-week `projectedCatWins`.
- Scoreboard **Opp** row uses opponent roster projections **plus** simulated streams. **You** row stays our Daily (+ Preview when on).
- Compact **Opp week** strip under the Scoreboard: per day, opponent game count + that night’s simulated streamer (or —).
- Our Streaming plans table is unchanged in shape. Add cells may show muted `Opp: Name` when the opponent added that day.
- Our drop `<select>` stays today, or the first matchup day if today is before the week. Later days still show the **planned** drop label (not —).
- Unit tests cover the cases in §7.

### Non-goals

- Day-by-day predicted vs actual 9-category You/Opp comparison (next spec)
- Full opponent Daily PG–BE grid
- Rendering a full 1/2/3-spot opponent calendar
- Joint search over (our add × their add) combinations
- ESPN remaining-add counts or waiver-order claim simulation
- Persisting `oppSpotCount` on the server
- Opponent today-Hold dropbox
- Live injury APIs, ESPN lineup writeback
- Changing Aggressive / Balanced / Conservative for us

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| What “opponent replaces” means | Category arms race **and** same FA pool |
| Claim / collision | Interleaved greedy: **we pick first** that day; they pick from leftovers. Same player → we keep ours, they take next-best |
| Our plan UI | Still the only full calendar. Scoring includes opponent streams |
| Opponent visibility | Scoreboard Opp + one **Opp week** row + `Opp: Name` on our Add cells |
| Opponent spots | User `Auto / 1 / 2 / 3`. Auto from empty non-IL seats (1–3, zero → 1) |
| Opponent add budget | Same number as our weekly add budget control |
| Opponent daily | `initDailyLineups` from opponent weekly roster + schedule, then simulated seats — not ESPN sit/start |
| Opponent drops | Planner-chosen (greedy), no Hold default dropdown |
| Our 1/2/3 comparison | All three of **our** plans scored against the **same** opponent policy |
| Persistence | Session React state only |
| Copy | English. Control: `Opp spots`. Auto label: `Auto · N open`. Hint: `Opp: {name}` |

Rejected: we always get exclusive #1 FA with a frozen Opp board; opponent always drafts first; independent two-plan post-hoc collision repair; full combinatorial search; always-on 9-cat pred/actual grid.

---

## 3. Approach

Keep the existing greedy planner (hold → fill empties → early-swap) and add a **second turn per day**.

Shared state for a run of `buildStreamingPlan` (our `spotCount` ∈ {1,2,3}):

- `faPool` — `availablePlayerIds` not on either side’s roster at the start of the week, minus players already added by us or them this week (waiver cooldown still applies per side as today).
- `youWorkingDaily` — current input Daily (or init from our roster).
- `oppWorkingDaily` — init from **opponent** roster + schedule, then opponent streamer seats.
- `oppSpotCountResolved` — 1, 2, or 3 from Auto or the override.
- Separate `addsUsed` counters; both capped at the same `addLimit`.

### Day loop

For each matchup date, in order:

1. **Our turn** (existing passes). Candidates exclude player ids already seated by **either** side that day or already consumed from the shared pool this week. Board delta: `buildMatchupBoard(youTotalsFromDaily(youWorkingDaily'), oppTotalsFromDaily(oppWorkingDaily))` vs the board before the move. Require delta `> 0` as today.
2. **Opponent turn.** Same schedule/strategy gates, `oppSpotCountResolved` virtual spots, drop+add scored against **their** board (our totals vs their totals, they want to raise **their** `projectedCatWins`, i.e. hurt ours). Candidates = remaining pool after our turn. If the best player is already our pick that day, skip to the next FA. If no positive delta, leave empty / hold.
3. Commit both overlays. Later days see both dailies.

Opponent has no today-Hold UI. Forced holds for **us** (`withTodayHolds` / first-day edit date) are unchanged.

### Auto spots

```
open = count of opponent entries where slot !== "IL" and playerId == null
resolved = clamp(open === 0 ? 1 : open, 1, 3)
```

Show `Auto · {open} open` even when `open` is 0 (resolved spots still 1).

---

## 4. UI

Place **Opp week** directly under the Scoreboard (same day columns as Daily / Plans).

- Leading label: opponent team name or `Opp`.
- Per day: game count for opponent rostered players that date (integer) and the simulated streamer name for that night, or —.
- Trailing control: `Opp spots` — `Auto · N open` | `1` | `2` | `3`. Changing it rebuilds our three plans, the strip, and Scoreboard Opp.

Scoreboard:

- You: existing live Daily (+ Preview plan when selected).
- Opp: opponent weekly projections from `oppWorkingDaily` after the simulated week (the opponent daily that belongs to the **previewed** plan if Preview is on, else a shared opponent sim used for all three plan builds — see §5).

Streaming plans table:

- Unchanged grid. On an Add / Drop→Add cell, if the opponent added that date, append muted `Opp: {name}`.
- Our drop `<select>`: today if today ∈ week; else first day if today < week start; else none. Later days: read-only planned drop names.

No opponent PG–BE Daily clone. No second 1/2/3-spot table.

---

## 5. Scoreboard vs three plans

Our panel always builds 1-spot, 2-spot, and 3-spot **our** plans. Each build includes its own interleaved opponent (same `oppSpotCountResolved` and add limit). Opponent adds can differ slightly across those runs because we consume different FAs.

- **Opp week strip + Scoreboard Opp** follow the **Preview** plan’s opponent sim when Preview is 1/2/3-spot.
- When Preview is None, use the opponent sim from the **1-spot** our-plan run (stable default, matches Auto’s “typical streamer” reading of the strip).

Do not average the three opponent sims.

---

## 6. Failure and empty states

- Thin FA pool: opponent cells —; Opp Scoreboard falls back to roster-only projections (no streams). Our plan still fills as today.
- Missing opponent team / no entries: hide Opp spots control; strip shows —; Opp Scoreboard stays current static `board.opp`.
- Opponent never finds a positive-delta add: strip names —; our deltas match near-frozen Opp (current behavior).

---

## 7. Testing

Unit tests (planner + panel):

1. Collision: both sides’ top FA is the same on day 1 → our cell gets that id; opponent cell gets a different id (or empty if none).
2. Auto: opponent roster has two empty non-IL seats → resolved spots = 2; zero empty → resolved = 1.
3. Board: after opponent adds an STL streamer, our STL-specialist add’s `projectedCatWins` delta is **lower** than the same add vs a frozen Opp board.
4. Strip: a day the opponent added renders the streamer name; a day they did not renders —.
5. Dropbox: still only on today or first day of a future week; later days have no `<select>` and show a planned drop label (not forced —).
6. `Opp spots` 3 vs Auto 1: our plan FA order or Opp totals can change (assert a detectable board or strip difference).

Do not require ESPN network in these tests; use existing tiny roster/schedule fixtures.

---

## 8. Files (expected)

- `src/lib/matchup/streamingPlans.ts` — day loop opponent turn; shared FA consumption.
- New helper as needed: `src/lib/matchup/opponentStreaming.ts` — Auto spot resolve, opponent `initDailyLineups` input.
- `src/components/matchup/StreamingPlansPanel.tsx` — `Opp: Name` hint; `oppSpotCount` state passed into `buildStreamingPlan`.
- `src/components/matchup/MatchupWorkspace.tsx` — Opp week strip + `Opp spots` control; Scoreboard Opp from opponent sim.
- Tests under `tests/unit/` for planner, panel, and workspace/strip as needed.

Keep changes on the matchup streaming path only.
