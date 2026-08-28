# Daily Lineup ESPN Roster Grid — Design Spec

**Date:** 2026-08-28  
**Status:** Draft for user review  
**Product:** Matchup Daily lineup displays like ESPN team stats (`view=stats`): one stable roster row per slot, week cells are that player’s schedule  
**Builds on:** `DailyLineupPanel`, `buildLineupDisplayRows`, `DailyLineups` / `togglePlayerDay`, streaming plan preview overlay  
**Reference:** ESPN Fantasy Basketball team clubhouse stats view  
**Branch context:** `feat/published-nba-schedule`  
**Deferred:** streaming plans algorithm review (separate spec)

---

## 1. Goal

Stop packing off-night and Sit players onto Bench. The grid should read like ESPN: **PG stays PG even with no game that day**; the day cell is empty or Sit, not a missing row.

### Success criteria

- Rows follow **weekly roster seats** (PG → UTIL ×3 → BE ×3 → IL), including empty seats.
- A player’s row does not change when the focus day changes, when they have no game, or when they are Sat.
- Day-header click **highlights that column** and sets the focus day for Games count / `aria-pressed`. It does **not** reorder rows.
- Preview streamers appear as **extra dashed rows below** roster/IL, not in PG/C/UTIL seats.
- `DailyLineups` storage and start/sit scoring rules stay as they are (eligible-slot seating, full-day, IL block).
- Unit tests cover the five cases in §7.

### Non-goals

- Streaming plan builder / add-pace / hold / swap logic
- Pixel-matching ESPN chrome (fonts, stat columns, opponent logos)
- Moving Sit players to Bench
- Per-day roster-slot history (home slot = current `SeasonRosterEntry.slot`)
- Changing `applyStreamingPlanPreview` seating used for **projections** (display only splits preview into extra rows)

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Row identity | Weekly roster slot from `rosterEntries`, ESPN stats-style |
| Off-night | Stay on home row; cell `—` |
| Sit (has game) | Stay on home row; cell shows Sit state |
| Day header | Column highlight + focus day only |
| Preview streamers | Extra rows under IL; do not occupy roster rows |
| Engine vs display | Display row ≠ daily start slot. Engine still seats Start into an eligible empty slot |

---

## 3. Approach (locked)

**Roster-home grid.** Rejected: packing sitters to BE; re-sorting rows by focus-day starts.

---

## 4. Display model

### Rows

Build from `rosterEntries` in `SEASON_ROSTER_SLOTS` order:

1. One row per active seat (PG, SG, SF, PF, C, G, F, UTIL ×3), `playerId` from that entry (may be `null`).
2. Exactly **3** BE rows from bench roster entries (empty bench stays empty). **Do not grow BE** for sitters.
3. IL row(s) as today (current IL occupants; keep at least one IL row).
4. Then, if preview is on, one extra row per preview streamer id **not already shown** on a roster/IL row. Slot label is `PV`. Keep the existing dashed row + name `preview` badge.

Each row is **one player for the whole week**. Week cells are that player’s real schedule (`dayOpponentLabel` / existing game buttons).

Replace `buildLineupDisplayRows` focus-day occupant mapping + sitter→BE packing. Focus day must not pick `playerId` for active rows.

### Cells (player × day)

| State | Cell |
| --- | --- |
| No game | `—` (unchanged) |
| Has game and in `DailyLineups[day]` | Start button, opponent, existing B2B / sit-start hints |
| Has game and not started | Same opponent control in **Sit** pressed/unstarted state; row unchanged |
| IL + has game | Existing IR shade + block toggle |
| Plan-dropped / preview lock | Existing lock / strikethrough on **that day’s cell and/or name** |

If the engine started the player in a slot other than the home roster slot, show a compact **started-slot badge** on that day’s cell (e.g. UTIL). Do not move the row.

### Focus day

- Default: first matchup day (or existing default).
- Header button: `aria-pressed` + filled chip as today; optional light column background on that day’s cells.
- Games row: count of **started games that calendar day** (unchanged meaning).

### Copy

Replace the Daily lineup subtitle that says sitters go to Bench. New sense: slots stay put; click a day to highlight it; click a game cell to start/sit.

---

## 5. Start/sit data (unchanged contract)

`DailyLineups` remains `date → started active entries`.

- **Sit:** remove player from that date’s entries only.
- **Start:** existing `togglePlayerDay` / eligible-slot seating (C → C or UTIL, not first empty PG). `"full"` still applies.
- Day header does not write storage.
- Reset still refills days with players who have games.

Projections keep using started entries, including preview overlay from `applyStreamingPlanPreview`. The **visible** roster rows ignore that overlay for who sits in PG; preview names appear only on extra rows.

---

## 6. Preview overlay (display)

Rostered occupants never leave their home row to make room for a streamer.

- Preview streamer schedule: extra rows only.
- If the plan drops a rostered player from a date, that player **stays on the home row**; that day’s cell uses the existing dropped/locked treatment.
- Do not insert streamers into empty PG/UTIL **display** seats.

---

## 7. Tests

Update `matchupDailyLineups` / `DailyLineupPanel` tests that assume sitters pack to BE or focus-day row reshuffle.

Must pass:

1. Player with no game on the focus day still occupies their roster home slot; that day’s cell is `—`.
2. Sit on a game day leaves the player on the same row; they are absent from `DailyLineups[day]`.
3. Changing focus day does not change row player order.
4. Empty active roster seats render as empty rows (not filled by sitters).
5. Preview streamer ids render as extra rows and do not appear as the PG/C/UTIL row occupant when that seat has a rostered player.

---

## 8. Out of scope (next spec)

Streaming plans quality: add selection, hold vs swap, drop policy, full-day skip interaction with this grid, UX of the plan table. This spec does not change `buildStreamingPlan`.
