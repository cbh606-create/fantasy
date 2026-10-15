# Injury replacement selection

**Date:** 2026-10-15  
**Status:** Pending review of this file  
**Product:** Choose one available FA/waiver replacement for each recent NBA OUT or GTD.  
**Related:** [Injury replacement pickup (fixture MVP)](./2026-08-18-injury-replacement-pickup-design.md)

This spec replaces the fixture injury and fixture depth-chart **selection** path from the 2026-08-18 spec. It does not replace that spec's screens.

---

## 1. Goal

For every NBA player who became **OUT** or **GTD** in the last 24 hours, select at most one available replacement.

The replacement is the confirmed new starter at that position when a starting lineup has been announced. Otherwise it is the next available player on the RotoWire depth chart at that position.

### Success criteria

- A pure function selects the replacement from injury updates, a depth chart, confirmed lineups, an ID crosswalk, and `availablePlayerIds`.
- Each qualifying injury produces one row, or no row when this spec says to skip it.
- The same available player may be the replacement for two injuries. Both rows are kept.
- Unit tests cover the cases in section 7.

### Out of scope

- How the list is shown, sorted, or filtered, including the category re-sort.
- Scoring the replacement with the minutes model in section 8.
- Breakout pickups.
- Messenger or push alerts.
- Auto-claim.
- A background cron. The server refreshes its cache when the pickups request finds the cache stale.

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Injury source | RotoWire injury updates, server-side |
| Who can be the injured player | Any mapped NBA player, whether or not a fantasy roster owns them |
| Who can be the add | A player in `availablePlayerIds` |
| Statuses | `OUT` and `GTD` |
| Window | Latest update in the last 24 hours |
| Before a confirmed lineup | RotoWire depth chart |
| After a confirmed lineup | The new starter at that position |
| Projected lineup | Does not change the pick |
| Player identity | Saved map from RotoWire id to ESPN player id |
| Rows | One per injury. Duplicate add ids stay |

---

## 3. Inputs

The selector does not call RotoWire. A server cache loads these inputs and passes them in.

| Input | Refresh when stale | Used for |
|---|---|---|
| Injury updates | 5 minutes on a day with NBA games, otherwise 30 minutes | Who is OUT or GTD |
| Depth chart | 60 minutes on a game day, otherwise 6 hours | Backup order |
| Lineups | 5 minutes, from 2 hours before the day's first tip until lineups are confirmed | Confirmed starters only |
| Player list | 6 hours | RotoWire id → ESPN id |

The API key stays in a server environment variable.

If a refresh fails, keep the previous cache. If that input has never loaded, the selector receives an empty list for it and selects nothing from it.

### Injury update

Use RotoWire `Injury.Status`. `OUT` and `GTD` qualify. `NBAInjuryStatus` alone does not.

The 24-hour window is measured from the selector's run time against the update's `DateTime`. If one player has more than one update in that window, keep the latest `DateTime`. If that status is not `OUT` or `GTD`, drop the player.

### Depth chart

Per NBA team and position `PG`, `SG`, `SF`, `PF`, `C`, an ordered list of RotoWire player ids. Rank 1 is the starter. The injured player's position is the list that contains that player. A player listed in two positions uses the list with the lower rank number.

### Confirmed lineup

A lineup counts only when RotoWire marks it confirmed. Each starter has a RotoWire player id. Position on the lineup is used when present. When it is absent, a starter's position is the depth-chart list that contains that id.

### Crosswalk

Build the map from the RotoWire player list.

- Compare normalized first name, last name, and team code with the ESPN player's name and `teamAbbr`.
- Normalization lowercases, removes punctuation, collapses whitespace, and drops the suffixes `jr`, `sr`, `ii`, `iii`, and `iv`.
- Team codes pass through a fixed alias table before comparison: `PHO` = `PHX`, `BRK` = `BKN`, `CHO` = `CHA`, `GS` = `GSW`, `SA` = `SAS`, `NY` = `NYK`, `NO` = `NOP`, `WSH` = `WAS`.
- One ESPN player for that key: store `rotowireId → espnId`.
- Zero ESPN players: leave it unmapped. A later alias entry may add that one pair. The alias table starts empty.
- Two or more ESPN players for that key: store neither.

---

## 4. Selection

`selectInjuryReplacements` returns:

```ts
type InjuryReplacement = {
  injuredPlayerId: string
  status: "out" | "gtd"
  addPlayerId: string
  source: "lineup" | "depth"
}
```

Player ids in the result are ESPN ids. For each qualifying injury:

1. Skip it when the injured RotoWire id is not in the crosswalk.
2. Resolve the depth-chart position list that contains the injured player. If no list contains that player, skip the injury.
3. **Lineup path.** The lineup is the confirmed lineup for that team's next game that has not tipped off. Use it when that lineup exists and the injured player is not on it. The candidate is a confirmed starter who is not the injured player and whose position equals that depth-chart position. Use this candidate when there is exactly one, the id is in the crosswalk, and the ESPN id is in `availablePlayerIds`. `source` is `"lineup"`.
4. **Depth path.** Use it when step 3 does not produce a pick. Walk the position list after the injured player. The pick is the first id that is in the crosswalk and whose ESPN id is in `availablePlayerIds`. `source` is `"depth"`.
5. Skip the injury when neither path produces a pick.

`availablePlayerIds` is the only availability test. A player on any fantasy roster is not available.

---

## 5. Boundaries

- `GTD` followed by `OUT` inside 24 hours selects on `OUT`.
- The injured player still listed in the confirmed lineup uses the depth path.
- A projected lineup uses the depth path.
- The lineup candidate is unavailable: continue with the depth path.
- More than one confirmed starter matches the position: skip the lineup path and use the depth path.
- The same add player for two injuries: emit two rows.
- An update older than 24 hours: no row, including a player who is still out.
- An unmapped player, on either side of the pick: that player cannot be chosen.
- The injured player is on no depth-chart position list: no row.
- No fixture injury and no fixture depth chart fill a live miss.

---

## 6. Failure

| Condition | Result |
|---|---|
| RotoWire refresh fails and a cache exists | Select from the cache |
| An input has never loaded | That input is empty |
| Crosswalk miss, no position list, or no available backup | No row for that injury |
| Two ESPN players share a normalized name and team | That RotoWire id stays unmapped |

---

## 7. Tests

Test the pure function with in-memory inputs. No network.

- Confirmed new starter is available → that player, `source: "lineup"`.
- That starter is rostered → first available player below the injured player on the depth chart.
- No confirmed lineup → depth-chart pick.
- Injured player remains in the confirmed lineup → depth-chart pick.
- Projected lineup only → depth-chart pick.
- Two confirmed starters match the position → depth-chart pick.
- Latest update is `OUT` after an earlier `GTD` → `status: "out"`.
- Latest update is older than 24 hours → no row.
- Latest status is neither `OUT` nor `GTD` → no row.
- Injured id or backup id is unmapped → no row.
- Injured player is absent from the depth chart → no row.
- Two injuries select the same available player → two rows.
- Two ESPN players share a name and team → no crosswalk entry.

---

## 8. Decided, not part of selection

These are recorded so a later spec can use them. This spec's function does not score or display.

**Minutes model.** Expected minutes = the backup's current minutes + the injured starter's season minutes × **0.45**. The 0.45 is the median share of the absent starter's minutes gained by the new starter in 170 regular-season games (2023-24, 2024-25, 2025-26) where one recent starter was out injured. Counting stats scale by expected minutes divided by current minutes. FG% and FT% stay at the backup's rates; attempts scale. Per-minute production is not given an extra starter boost. The backup's current minutes are L7 minutes per game, or season minutes per game when L7 is missing. The injured starter's minutes are season minutes per game.

**Category order.** One candidate set. Default order is a later display choice. Choosing a category re-sorts that full set by that category, then shows the top 10. Turnovers sort toward the smaller increase.

**Alert, later.** 10–15 minutes before the first NBA tipoff of the day, through a messenger such as Telegram. After that tipoff, same-day adds are treated as closed. No mobile app notification.

**Surfaces, later.** The existing pickups API and the current Waivers and Matchup injury panels remain the place a display spec will attach. This selection function is what those panels will eventually call.
