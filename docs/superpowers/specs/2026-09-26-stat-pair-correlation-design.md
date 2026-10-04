# Stat pair correlation — read-only table

**Date:** 2026-09-26  
**Status:** Draft for review  
**Product:** Matchup — a collapsed table of how the nine categories travel together, computed from last season and this season’s actual lines  
**Does not change:** streaming plan chase selection, add ranking, drops, spot caps, or schedule policy

---

## 1. Goal

Show whether two categories tend to arrive on the same player. The table is there so the pair list can be read before any streaming-plan rule uses it.

### Success criteria

- Matchup shows 36 unique pairs among the nine `CategoryId`s.
- Each row shows the pair, Pearson `r`, the penalty, and the number of sample rows.
- Pairs with a measured `r` sort lowest `r` first.
- 2025-26 actuals and this season’s actuals share equal weight when both exist for a player.
- `proj_2026_27` lines are absent from the sample.
- Streaming plan output is unchanged.

### Non-goals

- Applying the penalty inside `pickBestStreamerMove`, chase selection, or plan ranking
- Shrinking a player’s stat line toward the pair structure
- Updating weights from matchup wins or winner-stream recipes
- Using last-7, last-15, or last-30 splits as the current-season sample
- Hiding pairs because of punt or focus

---

## 2. Sample

One observation is one player-season. A player with both seasons contributes two rows. A player with one season contributes one row. Rows are not averaged together. Equal weight means that row rule. The two seasons are not rebalanced to 50% when one season has more qualifying players.

### Fantasy-good value

Counting stats are per game: season total ÷ games played. `FG_PCT` and `FT_PCT` stay rates. `TO` is negated so a higher number is better. Pearson `r` is computed on these fantasy-good values.

Skip a rate when its attempts are 0 (`FGA` for `FG_PCT`, `FTA` for `FT_PCT`). A missing or non-finite value drops that observation from pairs that use it.

### Games played

A row with games played under 20 is omitted. Games played must be the actual games on that season line.

| Season | Source | Per-game counting | Games |
|---|---|---|---|
| 2025-26 | `data/players/stats_2025_26.json` totals | total ÷ `projectedGames` | `projectedGames` |
| This season | `SeasonPlayer.seasonRates` | already per game | `seasonRates.gamesPlayed` |

`stats_2025_26.json` currently has totals and no `projectedGames`. Backfill only that field from the ESPN actual row (`statSourceId === 0`, `statSplitTypeId === 0`, stat `"42"`). Leave the stored counting totals and percentages as they are. The refresh helper prefers projections (`pickBestStats`); this backfill must call the actual-stat pick, not that helper.

This season’s live map stores ESPN `averageStats` as 82-game totals, then `applyPoolProjections` replaces them with ROS projections. Copy the actual per-game line into `seasonRates` at import and leave it in place when projections are applied.

```ts
seasonRates?: {
  gamesPlayed: number
  projections: Record<CategoryId, number>
  shooting: { FGM: number; FGA: number; FTM: number; FTA: number }
}
```

`gamesPlayed` comes from stat `"42"` on that same actual season-to-date row. Counting rates and shooting makes/attempts come from `averageStats` (already per game). Omit `seasonRates` when games played is missing. Last-7 / last-15 / last-30 stay on `recentRates` and are not read here.

Before this season has actual games, the sample is 2025-26 only. A player with no actual games yet does not receive a this-season row. Projected lines are never a substitute row.

---

## 3. Correlation and penalty

Canonical category order is `FG_PCT`, `FT_PCT`, `TPM`, `REB`, `AST`, `STL`, `BLK`, `TO`, `PTS`. Each pair is stored once, earlier category first. That is 36 pairs.

For a pair, `n` is the number of observations where both fantasy-good values are finite.

When `n < 40`, or either value has zero variance, the computed `r` is `0` and the penalty is `0`. The table renders an em dash for `r` and the penalty in that case, and still shows `n`.

Otherwise `r` is the Pearson correlation:

```
r = Σ (a − meanA)(b − meanB) / sqrt( Σ(a − meanA)² × Σ(b − meanB)² )
```

Penalty, in category win-probability points, for a later streaming-plan decision:

```
r < 0  →  penalty = -r × 0.15
r ≥ 0  →  penalty = 0
```

This table displays that number. No add ranker subtracts it.

Measured pairs (`n ≥ 40` and non-zero variance) sort by `r` ascending, then by canonical pair key. Unmeasured pairs follow, ordered by canonical pair key.

Display `r` to two decimals and the penalty to three decimals. Pair labels use `CATEGORY_SHORT_LABELS` (`FG%`, `FT%`, `3PM`, `REB`, `AST`, `STL`, `BLK`, `TO`, `PTS`).

---

## 4. Where it appears

Pure function in `src/lib/players/statPairCorrelation.ts`. It does not import streaming-plan modules. Streaming-plan modules do not import it.

The matchup API returns `statPairs` next to the existing payload. The plan builder ignores that field.

```ts
type StatPairRow = {
  categoryA: CategoryId
  categoryB: CategoryId
  r: number
  penalty: number
  n: number
  measured: boolean
}
```

`measured` is false when `n < 40` or either value has zero variance. The table shows an em dash for `r` and the penalty when `measured` is false.

On the matchup page, under the daily-lineup / streaming-plans grid and above Injury Alerts, render a collapsed `<details>`:

- Summary text: `Stat pairs`
- `aria-label`: `Stat pairs`
- Columns: pair, `r`, penalty, rows
- Collapsed on first paint
- Empty sample (no observation from either season): summary stays, body text is `No stat-pair sample yet`

Punt, focus, the stat-window picker, and the opponent do not change the rows. The sample is the player pool, not this week’s chase set.

---

## 5. Errors

| Situation | Result |
|---|---|
| `projectedGames` missing on a 2025-26 player | That player-season is omitted |
| Games played under 20 | That player-season is omitted |
| `FGA` or `FTA` is 0 | That percentage is missing on that row |
| `n < 40` or zero variance | `r = 0`, penalty `0`; table shows an em dash |
| Stats file missing, or `seasonRates` absent for every current player | 2025-26-only sample, or the empty state when both sides are empty |
| ESPN backfill fails | Existing totals stay; pairs stay unmeasured until `projectedGames` exists |

Matchup advice still loads when the pair table is empty.

---

## 6. Testing

`tests/unit/statPairCorrelation.test.ts` covers:

- Two seasons for one player become two equally weighted rows
- A player with only 2025-26 contributes one row
- Counting stats use per game; `TO` is negated before `r`
- `FG_PCT` / `FT_PCT` stay rates; zero attempts drop that rate
- Games played under 20 are omitted
- A projection line is not an observation
- `n < 40` yields `r = 0` and penalty `0`
- `r = -0.5` yields penalty `0.075`
- `r ≥ 0` yields penalty `0`
- 36 pairs, canonical order, measured pairs before unmeasured pairs

Streaming-plan ranking tests keep their current expectations.

A season-map test uses a fixture ESPN player, not a live request. It asserts an actual per-game line is stored on `seasonRates` and remains after `applyPoolProjections`. A backfill test uses a fixture actual-stat payload. It asserts `projectedGames` is written from stat `"42"` and counting totals are unchanged.
