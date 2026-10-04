# Matchup stat window (Season / last 7–15–30)

**Date:** 2026-09-16  
**Status:** Approved for planning  
**Product:** Matchup — one rate window for weekly projections, with ESPN last-7 / last-15 / last-30 actuals ready for in-season use

## Goal

Keep today’s rest-of-season (ROS) path as the default **Season** window. Ingest ESPN last-7 / last-15 / last-30 actual splits at league import so the user can switch the whole matchup onto recent form when the 2026-27 season has games. Do not add ESPN calls when the picker changes.

## Current behavior (as of 2026-09-16)

Matchup weekly totals come from `weeklyPlayerStats`:

1. ESPN league map stores season `averageStats` as 82-game totals.
2. `applyPoolProjections` overlays `data/players/proj_2026_27.json`.
3. That overlay is **ESPN 2026-27 projected season totals** (`statsRowId` `102027`) when published, else prior-season `102026`.
4. Week totals = those season totals × (this week’s games / `projectedGames` or 82). Per-game-looking PTS (`< 50`) × games instead.
5. Board, Daily, streaming, Sit/Start, Opp plans all use this helper.

Last-N splits already exist as empty ESPN shells (`012027` / `022027` / `032027`) and will fill when games are played.

## Locked decisions

### Window

- Values: `season` | `l7` | `l15` | `l30`.
- Default: `season`.
- One window for the **whole matchup**: board, Daily, streaming plans, Sit/Start, Opp week strip, drop explain. No per-player window.
- **Season** = current `projections` + `shooting` (ESPN 2026-27 ROS overlay via `players:refresh-projections`).
- **L7 / L15 / L30** = ESPN **actual** per-game splits × this week’s games. Not blended with Season.

### Per-player fallback

If the selected last-N split is missing or all counting cats are 0, that player uses Season. The picker stays on last-N. Manual / fixture leagues have no splits → every player falls back to Season.

### Ingest

- At existing ESPN season import / FA map (`espnSeasonMap`), copy actual splits from `player.stats`:
  - last 7: `statSourceId === 0`, `statSplitTypeId === 1` (id `01{season}`)
  - last 15: split `2` (id `02{season}`)
  - last 30: split `3` (id `03{season}`)
- Confirm ids against a live payload in tests; if ESPN renames them, map by `statSplitTypeId` 1/2/3 + source 0.
- Store on `SeasonPlayer` as optional per-game rate sets (`recentRates.l7 | l15 | l30`: same `projections` + `shooting` shape). Do not overwrite Season `projections`.
- No extra ESPN fetch on picker change. Refresh of the season league re-reads splits.

### Scaling

- `weeklyPlayerStats(player, games, window)` is the only entry. Existing call sites pass the matchup window (default `season`).
- Last-N sets are per-game → multiply counting stats and shooting makes/attempts by `games`. Recompute FG% / FT% from scaled makes/attempts.
- Season path unchanged.

### UI

- **One matchup-level dropdown** on the plan bar (same column as You / Opp spots), not chips and not per player.
- Options: `Season`, `Last 7 days`, `Last 15 days`, `Last 30 days`.
- `aria-label`: `Stat window`.
- Persist per season league in `localStorage` (`matchup-stat-window:{leagueId}`), same pattern as stored opponent. Invalid stored values → `season`.
- Per-player dropdowns are **out of scope**: Daily + streamer grids would crowd, and mixed windows would desync board vs recs.

### Errors

- Overlay / import failure: Season from live-mapped averages (today’s fallback). Last-N still missing → fallback per player.
- Empty 2027 last-N before tip-off: choosing Last 7/15/30 looks like Season until splits have counting stats.

## Out of scope

- Calendar rolling X days from box scores, or last-X-games that are not ESPN’s 7/15/30.
- Blending last-N with ROS.
- Re-fetch cadence for ROS after the first `102027` overlay.
- Per-player or per-category windows.
- Auto-switching window when enough games exist.

## Testing

- Map fixture ESPN stats rows `012027` / `022027` / `032027` onto `recentRates`; empty rows do not attach a window.
- `weeklyPlayerStats` with `l7` uses last-7 per-game × games; empty `l7` equals Season.
- Plan bar select lists the four options; change updates board + streaming inputs through the same window.
- Fixture / manual league: Last 15 selected, board totals match Season.
