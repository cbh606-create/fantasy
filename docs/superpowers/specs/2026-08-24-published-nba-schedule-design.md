# Published NBA schedule + season roster slots

**Date:** 2026-08-24  
**Status:** Implemented  
**Base:** `feat/draft-mvp` / season matchup stack

## Problem

1. Matchup already prefers ESPN live scoreboard for the current America/New_York Mon–Sun week, but in the offseason that week has **zero games**. Empty/failed live then falls back to a **fictional sparse March week** in `nba-matchup-schedule.json`. Players already carry real NBA `teamAbbr`s, so the table feels fake (wrong density, many teams missing).
2. Waivers matchup-stream still hard-imports the March fixture instead of the shared schedule helper.
3. User league slots are already the desired template; we should **persist and validate** them explicitly, not invent a new slot UI.

## Decisions (approved)

| Topic | Choice |
|---|---|
| Offseason / empty live week | Show the **next Mon–Sun week that has games** from a published 2026–27 calendar |
| In-season | Keep **ESPN live** for the current week when it has games |
| Roster slots | `PG, SG, SF, PF, C, G, F, UTIL×3, BE×3, IL×1` (bench = 3; IR = `IL`) |
| Player positions | Use existing pool/ESPN `positions`; do not hand-assign |
| Preseason | Out of scope; regular season only (next week with games may be opening week) |
| Slot customizer UI | Out of scope |

## Design

### Schedule resolution (`getMatchupSchedule`)

Order of preference:

1. **Live** — fetch ESPN scoreboard for current NY Mon–Sun (+ lookback day for B2B). If normalized games for the week window are non-empty → `source: "live"`.
2. **Published season** — load checked-in `data/fixtures/nba-schedule-2026-27.json` (full regular season: `{ date, homeAbbr, awayAbbr }[]` plus season metadata). Find the earliest ISO date `>= today (NY)` that has ≥1 game; take that date’s Mon–Sun week; slice games in that week (+ optional lookback Sunday for B2B) → `source: "season"`, `matchup.days` = that week.
3. **Last resort** — only if the season file is missing/unreadable: keep a minimal sample fixture for tests/CI, labeled clearly. Do **not** use the old dense 8-team March fiction as product fallback.

Also:

- Deduplicate live day merges (already landed).
- Wire **waivers** `matchup-stream` + `preview` through `getMatchupSchedule()` (same as matchup/schedule APIs).
- UI chip: distinguish `live` vs `season` (e.g. `Schedule: published · next week with games`).

### Season schedule artifact

- Path: `data/fixtures/nba-schedule-2026-27.json`
- Coverage: 2026–27 regular season (tip-off **2026-10-20**, ends ~2027-04-11)
- Team abbrs must match player map / existing ESPN normalizer (`GS→GSW`, `NY→NYK`, etc.)
- Refresh: small script (e.g. `scripts/refresh-nba-schedule.mjs`) that builds/updates the file from a public ESPN calendar endpoint or equivalent; committed output is the source of truth for offline/CI
- Replace `nba-matchup-schedule.json` role: either delete product use, or reduce it to a tiny test-only sample that still satisfies unit tests expecting a 7-day week

### Roster slots

- Keep `SEASON_ROSTER_SLOTS` as today in `src/lib/season/slots.ts`.
- On manual/demo season league create, persist `rosterSlots: SEASON_ROSTER_SLOTS` on `SeasonLeagueState`.
- ESPN import already maps `lineupSlotCounts` → `rosterSlots`; leave that path.
- Fix `PATCH .../lineup` to validate against `rosterSlotsFor(state)`, not a hardcoded length/index of `SEASON_ROSTER_SLOTS`.
- Optional UI copy: show `IL` as **IR**; storage stays `IL`.

### Eligibility (unchanged rules)

- `BE` / `IL`: any player  
- `UTIL`: any player  
- `G`: PG, SG, G  
- `F`: SF, PF, F  
- Exact slot otherwise; missing `positions` → only UTIL/BE/IL

## Non-goals

- Fantasy scoring-period IDs synced to ESPN league weeks beyond Mon–Sun calendar weeks  
- Editable roster-slot settings UI  
- Full preseason calendar  
- Changing draft-module slot defaults (UTIL×2 / BE×4 / no IL)

## Testing

- Unit: season file has all 30 teams; per-team game days in a typical mid-season week land in a realistic band when sliced  
- Unit: with “today” fixed in offseason (e.g. 2026-08-24), `getMatchupSchedule` returns `source: "season"` and a week that includes opening tip (week of 2026-10-19 or first week with games)  
- Unit: when live returns games, still `source: "live"`  
- Unit: lineup PATCH accepts state’s `rosterSlots`  
- API/waivers: matchup-stream uses shared helper (mock schedule)

## Success criteria

- Offseason Matchup schedule table uses **real published** 2026–27 matchups for the next week with games, not March fiction  
- Players with real `teamAbbr`s see plausible 3–4 game weeks when that week’s slate says so  
- Season leagues expose PG…UTIL×3, BE×3, IL×1 without extra UI work  
- Waivers and Matchup share one schedule path
