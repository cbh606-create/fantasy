# Trade vacancy pickups

**Date:** 2026-10-15
**Status:** Pending review of this file
**Product:** When a trade is reported, recommend one available replacement for the team that lost the player. Show that row on the existing Injury pickups list.
**Related:** [Injury replacement selection](./2026-10-15-injury-replacement-selection-design.md)

---

## 1. Goal

Injury pickups already recommend a replacement when a player becomes OUT or GTD. That path stays. A completed trade is a second way a rotation spot opens, and it must produce a recommendation as soon as RotoWire publishes the news.

### Success criteria

- A new OUT or GTD in the last 24 hours still produces the same replacement as today. A missing return date does not delay or drop that row.
- A completed trade in the last 24 hours produces one replacement for the team the player left, or no row when this spec says to skip it.
- Both kinds of row appear in the same Injury pickups list. One-game and long-term OUT rows are not labeled differently.
- Unit tests cover the cases in section 7.

### Out of scope

- Waiting for `ReturnDate` before recommending an injury replacement.
- Keeping a season-long list of players who are still out.
- Inferring a trade by comparing this year's team with last year's team.
- A separate messenger or push alert.
- Changing breakout selection.
- Changing how the injury replacement is chosen once an OUT or GTD qualifies.

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Injury trigger | Unchanged. Latest OUT or GTD update in the last 24 hours |
| Return date | Not read. Not a gate |
| Long-term label | None. OUT and GTD stay `OUT` and `GTD` |
| Trade source | RotoWire NBA news, server-side |
| Trade trigger | Headline reports a completed trade. Notes only name the teams |
| Vacancy | The team the player left |
| Replacement | Same lineup, then depth-chart, rule as injuries |
| Window | News `DateTime` in the last 24 hours |
| List | Same Injury pickups list. Trade rows show `TRADED` |
| Rows | One per trade. An injury row and a trade row for the same add both stay |

---

## 3. Inputs

The selector does not call RotoWire. The existing injury cache also loads news and passes it in.

| Input | Refresh when stale | Used for |
|---|---|---|
| News | 5 minutes on a day with NBA games, otherwise 30 minutes | Completed trades |
| Depth chart | Unchanged | The vacated position and the backup order |
| Lineups | Unchanged | Confirmed starter after the player is gone |
| Player list | Unchanged | RotoWire id to ESPN id |

Request `GET /Basketball/get-nba-news.php` with `format=json`, `hours=24`, and `with_analysis=0`. The API key stays in `ROTOWIRE_API_KEY`.

If the news refresh fails, keep the previous news cache. If news has never loaded, the selector receives an empty news list and still returns injury rows. A missing API key does not fetch, matching the injury cache.

### News item kept by the parser

```ts
type TradeNewsItem = {
  rotowirePlayerId: string
  teamAbbr: string
  headline: string
  notes: string
  position: string
  at: string
}
```

`teamAbbr` is the news item's `Team.Code`. `position` is `Player.Position` with surrounding whitespace removed. `Analysis` is discarded.

---

## 4. What counts as a completed trade

The completed-trade check reads Headline only. Notes are used only to name the teams. The check is case-insensitive.

A completed headline contains one of:

- `traded to`
- `traded from`
- `has been traded`
- `was traded`
- `in exchange for`

It is not a completed trade when the Headline contains any of:

- `rumor`
- `rumour`
- `talks`
- `unlikely`
- `could be traded`
- `may be traded`
- `trade candidate`
- `on the trade block`
- `trade interest`

If one player has more than one news item in the 24-hour window, keep the latest `DateTime`. If that item is not a completed trade, drop the player.

### Team the player left

Team phrases match a fixed table of the 30 NBA teams. Each entry has the RotoWire code, the city name, and the nickname, then passes through the existing alias table (`PHO` = `PHX`, and the other aliases already used by the injury crosswalk). A phrase that matches two teams is ignored.

1. `traded to` followed by a city, nickname, or code names the destination.
2. If the player is still listed on exactly one depth-chart team, and that team is not the destination, that team is the vacancy.
3. Otherwise `traded from` followed by a city, nickname, or code names the vacancy, when that team is not the destination.
4. Otherwise the news `Team.Code` is the vacancy when it is not the destination.
5. If the vacancy is still unknown, skip the item.

### Replacement

Player ids in the result are ESPN ids. Skip the item when the traded RotoWire id is not in the crosswalk.

When the traded player is still on the vacated team's depth chart, choose the replacement with the existing injury rule. A confirmed lineup for that team's next game that has not tipped off wins when the traded player is not in it and exactly one available starter matches the position. Otherwise walk the depth chart after the traded player. The first mapped id in `availablePlayerIds` is the add.

When the traded player is already off that depth chart, use the news position only when it is exactly one of `PG`, `SG`, `SF`, `PF`, or `C`. The add is the first mapped available player on that position list, starting at rank 1. `G`, `F`, `G/F`, and `F/C` produce no row.

`source` is `"lineup"` or `"depth"`, same as injuries. The route adds the reason `Trade`.

```ts
type InjuryReplacement = {
  injuredPlayerId: string
  status: "out" | "gtd" | "traded"
  addPlayerId: string
  source: "lineup" | "depth"
}
```

A trade row uses `status: "traded"`. The list label is `TRADED`. The departed player is stored in `injuredPlayerId` so the existing row shape can render `{name} (TRADED) → {add}`.

---

## 5. Boundaries

- An OUT with no return date still produces an injury row.
- A headline that only says a player is OUT does not also produce a trade row.
- A rumor, or a denial, produces no trade row.
- The same available player replacing two traded teammates produces two rows.
- An injury row and a trade row that name the same add both stay.
- An unmapped player, on either side of the pick, cannot be chosen.
- A trade older than 24 hours produces no row.
- News that names no vacated team produces no row.
- A traded player already removed from the depth chart, with a combined position such as `G/F`, produces no row.

---

## 6. Failure

| Condition | Result |
|---|---|
| News refresh fails and a cache exists | Select from the cached news |
| News has never loaded | Injury rows only |
| RotoWire key missing | Do not fetch. Previous cache, or empty |
| Crosswalk miss, unknown vacated team, or no available backup | No trade row |

---

## 7. Tests

Test the pure function with in-memory news, depth, lineups, and the crosswalk. No network.

- `traded to the Lakers` while the player is still on the BOS depth chart selects the next available BOS player.
- That player is already off the BOS chart, position `PG`, selects the first available BOS PG.
- Position `G/F` and the player is off the chart produces no row.
- `could be traded` produces no row.
- Latest item is a rumor after an earlier completed trade produces no row.
- News older than 24 hours produces no row.
- Unmapped traded player produces no row.
- Two trades selecting the same available player produce two rows.
- An OUT update and a trade for different players both appear.
- An OUT update with no return date still appears.
