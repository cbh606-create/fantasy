# Daily Lineup Focus-Day Seats — Design Spec

**Date:** 2026-08-29  
**Status:** Superseded for seating passes — see [Starts-Only Seats](./2026-08-29-daily-lineup-starts-only-seats-design.md)  
**Product:** Daily lineup grid — fixed slot column; occupants are that day’s daily-league seats  
**Builds on:** [Daily Lineup ESPN Roster Grid](./2026-08-28-daily-lineup-espn-roster-grid-design.md), `DailyLineups` / `togglePlayerDay` / `eligibleForSlot`  
**Branch context:** `feat/published-nba-schedule`

This spec **replaces** the roster-grid rules “day click does not move occupants,” “preview never sits in PG/C/UTIL,” and the earlier draft that only **reordered** whole rows. Cell chrome (Start / Sit / `—` / IR / preview lock) stays with the parent spec. **Storage and seating engine do not change.**

This is a **daily league**. The left column is the slot template. Who you see in PG on Monday is Monday’s seat, not a weekly roster sort.

---

## 1. Goal

Clicking a day still highlights that column. It also **re-seats the name (and that player’s week cells)** into the fixed slots so the focused night reads like a daily lineup: game-day players up, empty holes filled by eligible off-nights, preview streamers with a game that night included and still marked preview.

### Success criteria

- Slot column order never changes: league seats PG → last BE, then IL, then leftover PV.
- Occupants for the focus day follow §4. Engine slots win; nobody already started is displaced.
- Sit + has game still appears in an eligible hole (prefer home). Cell stays Sit.
- Preview + has game appears in an eligible **active** hole when one is open. Name keeps the existing preview / `PV` treatment. No second PV row for that id.
- Remaining active holes get eligible off-night roster players (prefer home). Cell is `—`.
- IL stays last among roster blocks even if that player has a game.
- `DailyLineups` / `togglePlayerDay` / `applyStreamingPlanPreview` seating used for projections stay as they are.
- Unit tests cover §6.

### Non-goals

- Writing off-night fills or PV display seats into `DailyLineups`
- Playing / Off section headers
- Floating IL
- Changing start/sit scoring or streaming add rules
- ESPN writeback

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Left column | Fixed league slot template. Never reorder. |
| Occupant mapping | Display-only, per focus day |
| Pass 1 | `daily[focusDay]` starts, in their engine slots |
| Pass 2 | Roster Sit + has game → empty eligible; **prefer home slot** |
| Pass 3 | PV + has game → empty eligible **active**; no home slot |
| Pass 4 | Off-night roster → remaining empty eligible; prefer home |
| Pass 5 | Unplaced roster → remaining empty seats, BE first |
| IL | Unchanged, under BE |
| Leftover PV | No game or no active hole → `PV` rows under IL |
| Full day | Sit / PV with games stay down (BE or PV). Daily “full” |
| Displace | Never move a Pass 1 start |
| Missing `focusDay` / schedule / `daily` | Today’s home-row builder |
| Day header | Highlight + `aria-pressed` + this seating |
| First paint | Default focus = first matchup day; grid opens seated for that day |

---

## 3. Approach (locked)

**Seat in `buildLineupDisplayRows`.** Build the same slot skeleton as today (roster seats, IL, PV). If focus inputs are present, **clear roster-block `playerId`s** and fill them with the five passes. Return the same row type (`slot` + `playerId` + `slotOccurrence`).

Rejected: sorting whole rows (slot labels would move). Rejected: panel-only mapping. Rejected: packing Sit onto Bench as the only home.

`DailyLineupPanel` passes `activeFocusDay`, `schedule`, player map, and the same `daily` object it already uses for cells (preview overlay included when preview is on).

---

## 4. Display model

### Skeleton (unchanged order)

1. One row per active seat from `rosterEntries` (or league slot list if entries are empty).
2. BE rows from bench entries (do not grow BE for sitters).
3. IL rows as today (at least one).
4. PV rows only for preview ids **not already seated** in a roster/IL row.

### Has-game

`playerId` is in the lookup, has `teamAbbr`, and `gameWeightForTeamDate(...) > 0`. Otherwise no-game. Missing player / missing abbr = no-game.

### Home slot

The player’s current `SeasonRosterEntry` slot + occurrence. PV has no home. Prefer-home means: if that seat is still empty and `eligibleForSlot(player, seat.slot)`, take it; else first empty eligible active; else first empty BE (pass 2 / 5 only).

Pass 1 matches `DailyLineups` entries to skeleton rows by `slot` + unused `slotOccurrence` (UTIL ×3).

### Worked example

League seats: PG, SG, SF, PF, C, UTIL, BE.  
Home: PG A, SG B, SF C, PF empty, C D, UTIL E, BE F.  
IL: Injured. Preview: Streamer.

Monday games: A, C, D, F, Streamer. Off: B, E.  
`DailyLineups[Mon]`: A@PG, C@SF, D@C, F@UTIL (F started off the bench). D is **not** Sit in this example. Sit example: if D were Sit, skip Pass 1 for D and Pass 2 would put D@C if C is empty.

**Focus Monday** (D started at C; F started at UTIL):

| Slot | Player | Why |
| --- | --- | --- |
| PG | A | Pass 1 |
| SG | B | Pass 4 off-night, home |
| SF | C | Pass 1 |
| PF | Streamer | Pass 3 (empty active, eligible; preview badge) |
| C | D | Pass 1 |
| UTIL | F | Pass 1 (engine slot, not home BE) |
| BE | E | Pass 5 leftover off-night |
| IL | Injured | Fixed |
| PV | *(none)* | Streamer already seated |

If Monday is full (ten starts, no empty active), Streamer stays a `PV` row under IL even with a game.

**Focus Tuesday** re-runs the same passes for Tuesday’s `daily` and schedule. Slot column stays PG → BE → IL → PV.

### Cells

Parent spec: `—` / Start / Sit / IR / lock. Week cells are the **occupant’s** schedule, so they change when the occupant changes.

Started-slot badge: still when `DailyLineups[that day]` slot ≠ the player’s **weekly home** slot. The row label is the **display** slot for the focus day (may already be the engine slot).

### API

First three arguments unchanged. Optional last argument:

```ts
{
  focusDay?: string
  schedule?: ScheduleResponse
  playersById?: Record<string, SeasonPlayer>
  daily?: DailyLineups
}
```

---

## 5. Start/sit data (unchanged)

Day header does not write `DailyLineups`. Game-cell click still calls `togglePlayerDay`. Off-night fills and PV-up are not persisted. Reset still rebuilds days from players who have games.

Projections still use started entries + existing preview overlay. Display seating can **read** that `daily`; it must not write new occupants.

---

## 6. Tests

Update `matchupDailyLineups` / `DailyLineupPanel`. Cases that assume home-row occupants never move, or that PV never sits in an active row, are replaced.

Must pass:

1. Slot labels stay PG → BE → IL → PV when focus day changes; only `playerId`s on roster/PV change.
2. Pass 1: a player started at UTIL appears on the UTIL row, not their home C.
3. Sit + has game: not in `DailyLineups[day]`; appears on home slot if empty and eligible; cell is Sit.
4. Empty active after starts + sits: filled by an eligible off-night; cell `—`; not written to `daily`.
5. PV + has game + open eligible active: that id is the occupant; preview chrome; no extra PV row.
6. PV + has game + no open active: stays a `PV` row under IL.
7. IL with a game stays an IL row.
8. Omitting focus/schedule/daily leaves today’s home-row order and occupants.

---

## 7. Out of scope

Streaming plan quality, ESPN writeback, and changing `togglePlayerDay` stay out. The parent spec still owns cell chrome. This spec owns **who is shown in each fixed slot** on the focus day.
