# Most Categories matchup

**Date:** 2026-09-27  
**Status:** Approved for planning  
**Product:** Matchup only. Each Category leagues stay on the current board and streaming. Most Categories leagues reuse that math, with a different week headline and a different starting Punt set.

## Goal

Korea League is ESPN `H2H_MOST_CATEGORIES`. PIA is `H2H_CATEGORY`. The roster already stores `scoringMode`: `each_category` or `most_categories`. A missing value is Each Category.

Most Categories still plays nine categories. The week is one result: you win it when you take more categories than you lose. Ties do not count as a win for either side. Streaming keeps chasing extra categories after that week is already won.

## Week result

Use the existing category board (`wins`, `losses`, `ties`). Do not recompute category rows.

| Category record | Week headline |
| --- | --- |
| wins > losses | 1–0 |
| losses > wins | 0–1 |
| wins = losses | 0–0–1 |

Examples: 5–4 is 1–0. 4–5 is 0–1. 4–4–1 is 0–0–1. 3–3–3 is 0–0–1.

The nine category columns stay, including each row’s W/L/T. The projected category-win number next to the headline stays. Only the big record changes, and only when `scoringMode` is `most_categories`.

## Starting Punts

Punt buttons stay on the streaming plan for both modes. They still apply only to this matchup session.

For Most Categories, seed the selected Punts when the matchup first has a board, and again when the opponent or the stat window changes. A category is seeded when its `winProb` is strictly below `0.28` (`CONTESTED_WIN_PROB_MIN`). That is the band streaming already refuses to chase.

Seeding replaces the previous selection. It does not merge with buttons the user pressed before the opponent or window change.

After that seed, button presses stick. Sitting or starting a player, and streaming-plan previews, do not turn Punts back on. A full reload seeds again from the board at that moment.

Each Category does not auto-seed Punts.

## Streaming and the rest of the matchup

Streaming, sit/start, drop order, spot counts, and opponent plans stay on the Each Category objective: expected category wins among categories that are not punted. A week that is already 1–0 does not stop that chase.

Trade, waivers, and season standings do not read `scoringMode`.

## Tests

- A category with `winProb` 0.27 is in the Most Categories seed. A category at 0.28 is not.
- Each Category does not receive that seed.
- 5–4 renders 1–0. 4–4–1 renders 0–0–1. Each Category still renders the category record.
