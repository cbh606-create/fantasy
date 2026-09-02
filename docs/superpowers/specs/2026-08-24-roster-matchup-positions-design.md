# Roster + Matchup positions & slot assignment

**Date:** 2026-08-24  
**Status:** Implemented
**Branch context:** `feat/published-nba-schedule` / season modules

## Goal

1. **Show** each player’s eligible positions (`PG/SG`, etc.) on Roster and Matchup.
2. **Assign** players into league slots on both Roster and Matchup:  
   `PG, SG, SF, PF, C, G, F, UTIL×3, BE×3, IL×1` (UI label **IR** for `IL`).

## Decisions

| Topic | Choice |
|---|---|
| Slot template | Existing `SEASON_ROSTER_SLOTS` (no customizer UI) |
| Storage | `IL` in data; display as **IR** |
| Matchup weekly lineup | Reuse roster table / shared component + existing lineup PATCH |
| Eligibility | Block or warn on save when `!eligibleForSlot(player, slot)` (prefer block) |
| Daily start/sit | Unchanged; still uses active slots after weekly lineup |

## Design

### Shared helpers

- `formatPlayerPositions(player): string` → `positions?.join("/") ?? "—"`
- `slotDisplayLabel(slot): string` → `IL` → `IR`, else slot as-is

### Roster (`PlayerRosterTable`)

- Slot column uses `slotDisplayLabel`
- Add **Pos** column (or inline under name) with `formatPlayerPositions`
- Edit dropdown options: `Name · Pos · TEAM`
- Group headers: Starters / Bench / **IR** (not “Injured list”)
- Ensure state has `rosterSlots` (already persisted for manual leagues)

### Matchup (`MatchupWorkspace`)

- Add **Weekly lineup** section (above Daily lineup): same slot editor as Roster, wired to lineup PATCH / existing apply path used by Roster
- Daily grid player column: show positions under name
- Sit/Start reasons may keep as-is

### Eligibility on assign

- When selecting a player for a slot in edit mode, filter options to eligible players **or** allow select then reject on save with inline error
- Prefer: dropdown lists eligible-first; ineligible still selectable only if needed for empty leagues with missing `positions` — if `positions` missing, UTIL/BE/IR only (existing `eligibleForSlot` rules)

## Non-goals

- Changing number of UTIL/BE/IR via settings UI  
- Drag-and-drop board  
- Writing lineup back to ESPN

## Success criteria

- Roster and Matchup show player Pos  
- Matchup can set weekly PG…IR lineup like Roster  
- IR label visible; data remains `IL`  
- Ineligible slot assignment cannot persist  
- Existing daily Start/Sit + autofill still work

## Testing

- Unit: `slotDisplayLabel`, format positions  
- Unit/component: roster table shows Pos + IR  
- API/UI path: matchup weekly lineup save uses same validation as roster PATCH
