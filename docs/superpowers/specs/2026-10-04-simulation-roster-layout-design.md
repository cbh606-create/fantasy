# Simulation roster layout

**Date:** 2026-10-04
**Status:** Approved
**Product:** Trade finder — one-screen simulation with vertical rosters and rank charts
**Related:** [Trade simulation](./2026-10-03-trade-simulation-design.md)

## Goal

The Simulation tab shows both rosters and both rank charts on one screen. The user's roster and the other team's roster are vertical lists on the left, with a photo on each row. The two nonagons and their overall lines are on the right.

This replaces the Simulation picker and result layout in the 2026-10-03 trade simulation spec. Package rules, missing-piece copy, value copy, drop copy, rule sentences, and cannot-fit sentences stay as that spec states. Those rule sentences still use season-total suggestion rules.

Simulation ranks, and the nine category numbers under each chart, use the sum of each roster player's projected per-game line. Suggestions, the rank matrix, and `seasonTeamTotals` stay on season totals.

Suggestions is unchanged. Hold / Include, category toggles, and Generate stay on that tab.

## Screen

The Simulation panel fills the space under the tab list and does not grow the page. The page does not scroll to reveal more of this panel.

The panel is two columns.

The left column holds two rosters side by side. The user's roster is first. The other team's roster is second. Each roster is a vertical list of one-line rows. A row that does not fit scrolls inside that list. The page does not scroll.

The right column holds the result. Until the package is complete, it shows the first missing-piece sentence and no charts. When the package fits, it shows the two nonagons side by side, each with its overall line above it. Under each nonagon are nine rows: the short category label, the per-game sum `before → after`, and the rank `#before → #after`. A category that does not move still appears. Counting stats and percentages use the existing total formatting. Under those rows, in this order: the value sentence, the user's drop sentence when present, the other team's drop sentence when present, and the rule sentence when present. The nonagons shrink to the right column. Their rank geometry does not change. If the rows and sentences do not fit, the right column scrolls inside itself. The page does not scroll.

A package that cannot fit shows the existing cannot-fit sentence and no charts.

## Rosters

Each row is a button: a round photo, then the player's name on one line. A long name truncates. The photo uses the existing player avatar. A numeric player id loads the ESPN headshot. A missing image, or an image that fails to load, shows the player's initials.

IL entries and empty slots are absent.

Pressed means the player is in the package. A pressed send or receive row uses the filled ink style. At most two players can be pressed on each roster. Pressing a third player does nothing. Pressing a selected player clears that player.

The other roster has one team select above the list, labeled so the control's accessible name is Team. The options are the other teams in the league. There is no row of team-name buttons. Before a team is chosen, that roster is empty. Choosing a different team clears the players received from the previous team, and clears a drop that is no longer legal.

A drop is required only when the user receives more players than they send and the user's roster has no open non-IL slot. Only then, the user's roster can mark one player who is not being sent. That row is not filled. It shows the word `Drop`. Pressing it again clears the drop. A player who is being sent cannot be the drop. When a drop is not required, no row offers `Drop`.

## Per-game team line

A player's projected games are `projectedGames` when that number is greater than zero. Otherwise they are `ASSUMED_SEASON_GAMES` (82), the same divisor the ESPN season import uses when it stores a season total.

For 3PM, REB, AST, STL, BLK, TO, and PTS, the player's per-game value is that season total divided by projected games. The team value is the sum of those per-game values across every player on the roster, including IL. An empty slot adds nothing.

For FG% and FT%, the team value does not add percentages and does not divide by projected games. Add every roster player's makes, add every roster player's attempts, then divide makes by attempts. When the summed attempts are 0, the team percentage is the average of the players' percentage projections.

Before and after are ranked separately with the existing rank ordering, using these per-game team lines for every team in the league. A higher line is better except TO. An equal line gives the better rank to the lower `teamIndex`. Overall place is still the sum of the nine ranks. The source league state is not mutated.

## Components

`TradeSimulation` keeps the team, receive, send, and drop state. It still calls `simulateTrade` with the loaded league state. It does not send a request when the picks change. `simulateTrade` ranks the per-game team lines. It does not change `seasonTeamTotals`.

`SimulationRoster` draws one roster. It receives the rows, the pressed ids, and the drop id when this roster is the user's. The other team's roster also receives the team select.

`RankNonagon` stays the chart. This layout only lets the SVG scale down with its column. `PlayerAvatar` stays the photo. No new image field is stored.

## Tests

- Each roster is a vertical group of player buttons, and a row shows the player's photo or initials.
- The other team is chosen from one select, not a button per team. Changing it clears the received players.
- Pressing a player on the user's roster marks send. Pressing a player on the other roster marks receive. A third press on a full side does not add a player.
- `Drop` appears on the user's roster only when a drop is required, and only on a player who is not being sent.
- Before the package is complete, the right column shows the first missing-piece sentence and no nonagon.
- A complete package shows two nonagons, two overall lines, and nine per-game sums on each side. Those sums are not season totals. The same season total over fewer projected games contributes more per game than that total spread over 82 games.
- A lower per-game TO sum ranks better. FG% is the roster's total makes divided by its total attempts.
- Suggestion ranks and the rank matrix still use season totals.
- A cannot-fit package shows its sentence and no nonagon.
- The Suggestions tab still generates without using this roster.

## Out of scope

Expected category wins, a remaining-season replay, an ESPN write, a new chart library, changing suggestion or rank-matrix totals, and restyling the Suggestions roster. The simulation rank order stays the existing order. Only its inputs change to per-game team lines.
