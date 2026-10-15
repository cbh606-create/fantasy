# Breakout selection

**Date:** 2026-10-15  
**Status:** Pending review of this file  
**Product:** Choose available players whose recent role or production has broken out.  
**Related:** [Injury replacement selection](./2026-10-15-injury-replacement-selection-design.md)

This spec adds a second selection function beside injury replacement. It does not change that function, its cache, or its screens.

---

## 1. Goal

Select every available player who qualifies on the rates path, the lineup path, or both.

The rates path compares a recent per-game sample with a baseline. The baseline is the player's ESPN projection until the player has 8 season games, then the player's own season average. The lineup path selects a confirmed starter who was not the depth-chart starter, when that charted starter is not `OUT` or `GTD`.

### Success criteria

- A pure function selects from in-memory inputs. It does not fetch.
- Each qualifying player produces one row. A player who qualifies on both paths keeps both reasons on that row.
- A player who fails the rules below produces no row.
- Unit tests cover the cases in section 5.

### Out of scope

- How the list is shown, sorted, or filtered.
- Scoring a breakout with the injury minutes model.
- Messenger or push alerts.
- Auto-claim.
- Changing `selectInjuryReplacements`.

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Who can be the add | A player in `availablePlayerIds` |
| Rows | One per player. Reasons are `rates`, `lineup`, or both |
| Rates, season games 1–3 | Recent per-game sample versus that player's ESPN projection. Qualify when minutes are higher **or** the 9-category z-sum is higher |
| Rates, season games 4–7 | Same ESPN projection baseline. Qualify when minutes are higher **and** the z-sum is higher |
| Rates, season games 8 or more | Last-7 per-game sample versus the season per-game sample. Qualify when minutes are higher **and** the z-sum is higher. The last-7 window must contain at least 4 games |
| Rates, season games 0 or unknown | No rates row |
| Value | Sum of nine category z-scores. Turnovers are inverted when converted to z, so fewer turnovers raise the sum |
| Minutes | Raw minutes per game. Not a z-score. Strictly greater than the baseline. No extra minimum gap |
| Z-score pool, games 1–7 | Every player's ESPN projection in the league |
| Z-score pool, games 8 or more | Every player's season-to-date per-game rates in the league |
| Projection field on `SeasonPlayer` | Do not use it. That field is a scaled season average, and a later overlay can replace it |
| ESPN projection | The projection stat row on the ESPN player payload, stored separately as per-game minutes and per-game category rates |
| Lineup path | All season. No game-count wait |
| Lineup qualification | Confirmed starter, not depth-chart rank 1 at that lineup position, and rank 1 is not `OUT` or `GTD` |
| No injury update for rank 1 | Rank 1 is treated as healthy |
| Projected lineup | Ignored |
| Candidate `OUT` | Excluded from both paths |
| Candidate `GTD` | May qualify |
| Rank 1 `OUT` or `GTD` | Not a lineup breakout. That case stays with injury replacement |

---

## 3. Inputs

`selectBreakouts` receives inputs, including `now`. It does not call ESPN or RotoWire. Each row is `{ playerId, reasons }` where `reasons` contains `rates`, `lineup`, or both.

Persist these on the way in. They are not all stored today.

| Input | Source | Used for |
|---|---|---|
| Season games played | ESPN stat `42` on the season actual row | Which rates rule applies |
| Last-7 games played | ESPN stat `42` on the last-7 actual row | The 4-game gate after 8 season games |
| Minutes per game | Average minutes on that same actual row, and on the ESPN projection row | The minutes comparison |
| Category rates | The nine categories already used by the app, per game | The z-sum |
| ESPN projection | Projection stat row on the same player payload | Baseline for season games 1–7 |

The implementation plan names the ESPN minutes key and the projection `statSourceId` from a captured payload before any code reads them. Season games played stays stat `42`.

Lineup inputs are the same shapes injury selection already uses: confirmed lineups, the depth chart, injury updates, and the RotoWire-to-ESPN crosswalk. A projected lineup is not an input.

Injury status for this function is the latest update in the last 24 hours, the same window injury selection uses. Statuses other than `OUT` and `GTD` do not count. No update means not injured.

For season games 1–7, the recent sample is the season-to-date per-game line. The last-7 split is not required, because it covers the same games.

For season games 8 or more, the recent sample is the last-7 per-game line and the baseline is the season-to-date per-game line.

Z-scores use one distribution for both sides of a comparison. Games 1–7 use the pool of ESPN projections. Games 8 or more use the pool of season-to-date rates. The pool is the league's players, not only `availablePlayerIds`.

---

## 4. Selection

### Rates path

A missing recent sample fails the rates path. A missing baseline fails only that side: minutes or z-sum. After 8 season games, a missing last-7 game count also fails the rates path.

| Season games | Recent sample | Baseline | Qualify |
|---|---|---|---|
| 0 or missing | — | — | No |
| 1–3 | Season-to-date per game | ESPN projection per game | Minutes higher, or z-sum higher, or both |
| 4–7 | Season-to-date per game | ESPN projection per game | Minutes higher and z-sum higher |
| 8 or more | Last-7 per game, with at least 4 games in that window | Season-to-date per game | Minutes higher and z-sum higher |

A missing minutes baseline fails the minutes side only. A missing category baseline fails the z-sum side only. In games 1–3 the other side can still qualify. In games 4 or more, a missing side fails the rates path. A player with no ESPN projection row fails the rates path for games 1–7.

### Lineup path

For each confirmed starter:

1. Map the starter and the depth chart to ESPN ids. An unmapped starter produces no lineup reason.
2. Find the depth-chart list for that starter's lineup position. If the position is missing, or the list has no mapped rank-1 player, produce no lineup reason for that starter.
3. If the starter is that rank-1 player, produce no lineup reason.
4. If rank 1's latest 24-hour status is `OUT` or `GTD`, produce no lineup reason.
5. Otherwise the starter qualifies with reason `lineup`.

The lineup path does not read minutes, z-scores, or game counts. It still runs when rate inputs are empty. The rates path still runs when lineup inputs are empty.

### One row

If a player qualifies on both paths, the row lists `rates` and `lineup`. Players outside `availablePlayerIds` produce no row. A candidate whose own latest status is `OUT` produces no row, even when the lineup path would otherwise match. `GTD` does not remove the row.

---

## 5. Tests

Test the pure function with in-memory inputs. No network.

- Season games 1, minutes above the ESPN projection, z-sum not above → `rates`.
- Season games 2, z-sum above the ESPN projection, minutes not above → `rates`.
- Season games 2, neither side above the ESPN projection → no rates reason.
- Season games 3, both sides above → `rates`.
- Season games 0 → no rates reason.
- Season games 5, only one side above the ESPN projection → no rates reason.
- Season games 5, both sides above → `rates`. The season average is not the baseline.
- Season games 5, ESPN projection row missing → no rates reason.
- Season games 8 or more, last-7 minutes and z-sum both above the season line, and the last-7 window has at least 4 games → `rates`.
- Season games 8 or more, only one of minutes or z-sum above the season line → no rates reason.
- Last-7 window has 3 games → no rates reason.
- Fewer recent turnovers raise the z-sum.
- Confirmed starter, not depth-chart rank 1, no injury update for rank 1 → `lineup`.
- Rank 1 latest status `OUT` → no lineup reason.
- Rank 1 latest status `GTD` → no lineup reason.
- Projected lineup only → no lineup reason.
- Starter or rank 1 has no ESPN id → no lineup reason.
- Player is not in `availablePlayerIds` → no row.
- Candidate latest status `OUT` → no row.
- Candidate latest status `GTD` and the rates path matches → the row remains.
- Both paths match → one row with `rates` and `lineup`.
- Rate inputs empty, lineup path matches → `lineup`.
- Lineup inputs empty, rates path matches → `rates`.
