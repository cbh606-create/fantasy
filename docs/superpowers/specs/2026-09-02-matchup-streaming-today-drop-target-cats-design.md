# Matchup Streaming Plans — Today Drop + Target Cats — Design Spec

**Date:** 2026-09-02  
**Status:** Draft (awaiting user review)  
**Product:** Matchup streaming plans — user owns today's drop; adds explain which cats they hunt; preview shows Daily + board impact  
**Builds on:** streaming plans (1–3 spots), board-delta adds, plan → daily preview, winner-stream prior (tie-break only)  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

The planner should not lock a week of drop/add pairs. The user picks **today's drop** (or Hold). Adds must be understandable: show **which H2H cats** that add is for. Changing today's drop must re-rank today's add and, with Preview on, update Daily lineup and the weekly projection board.

### Success criteria

- Drop `<select>` appears only on the matchup day that is **today**. Options include **Hold** and **every non-IL roster player** (no ADP / protection filter).
- Default today drop is **Hold** (nobody replaced, no add spent). Suggested drop is **not** pre-selected.
- Hover on today's Drop cell (and future Drop cells) shows a tooltip naming the roster player who most **hurts contested cats**. Tooltip is a suggestion only.
- Today's add cell shows **1–3 category chips** for the cats that move most, given the chosen drop. Hold → empty add, no chips.
- Changing today's drop rebuilds that spot's remaining plan from today forward. Preview overlays Daily + live board from the rebuilt plan.
- Unit tests cover the cases in §7.

### Non-goals

- Searching drop+add pairs for the user
- Week-level `Stream off` control
- Drop dropdowns on past or future days
- Persisting today's drop on the server (local / session like current `forcedRosterDrops` is enough)
- ESPN lineup writeback
- Live injury APIs
- Replacing Aggressive / Balanced / Conservative or board-delta add ranking
- New pages or changing Daily row identity

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Who picks the first / daily drop | User, today only |
| Default drop | Hold |
| Suggested drop | Hover tooltip only; never auto-select |
| Who may be dropped | All non-IL roster players + Open slot if a non-IL seat is empty |
| Hidden / protected drops | None (remove ADP filter from this dropdown) |
| Future days | No assigned drop shown; hover suggestion only |
| Past days | Read-only label of what already ran; no `<select>` |
| "Today" | Calendar date in the user's local timezone that falls in `schedule.matchup.days`. If today is not in the week, no drop `<select>` anywhere |
| Add ranking | Existing schedule gates + rest-of-week `projectedCatWins` delta (then winner-stream tie-break) |
| Target cats | 1–3 chips on the add; trailing / contested first; blowout wins omitted |
| Preview | Existing Preview chips; Daily + board already follow `previewPlan` — must stay in sync after today-drop changes |
| Copy | English UI |

Rejected: pre-filling the suggested player; week-long drop dropdowns; planner-chosen first drop; hiding ADP-protected names.

---

## 3. Approach

Keep the greedy planner. Add an explicit **today drop** input per spot.

1. `today` = local `YYYY-MM-DD` if it is in the matchup `days`, else `null`.
2. Each spot has `todayDrop`: `hold` | `open_slot` | `{ playerId }`. Default `hold`.
3. If `todayDrop === hold`: that spot's **today** cell is `action: "hold"` (or `empty` if no streamer seated), `playerId` unchanged, no add spent, no chips.
4. Else: treat `todayDrop` as a **forced roster drop** for today's add (same path as current `forcedRosterDrops`). Re-run the planner from today forward for that spot. Rank FAs by rest-of-week board delta after applying that drop.
5. Future cells: do not write a roster drop name into the Drop row. Add row may still show a **tentative** FA (current behavior) but Drop stays unassigned. Hover still offers the contested-cat suggestion (recomputed from the current board + remaining week).
6. Past cells: show the add/drop that the last built plan recorded; no editor.
7. Preview on: `onPreviewPlanChange` receives the rebuilt plan so Daily overlay and `liveBoard` update.

Do not add a separate week-level Stream-off picker.

---

## 4. Scoring

### Contested cats

A board row is **contested** when `outcome` is `L` or `T`, or `outcome` is `W` and `winProb < 0.65`.

### Drop suggestion (tooltip)

For each non-IL roster player still on the roster, score **rest-of-week** `projectedCatWins` if that player is removed from `workingDaily` from today (or from the hovered day if future) through week end, versus current `workingDaily`.

The suggestion is the player whose **removal most improves** contested-cat wins (largest positive delta on contested rows). If no player improves contested cats, name the player with the **worst** contested-cat contribution this week (most negative counting stats on those cats) and say they are the weakest contested-cat piece — still not selected.

Tooltip copy (English): `Suggested drop: {name} — weakest for {CAT, CAT}`.

### Target cats (add chips)

After today's drop + chosen FA are overlaid on `workingDaily`, compute per-category change in `you` totals and `outcome` / `winProb` versus the no-move board.

Include a cat if it is contested (or becomes a win from L/T) and the move's you-total on that cat is better (TO: lower). Sort by how much that cat's win probability improves. Take at most 3. Omit cats that were already `W` with `winProb ≥ 0.65` unless the move is what created that blowout (then still omit — chips are for the hunt, not for padding).

Chips use existing short labels (`STL`, `BLK`, `3PM`, `FG%`, …). Tooltip line: `Helps STL, BLK`.

Hold today → no chips.

---

## 5. UI

Streaming plans table, Drop row:

- **Today:** `<select>` — `Hold`, then `Open slot` (only if a non-IL roster seat is empty), then roster names A–Z. `aria-label` stays `Roster drop {day} spot {n}`. Hover on the cell (not only the closed list) shows the suggestion tooltip.
- **Future:** muted `—` (no player name). Hover shows the same style of suggestion tooltip.
- **Past:** muted name or `—` / `Hold` as recorded; no hover editor.

Add row today (when not Hold): name + 1–3 mute cat chips after positions/team. Existing add hover keeps alternatives and adds the `Helps …` line.

Preview chips unchanged. Changing today's drop while Preview is on that spot count must refresh Daily and the matchup board in the same render cycle as today's planner (existing `useEffect` on `plans` is enough if `forcedRosterDrops` / today-drop state is an input to `buildStreamingPlan`).

---

## 6. Data / API

- Extend `StreamingPlanDayCell` with optional `targetCategoryIds: CategoryId[]` (empty when Hold / no add).
- Today drop stays client state, keyed like `forcedRosterDrops` (`date:spotIndex` or a dedicated `todayDropBySpotCount`). Past `forcedRosterDrops` for **future** dates are ignored for display (do not show those names). A today-only key is enough for v1.
- Matchup GET does not need a new field. Client rebuild (already the source of truth for plans) applies today drop.

---

## 7. Tests

| Case | Expect |
| --- | --- |
| Today in week, default | Drop `<select>` on today; value Hold; no add chips |
| Select roster player today | That spot spends an add today if a FA has `delta > 0`; chips match target cats; later days do not show a drop name |
| Select Hold after a player | Today's add cleared; chips gone |
| ADP-protected player | Still listed in today's `<select>` |
| Future Drop cell | No `<select>`; `—`; hover text includes `Suggested drop:` |
| Past Drop cell | No `<select>` |
| Today not in matchup week | No Drop `<select>` |
| Preview + today drop change | `onPreviewPlanChange` called with rebuilt plan (existing preview tests extended) |
| Target cats | Trailing STL/BLK add exposes those ids; padded FG% blowout omitted |

---

## 8. Open implementation notes (not product choices)

- Reuse `forcedRosterDrops` plumbing; add `hold` as an explicit forced value so the planner cannot override today with an auto drop.
- `eligibleRosterDropPlayerIds` used by today's `<select>` must stop filtering ADP-protected players. Future tooltip scoring is independent of that list.
- Local `today` in tests: inject `today: string` into the panel/planner (do not stub `Date` globally).
