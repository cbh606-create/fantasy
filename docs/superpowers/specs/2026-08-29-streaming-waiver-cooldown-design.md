# Streaming Plans — Waiver Cooldown — Design Spec

**Date:** 2026-08-29  
**Status:** Approved — default 2-day; league hook ready  
**Product:** Streaming plans do not re-add a player still on waivers after we dropped them  
**Builds on:** 1-spot off-night always-cover, board-delta who-pick  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

Typical ESPN/Yahoo: a dropped player is not an instant FA. The planner must not bounce the same streamer back the next day. Default like a **2-day waiver period**. When a live league is wired later, use that league’s period.

### Success criteria

- After the plan drops player P on matchup day D, P cannot be added again on D or the next `waiverPeriodDays` matchup days.
- Default `waiverPeriodDays` is **2** when neither the call nor the league sets it.
- `SeasonLeagueState.waiverPeriodDays` is the league hook (unset today). `buildStreamingPlan({ waiverPeriodDays })` overrides for tests / later UI.
- Period `0` means no cooldown (same-day still cannot add a player just dropped that day? **Lock:** period 0 only skips the extra days; drop day itself is always locked).
- 1-spot off-night cover still fires, but the replacement cannot be a cooling-down id.
- Unit tests cover §3.

### Non-goals

- Parsing ESPN/Yahoo waiver settings from a live import (field only)
- Modeling other teams claiming the dropped player
- FAAB / waiver order for these planned adds
- Changing addLimit or 2/3-spot density gates

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Default period | 2 matchup days after the drop date (`to - from <= period` → locked) |
| Drop day | Always locked |
| Example | Drop Tue → blocked Tue, Wed, Thu; first eligible Fri |
| League hook | optional `state.waiverPeriodDays` |
| Call hook | optional input overrides state |
| Who is marked | `droppedPlayerId` and roster-drop ids the plan actually drops |

---

## 3. Tests

1. Default (omit period): Mon add A, Tue drop A for B; Wed A has a game → Wed occupant is not A.
2. Same week, day index drop+3 (Fri if drop Tue): A may return.
3. `waiverPeriodDays: 1`: drop Tue → Wed still locked; Thu may add A again.
4. `state.waiverPeriodDays: 3` without input override: Wed still not A.
