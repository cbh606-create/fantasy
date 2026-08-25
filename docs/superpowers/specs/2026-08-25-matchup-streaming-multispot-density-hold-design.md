# Matchup Streaming Plans — Multi-Spot Density-First Hold — Design Spec

**Date:** 2026-08-25  
**Status:** Approved for implementation planning  
**Product:** Matchup streaming plans — 2/3-spot hold dense blocks; spend adds on B2B / 2-in-window / 3-in-4  
**Builds on:** `2026-08-25-matchup-streaming-onespot-offnight-always-cover-design.md`, schedule sophistication blocks  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

Extend off-night behavior beyond 1-spot without copying 1-spot’s **always thin cover**. With 2 spots and ~7 weekly adds, each add should prefer **dense schedule bundles** (B2B, ~2 games in a short window, 3-in-4). Mid-block off nights should **hold**; upgrades fire when a **new dense block starts today**, or late-week leftover allows thin.

### Success criteria

- **1-spot:** unchanged always-cover on off nights.
- **2-spot / 3-spot:** default **hold** through off nights while `remainingGameDays(held) > 0`.
- **2/3-spot off-night upgrade** only when a candidate block starting today has density tier **`ok` or better** (`ok` = 2 games no B2B, `strong` = 2 + B2B, `elite` = ≥3 in window), and `addsUsed < addLimit`.
- **Late week leftover:** if no dense today block and `allowsThinFill(strategy, dayIndex, dayCount)`, allow thin / `pickBestFa` cover on 2/3-spot off nights (same spirit as needFill thin unlock).
- Empty-spot fills still prefer `pickTodayBlock` (density-first); prefer spots with fewer adds when choosing which spot to fill/cover.
- Game days: hold unless existing density `allowsEarlySwap`.

### Non-goals

- Copying 1-spot always-cover onto 2/3-spot
- Full weekly DP optimizer
- Changing density tier definitions in `streamingBlocks.ts`
- On-game weak-cat forced swaps

---

## 2. Locked rules

### Spot-count split

| Spot count | Off-night policy |
|------------|------------------|
| `1` | Always cover if today-playing FA exists (`pickTodayBlock` then `pickBestFa`) |
| `2` or `3` | Hold by default; density upgrade or late thin only (below) |

### 2/3-spot off-night upgrade accept

```
!heldPlaysToday && heldRemaining > 0 && addsUsed < addLimit
```

Then:

1. `todayBlock = pickTodayBlock(...)` (already tier-gates by strategy).
2. If `todayBlock` and `densityTierRank(todayBlock.tier) >= densityTierRank("ok")` → `drop_add`.
3. Else if `allowsThinFill(strategyMode, dayIndex, dayCount)` → `pickBestFa` (or thin block) if plays today → `drop_add`.
4. Else stay `hold`.

Do **not** require `upgradeRemaining > heldRemaining` for multi-spot (density/timing is the gate).

### On-game early swap

Unchanged for all spot counts: `allowsEarlySwap` tier delta when held plays today.

### Fill path

Unchanged preference for dense blocks; soft evenness via sorting needFill / cover candidates by `addsBySpot` ascending.

**Cover loop order (2/3):** iterate spots by ascending `addsBySpot` then `spotIndex` so budget craft stays even when multiple spots are off the same night.

---

## 3. Implementation sketch

In `buildStreamingPlan` early-swap loop:

- Replace `isOffNightAlwaysCover = spotCount === 1 && ...` with:
  - `isOneSpotCover = spotCount === 1 && !heldPlaysToday && heldRemaining > 0`
  - `isMultiSpotDensityCover` path for `spotCount > 1 && !heldPlaysToday && heldRemaining > 0`
- One-spot: keep current always-cover + `pickBestFa` fallback.
- Multi-spot: pick block; accept if tier ≥ `ok`; else thin only if `allowsThinFill`.
- Before the loop, build `spotOrder = [0..spotCount).sort by addsBySpot then index` and iterate that order.

---

## 4. Testing

- 2-spot: held BOS mid-block off Tuesday with only thin CHI today → **hold** (not always-cover).
- 2-spot: same off night but NYK starts `strong`/`ok`/`elite` block today → **drop_add**.
- 2-spot: late-week off night + conservative/balanced thin unlock → thin cover allowed.
- 1-spot: existing always-cover tests still pass.
- Prefer lower `addsBySpot` spot when two spots off same night and one dense FA.

---

## 5. Out of scope / follow-ups

- Explicit “2 games in 3 calendar days” tier distinct from current 4-day window `ok`/`strong` (current block window already encodes this)
- UI badges for block tier on calendar cells
