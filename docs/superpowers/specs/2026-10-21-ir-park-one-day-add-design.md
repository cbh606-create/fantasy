# Park a sitter on IR for a one-day add

**Date:** 2026-10-21
**Status:** Approved for planning
**Product:** Matchup streaming drop box. A roster player with no game that day can be parked on the empty IR slot so a one-day add fills the active seat they leave. The parked player stays on IR until the user moves them back.

## Goal

Veterans often sit one game of a back-to-back. That player still occupies a roster seat, so the add drop box can only drop someone or use an already empty active seat. When IR is empty, the user can park the sitter on IR instead of dropping them, and use that active seat for one add.

The plan may assume the sit before ESPN marks the player OUT. The real IR move happens after the pregame status flip. The drop box says so when the player is not OUT yet.

## Drop box

The control is the existing roster-drop select on the user's streaming plan (`StreamingPlansPanel`, options from `rosterDropSelectOptions`). Opponent plans do not get this choice.

Each roster player who has no game on that date and sits in an active slot that day gets one option. A bench player is omitted, because parking them does not open an active seat.

- Value: `ir:<playerId>`
- Label: `To IR · <player name>`

The option is absent when any of these is true:

- The IR slot already has a player.
- The player has a game on that date, or is not in an active slot that day.
- The player is already on IR, or is not on the user's roster.

When `injuryStatus` is `out`, the option has no extra note. Otherwise the option notes that the ESPN move waits until the player is OUT before the game. The plan can still be selected.

A stored `ir:<playerId>` that no longer qualifies, including an IR slot that filled later, reverts to Hold. Nobody is parked.

## Plan result

`StreamingPlanRosterDropKind` gains `ir`. The parked player id is `rosterDropPlayerId`. The add still spends one weekly acquisition. Parking is not a drop, so the player is not waived.

Preview from the chosen date through the end of the shown week:

- The parked player occupies IR and no active or bench seat.
- The added player occupies the vacated active seat on the chosen date only.
- Later dates leave that active seat empty. The preview does not promote a bench player into it and does not create another add.
- The parked player does not return automatically. Putting them back is a roster edit.

The automatic streaming plan does not choose `ir` by itself.

## Tests

- A player with no game that day appears as `To IR · <name>` when IR is empty.
- A player with a game that day does not appear. A bench player does not appear. An occupied IR slot hides every To IR option.
- A non-OUT player carries the pregame-OUT note. An OUT player does not.
- Applying the choice parks that player on IR from the chosen date through the week, seats the add on the chosen date only, and leaves the vacated active seat empty on the next date.
- A stale `ir:` choice reverts to Hold and parks nobody.
