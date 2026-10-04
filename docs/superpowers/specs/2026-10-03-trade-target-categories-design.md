# Targeted trade suggestions

**Date:** 2026-10-03  
**Status:** Pending review  
**Product:** Trade finder — choose categories and outgoing players, then generate  
**Related:** [Fair trade offers](./2026-10-03-trade-fair-offers-design.md)

## Goal

The trade workspace waits for a category choice and an explicit generate click. Suggestions are the fair offers from the fair-offer spec that also raise at least one selected category, and that do not send or drop a player the user marked Do Not Include.

Acceptance, value bands, sort, paging, and the deal card stay as in the fair-offer spec except where this document names a change.

## Locked decisions

### When suggestions exist

Opening `/trade/[id]` loads the league, the below-average / above-average summary, and the user’s roster. It does not enumerate packages and it does not show suggestions.

The user turns on one or more category toggles and classifies roster players, then presses **Generate trade suggestions**. That click is the only time packages are enumerated. Changing a toggle or a roster classification leaves the current list in place until the next click.

The button is disabled while no category is on, and while a generate request is in flight. The in-flight label is `Generating trade suggestions…`.

### Category toggles

Nine toggles sit under the below-average / above-average panel. Each uses the short label:

| Id | Label |
|---|---|
| `FG_PCT` | FG% |
| `FT_PCT` | FT% |
| `TPM` | 3PM |
| `REB` | REB |
| `AST` | AST |
| `STL` | STL |
| `BLK` | BLK |
| `TO` | TO |
| `PTS` | PTS |

The stored id stays `TPM`. Every trade surface that shows a category name uses these labels, including the summary pills, the list reason, and the deal card. All nine start off. A toggle is `aria-pressed`.

A selected category “rises” when your post-trade team total moves strictly the good way: the total rises, or `TO` falls. A category that was already above average can rise. The filter is not limited to matched weak categories.

One rising selected category is enough. The other selected categories may stay flat or get worse.

### Include and Do Not Include

Under the toggles, **Your roster** splits your non-IL players who have an id into two groups, labeled `Include` and `Do Not Include`. Every such player starts in `Include`. Empty slots and IL players appear in neither group.

Each row shows the player name and one control that moves them to the other group. On an `Include` row the control reads `Do Not Include`. On a `Do Not Include` row it reads `Include`. The control is keyboard reachable.

A Do Not Include player is absent from every package you generate:

- They are not in `givePlayerIds`.
- When your side must drop someone to open a roster spot, they are not that drop. The drop is the lowest-value `Include` player who is not already leaving in the package. If no such player and no empty slot exists, that asymmetric package is not offered.
- The counterparty’s own drop rule is unchanged.

### Generation

`GET /api/trade/suggestions?seasonLeagueId=` still applies the saved local lineup first.

Without a `categories` query parameter, or with an empty one, the handler returns `youWeak`, `youStrong`, `state`, and `analysisPerspectiveTeamIndex`, with `suggestions: []`. It does not call package enumeration.

With `categories`, it enumerates, accepts, sorts, and returns the full filtered list. `categories` is a comma-separated list of category ids. An unknown id is `400`. Repeats are ignored. `excludedPlayerIds` is an optional comma-separated list of your player ids. An id that is not one of your non-IL players is ignored.

A package is returned only when it already passes the fair-offer rules and at least one id in `categories` rises for you. Sort and the 20-row page stay as they are, applied to this filtered list.

Each suggestion adds `youImproved`: `{ categoryId, before, after }[]` for every category whose total moved the good way for you, matched weak or not. `youGains` stays the matched-weak subset.

The deal card still leads with matched-weak gains. After those lines, it adds any `youImproved` category that was in the `categories` set for that click and is not already in `youGains`, with the same before → after total. The client remembers the category set from the click that produced the visible list.

`reasons[0]` uses the short labels.

### Empty and error states

Before the first completed generate, the list area reads `Select a category, then generate trade suggestions.`

A completed generate with no passing package reads `No mutually beneficial deals found under current rules.`

A failed generate leaves the list as it was and shows the existing error text. The first load still uses the existing unauthorized and load-error states. Auth codes stay `401`, `400`, `404`, `429`, and `500`. An empty passing set is `200` with `suggestions: []`.

After a successful generate, the selected deal is the first suggestion, or the empty state when the list is empty.

## Files

- `src/app/api/trade/suggestions/route.ts` — preview without `categories`; generate with `categories` and `excludedPlayerIds`.
- `src/lib/trade/enumerate.ts` — your combinations omit excluded player ids.
- `src/lib/trade/simulate.ts` — your roster-spot drop skips excluded player ids.
- `src/lib/trade/suggest.ts` — keep a package when a requested category rises; fill `youImproved`; label `reasons[0]`.
- `src/lib/trade/types.ts` — `youImproved`.
- `src/components/trade/TradeWorkspace.tsx` — toggles, roster groups, generate button, request on click.
- `src/components/trade/WeakCategoriesPanel.tsx`, `DealDetail.tsx`, `SuggestionList.tsx` — short labels, including `3PM`.

Waiver rank helpers stay untouched.

## Tests

Unit:

- An excluded player id never appears in your combinations.
- Your roster-spot drop skips an excluded player and uses the next included player. With only excluded candidates and no empty slot, the asymmetric package is not offered.
- A package that passes the fair-offer rules and raises one requested category is returned, including when that category is not a matched weak.
- A package that raises none of the requested categories is omitted.
- `TO` counts as risen only when your total falls.
- `youImproved` lists every category that moved the good way for you. `youGains` is still only matched weaks.
- `reasons[0]` says `3PM`, not `TPM`.

Component:

- The generate button is disabled until a category is pressed.
- Pressing it requests suggestions with the on categories and the Do Not Include ids.
- Changing a toggle after a response does not send another request.
- Before generate, the list reads `Select a category, then generate trade suggestions.`
- Category text in the summary, a suggestion reason, and the deal card shows `3PM`.

API:

- A request with no `categories` returns `200` and `suggestions: []`.
- A request with a valid `categories` value returns only packages that raise one of those categories.
- An unknown category id returns `400`.

## Out of scope

- Saving toggle or roster choices after refresh.
- Blocking a player the counterparty would send you.
- Requiring every selected category to rise.
- Generating on each toggle change.
- Shapes, value bands, strength protection, or waiver ranks.
