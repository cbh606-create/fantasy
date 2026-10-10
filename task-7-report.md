# Task 7 Report

## Important review findings

- Unconstrained simulations now always use the greedy user policy, so top-level `forcePickPlayerId` cannot alter path frequencies or category outlook.
- Force picks are applied only while evaluating the top 12 ADP candidates for `nextPicks`.
- Non-user turns return no `nextPicks` while retaining greedy-simulation outlook.
- Completed drafts calculate category outlook from the existing perspective roster and league rosters.
- Added regression coverage for non-user turns, force-pick isolation, and completed-board outlook.

## Verification

- `npm test -- tests/unit/engine.test.ts`
- Result: 1 test file passed, 6 tests passed.
- `npm test`
- Result: 7 test files passed, 27 tests passed.
