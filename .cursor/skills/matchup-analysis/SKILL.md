---
name: matchup-analysis
description: Use when implementing weekly H2H matchup previews, category win odds versus an opponent, stream add/drop recs, games-played differentials, daily lineup lock, waiver targets for a matchup week, or undeclared category leaks in this app.
---

# Matchup Analysis

Weekly H2H is a **this-week** problem. Season ranks and draft boards are context, not the comparison set.

Scoring ids, TO invert, punt weights, and FG% paths come from **h2h-categories**. This skill only decides *who counts this week* and *what to change*.

## When to use

- Matchup preview, cats-won odds, stream/add/drop for a week
- Daily lock / games-played / opponent week roster
- “We’re losing close weeks on one cat”

**Not this skill:** draft simulate, season 12×9 rank matrix, ESPN HTTP (**espn-adapter**).

## Who counts this week

Default league: weekly H2H, **daily lineup lock**, 10 active slots (`PG SG SF PF C G F UTIL UTIL UTIL`) + 3 BE + 1 IL.

| View | Player set |
|---|---|
| Season profile / rank matrix | All 14 filled slots |
| Draft outlook | Drafted roster |
| **This matchup** | Each day: fill 10 active slots from available, eligible, **game that day**. Sum those days. IL/Out/BE count only if they start. |

Do not freeze Monday’s 10 for the week. Do not score the raw 14-man season roster. Do not use the opponent’s draft or last week’s box as the comparison set (those are IL/trade hints only).

## Objective

Maximize **weighted expected category wins vs this opponent this week**. Auto-concede:

- Declared punts (`effectiveWeight == 0`)
- Hopeless gaps (`|z|` vs opponent this week above ~1.0)

Target about 5–6 cat wins, not 9-0.

## Roster-change policy (what actually worked)

Calibrated on a 12-team daily 9-cat season: 1–2 cat punts made playoffs; 4+ cat punts did not; the champion streamed **hole specialists**; high unique-player count without a hole target did not.

1. **Chase at most two cats this week.** Pick the largest *contestable* gaps (`winProb` roughly 0.28–0.72, not a punt). An undeclared leak (~33% season win rate) is first in line if it is still contestable vs *this* opponent.
2. **Stream the hole, not the wire.** FA score = `(games this week) × (delta on chase cats) − harm to hold cats` (especially `FG_PCT` / `FT_PCT` / `TO`). Prefer a specialist in the chase cat over a high-usage wing who pads PTS/3PM you already hold.
3. **Do not silent-punt.** A ~33% leak keeps `weight = 1` until the user declares. If it is hopeless this week only, concede the week and recommend declare-punt **or** a season-long specialist — do not zero the weight in code.
4. **Do not chase a cat you already hold** (~70%+ season or this-week `winProb` already high). Adds there are churn, not strategy.
5. **Drops:** lowest projected start-share who least damages hold cats. ADP is a keeper floor, not a stream ranking. Keep ~9–11 of 13 drafted; churn late-round / low-minute slots.
6. **Opponent model:** their **current** roster projected through this week’s schedule and IL, same daily 10-slot fill. Season category matrix is the wrong opponent.

```ts
const MAX_CHASE = 2

const startableDay = (roster: PlayerDay[]): PlayerDay[] =>
  roster
    .filter((p) => !p.out && p.slot !== "IL" && p.games === 1)
    .sort(byStartPriority)
    .slice(0, 10)

const scoreStream = (
  fa: Player,
  weekGames: number,
  chase: CategoryId[],
  hold: CategoryId[],
) => weekGames * (sumDelta(fa, chase) - 0.5 * sumHarm(fa, hold))
```

`sumDelta` / `sumHarm` use h2h-categories fantasy metric (invert `TO` only there).

## Common mistakes

| Failure | Correct |
|---|---|
| Season 14-man vs opponent ranks | This week’s startable lineup-days |
| Frozen 10 starters all week | Re-fill 10 each day from games |
| Stream by ADP or PTS volume | Games × chase-cat delta, minus hold-cat harm |
| Win-all-9 / four-cat punt in-week | Max two chase cats; concede punts and hopeless gaps |
| Silent-punt a 33% leak | Keep weight; chase or ask user to declare |
| Stream into a 70% hold cat | Leave it; spend the add on the leak |
| Encode last year’s FA names | Archetype = chase cat + games + low hold-cat harm |
