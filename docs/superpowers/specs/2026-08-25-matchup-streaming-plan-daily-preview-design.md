# Matchup Streaming Plan → Daily Lineup Preview — Design Spec

**Date:** 2026-08-25  
**Status:** Approved for implementation planning  
**Product:** Preview a selected streaming plan on Daily lineup + H2H board without mutating saved state  
**Builds on:** `2026-08-12-matchup-daily-lineup-design.md`, streaming plans (1-spot always-cover, 2/3-spot density-hold)  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

Managers pick a streaming plan (1 / 2 / 3-spot) and see **what the week would look like** if those adds/drops were followed: Daily lineup overlay plus the live H2H board recomputed from that simulated roster occupancy — without writing localStorage or ESPN.

### Success criteria

- Preview selector: `None | 1-spot | 2-spot | 3-spot` (default `None`).
- Selecting a plan builds `previewDaily` from `savedDaily` + that plan’s calendar cells.
- Matchup board uses `youTotalsFromDaily(previewDaily, …)` while preview is active.
- Daily grid shows preview streamers (distinct styling) and muted/struck dropped roster players; click-to-toggle is disabled until preview cleared.
- Clearing preview restores saved daily + board with no leftover overlay.
- Unit tests cover preview apply (drop from add-day onward, seat on game days only, totals differ from base); UI smoke covers select → board change → clear.

### Non-goals

- Persist preview into `matchup-days:{leagueId}`
- ESPN / apply-lineup writeback of streamers
- Opponent day-by-day simulation
- Editing daily while preview is on (merge of manual toggles + preview)
- Category delta badges inside the Streaming Plans table (board is enough)

---

## 2. Approach (locked)

**A — Plan → virtual `DailyLineups`.**

1. Copy `savedDaily`.
2. Apply plan roster drops and streamer seats day-by-day → `previewDaily`.
3. Feed `previewDaily` through existing `youTotalsFromDaily` / `buildMatchupBoard` path already used by Daily lineup.

Rejected: board-only cosmetic deltas; server re-advise per selection.

---

## 3. Preview apply rules

Function (name indicative):

```ts
applyStreamingPlanPreview(
  baseDaily: DailyLineups,
  plan: StreamingPlan,
  playersById: Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): DailyLineups
```

Work on a deep copy of `baseDaily` for each matchup day in order.

### 3.1 Roster drops

When a plan cell has `action === "add"` and `rosterDropKind === "player"` with `rosterDropPlayerId`:

- From that **cell’s date through the last matchup day**, remove that playerId from every day’s active entries (set matching slots to `playerId: null`).

`drop_add` that only drops a previous **streamer** (`droppedPlayerId`) does not remove a roster star; it only frees the streaming seat narrative for that spot (handled by seating the new streamer).

### 3.2 Streamer seats

For each day, for each plan cell with a non-null `playerId` and action in `add | drop_add | hold`:

- Resolve streamer player; if they have **no NBA game that day**, do **not** put them in active (same as daily no-game clear).
- If they have a game: place `playerId` into that day’s active lineup:
  1. First empty active slot, else
  2. A slot freed by a roster drop that day, else
  3. First active slot whose current occupant has **no game** that day, else
  4. Leave unseated (do not displace a game-day starter in MVP).

Multi-spot: apply seats for spot 0..n-1 independently (different FAs); `seated` uniqueness per day — one playerId only once.

### 3.3 Players map

Streamers may not be on the weekly roster list. Preview board/grid must resolve names via `playersById` ∪ `state.players` (same enrichment Streaming Plans already uses). Daily grid may append **preview-only rows** for streamer ids not in `rosterPlayers`.

---

## 4. Workspace wiring

`MatchupWorkspace`:

| State | Role |
|-------|------|
| `savedDaily` / existing `daily` | Persisted lineup (unchanged by preview) |
| `previewPlanSpot: 1 \| 2 \| 3 \| null` | Selection |
| `displayDaily` | `previewDaily ?? daily` |

- `liveBoard` always from `displayDaily`.
- Pass `displayDaily` + preview metadata into `DailyLineupPanel`.
- `StreamingPlansPanel` reports selection upward (`onPreviewPlanChange`) or selection lifts to workspace.

While `previewPlanSpot != null`:

- Disable `onTogglePlayerDay` / show banner: clear preview to edit.
- Reset daily control either clears preview first or stays disabled.

---

## 5. UI

### Streaming Plans

- Segmented control or buttons: None / 1-spot / 2-spot / 3-spot next to strategy/budget.
- Short banner when active: “Previewing N-spot plan — board & daily show simulated adds/drops.”

### Daily lineup

- Banner when previewing (same message).
- Preview streamer rows: dashed border or `preview` badge; cells for game days filled as started.
- Roster players dropped for the remainder of the week: muted / strike on name; game cells not interactive.
- All toggles `disabled` during preview.

Visual polish stays within existing matchup tokens (no new theme).

---

## 6. Testing

| Layer | Cases |
|-------|--------|
| Unit `applyStreamingPlanPreview` | Drop removes player from add-day onward; streamer seated only on game days; multi-spot two FAs; `youTotalsFromDaily` differs from base when streamer plays |
| Panel / workspace | Selecting 1-spot changes board copy or category readout; None restores |

---

## 7. Out of scope / follow-ups

- One-click “Apply preview to daily” (persist)
- Smarter displace of weak game-day starters when no empty slot
- Highlighting plan add ordinals on the daily grid
