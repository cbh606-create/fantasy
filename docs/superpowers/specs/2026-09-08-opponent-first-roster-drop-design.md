# Matchup Streaming Plans — Opponent First Roster Drop — Design Spec

**Date:** 2026-09-08  
**Status:** Draft (awaiting user review)  
**Product:** Matchup streaming plans — let us name who the opponent cuts first  
**Builds on:** `2026-09-08-matchup-opponent-streaming-plans-design.md`  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

The opponent simulator picks roster cuts with greedy ranking plus core/ADP protection. We can already see the opponent’s first streaming cuts on ESPN, so those guesses are often wrong and the rest-of-week board is off.

We name the opponent’s first roster cut **per streaming spot**, then the planner uses those players when it actually has to cut. Empty seats still add without dropping.

### Success criteria

- Plan bar shows one `Opp drop` `<select>` per resolved opponent spot (`Auto` or a non-IL opponent roster player).
- Default is `Auto` (today’s greedy drop, including core protection).
- A chosen player is used the first time that spot needs a **roster** cut. Open-slot adds and streamer-for-streamer swaps do not consume it.
- All three of our 1/2/3-spot plans share the same opponent drop map.
- Session-only. Changing the opponent team resets to `Auto`.
- Unit tests cover §7. Browser check: picking a drop changes the Opp week strip first cut and Opp scoreboard.

### Non-goals

- Opponent Hold / Open slot options in the select
- Per-day opponent drop editing (no opponent calendar)
- Persisting drops on the server
- Changing how later-week streamer swaps are chosen
- Changing our (You) drop `<select>`
- Waiver-order or ESPN remaining-add counts

---

## 2. Locked decisions

| Topic | Choice |
|---|---|
| When a forced drop applies | Only when that opp spot must cut a **roster** player (no open non-IL slot, no expired streamer to replace) |
| Open slots | Add with no roster drop. Ignore that spot’s select for that add |
| How many selects | Resolved opp spot count (Auto → 1–3, same as `Opp spots`) |
| Default | `Auto` per spot. Unset spots stay planner-chosen |
| Multiple cuts on day one | One named player per spot (spot 0, 1, 2) |
| Duplicate / missing player | That spot falls back to `Auto` |
| Core / ADP / positive delta | Forced player **bypasses** protection and `requirePositiveDelta`. `Auto` keeps both |
| Hold | Not offered |
| Shared policy | Same map for our 1/2/3-spot plans |
| Persistence | Session React state. Reset when opponent `teamIndex` changes |
| Copy | English. Label `Opp drop`. Option `Auto`. `aria-label`: `Opp drop spot N` (1-based) |
| Later streamer swaps | Unchanged. Do not consume the forced roster drop |

This **amends** the parent spec row “Opponent drops = planner-chosen, no Hold dropdown”: planner-chosen remains the default; we add an optional first roster-cut override. It does **not** add the rejected opponent today-Hold dropbox.

---

## 3. Planner

Add `forcedOpponentRosterDrops?: (string | null)[]` to `BuildStreamingPlanInput`. Index is opp `spotIndex`. `null` / omitted / unknown id → Auto. Length may be shorter than `oppSpotCount`; missing indexes are Auto.

Pass the array into `fillOpponentSpotsForDate`. Keep the existing fill order per empty/expired spot:

1. If the spot still has a streamer with remaining week games, hold (then off-night swap as today).
2. If it has an expired streamer (`previousId` with 0 remaining games), replace that streamer. **Do not** read or consume `forcedOpponentRosterDrops[spotIndex]`.
3. Else if `hasOpenNonIlSlot(oppEntries)`, add with `{ kind: "none" }`. **Do not** consume the forced drop.
4. Else roster-cut: if `forcedOpponentRosterDrops[spotIndex]` is a player still on a non-IL opponent roster entry and not already in `weekDropped`, `tryOppMove({ kind: "player", playerId }, requirePositiveDelta: false)`. The opponent will cut this player even if our board model does not like the swap. On success, `weekDropped.add(id)` and mark waiver as today. On failure (cannot seat an FA, missing player), fall back to `rankRosterDropPlayerIds(..., protectCoreRoster: true)`.

Consume the forced id only on a successful roster cut for that spot. A later fill of the same spot that needs another roster cut uses Auto.

Streamer off-night / density swaps stay on `{ kind: "player", playerId: heldStreamerId }` and never use the forced roster map.

Our 1/2/3 `buildStreamingPlan` calls in `StreamingPlansPanel` all receive the same `forcedOpponentRosterDrops` from workspace state.

---

## 4. UI

`MatchupPlanBar` grows an `Opp drop` group to the right of `Opp spots`.

- Render `N` `<select>`s where `N = resolveOppSpotCount(...)` (the same N the planner uses).
- Each options list: `Auto`, then opponent non-IL roster players by name, excluding ids already chosen on a lower spot index.
- No Hold. No Open slot option.
- `MatchupWorkspace` owns `forcedOpponentRosterDrops: (string | null)[]` and passes it into `StreamingPlansPanel` → `buildStreamingPlan`.
- Changing You 1/2/3 does not reset the map.
- Changing `Opp spots` (including Auto) keeps overlapping indexes; new spots are `null` (Auto); unused higher indexes are ignored.
- Changing opponent team (picker) sets the map to `[]`.
- `OpponentWeekStrip` stays read-only and already shows `drop → add` from plan cells.

---

## 5. Data flow

```
MatchupWorkspace state
  forcedOpponentRosterDrops: (string | null)[]
        │
        ├─ MatchupPlanBar (Opp drop selects)
        └─ StreamingPlansPanel
              └─ buildStreamingPlan({ oppSpotCount, forcedOpponentRosterDrops })
                    └─ fillOpponentSpotsForDate (first roster cut per spot)
                          └─ OpponentWeekStrip / Opp scoreboard
```

---

## 6. Error / edge cases

| Case | Behavior |
|---|---|
| Forced id not on opponent non-IL roster | Auto |
| Forced id already dropped this week | Auto |
| Forced move scores no add (`tryOppMove` null) | Auto |
| Spot adds into an open slot | Select unused for that add; value stays in state |
| `oppSpotCount` 1 with two stored ids | Only index 0 is read |
| IL-only player | Not listed; if somehow set, Auto |

---

## 7. Tests

Planner (`tests/unit/streamingPlans.test.ts`):

- Full opponent roster, spot 0 forced player → that id is `droppedPlayerId` on the first opponent add cell.
- Open non-IL slot → first add is `action: "add"` with no roster `droppedPlayerId`, even if spot 0 is forced.
- Unset / `null` → same drop as today’s greedy path (core protection still applies).
- `oppSpotCount: 2` with two distinct forced ids → those two roster drops, in spot order.
- Same player forced on spots 0 and 1 → spot 0 uses it, spot 1 Auto.
- Unknown player id → Auto.
- Expired streamer replacement does not use or consume the forced roster id.
- Forced id is ADP/core-protected → still dropped.
- Forced drop still applies when the 9-cat delta is not positive.

UI (`tests/unit/MatchupPlanBar.test.tsx`, `tests/unit/MatchupWorkspace.test.tsx`):

- Renders N `Opp drop` selects for resolved N; default option Auto.
- 1/2/3 You plans are built with the same `forcedOpponentRosterDrops`.
- Opponent team change clears the map (selects back to Auto).

Browser: on a packed opponent roster, choose a named Opp drop and confirm the week strip’s first `drop → add` uses that name and Opp category totals move.

---

## 8. Out of scope follow-ups

Per-day opponent drop overrides, opponent Hold, persisting the map, and using forced drops for streamer-to-streamer swaps.
