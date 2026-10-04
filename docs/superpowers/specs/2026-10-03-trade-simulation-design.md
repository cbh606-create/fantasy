# Trade simulation

**Date:** 2026-10-03
**Status:** Pending review
**Product:** Trade finder — build one trade and see rank movement
**Related:** [Fair trade offers](./2026-10-03-trade-fair-offers-design.md), [Targeted trade suggestions](./2026-10-03-trade-target-categories-design.md)

## Goal

The trade league page has two tabs. **Suggestions** stays the current generate flow. **Simulation** lets the user pick both sides of one trade and see what that trade does to category ranks and overall rank.

The simulation always shows the effect of a complete package. Suggestion filters do not hide it. When a package would be left off the suggestion list, one sentence says why.

Expected category wins and a remaining-season win replay are out of scope. Nothing is written to ESPN.

## Tabs

`/trade/[id]` shows a tablist, **Suggestions** and **Simulation**, in the same pill style as the roster workspace. Suggestions is selected on arrival.

The suggestion panel is the current workspace: category toggles, Hold / Include, generate, and the suggestion list. Simulation does not use those controls.

Both panels stay mounted. The inactive panel is hidden. Switching tabs keeps each panel's choices.

The league state is the one already loaded for the page. Simulation does not send another request when the picks change. A failed load or a signed-out session uses the messages the suggestion panel already shows.

## Building the package

The on-screen roster layout is specified in [Simulation roster layout](./2026-10-04-simulation-roster-layout-design.md). The rules below still govern which picks are legal.

The user picks, on one screen:

1. One other team.
2. One or two non-IL players on that team. These are the players received.
3. One or two non-IL players on the user's team. These are the players sent.
4. A drop, only when the user receives more players than they send and the user's roster has no open non-IL slot. The drop is one of the user's non-IL players who is not being sent.

IL entries and empty slots are absent from every picker. A player who is being sent cannot also be the drop.

Equal counts (1:1 or 2:2) have no drop. When the user sends more than they receive, the other team takes an open non-IL slot if it has one, and otherwise drops the lowest-value non-IL player who is staying. The result names that player. The user does not pick the other team's drop.

An open slot is a non-IL entry with no player. An empty IL slot is not an open slot.

Changing the other team clears the players picked from that team. A drop selection is cleared when it is no longer a legal drop.

Until the package is complete, the page shows the first missing piece in the order below and does not show ranks. There is no generate button. A complete package updates the result immediately.

Missing-piece copy:

| State | Copy |
|---|---|
| No other team | `Choose another team.` |
| No player to receive | `Choose who to receive.` |
| No player to send | `Choose who to send.` |
| A drop is required and not chosen | `Choose who to drop.` |

## Result

When the package fits, the result has four parts.

### Nonagons

You and the other team each get one nine-sided chart, drawn in SVG. No chart library.

Vertices follow `ALL_CATEGORY_IDS`, clockwise from the top: FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS.

Rank 1 sits on the outer radius. Last place, among the current number of teams, sits at 15% of that radius. The radius falls in a straight line as the rank gets worse. A larger shape is a better rank profile. The before shape is a thin line. The after shape is a filled polygon on the same axes. Each vertex shows that category's rank change, for example `#8 → #4`. An unchanged rank shows as `#5`.

### Overall

Above each nonagon:

`Overall #6 → #4 (rank sum 48 → 41)`

The numbers above are an example of the format.

Overall place is the order of rank sums across every team in the league. The rank sum is the nine category ranks added together. A smaller sum is better. An equal sum gives the better place to the lower `teamIndex`. Category ranks use the existing season ordering: higher total is better except TO, and an equal total gives the better rank to the lower `teamIndex`.

Before and after are ranked separately, each from the full league totals at that moment.

### Category table

The on-screen rows and the ranks behind them are specified in [Simulation roster layout](./2026-10-04-simulation-roster-layout-design.md). Each row shows the sum of the roster's projected per-game lines, not the season total. Suggestion rules in this spec still use season totals.

### Package notes

The value sentence is `formatValueLine`. When someone is dropped, the result names them: `Drops {name} to open a roster spot` for the user's drop, and `They drop {name} to open a roster spot` for the other team's drop.

## When the package would not be suggested

The rank result still renders. One sentence follows it, the first failure in this order:

1. Even package, the user's side is larger by more than 10%: `Your package is more than 10% larger.`
2. Even package, the other side is larger by more than 10%: `Their package is more than 10% larger.`
3. Uneven package, the two-player side is below 1.2× the one-player side: `The two-player side is below 1.2× the one-player side.`
4. The two intersections are not both nonempty (your weak categories against their strong categories, and the reverse): `These teams do not have complementary categories.`
5. Your side does not improve a matched weak category: `None of your matched weak categories improve.`
6. Their side does not improve a matched weak category: `None of their matched weak categories improve.`
7. One of your pre-trade strengths finishes on the bad side of the post-trade league mean: `One of your strengths finishes on the bad side of the league mean.`
8. One of their pre-trade strengths finishes on the bad side of the post-trade league mean: `One of their strengths finishes on the bad side of the league mean.`

A passing package has no sentence. The category-toggle filter from Suggestions is not applied. Weak, strong, the 10% band, the 1.2× ratio, and strength protection use the fair-offer rules already in the trade module.

## When the players do not fit

If the side that must open a spot has no open non-IL slot and no legal non-IL player to drop, there is no chart and no category table. The page shows one of:

- `Your roster cannot fit the extra player.`
- `Their roster cannot fit the extra player.`

The user's case happens when every remaining non-IL player is already being sent. The other team's case uses the automatic rule. The original league state is left unchanged.

## Calculation

`simulateTrade` takes the loaded `SeasonLeagueState` and the picked ids. It runs in the browser.

Roster application stays in `applyTradePackage`. Suggestions keep today's automatic drop by passing no explicit drop, including today's search for an open slot. Simulation passes `yourDropPlayerId` only when the user's side needs a spot. That id is used only when it is one of the user's current non-IL players and it is not being sent. For a simulation package, an open non-IL slot is used before any drop, on either side, and an empty IL slot is not used. The other team's drop stays the lowest-value legal non-IL player.

Simulation ranks come from the per-game team lines in [Simulation roster layout](./2026-10-04-simulation-roster-layout-design.md), before the trade and after the applied roster, using the same category ordering as `analyzeTeamTotals`. Overall place is computed from those ranks. This spec does not change the rank matrix or suggestion totals.

## Tests

Calculation:

- A 1:1 moves the rank of a category whose total changes, and leaves an unchanged category on the same rank.
- A lower TO total produces a better TO rank.
- The user's chosen drop is removed, and a lower-value teammate who was not chosen stays.
- An open non-IL slot is used and nobody is dropped.
- The other team drops its lowest-value remaining non-IL player.
- No legal spot returns the matching cannot-fit sentence and no ranks.
- A package outside a suggestion rule still returns ranks, with only the first failing sentence.
- A package that passes the rules returns ranks and no sentence.

Screen:

- The Suggestions tab still generates from a category click.
- On Simulation, choosing one player from each side shows a rank change of the form `#8 → #4`, an `Overall` line with a rank sum, and the nine short category labels on each chart. The test asserts that pattern, not those exact rank numbers.
- Receiving two players and sending one shows no chart until a drop is chosen.
- Switching to Suggestions and back leaves the Simulation picks in place.
