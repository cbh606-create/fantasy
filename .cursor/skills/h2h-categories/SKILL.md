---
name: h2h-categories
description: Use when implementing or changing H2H category scoring, 9-cat totals, z-scores, rank matrix, punt/focus weights, FG%/FT% aggregation, turnover inversion, category outlook, matchup category wins, or draft/season/roster fantasy metrics in this app.
---

# H2H Categories

One scoring contract for draft, season roster, and matchup. Do not invent a second 9-cat model.

**Fantasy metric:** higher is always better. Store `TO` raw (higher worse). Invert only when converting to z, rank, who-won, or win expectancy.

## When to use

- Totals, z-scores, ranks, bars, outlook, or "who wins the cat"
- `effectiveWeights`, punt, focus, enabled/disabled cats
- FG%/FT% team aggregation or FGM/FGA display fields

**Not this skill:** ESPN HTTP, cookies, fixtures, scoringPeriodId sync (**espn-adapter**), draft board UI, opponent ADP sampling, points leagues, weekly stream/add/drop policy.

**Who counts:** season profile/matrix = all 14 filled slots. Draft outlook = drafted roster. Weekly matchup who-plays is **matchup-analysis** (daily 10 startable slots, not the raw 14).

## Category ids

Use this union only. Never `fg_pct`, `"FG%"`, or extra cats (`DD`, `FGM`).

| `CategoryId` | Label | Kind | Team aggregate |
|---|---|---|---|
| `FG_PCT` | FG% | rate | see aggregation |
| `FT_PCT` | FT% | rate | see aggregation |
| `TPM` | 3PM | count | sum |
| `REB` | REB | count | sum |
| `AST` | AST | count | sum |
| `STL` | STL | count | sum |
| `BLK` | BLK | count | sum |
| `TO` | TO | count (worse-higher) | sum raw |
| `PTS` | PTS | count | sum |

Default: all 9 `enabled: true`, `weight: 1`.

`FGM`/`FGA`/`FTM`/`FTA` are display + % inputs only. **Not** matrix columns, **not** `CategoryId`s.

## Aggregation (two paths)

Draft `Player.projections` has rates only. Season may also have `shooting`.

| Module | `FG_PCT` / `FT_PCT` |
|---|---|
| Draft sim `rosterTotals` | Mean of player `projections.FG_PCT` / `FT_PCT` |
| Season analysis | If every filled player has `shooting` and `FGA`/`FTA` > 0: `sum(FGM)/sum(FGA)` (same for FT). Else mean of `%` projections |

Do not "fix" draft to volume-weighted without a spec change.

Example (season volume path): 10/10 and 1/2 → FG% = `11/12 ≈ 0.917`, not mean `0.750`.

## Weights

```ts
// punt → 0; disabled → 0; focus → weight * 1.5; else weight
```

Punt and focus are user strategy. Disabled is league settings.

| | Weight | Show on profile/matrix |
|---|---|---|
| Enabled, not punting | `weight` or `weight * 1.5` if focus | Yes |
| Punt | `0` | Yes (user is punting; they still look at it) |
| Disabled | `0` | No scored column |

Punt must not change a team's score when only that cat differs. Do not hide punted cats. Do not drop them from `CategoryId`.

## Z, rank, win expectancy

Population z vs the 12-team totals (or league mean in draft sim):

```ts
const stdev = populationStdev || 1
const z = id === "TO" ? (mean - team) / stdev : (team - mean) / stdev
const sigmoid = 1 / (1 + Math.exp(-z))
// expected category wins = sum over cats of effectiveWeight * sigmoid(z)
```

- Rank `#1` = best fantasy metric (fewest TO).
- Never invert `TO` twice (raw store stays unnegated).
- Draft objective: maximize weighted expected category wins. Build choice: **draft-strategy**. Sim shape: **draft-simulation**.

## Shared helpers vs module split

Put ids, labels, `effectiveWeights`, invert-TO z, and z-score utils in shared domain code (`src/lib/domain/categories.ts` and small z helpers).

Season analysis must not import draft simulate/board/mock. Draft must not import season roster UI/domain. Copy is allowed if a shared helper does not exist yet; then extract.

## Common mistakes

| Failure | Correct |
|---|---|
| Higher TO is better | Lower TO wins; invert only at z/rank/who-won |
| One FG% formula everywhere | Draft = mean of rates; season = volume when shooting exists |
| FGM/FGA as 10th/11th cats | Display only; matrix stays 9-cat |
| Weekly matchup = season 14 or frozen 10 | Daily startable 10; use matchup-analysis |
| Punt removes the column | Weight 0; still display |
| Double-negate TO | Raw totals; invert once at compare |
| `fgPct` / ESPN display strings as ids | `FG_PCT` union only |
| Points / 8-cat / 10-cat defaults | 9-cat H2H only unless settings disable a cat |
