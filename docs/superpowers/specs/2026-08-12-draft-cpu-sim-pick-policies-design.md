# Draft CPU vs Sim pick policies

Date: 2026-08-12  
Status: approved for planning

## Problem

Live CPU auto-picks and draft simulation opponents shared one picker.

1. Need-score weighted random made late-ADP players (e.g. Sam Merrill ADP 235) appear too early on Live boards, because a roster-wide category bonus flattened scores.
2. Switching to pure best-ADP fixed Live realism but made every simulation path identical.

Live boards and Prep simulations have different goals and need separate policies.

## Goals

- Live CPU picks look like a plausible ADP board (no bizarre early reaches).
- Simulation opponents vary across seeds/runs so recommendations are not deterministic.
- Keep opponent logic simple and testable; avoid the category-need constant bug.

## Non-goals

- Changing `greedyUserPick` / user recommendation policy
- Restoring category-need scoring for opponents
- Replacing or regenerating ADP source data (`data/players/stats_2025_26.json`)
- ESPN live sync pick behavior (real picks remain sync-driven)

## Policy split

| Path | Function | Policy |
|------|----------|--------|
| Live CPU (`advanceCpuPicksUntilUserTurn`) | `pickLiveCpuByAdp` | Best remaining ADP; RNG only on ADP ties |
| Sim opponents (`simulateDraft`) | `pickSimOpponent` | ADP top-8 window, then ADP weight + position bonus, weighted random |

## Live: `pickLiveCpuByAdp`

Inputs: `remaining: Player[]`, `rng`

Behavior:

1. Reject empty `remaining`.
2. Find minimum `adp` among remaining.
3. If one player has that ADP, return them.
4. If tied, pick uniformly among ties using `rng`.

No position or category adjustments.

## Sim: `pickSimOpponent`

Constant: `SIM_ADP_WINDOW = 8`

Inputs: `remaining: Player[]`, `roster: Player[]`, `rng`

Behavior:

1. Reject empty `remaining`.
2. Sort remaining by `adp` ascending (stable by `id` on ties for determinism before RNG).
3. Take the first `min(8, remaining.length)` players as candidates.
4. Score each candidate:

```
score = (1 / adp) * 100 + positionNeedBonus(player, roster)
```

`positionNeedBonus` reuses the existing helper:

- `50` if primary position is not yet on the roster
- `25` if the player improves a flexible starter fit
- `0` otherwise

5. Do **not** use `categoryNeedBonus` (it is roster-constant and previously dominated ADP).
6. Weighted-random select among candidates using `score` and `rng` (same cumulative-threshold style as the old picker).

## Code boundaries

Primary file: `src/lib/sim/opponent.ts`

- Add `pickLiveCpuByAdp`
- Add `pickSimOpponent` (+ export `SIM_ADP_WINDOW` if tests need it)
- Keep `positionNeedBonus` / `createRng` / `scoreOpponentNeed` as needed; `scoreOpponentNeed` may remain for unit tests of ADP+position composition, or be slimmed to match sim scoring without category need
- Remove or thin-alias `pickOpponentPlayer` after call sites move

Call sites:

- `src/lib/sim/advanceCpuPicks.ts` → `pickLiveCpuByAdp`
- `src/lib/sim/engine.ts` opponent branch → `pickSimOpponent`

Drop unused `weights` / `leagueAvg` parameters from opponent pick call sites once callers are updated.

## Testing

- Live: always selects lowest ADP; ties follow RNG
- Sim: player outside ADP top-8 never selected when more than 8 remain
- Sim: with seeded RNG and a missing primary position, a fitting player inside the window can beat a slightly better ADP without that position
- Existing `advanceCpuPicks` and simulate API suites keep passing

## Success criteria

- Fresh Live manual draft early picks track ADP order (Jokic/Wemby/SGA-tier, not late-ADP outliers)
- Running draft simulation twice with different seeds yields different opponent paths / recommendation mixes more often than not
- No category-need constant reintroduced into opponent selection
