# Recommendation page

**Date:** 2026-10-15  
**Status:** Pending review of this file  
**Product:** Show breakout, injury-replacement, and season-need adds on the waivers page, and add or drop from that page.  
**Related:** [Breakout selection](./2026-10-15-breakout-selection-design.md), [Injury replacement selection](./2026-10-15-injury-replacement-selection-design.md)

The waivers address stays the recommendation page. The home link keeps the word Waivers.

---

## 1. Goal

On a season league's waivers page, show three recommendation lists and keep the short-horizon stream and the full available pool. Choosing any player fills the existing add/drop builder.

### Success criteria

- The page lists breakouts, injury replacements, and season needs, in that order.
- The matchup stream and the available pool stay on the page, below those lists.
- A click in any list selects that player as the add. The builder is the one the waivers page already uses.
- A failed breakout request leaves the injury list and the season-needs list on screen.
- The home link still says Waivers. The path stays `/waivers`.

### Out of scope

- Changing `selectBreakouts` or `selectInjuryReplacements`.
- A new top-level path.
- Renaming the home link.
- Sorting, category filters, or a second score on a breakout row.
- Alerts, auto-claim, and the injury minutes model.

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Address | `/waivers` and `/waivers/[id]` |
| Home link | The visible word stays Waivers |
| Lists, top to bottom | Breakouts, injury replacements, season needs, matchup stream, available pool |
| Weak categories | The existing panel stays above the lists |
| Add/drop | The existing builder, on the right. One selected add at a time |
| Removed duplicates | Injury pickups and season needs are not shown a second time elsewhere on the page |
| Breakout row | Player name, plus `rates`, `lineup`, or both. No minutes or category numbers |
| Injury row | The current injury-pickup row |
| Season-needs row | The current recommended-pickup row: name, FA or Waiver, first reason |
| Breakout data | A new GET route. Injury and season needs keep their current loaders |
| Names | The page joins breakout ids to the season player pool. An id with no pool player is omitted |
| One failure | Each list loads on its own. One error does not clear the others |

---

## 3. Page

`WaiversWorkspace` is the recommendation workspace. It does not gain a second route.

Left column:

1. **Breakouts.** Heading "Breakouts". Empty copy: "No breakouts right now."
2. **Injury replacements.** The current injury panel, moved up with the other recommendations.
3. **Season needs.** The current season-needs block.
4. **Matchup stream.** Unchanged, and not mixed into the three lists.
5. **Available pool.** Unchanged.

Right column: the current add/drop builder and the stream delta. A breakout, an injury add, a season-need add, or a pool player calls `onSelectAdd`. A stream row keeps today's `onSelectPair`, which sets the add and the drop together.

The index page at `/waivers` still asks the user to choose a season roster. Its description names breakouts, injury replacements, and season needs.

---

## 4. Breakout route

`GET /api/injuries/breakouts?seasonLeagueId=`

Auth and league lookup match `GET /api/injuries/pickups`: 401 without a user, 400 without `seasonLeagueId`, 404 when the league is not owned, 500 when the saved state is invalid.

The route calls `selectBreakouts`. It does not reimplement the rules.

Inputs:

- `availablePlayerIds` from the saved league.
- Lineups, depth, updates, and the crosswalk from `loadInjurySelectionInputs`.
- Stat lines from ESPN `kona_player_info` rows passed through `readBreakoutStatLines`. The route does not read `SeasonPlayer.projections`, `seasonRates`, or `recentRates`. Those fields have no minutes, and `projections` is not the ESPN projection row.

ESPN stat rows use their own server cache, with a 6-hour TTL. This cache is not one of the RotoWire input TTLs. A failed fetch keeps the previous snapshot. No snapshot means the breakout list is empty and the route still returns 200.

Response:

```ts
type BreakoutRecommendation = {
  playerId: string
  reasons: Array<"rates" | "lineup">
}

type BreakoutRecommendationsResult = {
  recommendations: BreakoutRecommendation[]
  source: "espn" | "empty"
}
```

`source` is `"espn"` when a stat snapshot was used, including a previous snapshot after a failed refresh. It is `"empty"` when no snapshot exists. The page supplies the name from the league pool.

---

## 5. Errors

- Breakout HTTP 401, 400, 404, or 500: the Breakouts section shows the error. Injury replacements and season needs still render.
- Breakout HTTP 200 with `source: "empty"`: the section shows "No breakouts right now."
- Injury and season-needs failures keep today's copy and do not clear Breakouts.

---

## 6. Tests

- The breakout route returns a `rates` row and a `lineup` row from fixture inputs, and omits a player whose latest status is `out`.
- The workspace shows the three recommendation headings. Clicking a breakout row sets that id as the add.
- A rejected breakout request leaves the injury and season-needs sections rendered.
- The workspace no longer has a second injury block or a second season-needs block. The stream and the available pool remain.

---

## 7. Why the lists stay as they are

Waiver adds that became real producers over 2021-22 through 2025-26 were role changes: a new start or a star's minutes opening. Dyson Daniels (2024-25) and Nickeil Alexander-Walker (2025-26) fit that, as did Josh Hart, Quentin Grimes, and Cameron Payne in earlier seasons. A good bench rate without a new role did not. The existing breakout and injury selectors already mark that moment. This page shows them. It does not add a new rule.
