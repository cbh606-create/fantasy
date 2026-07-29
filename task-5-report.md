# Task 5 Report

## Important review finding

- Updated opponent category-need scoring to compare roster averages with supplied league averages.
- Turnovers now add need when the roster average is above the league average.
- Added league-average parameters to `scoreOpponentNeed` and `pickOpponentPlayer`.
- Added regression coverage for league-relative category needs, flexible-slot `+25`, and no-fit `0`.

## Verification

- `npm test -- tests/unit/opponent.test.ts`
- Result: 1 test file passed, 6 tests passed.
