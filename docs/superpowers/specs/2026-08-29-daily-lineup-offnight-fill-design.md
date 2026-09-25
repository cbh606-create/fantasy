# Daily Lineup Off-Night Fill — Design Spec

**Date:** 2026-08-29  
**Status:** Draft for user review  
**Product:** Daily lineup grid — empty active seats after starts are filled by off-night roster only  
**Amends:** [Starts-Only Seats](./2026-08-29-daily-lineup-starts-only-seats-design.md)  
**Branch context:** `feat/published-nba-schedule`

Starts-only left every non-start on BE. Thin nights (one game) grew BE and stretched the page. This spec puts **off-nights back on empty actives**. Sit and plan-drops still stay down. Engine unchanged.

---

## 1. Goal

Keep the grid near weekly-roster height. After Pass 1 starts, fill leftover empty actives with roster players who have **no game** that focus day (prefer home). Do not put Sit or plan-dropped (has game, not started) on an active row.

### Success criteria

- Pass 1 unchanged: `daily[focusDay]` starts in engine slots.
- Empty active after starts: first eligible **off-night** (no game), prefer weekly home if empty and eligible. Cell is `—`.
- Sit / plan-drop (has game, not in `daily[focusDay]`): BE only. They do not take an active. An off-night may occupy the vacated home slot.
- Unstarted preview stays `PV` under IL. Started preview stays on the engine slot.
- Off-night fills are display-only. Not written to `DailyLineups`.
- `togglePlayerDay` unchanged. No auto-start.
- Unit tests cover §5.

### Non-goals

- Auto-starting a bench player after Sit
- Putting Sit or PV into empty actives
- Hiding empty slot rows
- Streaming plans / ESPN writeback

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Who fills empty actives | Off-night roster only (`gameWeightForTeamDate` = 0) |
| Prefer | Weekly home if empty and `eligibleForSlot`; else first empty eligible active |
| Sit / plan-drop with a game | BE (grow if needed) |
| Unstarted PV | `PV` under IL |
| Thin night (e.g. 10/22, one start) | One start + off-nights on remaining actives; BE stays the unused bench, not the whole roster |
| Engine | Unchanged |

---

## 3. Approach (locked)

In `buildLineupDisplayRows` focus branch, after Pass 1:

1. For each remaining non-IL roster id **without** a game that day, prefer-home then first empty eligible **active** (not BE).
2. Then place remaining non-IL roster ids (Sit / drop / leftover) on empty BE, then append BE rows.
3. Leftover extras → `PV` after IL.

Restore `playerHasGame` / `gameWeightForTeamDate` for this pass. Do not restore Sit-into-hole or PV-into-active.

---

## 4. Worked examples

**10/22 (one start):** `daily` has F@UTIL. Off-nights A–E take home PG–C / leftover actives. BE is weekly bench only (or empty). Grid does not grow by twelve BE rows.

**Friday (nine starts, Collier sat):** Nine starts on engine slots. Empty PG: if someone is off Friday and eligible, they sit there with `—`. Collier (game, not started) is BE.

---

## 5. Tests

Update `matchupDailyLineups` focus-day cases that currently expect off-nights on BE and empty SG/PF.

Must pass:

1. Off-night occupies empty home active; not written to `daily`.
2. Sit + has game still on BE; not on an active.
3. Unstarted preview still `PV`, not an empty active.
4. Starts still win their engine slots (never displaced by an off-night).
5. Omit focus → home-row builder unchanged.

---

## 6. Out of scope

Name strikethrough, streaming waiver, and auto-start stay with parent specs.
