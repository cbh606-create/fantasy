# Daily IL Cell Shade + Skip Streaming Adds on Full Days — Design Spec

**Date:** 2026-08-27  
**Status:** Draft for user review  
**Product:** Matchup Daily lineup shows IR (IL-slot) players via **per-game-cell** shading; streaming plans skip adds on days whose active lineup is already full  
**Builds on:** `DailyLineupPanel`, `dailyLineups` / `togglePlayerDay` full rule, `buildStreamingPlan`, season roster `slot === "IL"`  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

1. Managers can see at a glance which Daily lineup **game cells** belong to players currently on the **IL/IR** roster slot, without painting the whole week row (IL can change mid-week via roster edits).
2. Streaming plans should **not spend an add** on a matchup day when the saved Daily active lineup is already **full** (no open start slot that day).

### Success criteria

- Players with `slot === "IL"` on the perspective roster: each **game cell** that day is soft-cloud / muted shaded; small **IR** hint on those cells (not a full-row week stripe).
- Clicks on those IR game cells do **not** start/sit (no-op + optional short hint).
- Name column / non-game cells stay normal (no week-long row wash).
- `buildStreamingPlan` receives current (non-preview) `daily` and **skips** `add` / `drop_add` / add-spending early swaps on dates where the daily lineup is full under the same rule as Start `"full"`.
- Unit tests cover IL cell shade + blocked toggle, and full-day → no streaming add / `addsUsed` unchanged.

### Non-goals

- Per-day IL slot history (MVP uses **current** weekly roster `slot === "IL"`; mid-week change = user moves roster slot, UI updates all remaining game cells accordingly)
- Injury-status fields on `SeasonPlayer` separate from IL slot
- Changing autofill (already skips IL)
- Changing weekly Sit/Start or ratio sits
- Using preview-overlaid daily for the planner gate (use saved/base `daily`)

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Full-day definition | **A** — all 10 active slots occupied by players **with a game that day** (same as `togglePlayerDay` → `"full"`) |
| IL interaction | Shade + IR on **game cells only**; **block** start/sit clicks |
| IL visual scope | **Not** full-row week paint — **only that day’s game box(es)** |
| Streaming source of truth for fullness | Current `DailyLineups` passed into `buildStreamingPlan` |

---

## 3. Approach (locked)

**Minimal UI + planner gate.**

Rejected: inferring capacity from schedule alone (ignores sits/starts); new injury model on `SeasonPlayer`.

---

## 4. Daily IL display

### Data

- From perspective team `SeasonRosterEntry[]`, build `ilPlayerIds: Set<string>` (or `Record`) where `slot === "IL"` and `playerId` set.
- Pass into `DailyLineupPanel`.

### Rendering

For each player row × matchup day:

- If player ∉ `ilPlayerIds` → unchanged.
- If player ∈ `ilPlayerIds` and cell **has a game** → apply soft-cloud / muted fill (aligned with locked-cell language), show compact **IR** label/badge on the cell; `onClick` no-op (do not call `onTogglePlayerDay`).
- If player ∈ `ilPlayerIds` and **no game** → keep existing “—” empty treatment; no extra week stripe.
- Player **name** cell: optional small muted **IR** text badge only (no full-row background). Prefer badge on name **or** on game cells, not both loudly — **MVP: IR on game cells; name stays readable without row wash.**

### Interaction copy (optional)

If user clicks an IR game cell: reuse hint pattern e.g. `On IR — move off IL on Roster to start`.

---

## 5. Streaming full-day skip

### Helper

Export from `dailyLineups.ts` (mirror `togglePlayerDay` open-slot logic):

```ts
isDailyLineupFullForDate(daily, date, playersById, schedule): boolean
```

True iff that date’s 10 active entries all have a `playerId` whose team has `gameWeight > 0` that day.

### Planner

- Extend `BuildStreamingPlanInput` with optional `daily?: DailyLineups`.
- When `daily` present and `isDailyLineupFullForDate(...)` for the loop date: do **not** spend budget on fill or early-swap adds; leave hold/empty as applicable; do not increment `addsUsed`.
- Wire `MatchupWorkspace` → `StreamingPlansPanel` → `buildStreamingPlan({ ..., daily })` with **base** daily (not preview overlay).

### Edge cases

- Missing `daily` or missing date key → do not treat as full (planner behaves as today).
- Hold of an already-owned streamer on a full day remains allowed (no new add spend).

---

## 6. Tests

- `DailyLineupPanel`: IL player game cell shows IR / shaded; click does not invoke start; non-IL unchanged.
- `dailyLineups` / streaming: helper true when 10 game-day fills; false when any no-game or empty slot.
- `streamingPlans`: with full daily on an add-candidate day → no add cell / `addsUsed` not increased for that spend.

---

## 7. Out of scope / later

- True per-date IL assignment history from ESPN transactions
- Disabling IL players from appearing in streaming FA pools
