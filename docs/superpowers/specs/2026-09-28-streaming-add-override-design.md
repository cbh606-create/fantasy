# Streaming add override

**Date:** 2026-09-28  
**Status:** Approved for planning  
**Product:** Matchup streaming grid only. The user replaces one recommended add, sets how long that player stays in the spot, and reads the category difference on the existing matchup board.

## Goal

The streaming grid recommends who to add. The user can put a different free agent in that add cell, see the matchup board move to that choice, and see how each changed category differs from the untouched recommendation.

The rest of the week after the user's hold is replanned with the current streaming rules. This does not change drop ranking, add pacing, the ADP protection threshold, or opponent streaming.

## Picker

Clicking an add cell opens a picker next to that cell. The first rows are that cell's existing alternatives, up to three. Under them is a search field.

Search lists free agents who have a game on that add date. It excludes anyone already locked on that date, including a player whose hold range from an earlier add covers that date. Typing filters that list on the client. Typing does not rebuild a streaming plan.

Choosing a name closes the picker and replans only the spot count on screen, once.

Clicking the add date of an already locked cell opens the same picker, with a control to revert that cell to the recommendation. Choosing the player the recommendation already has in that cell clears the lock.

The drop row does not open a picker.

## Hold end

The default hold end is the same date `streamingHoldUntil` already returns for that player, add date, and spot count. For 1-spot that is the add date. For 2-spot and 3-spot that is the last game inside the next four matchup days, or the add date when that window has no game.

On a locked spot, clicking a matchup day from the add date through the last day of the week sets the hold end to that day and replans once. The add date itself means the player is held for that day only.

From the add date through the hold end, inclusive, that spot shows that player. Off nights inside the range stay holds. The 4-day week-end replacement does not run inside that range.

The day after the hold end, the normal streaming rules apply again, including dropping that player.

## What the plan must do

Locks are stored per spot count. One week can lock several cells. One replan honors every lock for the spot count being built.

On the locked date, that spot adds the locked player. Who is dropped follows the current drop rules. A roster drop is recorded only when that add is on the same cell.

The locked player stays in that spot through the hold end. After that date the spot is free.

If the add cannot be made because there is no open non-IL slot and every other roster player is ADP-protected, the lock is rejected. The picker shows one sentence that the player could not be added. The recommendation stays.

The baseline plan, with no locks, stays in memory. A lock replans only the spot count on screen.

Locks survive punt toggles and stat-window changes, and the week is replanned with those settings. Locks clear when the matchup week, the opponent, or the add budget changes. Each spot count keeps its own locks when the user switches the on-screen spot count.

## Board delta

The matchup board shows the locked plan's projected totals.

A category shows a delta only when its projected total differs from the baseline. The delta is the locked total minus the baseline total, in the same units that category row already uses. Unchanged categories show no delta.

Deltas disappear when every lock for the on-screen spot count is cleared.

## Tests

Tests assert structure. They do not name real players or pin a fixture to one ESPN id.

- A locked player occupies that spot from the add date through the hold end, and those days are holds. After the hold end the player may be dropped.
- A roster drop on a cell exists only when that cell is an add or a drop-add.
- The same rules apply at 1, 2, and 3 spots, for Each Category and Most Categories.
- When no open slot exists and every other roster player is ADP-protected, the lock is rejected and the recommendation is unchanged.
- The category delta equals the locked projected total minus the baseline projected total.
- Search results are free agents with a game on the add date who are not locked into another cell that day.

## Out of scope

Opponent streaming picks, a second matchup board, replanning all three spot counts on one click, and rebuilding a plan on each search keystroke.
