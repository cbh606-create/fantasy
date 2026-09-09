# Matchup Streaming Drop Overrides + Daily Sit/Start Hints — Design Spec

**Date:** 2026-08-26  
**Status:** Approved for implementation planning  
**Product:** (1) Per-`add` roster-drop dropdowns on streaming plans with cascading candidates; (2) Sit/Start hints on Daily lineup; (3) Client-side Sit/Start recompute when Daily changes  
**Builds on:** Streaming plans / preview, Daily lineup, `suggestSitStart`, Matchup workspace  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

Managers want control over **who is dropped to free a streaming seat** on each plan `add`, with later add dropdowns reflecting earlier choices. They also want **Sit/Start context next to Daily lineup**, and for those suggestions to **update when day sits change the week’s effective games / board** — without refetching the full matchup API each click.

### Success criteria

- Each streaming-plan `add` cell exposes a drop `<select>` (engine default selected).
- Changing a drop rebuilds the plan from that add onward; later add pickers exclude already-committed drops (and respect open-slot / protection rules).
- Daily lineup shows short Sit/Start badges on relevant players (hint only; Apply stays in Sit/Start panel).
- After Daily sit/start/reset, Sit/Start list (and Daily badges) recompute client-side via `suggestSitStart` using daily-derived effective games — no `/api/matchup` round-trip required for that update.
- Streaming plan preview remains consistent with the overridden plan.

### Non-goals

- Editing hold/FA choices cell-by-cell beyond roster drop on `add`
- Apply Sit/Start from Daily badges (hints only)
- Opponent daily simulation
- Changing ADP drop-protection policy itself (dropdown still only lists eligible drops)
- Recomputing streamers / streaming plans on every Daily toggle (only Sit/Start)

---

## 2. Approach (locked)

**A — Client plan drop overrides + client Sit/Start recompute.**

1. Streaming: maintain ordered forced drops keyed by add identity; regenerate plan with those locks.
2. Sit/Start: derive suggestions in the workspace from current `displayDaily` (or saved daily when not previewing) + roster entries; show badges on Daily; keep Apply on `SitStartPanel`.

Rejected: full plan cell editor; refetching matchup advise on every Daily click.

---

## 3. Streaming drop dropdowns

### Identity

Each `add` (and `drop_add` that performs a roster cut, if any) gets a stable key, e.g. `${date}:${spotIndex}` or `${date}:${addIndex}` — prefer **date + spotIndex** so rebuilds stay stable when addIndex renumbers.

### State

In `StreamingPlansPanel` (or thin parent state):

```ts
forcedRosterDrops: Record<string, string | "open_slot">
// key → playerId or open_slot override when allowed
```

Empty map = pure engine defaults.

### Candidates for an add

When rendering the select for add key `K` on date `D`:

1. Run (or read) the current plan with forced drops applied for all keys **strictly before** `K` in plan chronological / spot order.
2. Candidate set = players eligible under existing `pickRosterDrop` protection rules **minus** playerIds already forced/committed on earlier adds in this plan week.
3. Always include current engine default if still eligible.
4. If open non-IL slot would be chosen / available, include an **Open slot** option.

### On change

1. Write `forcedRosterDrops[K] = selection`.
2. Clear forced keys **after** `K` (stale later choices may be invalid).
3. Rebuild plan(s) for the active spot count with remaining forced prefixes.
4. If previewing that plan, push updated plan through `onPreviewPlanChange`.

### Engine support

Extend `buildStreamingPlans` / day loop to accept optional `forcedRosterDrops` (or a callback `resolveRosterDrop(ctx) → { kind, playerId }`). When a force is present and still valid, use it; otherwise fall back to `pickRosterDrop`. If forced player is no longer on roster / already dropped / protected, ignore force and use engine pick (and clear stale UI state).

---

## 4. Sit/Start: Daily badges + live recompute

### Recompute trigger

Whenever saved `daily` changes (toggle / reset) — and when building the list shown alongside Daily:

```ts
suggestSitStart({
  youEntries: perspective team entries,
  oppEntries: opponent entries,
  players,
  gamesMap: effectiveGamesByPlayerId(daily, players, schedule), // from dailyLineups
  categoryIds,
})
```

Use **saved daily** for Apply-backed suggestions when not in streaming preview. While streaming preview is active: **hide Daily Sit/Start badges** and keep using API `matchupData.sitStart` only in the lower panel **or** recompute from `displayDaily` without Apply — **MVP lock: hide badges during preview; lower Sit/Start panel may keep API list or also recompute from displayDaily without Apply to roster.** Prefer: preview → hide badges; panel still shows API suggestions (weekly roster) to avoid implying Daily Apply under overlay. Simpler MVP: **hide badges in preview; panel unchanged (API list).**

When not previewing: workspace state `liveSitStart` replaces display of `matchupData.sitStart` in both Daily badges and `SitStartPanel`.

### Daily badges

For each suggestion in `liveSitStart` (top list as today, max `MAX_SIT_START`):

- Bench player row: muted badge e.g. `Start over {activeShort}`
- Active player row: muted badge e.g. `Sit for {benchShort}`

If a player appears in multiple suggestions, show the highest-ranked one’s badge only.

No click handler on badges.

### Apply

Unchanged: `SitStartPanel` Apply → existing `handleApplySwap` (roster `localLineupJson`), then refresh matchup / daily as today.

---

## 5. Performance notes

- Plan rebuild: in-memory, matchup week only — fine on each dropdown change.
- Sit/Start recompute: O(bench × active) board evals — fine on each Daily toggle.
- Do **not** refetch `/api/matchup` solely to refresh Sit/Start after Daily edits.

---

## 6. Testing

- Unit: forced drop on first add removes that player from later add candidate set / appears as drop on that add cell.
- Unit: clearing/changing an early force clears later forces and rebuilds.
- Unit: `suggestSitStart` with reduced `gamesMap` for a player changes ranking vs full week (or drops a swap) — proves Daily-driven games matter.
- UI smoke: StreamingPlansPanel select changes call rebuild; DailyLineupPanel shows badge text for a fixture suggestion.
- Regression: unprotected engine path unchanged when `forcedRosterDrops` empty.

---

## 7. Out of scope / follow-ups

- Persisting forced drops across reloads
- Applying Sit/Start from Daily badges
- Recomputing streaming plans when Daily changes
- Soft warnings when forced drop hurts weak cats
