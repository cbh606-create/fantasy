# Matchup Realism: Live Schedule, Positions, Board Scales, B2B — Design Spec

**Date:** 2026-08-24  
**Status:** Implemented  
**Product:** Make Matchup Advisor schedules, H2H margins, and lineup eligibility feel realistic  
**Related:** [Matchup Advisor](./2026-08-12-matchup-advisor-design.md), [Daily Lineup](./2026-08-12-matchup-daily-lineup-design.md), [ESPN live roadmap](./2026-08-19-espn-season-live-data-roadmap-design.md)

---

## 1. Goal

1. Replace the sparse static NBA week fixture with **live current-week schedule** (ESPN/public), fixture fallback on failure.
2. Honor **league roster slot settings** and **player positions** for daily Start/Sit and Sit/Start legality.
3. Retune **category win-prob scales** so YOU vs opponent margins are less extreme / less distorted across PTS vs FG%.
4. Apply **back-to-back (B2B) play probability** so second nights do not always count as a full game for every player.

### Success criteria

- Matchup / schedule APIs return `source: "live"` with a real current scoring-period week when ESPN (or CDN) succeeds; otherwise `source: "fixture"` with existing checked-in week.
- Most rostered NBA teams have games when they actually play that week (no mass 0-game from missing-team fixture).
- Daily lineup Start only allowed into a slot the player is **eligible** for under that league’s slot template + player positions.
- Sit/Start suggestions never propose illegal swaps for the league’s slots.
- Board win probs use **per-category scales** (counting vs % vs TO).
- A player’s second night of a B2B contributes **expected game weight &lt; 1** (default play rate), visible as a B2B hint in the day grid.
- Unit tests cover: live/fallback schedule shape, eligibility helper, category scales, B2B weight aggregation.

### Non-goals

- Opponent day-by-day lineups or opponent B2B optimization.
- Per-player historical B2B sit rates / age models (v1 uses a single configurable play rate; optional later).
- Live injury feeds, minutes projections, ESPN lineup writeback.
- Changing draft Mock ADP sources.

---

## 2. Live schedule

### Source (recommended)

1. Prefer ESPN fantasy / CDN scoreboard for the **current NBA week** aligned to fantasy scoring period when cookies or public endpoints allow.
2. Else public ESPN scoreboard by date range for the same week.
3. On any failure: existing `data/fixtures/nba-matchup-schedule.json`.

### Response shape

Extend `ScheduleResponse`:

```ts
source: "live" | "fixture"
```

`matchup.days`, `games[]` `{ date, homeAbbr, awayAbbr }` unchanged. Prefer standard NBA abbreviations already used in `PRO_TEAM_ABBR`.

### Consumers

| Consumer | Change |
|---|---|
| `GET /api/schedule` | Live-first + fallback |
| `GET /api/matchup` | Same schedule payload |
| Waivers matchup-stream | Same helper (no separate fake week) |
| Roster Schedule tab | Same schedule module |

Cache live payloads in-memory ~15–30 minutes to avoid hammering ESPN on every tab switch.

---

## 3. League slots + player positions

### Data

| Field | Source |
|---|---|
| `SeasonLeagueState.rosterSlots: SeasonSlot[]` | ESPN league roster settings when imported; else current `SEASON_ROSTER_SLOTS` default |
| `SeasonPlayer.positions: string[]` | ESPN eligible slots / defaultPosition mapped to PG/SG/SF/PF/C (and implied G/F) |

Manual leagues: default ESPN-like 10 active + BE/IL template; positions from pool/ESPN id when known, else treat as UTIL-eligible only for unknown.

### Eligibility

```
eligibleForSlot(player, slot):
  BE | IL → always true (bench/IL containers)
  UTIL → any non-null player
  G → positions intersect {PG, SG, G}
  F → positions intersect {SF, PF, F}
  PG|SG|SF|PF|C → exact or listed multi-pos includes that slot
```

### Where enforced

| Surface | Rule |
|---|---|
| Daily lineup Start into slot | Reject / no-op if ineligible; UI shows muted reason |
| Daily Start “first empty active slot” | Skip slots player cannot fill |
| Sit/Start swap suggestions | Only swaps where both players are eligible for the destination slots |
| Active projection set | Still “active slots” from **that league’s** `rosterSlots` (not hardcoded 10 if league differs) |

IL / BE remain non-scoring for H2H totals (same as today).

---

## 4. Board math (category scales)

Keep `delta` definition (TO inverted). Replace single `MATCHUP_SIGMOID_SCALE = 2` with per-category scales:

| Category | Scale (v1) | Rationale |
|---|---|---|
| PTS, REB, AST, TPM | ~12–18 | Weekly counting deltas are large |
| STL, BLK | ~3–5 | Smaller absolute deltas |
| TO | ~4–6 | Inverted counting |
| FG_PCT, FT_PCT | ~0.02–0.04 | Percentage-point deltas |

`winProb = 1 / (1 + exp(−delta / scale(cat)))`.

Constants live in `src/lib/matchup/constants.ts` and are unit-tested with fixtures that show: a 0.5 PTS edge is not ~100% win, and a 0.01 FG% edge is not ignored.

No Monte Carlo in v1.

---

## 5. Back-to-back play probability

### Detection

For player team `T` and date `D` in the scoring period (and looking **one calendar day before** `matchup.startDate` if needed):

- `D` is **B2B second night** if `T` also has a game on `D−1` (consecutive calendar days with ≥1 game each).

First night of a B2B pair is weight `1.0` (unless it is also second night of a prior pair — rare three-in-three: apply second-night rule to each night that has a game the previous day).

### Expected game weight

Replace raw game-day counts with:

```
weight(player, D) =
  0 if no NBA game for team on D
  else if B2B second night → B2B_SECOND_NIGHT_PLAY_RATE
  else → 1.0
```

**Default:** `B2B_SECOND_NIGHT_PLAY_RATE = 0.75` (configurable constant).

Then:

```
effectiveGames(P) = sum over days D where P is started in DailyLineups[D]:
  weight(P, D)
```

Weekly (non-daily) advisor path uses the same weights over the scoring-period days for active-slot players (assume started every day they have a game, as today).

### UI

- Day grid: badge or tooltip on B2B second-night cells (“B2B · ~75% expected”).
- Board uses fractional expected games (already float-friendly in weekly stats).

### Non-goals for B2B v1

- Player-specific rest rates from historical data.
- Home/road or opponent strength adjustments.
- Auto-sit recommendations solely from B2B (Sit/Start may *prefer* swaps that avoid low-weight nights when score improves — optional nicety, not required).

---

## 6. Architecture (units)

| Unit | Responsibility |
|---|---|
| `src/lib/matchup/scheduleLive.ts` (new) | Fetch + normalize live week; fallback fixture |
| `src/lib/matchup/games.ts` | Keep join; add B2B helpers / weighted game days |
| `src/lib/matchup/eligibility.ts` (new) | `eligibleForSlot`, active slots from league template |
| `src/lib/matchup/board.ts` | Per-category sigmoid scales |
| `src/lib/matchup/dailyLineups.ts` | Eligibility-aware toggles; weighted `effectiveGames` |
| `src/lib/season/types.ts` | `positions`, `rosterSlots`, schedule `source` union |
| ESPN season map / import | Persist slots + positions when available |

---

## 7. Error handling

| Failure | Behavior |
|---|---|
| Live schedule fetch fails | Log; serve fixture; UI can show “Schedule: fixture fallback” |
| League missing `rosterSlots` | Default `SEASON_ROSTER_SLOTS` |
| Player missing `positions` | Eligible for UTIL / BE / IL only (and G/F only if we cannot infer — prefer UTIL-only for strictness on pinned slots) |

---

## 8. Testing

1. Schedule normalizer: sample ESPN/CDN payload → games + days; failure → fixture.
2. Eligibility: PG-only player cannot Start in C; can Start in G/UTIL.
3. Board scales: known deltas → winProb in expected bands.
4. B2B: team plays Mon–Tue → Tue weight `0.75`; Wed alone → `1.0`; effectiveGames sum matches.
5. Daily toggle: ineligible Start no-ops; eligible Start updates board.

---

## 9. Implementation order

1. Types + eligibility helpers + tests  
2. Live schedule module + API wiring + fallback  
3. Weighted games + B2B + daily/weekly totals  
4. Board category scales  
5. Import rosterSlots/positions from ESPN  
6. UI: eligibility + B2B cues + schedule source chip  

---

## 10. Decisions locked

- Schedule: **live-first (A)** with fixture fallback.  
- Scope: **schedule + positions + board scales (C)** plus **B2B expected play rate**.  
- B2B v1: **flat 0.75** second-night weight, not player-specific history.
