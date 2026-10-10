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
- The **slot column** stays the league template when the focus day changes. Who sits in each slot is [Focus-Day Seats](./2026-08-29-daily-lineup-focus-day-sort-design.md).
- Day-header click **highlights that column** and sets the focus day for Games count / `aria-pressed`. Occupants follow the focus-day seat spec.
- Preview streamers keep preview chrome. On the focus day they may occupy an empty eligible active slot; leftover PV rows stay below IL.
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
| Slot column | League template; never reorders |
| Off-night | Cell `—`; may fill an empty eligible slot on the focus day |
| Sit (has game) | Cell Sit; may occupy an empty eligible slot (prefer home) |
| Day header | Column highlight + focus day; occupants in the focus-day seat spec |
| Preview streamers | Preview chrome; may occupy an empty eligible active slot when they have a game |
| Engine vs display | Display can rematch occupants for the focus day. Engine still seats Start into an eligible empty slot |

---

## 3. Approach (locked)

**Fixed slot column.** Rejected: packing sitters to BE as the only home. Focus-day **occupants** are specified in [Focus-Day Seats](./2026-08-29-daily-lineup-focus-day-sort-design.md).

---

## 4. Display model

### Rows

Build from `rosterEntries` in `SEASON_ROSTER_SLOTS` order:

1. One row per active seat (PG, SG, SF, PF, C, G, F, UTIL ×3), `playerId` from that entry (may be `null`).
2. Exactly **3** BE rows from bench roster entries (empty bench stays empty). **Do not grow BE** for sitters.
3. IL row(s) as today (current IL occupants; keep at least one IL row).
4. Then, if preview is on, one extra row per preview streamer id **not already shown** on a roster/IL row. Slot label is `PV`. Keep the existing dashed row + name `preview` badge.

The slot list is **one seat for the week**. The occupant (and that player’s week cells) is chosen for the **focus day**; see the focus-day seat spec.

### Cells (player × day)

| State | Cell |
| --- | --- |
| No game | `—` (unchanged) |
| Has game and in `DailyLineups[day]` | Start button, opponent, existing B2B / sit-start hints |
| Has game and not started | Same opponent control in **Sit** pressed/unstarted state; occupant may sit in an empty eligible slot |
| IL + has game | Existing IR shade + block toggle |
| Plan-dropped / preview lock | Existing lock / strikethrough on **that day’s cell and/or name** |

If the engine started the player in a slot other than the weekly home slot, show a compact **started-slot badge** on that day’s cell (e.g. UTIL). Focus-day row placement follows the seat spec.

### Focus day

- Default: first matchup day (or existing default).
- Header button: `aria-pressed` + filled chip as today; optional light column background on that day’s cells.
- Games row: count of **started games that calendar day** (unchanged meaning).

### Copy

Replace the Daily lineup subtitle that says sitters go to Bench. New sense: slots stay put; click a day to see that day’s seats; click a game cell to start/sit.

---

## 5. Start/sit data (unchanged contract)

`DailyLineups` remains `date → started active entries`.

- **Sit:** remove player from that date’s entries only.
- **Start:** existing `togglePlayerDay` / eligible-slot seating (C → C or UTIL, not first empty PG). `"full"` still applies.
- Day header does not write storage.
- Reset still refills days with players who have games.

Projections keep using started entries, including preview overlay from `applyStreamingPlanPreview`. Visible occupants on the focus day follow the focus-day seat spec (may show a preview streamer in an empty active slot).

---

## 6. Preview overlay (display)

- If the plan drops a rostered player from a date, that day’s cell uses the existing dropped/locked treatment.
- A preview streamer with a game on the focus day may occupy an empty eligible **display** seat; leftover streamers stay extra `PV` rows. See the focus-day seat spec.

---

## 7. Tests

Update `matchupDailyLineups` / `DailyLineupPanel` tests that assume sitters pack to BE or focus-day row reshuffle.

Must pass:

1. Off-night cell is `—`. Occupant may be the home player or an eligible fill; see the focus-day seat spec.
2. Sit on a game day: player is absent from `DailyLineups[day]`; cell is Sit; they may occupy an empty eligible display slot.
3. Changing focus day keeps the slot column fixed; occupants follow the focus-day seat spec.
4. Empty active seats are filled only by the seat-spec passes (not by packing sitters to BE).
5. Preview streamer with a game may occupy an empty eligible active row; otherwise they render as a `PV` row.

---

## 8. Out of scope (next spec)

Streaming plans quality: add selection, hold vs swap, drop policy, full-day skip interaction with this grid, UX of the plan table. This spec does not change `buildStreamingPlan`.
