# You-spot recommendation from opponent streaming

**Date:** 2026-09-12  
**Status:** Approved for planning  
**Product:** Matchup PlanBar — pick the You streaming spot that maximizes expected category wins against the current Opp-spot assumption

## Goal

Given the user’s current **Opp spots** and **Opp drop** assumption, automatically select the **You** spot (None / 1 / 2 / 3) with the highest `projectedCatWins`. The user can override You; the next Opp-assumption change snaps back to Rec.

## Locked decisions

- **Score** = matchup board `projectedCatWins` (sum of category win probs) using the same enabled categories as the live board.
- **Candidates** = You `None`, `1-spot`, `2-spot`, `3-spot`.
- **1 / 2 / 3** = `applyStreamingPlanPreview(baseDaily, youPlan)` vs that plan’s `opponentDaily` (existing joint you+opp FA simulation).
- **None** = current you daily (no you stream) vs an **opp-only** stream. You do not consume free agents. Do not reuse a 1-spot you plan’s `opponentDaily` for None — that plan takes FAs the user is not taking.
- **Ties** = fewer You spots (`None` < `1` < `2` < `3`), then fewer you `addsUsed` (`None` counts as 0).
- **Auto-select You** when: first scored plans are ready, and whenever **Opp spots** or **Opp drop** changes (including Auto ↔ 1/2/3).
- **Pin:** a manual You click keeps that You until the next Opp-assumption change. Rec badge may move; You does not.
- **Do not** re-auto-select on add-budget, strategy mode, or daily sit/start edits.
- **UI:** You chips show Rec on the winner and each chip’s Proj (e.g. `2-spot Rec · 4.82`). Board, daily preview, and Opp week strip follow the selected You. When You is None, Opp daily / strip use the same opp-only daily used to score None.
- Rec is session-only. Do not persist You or Opp.
- No opponent team → leave You at None and do not show Rec.

## Out of scope

- Opp × You response matrix
- Persisting Rec / You / Opp
- Changing how `buildStreamingPlan` ranks adds
- New strategy modes or add-limit UI
