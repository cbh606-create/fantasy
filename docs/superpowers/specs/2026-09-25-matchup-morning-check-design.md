# Matchup morning check

**Date:** 2026-09-25  
**Status:** Draft, waiting for review  
**Product:** Matchup — once each morning, lock finished days to actual stats, compare them with that day's projection, and replan today through the end of the week

## Goal

When a matchup week is in progress, the page should show what already happened and what to do with the days that are left. Finished days use actual 9-category totals. The projection for those days still comes from the selected stat window, even if the app was not opened that morning. The week board, streaming plan, and lineup then recompute from today forward.

## Locked decisions

### When it runs

- Once a day, after the previous night's games are final and before today's lineup lock.
- Opening the matchup in that window performs the check and saves it.
- Opening again the same morning reads the saved check.
- Games still in progress do not update the check. Today stays unfinished until the next morning.

### What a finished day contributes

- Actual totals for all 9 categories, for us and for the opponent, from the final ESPN scoring period for that date.
- The startable player ids we and the opponent used for that day's projection. Those ids are saved the first time the day closes.
- Later roster adds do not change a closed day's player ids.
- The projection shown for a closed day is those saved ids multiplied by the stat window currently selected on the matchup. Switching Season / L7 / L15 / L30 recomputes the projection numbers and leaves the ids in place.
- Counting categories sum. FG% and FT% are makes and attempts aggregated, then turned into a percentage.
- A matchup day with no games still closes. Both sides are zero.

### Week from today forward

- Week board = actuals of closed days + projections for today through the last matchup day.
- Remaining-day projections use the current roster, the current stat window, and the existing daily lineup rules.
- Streaming plans and sit/start recompute for remaining days only, on that blended board.
- The existing 1-spot / 2-spot / 3-spot streaming policy stays as it is.

### Day comparison

- Sits directly under the week scoreboard.
- One group per closed matchup day. Today and later days are not in this grid.
- Columns are the same 9 categories as the week board.
- Each day has a You row and an Opp row. Each cell shows that day's projection above the actual. Actuals use the week board's number format. Projection is the secondary number.
- A day with no final actuals is not a row and is not included in the week sum.

### Morning summary

- Sits above the week scoreboard.
- Categories: all 9, each with this morning's week outcome (W, L, or T). A category that flipped against the saved board is marked. None are hidden.
- Opponent: adds they made that were not in the saved roster, adds we expected that they did not make, and drops we did not expect.
- Us: a player who was startable on a remaining day and is now Out, or a player in that closed day's saved startable ids who has no game line in the ESPN box score for that date. Out and did-not-play come from ESPN roster status and that day's player box score. A questionable tag is not a summary fact.
- Recommendation changes: only when at least one of those facts is present (a flipped category, an opponent roster difference, or an Out / did-not-play). Then list at most 3 remaining-day actions that differ from the saved plan. Today's lineup change or today's add/drop comes before later days.
- Facts with the same plan: say the recommendations are unchanged.
- No facts: refresh the boards and leave the change lines empty, even if the optimizer moved.
- First check of the week: no saved plan, so the change lines stay empty and the summary states today's recommendations only. All 9 outcomes still show, with no flip marks.

### What we save

On the season league, separate from `stateJson`:

- Per closed day: our startable ids, the opponent's startable ids, and both actual 9-category totals.
- The plan snapshot: all 9 projected week outcomes, the opponent roster ids, the opponent's remaining-day streaming plan, and our remaining-day streaming and sit/start recommendations. Expected opponent adds are read from that saved opponent plan.

The first close of a day writes the player ids. Later syncs may refresh actuals if ESPN corrects a final line. They do not replace the player ids.

## Failure behavior

- ESPN has no final line for a night that should be over: that day stays open. The summary says last night's results are not in yet.
- ESPN sync fails: keep the last saved morning check on screen. Do not clear the board.
- No saved plan yet: category list still shows all 9 current outcomes. Opponent, injury, and recommendation-change lines wait until the next morning.

## Out of scope

- Updating the check while games are in progress.
- Changing how many streaming spots we use, or spending an add by dropping a starter who is playing.
- Trade, waivers, or season-long punt decisions outside this week's remaining days.
- Writing lineups or adds back to ESPN.

## Tests

- Closing a day stores startable ids. A later roster add does not change that day's projection set.
- Changing the stat window changes the closed day's displayed projection and keeps the same ids.
- A day with no final actuals is absent from the grid and from the week sum.
- The summary lists all 9 categories. A flip is marked and the other categories still appear.
- Recommendation changes appear only when a flip, opponent roster difference, or Out / did-not-play exists, and there are at most 3.
- The first check of a week has outcomes and today's recommendations, and no change lines.
- A failed sync leaves the previous saved check in place.
