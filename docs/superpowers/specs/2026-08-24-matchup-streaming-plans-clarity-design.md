# Matchup Streaming Plans Clarity (horizontal + drops) — Design Spec

**Date:** 2026-08-24  
**Status:** Approved for implementation planning  
**Product:** Matchup module — make Streaming plans readable and explicit about drops  
**Branch context:** `feat/published-nba-schedule` / builds on `2026-08-24-matchup-streaming-plans-design.md`  
**Approach:** Extend plan cell schema + calendar-grid UI (not a planner rewrite)

---

## 1. Goal

Streaming plans are hard to scan today: a vertical day list, `Drop→Add` without naming who leaves, and no guidance on which rostered player to cut when adding.

### Success criteria

- Each plan renders as a **horizontal calendar**: **columns = matchup days**, **rows = spots**.
- Every **Drop→Add** names the **previous streamer FA** leaving the virtual spot.
- Every **Add** / **Drop→Add** shows a **roster line**:
  - `Roster: drop {name}` when a cut is needed, or
  - `Roster: open slot` when the perspective roster has a free slot.
- Still show **1- / 2- / 3-spot** plans; weekly **7-add** budget and greedy planner behavior stay the same unless noted below.
- Matchup API `playersById` includes all player ids referenced by drop fields (so names never show as `—`).

### Non-goals

- Applying the plan to the real roster / claiming waivers from this panel (waivers link only).
- Global DP optimality or stronger opponent-aware simulation.
- Collapsing to a single recommended plan.
- Putting B2B annotations back on every cell.
- Replacing virtual streamer spots with real BE/UTIL indices.

---

## 2. Locked product decisions

| Topic | Choice |
|---|---|
| Drop meaning | **Both**: virtual-spot previous FA **and** roster cut candidate |
| Roster-drop ranking | Prefer **no game that day** → fewer **remaining week game-days** → lower **weak-cat contribution**; exclude IL; no double-booking same day |
| Layout | **Calendar grid** (days as columns, spots as rows); plans stacked vertically; horizontal scroll OK |
| Roster line visibility | **Always** on Add / Drop→Add; use **`open slot`** when a free roster slot exists |
| Implementation approach | Extend cell schema + UI; keep greedy planner |

---

## 3. Data shape

Extend existing types (additive):

```ts
type StreamingPlanRosterDropKind = "player" | "open_slot" | "none"

type StreamingPlanDayCell = {
  spotIndex: number
  playerId: string | null // seated / added FA for this cell
  action: StreamingPlanAction // "hold" | "add" | "drop_add" | "empty"
  droppedPlayerId: string | null // previous FA leaving the spot; set only for drop_add
  rosterDropPlayerId: string | null // set only when rosterDropKind === "player"
  rosterDropKind: StreamingPlanRosterDropKind
}
```

Rules:

- `hold` / `empty`: `droppedPlayerId = null`, `rosterDropKind = "none"`, `rosterDropPlayerId = null`.
- `add`: `droppedPlayerId = null`; roster fields as in §4.
- `drop_add`: `droppedPlayerId = previous occupant id` (must not be inferred only in the UI); roster fields as in §4.

`StreamingPlan` summary fields (`spotCount`, `addLimit`, `addsUsed`, `gameStarts`, `days`) unchanged.

---

## 4. Algorithm deltas

Keep current greedy day/spot loop and FA pick scoring (weak cats, then remaining volume).

### Spot drop (virtual)

When replacing an occupant with a new FA (`action = "drop_add"`), set `droppedPlayerId` to the previous occupant id. Drops still do **not** consume the weekly add budget.

### Roster drop (perspective team)

On each `add` or `drop_add` cell:

1. If perspective roster has any **empty** non-IL slot (`playerId == null` on PG–BE/UTIL slots from the current league state — **do not** simulate earlier plan Adds filling those slots), set `rosterDropKind = "open_slot"`, `rosterDropPlayerId = null`.
2. Else pick one rostered player (non-IL, has `playerId`) using:
   - Prefer players with **no game** on that date.
   - Then fewer **remaining** game-days from that date through end of matchup week.
   - Then lower weak-cat contribution (same counting cats as streamers / plans).
   - Stable tie-break on player id.
3. Exclude players already chosen as `rosterDropPlayerId` earlier **that same day** (other spots).
4. If no candidate remains, `rosterDropKind = "none"`, `rosterDropPlayerId = null` (UI: `Roster: —`).

Do **not** use the virtual-spot `droppedPlayerId` as the roster cut (they are different concepts; the spot drop is usually an FA already streamed in earlier in the plan).

### API hydration

`collectReferencedPlayerIds` must include:

- existing roster / sitStart / streamers / plan `playerId`s
- every non-null `droppedPlayerId`
- every non-null `rosterDropPlayerId`

---

## 5. UI

Replace the vertical day×cell table in `StreamingPlansPanel` with:

- Per plan: title + `Adds k/7 · M starts`
- Table/grid: header row of day labels; one body row per spot (`Spot 1` …)
- Cell copy:
  - **Hold:** name (+ positions · team)
  - **Add:** `Add {FA}` + roster line
  - **Drop→Add:** `Drop {prev}` then `Add {FA}` + roster line
  - **empty:** `—`
- Roster line:
  - `Roster: drop {name}` when `rosterDropKind === "player"`
  - `Roster: open slot` when `open_slot`
  - `Roster: —` when `none` on an add-like action
- FA add targets keep waivers deep-link (`?addPlayerId=`). Optional later: roster-drop deep-link; **not required** for this spec.
- Dense, muted secondary lines; match existing Matchup typography tokens.

Keep section order: Daily lineup → Injury → **Streaming plans** → Sit/Start.

---

## 6. Testing

- Unit: `drop_add` sets `droppedPlayerId` to previous FA.
- Unit: empty roster slot → `open_slot` on Add.
- Unit: full roster → ranked roster drop; two same-day adds do not reuse the same roster drop id.
- Unit/API: plan drop ids appear in `playersById`.
- Component: calendar orientation (day headers); Drop/Add/Roster strings render for a fixture plan.

---

## 7. Relation to prior spec

Supersedes the **UI presentation** and **cell payload** portions of `2026-08-24-matchup-streaming-plans-design.md` for Matchup display. Locked rules (7 adds, drops free, 1–3 spots, FA pool, greedy fill) remain in force unless this document explicitly changes them.
