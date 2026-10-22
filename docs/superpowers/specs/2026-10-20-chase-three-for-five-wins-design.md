# Chase three categories to reach five wins

**Date:** 2026-10-20
**Status:** Approved for planning
**Product:** Matchup streaming chase for both Each Category and Most Categories. The week target stays five category wins. The chase list grows from two to three only when three or more flips are still required.

## Goal

A two-cat chase cannot finish a week that is three or more category wins short of five. When that happens, chase the three in-range losses most likely to flip. Do not chase a fourth or fifth. Do not spend one of those three slots on a category the board is already winning.

When two flips or fewer would reach five, keep today's two-slot chase, including the spare slot that can hold a close lead.

## Selection

`chaseCategoryIds` in `src/lib/matchup/streamingDropExplain.ts` keeps the current candidate filter. A category is a candidate when it is contested, its `winProb` is below `0.7`, and it is not punted.

A win is any board row with outcome `W` that is not punted, including a blowout that is not a chase candidate. Ties are not wins.

`flipsNeeded` is `max(0, 5 - wins)`.

The path set is the non-winning candidates, highest `winProb` first, limited to `flipsNeeded`. Sort order stays the same: path categories first, by `winProb` descending, then the existing close-to-win, flip-band, and weak tiers.

The returned list length changes:

| Path size | Cap | Who fills the list |
| --- | --- | --- |
| 0, 1, or 2 | 2 | Today's order. A single path loss can still leave the second slot for a closer lead. |
| 3 or more | 3 | The three highest-`winProb` path losses. A closer lead does not replace one of them. |

If only two losses are in range, the path size is 2 even when `flipsNeeded` is larger, so the cap stays 2.

Examples, all categories in range and not punted:

- Two wins, one of them a 54% lead, and in-range losses at 47%, 43%, and 40%. Chase those three losses. The lead does not take a slot.
- One win and four in-range losses. Four flips would reach five, but the list is the three highest. Drop the fourth.
- Four wins, one loss at 47% and a 52% lead. Chase the loss, then the lead. The list stays at two.
- Five or more wins. No path categories. Chase the two closest contested categories, as today.

## Scoring

Do not change the acquisition order in `pickBestStreamerMove`. Expected category wins across the board stay first. Chase remains the tiebreak when that total is equal.

The tiebreak already sums one delta per chase category. Three chase categories are equal weight because each delta is added once. There is no extra coefficient and no nested tiebreak for the third category.

The negative-correlation penalty stays exactly as it is: it applies only when the chase list length is 2. A three-category chase does not apply it.

## Chase note

`streamingChaseNote` today replaces a longer list with the first pair and that pair's correlation. Change it so a list whose length is not 2 returns every category id, `r: null`, and `penalty: 0`. A list of length 2 keeps the current pair lookup.

The plan note then shows all three names. The existing formatter prints a null `r` as a dash and the penalty as `0.000`. Do not invent a correlation of 0.

## Tests

- Three in-range losses are required to reach five wins: the chase list is those three, highest `winProb` first.
- Four in-range losses are required: the list is the three highest, not the fourth, and not a closer win.
- One or two flips still return today's two-slot results, including the spare closer lead.
- Five wins already on the board still prefer the closer category.
- `streamingChaseNote` on three ids returns those three ids, `r: null`, and `penalty: 0`.
- A two-id note still returns that pair's `r` and penalty.

## Out of scope

- Chasing four or more categories.
- Weighting the third category below the first two.
- Applying a pair penalty inside a three-category chase.
- Changing the primary sort away from expected category wins.
- Changing punt thresholds or the contested band.
