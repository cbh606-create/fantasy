# ESPN Live Season Import — Design Spec (Phase A)

**Date:** 2026-08-12  
**Status:** Approved  
**Product:** Import a private ESPN fantasy basketball league into SeasonLeague for Roster / Matchup  
**Related:** [Season Roster Module](./2026-08-11-season-roster-module-design.md)

---

## 1. Goal

Let the manager import **their real ESPN private league** (`leagueId` + `teamId` + `season`) using server-side cookies, create a `SeasonLeague`, and use it in Matchup / daily lineup.

### Success criteria

- `/roster` form: leagueId, teamId, season, optional name → creates SeasonLeague from live ESPN
- Server uses env `ESPN_S2` + `ESPN_SWID` only (never returned to client)
- `ESPN_LIVE=true` → live HTTP; otherwise existing fixture path (CI)
- `teamId` maps to `perspectiveTeamIndex` (YOU)
- 14-slot packing into app slots; player names + NBA teamAbbr + per-game averages as projections
- Unit tests for mapper with a small ESPN JSON fixture; no live HTTP in CI

### Non-goals (Phase A)

- Live Refresh ESPN (keep stub/fixture behavior for refresh until later)
- URL paste parser
- ESPN writeback
- Per-user cookie storage (single server env for now)

---

## 2. Auth & env

| Var | Role |
|---|---|
| `ESPN_LIVE` | `true` enables live fetch |
| `ESPN_S2` | `espn_s2` cookie value |
| `ESPN_SWID` | `SWID` cookie value (braces optional) |

Missing cookies when live → `ESPN_AUTH`.

---

## 3. Fetch

```
GET https://fantasy.espn.com/apis/v3/games/fba/seasons/{season}/segments/0/leagues/{leagueId}
  ?view=mTeam&view=mRoster&view=mSettings
Cookie: espn_s2=…; SWID=…
```

Timeout → `ESPN_TIMEOUT`. Non-OK / empty → `ESPN_UNAVAILABLE` or `ESPN_AUTH` on 401/403.

---

## 4. Mapping

- Teams from `teams[]` (id, location+nickname / abbrev, roster)
- Perspective: team whose ESPN `id === teamId` → `perspectiveTeamIndex` = index in our teams array
- Store `espnTeamId` on `SeasonLeagueState` for later refresh
- Lineup slot map (ESPN `lineupSlotId` → app):  
  `0 PG, 1 SG, 2 SF, 3 PF, 4 C, 5 G, 6 F, 7–11 UTIL, 12 BE, 13 IL`
- Pack into fixed `SEASON_ROSTER_SLOTS` (14); overflow → empty BE/UTIL
- Player id: `String(espnPlayerId)`; projections from season average stats when present, else zeros
- `source: "espn"`; FA pool optional empty for Phase A

---

## 5. API / UI

- Extend `POST /api/espn/season-import` with required integer `teamId`
- `/roster` aside: **Import ESPN league** form next to manual create

---

## 6. Testing

- Fixture `data/fixtures/espn-api-season-league-sample.json` (tiny 2-team payload)
- Pure `mapEspnLeagueToSeasonState` unit tests
- Existing fixture import tests still pass when `ESPN_LIVE` is not true
