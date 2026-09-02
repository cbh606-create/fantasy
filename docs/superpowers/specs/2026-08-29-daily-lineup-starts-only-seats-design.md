# Daily Lineup Starts-Only Seats — Design Spec

**Date:** 2026-08-29  
**Status:** Amended — off-nights fill empty actives; see [Off-Night Fill](./2026-08-29-daily-lineup-offnight-fill-design.md)  
**Product:** Daily lineup grid — active rows show that day’s starts only; Sit / drops stay down  
**Builds on:** [Focus-Day Seats](./2026-08-29-daily-lineup-focus-day-sort-design.md), [ESPN Roster Grid](./2026-08-28-daily-lineup-espn-roster-grid-design.md)  
**Branch context:** `feat/published-nba-schedule`

This spec **replaces** the focus-day seating passes that filled empty actives with Sit, preview, or off-night players. Slot column, cell chrome (Start / Sit / `—` / IR / lock), and the engine stay with those parent specs.

The user sits and starts by hand. The grid must not put a dropped or sat player back into the top ten, and must not auto-start a replacement.

---

## 1. Goal

Focus-day occupants: **starts in their engine slots**. Empty active seats stay empty so a bench game cell can be clicked to Start. Everyone else on the weekly roster goes to BE (BE may grow). Unstarted preview streamers stay `PV` under IL.

### Success criteria

- Active rows (PG → last UTIL) contain only `daily[focusDay]` starts, in those engine slots. Unused actives are empty (`playerId` null, cells `—`).
- Sit, plan-dropped, and off-night roster players do not occupy an active row. They appear on BE. Extra BE rows are added when the three template BE seats are full.
- IL stays under BE, even if that player has a game.
- Preview id that is started that day occupies the engine slot (preview badge). Otherwise one `PV` row under IL. No second row for that id.
- `togglePlayerDay` still only removes or seats that click. No auto-start when someone is sat.
- Display seating is not written into `DailyLineups`.
- Name strikethrough is true only when the **focus day** is on or after that player’s plan drop date.
- Unit tests cover §6.

### Non-goals

- Auto-starting a bench player after Sit
- Changing streaming plan construction
- ESPN writeback
- Changing start/sit scoring or `applyStreamingPlanPreview` projection seating
- Playing / Off section headers

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Active occupants | Pass 1 only: `daily[focusDay]` starts |
| Empty active | Stay empty. Do not fill with Sit, drop, off-night, or unstarted PV |
| Sit / plan-drop / off-night | BE (grow as needed) |
| IL | Unchanged, under all BE |
| Unstarted preview | `PV` under IL |
| Engine | Unchanged. Sit = clear that date’s entry. Start = existing eligible open slot |
| BE count | At least the three roster BE seats; append BE rows for remaining unplaced roster ids |
| Name strikethrough | `droppedFrom && focusDay >= droppedFrom` (not “dropped any day this week”) |
| Missing focus / schedule / daily | Today’s home-row builder (parent spec) |

---

## 3. Approach (locked)

Keep seating in `buildLineupDisplayRows`. Same slot skeleton (active seats, 3 BE, IL). If focus inputs are present:

1. Clear roster-block `playerId`s (not IL).
2. Place starts onto matching `slot` + `slotOccurrence` (existing Pass 1). Unmatched starts use first empty eligible, then any empty roster row.
3. Do **not** run the old Pass 2–4 (Sit into holes, PV into active, off-night into holes).
4. Place remaining non-IL roster ids (weekly roster-entry order) onto empty BE, then append `{ slot: "BE", playerId }` rows.
5. Leftover preview ids (not placed) become `PV` rows after IL.

`DailyLineupPanel` name chrome uses the focus day for plan-drop strikethrough. Per-day cell lock stays `day >= droppedFrom` as today.

---

## 4. Display model

### Active

League active seats in template order. Occupant is the start in that engine slot, or empty.

### BE

1. The three weekly BE seats (may be empty after step 2).
2. Then one extra BE row per leftover roster id (Sit, drop, off-night, unplaced).

Do not put leftover roster ids on IL or PV.

### IL / PV

IL rows unchanged. PV only for preview ids not already on a roster/IL row.

### Worked example

Active: PG…UTIL ×3. BE ×3. IL.  
`daily[Fri]`: 9 starts. Collier sat or plan-dropped (not in `daily[Fri]`). Jaquez on weekly BE, has a game, not started.

Focus Friday:

| Slot | Player | Why |
| --- | --- | --- |
| PG | empty | Collier is not a start |
| SG…UTIL | the 9 starts | Pass 1 |
| BE | weekly bench + Collier | Sit/drop down; BE grew |
| IL | IR occupant | Fixed |
| PV | unstarted streamers | Not in `daily[Fri]` |

User clicks Jaquez’s Friday cell → `togglePlayerDay` starts him into the open eligible slot (PG if eligible, else first open eligible). Next render: 10 starts, Collier still on BE if still not started.

### Cells

Parent spec. Empty occupant → `—`. Started → Start. Has game, not started → Sit (locked if plan-dropped that day).

---

## 5. Start/sit data (unchanged)

- Sit: remove that player from `daily[date]` only. No replacement write.
- Start: existing eligible-slot + `"full"` / `"ineligible"` hints.
- Reset: still rebuilds days from players who have games.
- Projections: started entries + existing preview overlay.

---

## 6. Tests

Update `matchupDailyLineups` / `DailyLineupPanel` cases that expect Sit, off-night, or PV to occupy an empty active.

Must pass:

1. Slot labels stay PG → UTIL, then BE (possibly more than 3), then IL, then PV. Only starts occupy actives.
2. Sit + has game: absent from `daily[day]`; occupant is a BE row; home active is empty; not written back.
3. Plan-dropped roster id with a game: not on an active row.
4. Changing `focusDay` re-seats from that day’s starts only.
5. Preview + started that day: active row + preview badge; no extra PV row. Preview + not started: `PV` under IL.

---

## 7. Out of scope

Streaming add/swap quality, waiver cooldown, and ESPN writeback stay out. Parent specs still own engine seating and cell chrome except the name strikethrough rule in §2.
