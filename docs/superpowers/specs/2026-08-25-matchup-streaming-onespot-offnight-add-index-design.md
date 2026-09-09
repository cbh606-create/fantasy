# Matchup Streaming Plans — 1-Spot Off-Night Net-Starts & Add Index — Design Spec

**Date:** 2026-08-25  
**Status:** Approved for implementation planning  
**Product:** Matchup streaming plans — 1-spot off-night upgrades + ordinal add badges  
**Builds on:** `2026-08-25-matchup-streaming-starts-max-protected-drops-design.md`  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

1-spot plans often **hold through off nights** and leave weekly add budget unused, even when a free agent with a denser remaining schedule (including tonight) is available. Separately, the Add calendar does not show **which add number** each move is within the plan’s budget.

### Success criteria

- For **1-spot only**, on a hold day where the seated streamer **does not play today**, the planner may spend an add to swap to a FA when that FA’s remaining week games from today **strictly exceed** the held player’s remaining week games from today (`net-starts` rule).
- 2-spot and 3-spot behavior unchanged (existing hold-through + early-swap gates).
- Existing early-swap (held **does** play today / denser tier upgrade) unchanged for all spot counts.
- Each `add` / `drop_add` cell exposes a **1-based `addIndex`** for that plan’s chronological add order.
- UI shows a small muted ordinal next to the seated name on those cells (not on `hold` / `empty`).

### Non-goals

- Budget-aware “cover tonight then re-add held later” (Approach B) — deferred
- Unconditional off-night churn (Approach C)
- Changing soft-cap / strategy tier tables
- Per-spot add counters in the badge (plan-wide only)

---

## 2. Locked approach

**A — Net-starts off-night swap (1-spot)** plus **plan-wide `addIndex` on add cells**.

Rejected for this round: B (budget-aware re-acquire) and C (always swap on off nights).

---

## 3. Off-night net-starts swap (1-spot)

### Trigger

Inside the day loop’s early-swap / hold-upgrade path (or a dedicated sibling pass after Pass-1 hold), for each spot:

1. `spotCount === 1`
2. Cell is `hold` with a `playerId`
3. Held player has `remainingGameDays(held, date) > 0` (otherwise Pass-1 already freed the spot)
4. Held player **does not** `playsOn(held, date)` (true off night)
5. `addsUsed < addLimit`

### Candidate

Same picker as today-block / best FA for that date (respect existing strategy density gates for *new* adds if the fill path already applies them; for this off-night upgrade, require the candidate **plays today** and `expectedStarts > 0`).

### Accept iff

```
remainingGameDays(upgrade, date) > remainingGameDays(held, date)
```

Then emit `drop_add`, bump `addsUsed` / `addsBySpot`, seat upgrade (same cell shape as existing early swap).

### Interaction with existing early swap

- **On-game early swap** (held plays today, tier-rank gate): unchanged; runs for all spot counts.
- **Off-night net-starts swap**: 1-spot only; uses remaining-games inequality above, **not** the tier delta gate (tonight’s start is the point). Strategy still limits *which* FA is eligible via the shared picker (`pickTodayBlock` / thin rules).

If both could apply the same day: held cannot both play and not play today — mutually exclusive.

---

## 4. `addIndex` on plan cells

### Type

Extend `StreamingPlanDayCell`:

```ts
addIndex: number | null
```

- Set to `1, 2, 3, …` when `action` is `add` or `drop_add`, in the order adds are spent while building the plan (day order, then spot order already used by the builder).
- `null` for `hold` and `empty`.

### UI (`StreamingPlansPanel`)

- On Add-row cells with a non-null `addIndex`, render a compact muted badge/superscript (e.g. `1`, `2`) adjacent to the player name.
- Do not renumber per spot; the number matches plan `addsUsed` accounting (`Adds k/N`).

---

## 5. Testing

- Unit: 1-spot off night — held has future games but none today; FA with strictly more remaining games including today → `drop_add` and `addsUsed` increments; FA with fewer/equal remaining → stay `hold`.
- Unit: 2-spot same fixture → no off-night net-starts swap from this rule.
- Unit: `addIndex` sequence on a multi-add plan is `1..n` across days.
- Panel: ordinal appears for add links, absent for hold.

---

## 6. Out of scope / follow-ups

- Approach B budget-aware off-night cover
- Injury / waiver claim timing for re-adding dropped multi-game streamers
- Bold/game-day UI (already shipped separately)
