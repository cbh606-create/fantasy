# 1-Spot Off-Night Always Cover (restored) — Design Spec

**Date:** 2026-08-29  
**Status:** Draft for user review  
**Product:** 1-spot streaming plans must spend the slot on every off-night so counting stats can run up  
**Amends:** [Board-Delta Adds](./2026-08-28-matchup-streaming-board-delta-design.md) §2–4 (off-night accept)  
**Restores:** [1-Spot Off-Night Always Cover](./2026-08-25-matchup-streaming-onespot-offnight-always-cover-design.md) accept rule  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

A 1-spot plan that **holds** a streamer through a night they do not play (e.g. 10/22) wastes the only streaming seat. Volume / counting cats cannot move if nobody starts. Board-delta still picks **who**; it must not decide **whether** to cover a 1-spot off-night.

### Success criteria

- **1-spot only:** hold + no game today + `addsUsed < addLimit` + a today-playing FA can sit → always `drop_add`.
- Among those FAs, pick **max board delta** (may be `≤ 0`). If every scored move fails to seat, stay hold.
- If density/thin gates yield no today block, fall back to today-playing FAs (`rankEligibleFas`) so cover is not starved.
- Held player **plays today** → keep hold unless existing 1-spot density early-swap fires.
- 2/3-spot unchanged (density / late-week / board gate).
- Empty-spot **first adds** still require `delta > 0`.

### Non-goals

- Forcing a swap on a night the held streamer has a game
- Copying always-cover onto 2/3-spot
- Changing drop picker or addLimit

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Accept | Always cover 1-spot off-night when a today FA can sit |
| Who | Max `projectedCatWins` delta, including `≤ 0` |
| No seat | Hold (full night / ineligible) |
| Gates | `listTodayBlocks` first; else today `rankEligibleFas` |
| 2/3-spot | Board + density rules unchanged |

---

## 3. Tests

1. 1-spot: Mon add BOS; Tue BOS off; CHI plays Tue only and is a bad-cat FA → Tue `drop_add` CHI (not hold).
2. 1-spot: two Tue FAs → pick the higher board delta even if both `≤ 0`.
3. 1-spot: held plays Tuesday → hold.
4. 2-spot: same Tue off fixture does not gain this always-cover rule.
