# Roster category z scale

**Date:** 2026-10-03  
**Status:** Pending review  
**Product:** Roster Stats — one z-scale row under the league rank matrix, and a dialog per category

## Goal

Show where every league team sits on each category's z scale. The rank matrix stays a rank table. This adds magnitude: a team at +0.1 and a team at +2 no longer look the same just because both can be near the top of the ranks.

No separate distribution section. Category profile stays. The matrix team rows and sort stay.

## Locked decisions

### Where it sits

- `LeagueRankMatrix` gets a footer row. The row header is `Z`.
- The row is not a team, so sorting team rows does not move it.
- Column order matches the matrix: Overall, then the nine category ids in `ALL_CATEGORY_IDS` order.
- Overall is a rank sum, so that cell is `—` and is not a button.
- Each category cell is one button. The button contains a compact z scale and is labelled `Show {label} league z` (labels from `CATEGORY_SHORT_LABELS`, so `FG%`, `3PM`, `TO`, and the rest).
- `SeasonRosterWorkspace` does not change. The matrix already receives `analysis`, `teams`, and `perspectiveTeamIndex`.

### Dialog

- Clicking a category button opens one dialog for that category.
- The dialog follows the existing overlay pattern (`fixed` full-screen scrim, `role="dialog"`, `aria-modal="true"`), with kicker `League z` and title set to the category short label.
- Close by the Close button, Escape, or a press on the scrim outside the panel. Focus returns to the button that opened it.
- On open, focus the Close button. Tab cycles inside the dialog.
- While the dialog is open, `document.body` overflow is `hidden`. Restore the previous overflow on close.
- If a category has no `byCategory` rows, its footer cell is `—` and is not a button. The dialog cannot open for it.

### What a scale shows

- Horizontal position is the fantasy z already stored on `analysis.byCategory.rows`. Do not recompute z. Do not invert again. `TO` is already inverted in `analyzeTeamTotals`, so right is better on every category, including turnovers.
- A pale band covers z −1 through +1 (±1 standard deviation). A dashed tick marks z 0.
- The perspective team is a larger sky-800 dot. Other teams use `--color-mute`.
- The compact scale has no text. Its dots are decorative (`aria-hidden`). The cell button is the only control.
- The dialog scale labels the ends `worse` and `better`, the center `0`, and the band edges `−1σ` and `+1σ`.
- The perspective team has a persistent caption: `YOU · {raw} · {z}`.
- Other dots are buttons. Hover and keyboard focus show the same three facts: team name, raw stat, z. The accessible name is `{name}, {raw}, z {z}`.
- Raw uses `formatCategoryStat`. z is a signed number with two decimals (`+1.15`, `-0.40`). A value that rounds to zero is `0.00`.
- The perspective name is `YOU`. Any other team uses `team.name`, or `Team {teamIndex + 1}` when the name is missing. That matches the matrix.
- Vertical position only separates overlapping dots. It is not a stat.
- Punt, focus, and category weights do not move these dots.

### Scale geometry

Shared helper, no React: `layoutCategoryZ` in `src/lib/season/zScaleLayout.ts`.

- `extent = max(3, max |z|)` over finite z values. An empty point list, or every z at 0, still uses extent 3.
- `xFraction = (z + extent) / (2 * extent)`. z 0 is 0.5. With extent 3, z 1 is 2/3 and z −1 is 1/3.
- The component draws the axis across the inner plot, inset by the perspective-team radius, so a dot at the extreme z stays fully inside the svg. `x = inset + xFraction * (plotWidth - 2 * inset)`.
- Lane order is center, then above, then below, then further above, then further below.
- Assign lanes after sorting by `xFraction`, then `teamIndex`. A point takes the first lane whose last dot is at least `2 * youRadius + laneGapPx` away. If every lane collides, it takes the lane whose last dot is farthest.
- The same inputs always produce the same lanes.

| | Compact row | Dialog |
|---|---|---|
| viewBox | `0 0 64 22` | `0 0 640 120` |
| Other radius | 2 | 6 |
| YOU radius / inset | 3 | 8 |
| Lane gap | 1px | 2px |
| Max lanes | 3 | 5 |
| Axis y | 11 | 64 |

Lane step is `2 * youRadius + laneGap`. Compact lanes sit at y 11, 4, and 18. Dialog lanes sit at y 64, 46, 82, 28, and 100.

The YOU caption is one svg text line at y=14, above the highest dialog lane. Its x follows the YOU dot. Anchor to the middle, except anchor to the start when the dot is in the left 20% of the plot and to the end when it is in the right 20%.

### Files

- `src/lib/season/zScaleLayout.ts` — extent, x fraction, lane index.
- `src/components/season/CategoryZScale.tsx` — compact and dialog svg.
- `src/components/season/CategoryZDialog.tsx` — overlay, focus, scroll lock.
- `src/components/season/LeagueRankMatrix.tsx` — footer row and which category is open.
- No API, schema, or analysis change.

## Tests

`tests/unit/zScaleLayout.test.ts`

- z 0 maps to x fraction 0.5, and extent stays 3 when every z is inside ±3.
- With extent 3, z 1 maps to 2/3 and z −1 maps to 1/3.
- A |z| of 3.4 sets extent to 3.4, and that point's x fraction is 0 or 1.
- A positive z is to the right of 0. The helper does not take a category id and does not flip the sign.
- Two points with the same z get different lanes, center first.

`tests/unit/LeagueRankMatrix.test.tsx` (jsdom, Testing Library)

- The Z row renders nine category buttons, and the Overall cell is `—`.
- Activating the REB button opens a dialog whose title is `REB` and whose YOU caption includes the formatted raw stat.
- Escape closes the dialog and returns focus to the REB button.
- In a fixture where two teams share a REB z and every other REB z is at least 1 away from it, those two dots do not share a y position in the dialog.

## Out of scope

- A bell curve, a box plot, or a density fit to the twelve teams.
- A distribution section above or beside the matrix.
- Replacing Category profile or the rank cells.
- An Overall z scale.
- A full team table inside the dialog.
- Weighting dots by punt or focus.
