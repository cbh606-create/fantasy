# Record actual swaps on locked past days

**Date:** 2026-10-21
**Status:** Approved for planning
**Product:** Matchup streaming grid. Days before today stay locked and start blank. The user can record the add and drop that actually happened, and the rest of the week is planned from those swaps.

## Goal

The streaming plan currently invents adds and drops on days that already happened, then locks those cells. Those swaps are not the ones the user made, and the rest of the week is planned from them.

Past days stay locked. They show no suggested swap until the user records the real one. Later days use that record.

## Past cells

A past day is a matchup date before `today`. Today and later dates stay the planning grid they are now.

On the user's plan, each past add cell and drop cell renders `—` and does not accept edits. The day has one control, `실제 교체`. Opponent plans do not get it.

Pressing `실제 교체` opens that day's existing add picker and drop box for every spot on the plan being viewed. Each change is stored immediately. Pressing `실제 교체` again locks the day. A spot with no added player shows `—` in the add cell and spends no acquisition. A player drop or `To IR` on that spot still applies. `open_slot` and `hold` remove nobody. A filled spot shows the recorded add name and the recorded drop label (no drop renders `—`, a player renders that name, `Open slot` and `To IR · <name>` stay as they do today).

`추천으로 되돌리기` clears today-and-later overrides only. It does not clear past records. The user clears a past spot by opening `실제 교체` and emptying that spot.

## What a record does

Records are one list for the matchup week, shared by the 1-spot, 2-spot, and 3-spot plans. Each record is a date, a spot index, the added player id or empty, and the drop value (`hold`, `open_slot`, `ir:<playerId>`, or a player id).

They are stored in `localStorage` for that league and that matchup's start date, in the same way daily lineups are stored. A refresh keeps them. The next matchup week does not reuse them. Today-and-later overrides stay in memory only.

For every date before today, the planner creates no add and no drop of its own. A past cell with no record is empty. A past cell with an added player counts one weekly acquisition and keeps that player in the cell. The planner does not replace the player when the usual stream rules would reject them.

The drop is applied from that date forward:

- A player drop removes that player from the roster the later days plan with.
- `To IR` parks that player the same way a future IR park does.
- `open_slot` and `hold` remove nobody.

The added player joins that roster from the add date forward, until a later recorded drop or a later planned drop removes them. A later past day that has no record still renders `—`. It does not draw the carried player as a swap.

Spot indexes above the plan on screen still count. A swap saved in spot 1 changes the roster and the acquisition count on the 1-spot plan, which only has a cell for spot 0.

Today and later dates are planned from the roster and the acquisitions left after those records. They do not fill a blank past day.

## Out of scope

- Editing opponent past days.
- Reading ESPN transactions.
- Changing how today is planned.
- Drawing a suggested swap on a past day.

## Tests

- A past day with no record renders `—` for add and drop, and the planner adds nobody that day.
- Recording an add and a player drop on a past day shows those names when locked, spends one acquisition, and removes the dropped player from a later day's roster.
- A recorded add the stream rules would reject stays in that cell. The planner does not substitute another player.
- An empty past spot does not spend an acquisition.
- `추천으로 되돌리기` leaves past records in place.
- A record stored for the matchup week is still there after a fresh read of that league and start date, and is absent for a different start date.
