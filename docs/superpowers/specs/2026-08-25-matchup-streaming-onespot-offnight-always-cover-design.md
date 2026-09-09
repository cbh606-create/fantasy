# Matchup Streaming Plans — 1-Spot Off-Night Always Cover — Design Spec

**Date:** 2026-08-25  
**Status:** Approved for implementation planning  
**Product:** Matchup streaming plans — realistic 1-spot add usage via off-night cover  
**Builds on:** `2026-08-25-matchup-streaming-onespot-offnight-add-index-design.md`  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

1-spot plans still often use only ~3 adds/week because hold-through plus the prior **net-starts** off-night rule (`remaining(FA) > remaining(held)`) rarely upgrades. That looks unrealistic when the manager is projected to lose categories (e.g. BLK) and would stream **someone who plays tonight** on every off night of the streaming seat.

### Success criteria

- **1-spot only:** on a hold day where the seated streamer **does not play today**, if `addsUsed < addLimit` and a today-playing FA is available, **always** `drop_add` (no remaining-games inequality).
- **Game days:** keep the held streamer (no weak-cat or density swap solely to upgrade an on-game hold under this feature). Existing on-game **density** early-swap (`allowsEarlySwap`) may still apply as today.
- FA selection continues to prefer **weak-category** contribution via the existing picker (`pickTodayBlock` / weak-cat sort).
- 2-spot / 3-spot unchanged by this rule.
- `addIndex` / panel ordinals unchanged.

### Non-goals

- Daily replace on days the held player **has** a game (for weak-cat or otherwise), except existing density early-swap
- Approach “spend every add even with empty FA pool”
- Changing 2/3-spot hold-through
- New category board UI

---

## 2. Locked product rules

| Situation (1-spot) | Behavior |
|--------------------|----------|
| Hold, **plays today** | Keep hold (unless existing density early-swap fires) |
| Hold, **off night**, budget left, FA plays today | **Always** `drop_add` to best eligible today FA |
| Hold, off night, no eligible FA / no budget | Stay hold |
| Weak cats on board | Influence **who** is picked, not whether off-night cover fires |

Replace the prior accept condition:

```
upgradeRemaining > heldRemaining   // removed for 1-spot off-night
```

with:

```
spotCount === 1 && !heldPlaysToday && heldRemaining > 0
  && upgrade plays today && upgradeRemaining > 0
  && addsUsed < addLimit
```

(Strategy gates inside `pickTodayBlock` / thin rules still decide whether a candidate exists.)

---

## 3. Implementation sketch

In `buildStreamingPlan` early-swap / off-night branch:

- `isOffNightCover = spotCount === 1 && !heldPlaysToday && heldRemaining > 0`
- If `isOffNightCover` and `pickTodayBlock` (or thin late-week path if already used for fills) yields a today-playing FA with `remaining > 0` → swap
- Else fall through to existing on-game `allowsEarlySwap` path (`heldPlaysToday` required)

Optional: if `pickTodayBlock` returns null on mid-week off night due to thin gate, allow 1-spot off-night cover to use `pickBestFa` when `allowsThinFill` **or** always for 1-spot off-night only so cover is not starved by tier gates. **Locked for this round:** try `pickTodayBlock` first; if null and 1-spot off-night, fall back to `pickBestFa` (today, not seated) so “always cover” is not blocked by thin/tier refusal while budget remains. Weak-cat sort in `pickBestFa` still applies.

---

## 4. Testing

- 1-spot: Mon add multi-game BOS; Tue BOS off; thin CHI plays Tue only → Tue `drop_add` to CHI (even though `remaining(CHI) < remaining(BOS)`).
- 1-spot: Tue BOS plays → stay hold (no forced cover).
- 2-spot: same Tue off fixture → spot 0 must **not** gain this always-cover rule (may still fill other spots).
- Adds used on a week with several off nights should rise vs prior net-starts rule when FAs exist.

---

## 5. Out of scope / follow-ups

- On-game weak-cat upgrades
- Budget-aware re-add of dropped multi-game streamers the next day as a first-class plan (may emerge naturally from needFill)
- Strategy-differentiated cover (Aggressive vs Conservative)
