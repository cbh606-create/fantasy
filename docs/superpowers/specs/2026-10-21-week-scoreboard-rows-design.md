# Fixed activity swaps and labeled week scoreboard — Design Spec

**Date:** 2026-10-21
**Status:** Approved for implementation planning
**Product:** Lock an executed add/drop in place, and turn the week scoreboard into labeled rows with a per-team difference and a You-versus-Opp advantage.

## 1. Goal

An executed swap is a record, not a suggestion. The week scoreboard should say what each number is.

### Success criteria

- A spot with a recorded swap shows the add and the drop as static text, including when that date is today.
- A spot on that same date with no recorded swap stays an editable suggestion.
- The week card lists, per team, 합계, 실제, and 차이, then one +/- row.
- A favorable 차이 or +/- is green. An unfavorable value is red. Zero is muted.
- Daily scoreboards stay the compact stack.

### Non-goals

- Editing or clearing an executed swap from the grid.
- Locking every spot on a day because one spot has a swap.
- Rebuilding the daily cards into the same seven rows.
- Changing which days count as having a box score.

## 2. Locked swaps

A spot is fixed when `pastActualSwaps` has an entry for that date and `spotIndex`. The same rule applies to the opponent plan and its swap list.

The fixed spot uses the past-day presentation: the added player’s name, or a dash when the add is empty, and the drop label. There is no player picker and no clear control. The 실제 교체 control stays only on dates before today.

Spots on that date without a swap keep the current suggestion picker. Dates before today with no swap stay empty, as they do now.

## 3. Week scoreboard rows

The week card keeps one column per category, in the current order, plus GP. It replaces the stacked You/Opp cells with these rows:

| Row | Value |
|---|---|
| You 합계 | Closed days use the box score. Remaining days use the lineup projection. This is the current week headline. |
| You 실제 | Box-score days only. |
| You 차이 | Actual minus that day’s projection, for box-score days only. |
| Opp 합계, Opp 실제, Opp 차이 | The same three values for the opponent. |
| +/- | Our advantage over the opponent’s 차이. |

차이 is not 합계 minus 실제. Counting stats sum each day’s actual minus that day’s projection. FG% and FT% subtract the two rates made from summed makes and attempts. A team with no box-score day shows a dash for 차이.

+/- is a dash unless both teams have a 차이 for that category. Otherwise it is our 차이 minus theirs. Turnovers flip that subtraction, so fewer turnovers than projection is the favorable direction. A positive number means we are ahead of them on that category. A negative number means we are behind.

GP is shown only on each team’s 합계 row.

Row titles are 합계, 실제, 차이, and +/-. You and Opp stay the group labels. You’s three rows share one shade, Opp’s three rows share another, and the +/- row has its own shade.

Favorable 차이 and +/- use `--color-success` (`#007d48`). Unfavorable values use `--color-sale`. Zero uses the muted text color. The daily delta line uses the same two colors, so favorable does not mean green on one board and another color on the other.

## 4. Testing

- A swap dated today fixes that spot and leaves the other spot editable.
- Week 차이 for points is the sum of daily actual-minus-projection, not headline minus actual.
- Turnovers: our delta −2 and their delta +3 produces +/- of +5.
- +/- is a dash when only one team has a box score.
- The week table exposes the row titles, and a positive points advantage uses the success color.
