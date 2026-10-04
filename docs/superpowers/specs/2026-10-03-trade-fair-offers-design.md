# Fair trade offers

**Date:** 2026-10-03  
**Status:** Pending review  
**Product:** Trade finder — sendable offers a counterparty can accept  
**Related:** [Trade module](./2026-08-11-trade-module-design.md)

## Goal

Keep the trade finder, and change what “a fair offer” means. A suggestion is a package both builders can live with, plus a card that states why the other manager would take it.

The August module stays the shell: `/trade`, `/trade/[id]`, `GET /api/trade/suggestions`, shapes `1:1`, `2:1`, `1:2`, `2:2`, no ESPN write. This spec replaces rank floors, the top-five candidate pool, the rank-based needs score gate, and the server cap of 20.

## Locked decisions

### Totals

A team total is the existing `teamTotals` number.

- Counting categories (`PTS`, `REB`, `AST`, `STL`, `BLK`, `TPM`, `TO`) are the sum of season projections for every player on that roster, including bench and IL.
- `FG_PCT` and `FT_PCT` are roster makes divided by roster attempts when every player has attempts. Otherwise they are the mean of the players’ percentage projections.
- The league mean for a category is the arithmetic mean of those team totals across every team in the league. Team count is not fixed at 12.

The good side of the mean is a higher total, except `TO`, where the good side is a lower total. A total equal to the mean is neither weak nor strong.

### Weak, strong, and a match

Classify each team from **pre-trade** totals and the **pre-trade** league mean.

- Weak: total on the bad side of the mean.
- Strong: total on the good side of the mean.

Two teams match when both intersections are non-empty:

- categories where you are weak and they are strong
- categories where they are weak and you are strong

Those two sets do not share a category. A team with no weak category, or no strong category, matches nobody.

Trade uses a new classifier for this. `teamNeedsAndSurplus` and `needsScore` stay rank-based, because waivers still call them. Trade stops using those two functions for matching, acceptance, and sort.

### Who can be traded

Every non-IL roster player with an id can be in a package. There is no value-ranked candidate pool. Empty slots stay out. IL players stay out of packages, and their projections stay inside team totals.

Shapes stay `1:1`, `2:1`, `1:2`, and `2:2`. Asymmetric packages still open a roster spot by the existing rule: an empty slot if one exists, otherwise the lowest-value player not already in the package. Acceptance uses the roster after that drop.

### Acceptance

Run the value check before simulating. It is unchanged.

- `1:1` and `2:2`: `|give − get| / max(give, get, ε) ≤ 0.25`, using the current softplus-scaled player values.
- `2:1` and `1:2`: the two-player side’s value is at least `1.2` times the one-player side.

Then apply the package and recompute the two teams’ totals. Other teams stay put. The post-trade league mean is the mean of those updated totals.

A package is a suggestion when all of the following hold, for both teams:

1. At least one matched weak category moves strictly the good way: that team’s own total rises, or its `TO` total falls. Do not require every matched weak category to move.
2. No pre-trade strong category lands on the bad side of the **post-trade** mean. Landing exactly on that mean still passes.

A pre-trade weak category may move further the bad way. That does not reject the package. Rank numbers are not an input to acceptance.

A category that started exactly on the mean is not weak, not strong, and not protected.

### Order

Sort suggestions by how much the matched categories actually improved.

For each side, sum `(zAfter − zBefore)` over the matched weak categories whose totals moved the good way. Use the z already produced by `analyzeTeamTotals`, where a higher z is better for every category, including `TO`.

When both sums are positive, the sort key is their harmonic mean: `2ab / (a + b)`. When either sum is `≤ 0`, the package still stands, and it sorts after every positive harmonic mean, ordered by the sum of the two sides. Ties keep a stable order by suggestion id.

The server returns the full sorted list. It does not truncate it.

### Card and list

The workspace layout stays: weak/strong summary, suggestion list, selected deal.

The summary labels are `Below average` and `Above average`. An empty side still reads `None identified`.

The list renders the first 20 suggestions. When more exist, a button under the list shows the next 20, or the remainder when fewer than 20 are left. The label is `Show {n} more`, and that string is the accessible name. The button is keyboard reachable and includes a downward chevron. Each press appends. The selected deal stays selected. The button is absent once every suggestion is visible. The extra rows come from the list already loaded. There is no second request.

Each list row keeps shape, the players you get, the players you give, and the counterparty name. The one-line reason names the counterparty’s improved categories.

The deal card states, for the counterparty and then for you:

- Improved matched categories, each with before → after total.
- Strong categories that are still on the good side of the post-trade mean.
- Value, using the same softplus totals as the value check. Even shape, you give the larger package: `Your package is larger by {n}%`. They give the larger package: `Their package is larger by {n}%`. `{n}` is `valueGap × 100` rounded to the nearest integer. When that integer is `0`: `Packages are even`. Asymmetric shape: `The two-player side is {overpayRatio}× the one-player side`, with the multiple rounded to two decimals.
- Weak categories that moved further the bad way, each with before → after total. Omit this block when there are none.

Percent totals render as a percent with one decimal. Counting totals render with one decimal. The card also names the players given, the players received, the counterparty, and any player dropped to open a spot.

When nothing passes, the list keeps the current empty sentence: `No mutually beneficial deals found under current rules.`

### API

`GET /api/trade/suggestions?seasonLeagueId=` stays synchronous and still applies the saved local lineup before classifying.

Success body:

- `youWeak` and `youStrong`: category ids from the pre-trade classifier
- `suggestions`: every passing package, sorted as above
- `state` and `analysisPerspectiveTeamIndex`: unchanged

Each suggestion keeps `id`, `shape`, `counterpartyTeamIndex`, `givePlayerIds`, `getPlayerIds`, `mutualScore`, `reasons`, and `overpayRatio` when the shape is asymmetric. `id` stays `{shape}|{counterpartyTeamIndex}|{sorted give ids}|{sorted get ids}`. It adds:

- `youGains`, `themGains`: `{ categoryId, before, after }[]` for matched weaks that improved
- `youWorsened`, `themWorsened`: the same shape, for pre-trade weaks that got worse
- `youStrengthsHeld`, `themStrengthsHeld`: category ids
- `valueGap`: the even-shape spread in `0…0.25`. Omit it on asymmetric shapes, which already carry `overpayRatio`.

`mutualScore` is the sort key above. `reasons[0]` is the list line. The card builds its sentences from the structured fields.

`TradeSideImpact.needsScoreBefore`, `needsScoreAfter`, and `categoryDeltas` leave the trade suggestion. The card does not show ranks. Waiver preview types that carry their own `needsScore` stay as they are.

Auth and errors stay: `401`, `400`, `404`, `429`, `500` for a broken stored league. An empty passing set is `200` with `suggestions: []`.

### Constants

- `FAIRNESS_BAND = 0.25` and `OVERPAY_RATIO = 1.2` stay.
- `NEED_RANK_FLOOR` and `SURPLUS_RANK_CEILING` stay for `teamNeedsAndSurplus`.
- `MAX_CANDIDATES_PER_TEAM` is removed.
- `MAX_SUGGESTIONS` is removed. The list uses `TRADE_PAGE_SIZE = 20`.

### Files

- `src/lib/trade/classify.ts` — pre-trade weak/strong from team totals.
- `src/lib/trade/enumerate.ts` — match filter, full non-IL combinations, no candidate cap.
- `src/lib/trade/score.ts` — value band and overpay, unchanged formula.
- `src/lib/trade/simulate.ts` — apply the package, then the total gates and the disclosure lists.
- `src/lib/trade/suggest.ts` — sort the full passing set, no slice.
- `src/lib/trade/types.ts` — suggestion fields above.
- `src/lib/trade/constants.ts` — page size, drop the candidate cap and the server slice.
- `src/components/trade/WeakCategoriesPanel.tsx` — below / above average.
- `src/components/trade/SuggestionList.tsx` — first page and `Show {n} more`.
- `src/components/trade/DealDetail.tsx` — the four card blocks.
- `src/app/api/trade/suggestions/route.ts` — return the new fields. No new route.

## Tests

Unit:

- A team below the mean in one category and above it in another can match the mirror team, including when the weak rank would have been better than 9 under the old floor.
- A non-IL player outside the old top five by value can appear in a package.
- One matched category improving is enough when another matched category does not.
- A pre-trade weak total that moves further the bad way stays a suggestion, and that category is on `youWorsened` or `themWorsened`.
- A pre-trade strong category that finishes on the bad side of the post-trade mean is rejected.
- A pre-trade strong category that drops and stays on the good side, or lands exactly on the post-trade mean, passes.
- An even package outside `0.25`, and a two-for-one under `1.2`, are rejected.
- `TO` improves only when the team total falls. `FG_PCT` improves only when the team percentage rises.
- The server result is not cut at 20 when more than 20 packages pass. Order follows the harmonic mean, with a non-positive side sum after those.

Component:

- The list shows 20 rows and `Show 20 more` when 40 exist. Activating the button shows 40 and hides the button.
- With 25 suggestions, the button reads `Show 5 more` after the first page.
- The selected id is unchanged after showing more.
- The card shows the counterparty gain, a held strength, the value gap, and a worsened weak category when one exists.
- Zero suggestions render the empty sentence.

API: the existing `401` / `404` / `200` cases stay. The `200` body includes `youWeak` and `youStrong`.

## Out of scope

- Submitting a trade to ESPN.
- Shapes larger than `2:2`.
- Position or games-cap legality.
- A declared punt or focus. Below-average is not stored as a punt.
- Schedule, games this week, or playoff weeks.
- Points leagues.
- Changing waiver need ranks or waiver needs scores.
- A second request to load more suggestions.
