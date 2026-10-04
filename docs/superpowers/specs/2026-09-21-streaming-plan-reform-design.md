# Matchup Streaming Plans — Spot-Policy Reform — Design Spec

**Date:** 2026-09-21  
**Status:** Approved for implementation  
**Product:** Matchup streaming plans — 1-spot off-night cover vs 2/3-spot even caps + density holds  
**Branch context:** `feat-season-roster` worktree  
**Supersedes (planner policy only):** [2026-08-25 1-spot always-cover](./2026-08-25-matchup-streaming-onespot-offnight-always-cover-design.md); [2026-08-25 multi-spot density hold](./2026-08-25-matchup-streaming-multispot-density-hold-design.md) late-week thin / off-night upgrade; swap-pace catch-up in `streamingStrategy.ts`.  
**Keeps:** hole calendar, UTIL-as-hole, weekly `addLimit`, ADP ≤ 60 drop shield, Aggressive / Balanced / Conservative as **FA picker** only.

---

## 1. Goal

1-spot must look like a manager who streams **someone who plays tonight** on every empty night of the seat. 2-spot and 3-spot must spend the weekly add budget **across seats all week**, holding B2B / 2-in-3 / 3-in-4 windows, instead of churning one seat early and dumping leftover adds onto the others in the last three days.

### Success criteria

- **1-spot:** occupant plays today → hold. Off night + remaining add + today-playing FA → always `drop_add` cover. Do **not** hold a 2-in-3 through a 1-spot off night.
- **2/3-spot hard caps:** split `addLimit` as evenly as possible. 7/2 → 4+3. 7/3 → 3+2+2. A spot at cap cannot add again.
- **2/3-spot windows:** hold through B2B, 2-in-3, and 3-in-4 (next game within 2 matchup days). Do **not** fill the mid-window off night with a different player. After the window, that spot may add the next dense block if cap remains.
- **Holes:** tonight’s concurrent streamers = `min(spotCount, holeCount)`. Extra spots stay empty and keep remaining cap. Never Sit/cut a tonight starter to invent holes. Never auto-cut ADP ≤ 60.
- **No late dump:** day-1-of-7 “budget behind” catch-up and last-3-days thin unlock must not pile adds onto one seat.
- **Modes:** stay in the UI. They only rank *which* FA to pick. They cannot skip 1-spot off-night cover, break even caps, or break a 2/3-spot mid-window hold.

### Non-goals

- Week-wide DP / globally optimal add sequences
- Opening holes by sitting healthy starters
- Redesigning mode labels, the plan board, or ESPN add/drop execution
- Changing density tier definitions in `streamingBlocks.ts`

---

## 2. Locked rules

### Spot-count split

| Spot count | Off-night policy | Add budget |
|------------|------------------|------------|
| `1` | Always cover if a today-playing FA exists and `addsUsed < addLimit` | Whole `addLimit` on the one seat |
| `2` or `3` | Hold inside a density window; add only when empty or the window is over | Hard per-spot `addCap` |

### Per-spot `addCap`

```
base = floor(addLimit / spotCount)
remainder = addLimit % spotCount
addCap[i] = base + (i < remainder ? 1 : 0)
```

Examples: 7/2 → `[4, 3]`; 7/3 → `[3, 2, 2]`; 6/3 → `[2, 2, 2]`.

A spot with `addsBySpot[i] >= addCap[i]` cannot `add` or `drop_add`.

### 2/3-spot hold window

```
nextGameOffset = index(next matchup day the occupant plays) - index(today)
insideWindow = nextGameOffset >= 1 && nextGameOffset <= 2
```

If `insideWindow` and the occupant does not play today → **hold** (no mid-fill).  
If they play today → seat and hold.  
If no remaining games, or next game is 3+ matchup days away → drop and the spot may fill.

### 1-spot off-night cover

```
spotCount === 1 && !playsToday && addsUsed < addLimit && todayFaExists
  → drop_add the best today-playing FA
```

This overrides a 2-in-3 / 3-in-4 hold on 1-spot only.

### Hole cap

```
streamerCap = min(spotCount, holeCount)
```

Fill at most `streamerCap` seats, poorest-`addsBySpot` first (then lower `spotIndex`). Spots beyond `streamerCap` are `empty` and do not spend cap.

### Modes (picker only)

Aggressive / Balanced / Conservative still gate **which** FA is chosen (`allowsAddForTier`, weak-cat sort). They must not:

- skip 1-spot off-night cover
- let one 2/3-spot exceed `addCap`
- drop a 2/3-spot occupant who is still inside a hold window

### Removed as you-side swap drivers

- `dailySwapPaceLimit` (~1 swap/day, leftover stacks late)
- `isAddBudgetBehind` catch-up that loosens gates on day 1 of 7/7
- Late-week thin unlock as a reason to `drop_add` a held 2/3-spot occupant

Empty-spot fills on a hole night may still take a 1-game FA when no denser block starts today, **if** that spot is under cap. That is a fill, not a late-week dump onto one hogging seat.

---

## 3. Day loop

1. Build today’s hole lineup (existing hole calendar).
2. `streamerCap = min(spotCount, holeCount)`.
3. For each occupant: 1-spot off-night → cover path; 2/3-spot inside window → hold without mid-fill; else drop if the window is over.
4. `needFill` = empty seats under `streamerCap` whose `addsBySpot < addCap`.
5. Sort `needFill` by `addsBySpot` ascending, then `spotIndex`.
6. Pick a today-playing FA in density order: B2B / 2-in-3 / 3-in-4 / 1-game leftover. Mode only breaks ties / filters conservative thin.
7. Seat only inside leftover holes.

Do not run an early-swap loop that can burn a second add on a 2/3-spot occupant who still has a window, or that uses pace/behind/late-week to dump remaining budget onto one seat.

---

## 4. Testing

- **1-spot cover:** Mon add BOS; Tue BOS off, CHI plays → Tue `drop_add` CHI; Wed BOS would have played but occupant is CHI (or new cover). Variant: Mon add; Tue off cover; Wed the cover player plays → hold.
- **2-spot even caps:** 7-add week with enough hole nights and FAs → final add counts `{4, 3}` (either order). No spot with 5+.
- **2-in-3 hold (2-spot):** same player play–off–play, then drop. Mid day is not another FA on that seat.
- **1-hole night:** only one seat non-empty; other spots `empty` and keep cap.
- **No late-only second seat:** if earlier days had leftover holes, spots 1/2 must not get their first add only in the last 3 matchup days.
- **ADP ≤ 60:** hidden from auto drop suggestions (existing shield).

---

## 5. Out of scope / follow-ups

- Week-wide assignment of non-overlapping windows to spots
- UI badges for `addCap` remaining
- Opponent plan copy of per-spot caps (same builder if it already shares the loop; no new opp-only policy)
