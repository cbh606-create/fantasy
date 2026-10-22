# Fill past swaps from recent activity

**Date:** 2026-10-21
**Status:** Approved for planning
**Product:** Matchup streaming grid. Past days stay locked. A successful read of the league's recent activity replaces the saved actual swaps for those days.

## Goal

The user records actual adds and drops so the rest of the week is not planned from invented swaps. Those moves are already in the league's recent activity, for both teams in the matchup. Reading that activity should fill the user's saved swap list and the opponent's saved swap list. This is the ESPN-transaction read the past-day swap spec left out.

## Activity

Recent activity is `mTransactions2`, the same view the winner-stream history already requests, filtered to `FREEAGENT` and `WAIVER`.

A usable transaction has status `EXECUTED`. Each item is an `ADD` or a `DROP` with a player id and a team id. The transaction's `scoringPeriodId` is the matchup date, using the same date-to-period pairing as the matchup schedule (`schedule.matchup.days` aligned with `schedule.matchup.scoringPeriodIds`).

Both ESPN teams in the current matchup are kept, in separate lists. Only dates strictly before `today` are kept. Today and later stay the planning grid. Trades and any other transaction type are ignored.

Within one transaction, take that team's `ADD` items and `DROP` items in item order and pair them by index. Index 0 is one swap, index 1 is the next. A leftover `ADD` uses drop `open_slot`. A leftover `DROP` uses `addedPlayerId: null`. Several swaps on the same date take spot indexes `0`, `1`, `2`, … in transaction order, then that index order.

Player ids are the ESPN player id as a string, the same id the roster already uses.

## Replacing the saved lists

The user's swap list is the existing one: `localStorage` key `matchup-past-swaps:${leagueId}:${matchupStart}`. The 1-spot, 2-spot, and 3-spot plans already share it. The opponent's list uses `matchup-past-swaps:${leagueId}:${matchupStart}:opponent`. Each record is still `{ date, spotIndex, addedPlayerId, drop }`.

For an ESPN league, a successful activity read puts both `pastActualSwaps` and `opponentPastActualSwaps` on the matchup response. The client replaces both saved lists. The user's three plans take `pastActualSwaps`. The opponent plan takes `opponentPastActualSwaps` and does not receive the user's list. The opponent grid still has no `실제 교체` control. A league that is not ESPN omits both fields.

- A successful read with no kept moves for a team replaces that team's list with `[]`. Those past days render `—`. The planner invents nothing on those days.
- A failed read, or a matchup whose `scoringPeriodIds` do not line up with the dates, omits both fields. The client keeps both saved lists.

The next successful read replaces both lists again, including swaps the user typed with `실제 교체`. `추천으로 되돌리기` still does not clear either list.

A recorded add still spends one weekly acquisition and stays even when stream rules would reject the player. A player drop removes that player from later days. `open_slot` removes nobody. Spot indexes above the plan on screen still change the roster and the acquisition count.

## Out of scope

- Editing opponent past days by hand.
- Trades, IR moves, and pending waivers.
- Moves dated today or later.
- Roster diffs across scoring periods.
- Changing how today is planned.

## Tests

- An executed waiver with one `ADD` and one `DROP` for the user's team on a past scoring period becomes one swap: that add, that drop, spot `0`.
- An `ADD` with no `DROP` stores drop `open_slot`. A `DROP` with no `ADD` stores `addedPlayerId: null`.
- Two transactions on the same past date use spot `0` and spot `1` in transaction order.
- A transaction for the other team in the matchup is stored on that team's list and not on the user's list.
- A team outside the matchup, a trade, a pending waiver, and today's scoring period produce no swap.
- A successful empty activity list replaces both saved lists with `[]`.
- A failed activity read omits both fields, and a fresh read of each saved list still returns the previous swaps.
