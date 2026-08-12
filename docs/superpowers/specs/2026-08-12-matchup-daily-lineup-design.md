# Matchup Daily Lineup — Design Spec (Phase 1)

**Date:** 2026-08-12  
**Status:** Approved for implementation planning  
**Product:** Day-by-day active-slot lineups on Matchup Advisor with live H2H board updates  
**Related:** [Matchup Advisor](./2026-08-12-matchup-advisor-design.md)

---

## 1. Goal

Let the manager set **who starts in each active slot for each day** of the scoring period, persist the choice in **localStorage**, and see the **H2H category board** update immediately from those day-lineups.

### Success criteria

- Day tabs for `schedule.matchup.days`
- Per day: dropdowns for active slots (`PG`…`UTIL`) choosing from YOUR roster
- Board recomputes client-side from effective games (days the player is in the active lineup and has an NBA game)
- Opponent totals unchanged (weekly active-10 model)
- Persist under `matchup-days:{leagueId}`; reset restores weekly active lineup clone
- Unit tests for effective-games aggregation + a UI smoke for day select → board change

### Non-goals (Phase 1)

- Server persistence / ESPN writeback
- Opponent day-by-day lineups
- Coupling Sit/Start Apply or streamers to daily state
- **Phase 2 (deferred):** opponent-tendency + B2B-aware FA/waiver recommendations

---

## 2. State

```ts
type DailyLineups = Record<string /* ISO date */, SeasonRosterEntry[]>
// each value: length 10, ACTIVE_SEASON_SLOTS only
```

| Key | Value |
|---|---|
| `matchup-days:{leagueId}` | JSON `DailyLineups` |

**Initialize:** for each day in `scoringPeriod.days`, copy current YOU active entries (after `localLineupJson` overlay from league load).

**Mutate:** changing a slot on day `D` updates `DailyLineups[D]` only; if the chosen `playerId` already occupies another slot that day, clear the previous slot (`playerId: null`) or swap — **MVP: clear previous slot**.

---

## 3. Projection math

For YOU player `P`:

```
effectiveGames(P) = count of days D where
  P has an NBA game on D (teamAbbr match) AND
  P appears in DailyLineups[D] active entries
```

Then `weeklyPlayerStats(P, effectiveGames)` → `activeTeamWeeklyTotals` from the **union of players who appear any day** is wrong — instead sum per-player weekly stats using each player’s `effectiveGames`, including players only used some days (even if not in “weekly” active set).

**Implementation approach:** build a synthetic active total by:

1. Collect all playerIds that appear in any day’s lineup  
2. For each, add `weeklyPlayerStats(player, effectiveGames(player))`  
3. Recompute FG%/FT% from summed shooting  

Opp: existing `gamesThisWeekByPlayerId` × opp active entries (no daily overrides).

`buildMatchupBoard(youTotals, oppTotals, enabledCategoryIds)`.

---

## 4. UI

**Placement:** below `MatchupBoard`, above Sit/Start.

**Components (planned):**

| Path | Role |
|---|---|
| `src/components/matchup/DailyLineupPanel.tsx` | Day tabs + slot selects + reset |
| `src/lib/matchup/dailyLineups.ts` | init / persist / effectiveGames / youTotalsFromDaily |
| Extend `MatchupWorkspace.tsx` | Hold daily state; pass recomputed board to `MatchupBoard` |

**Select options:** all YOU rostered players; option label includes name, teamAbbr, and day opponent label or `no game`. Empty option allowed.

**Accessibility:** day tabs as `role="tablist"`; each select `aria-label="{slot} for {day}"`.

---

## 5. Data loading

`MatchupWorkspace` already loads league + matchup advice. Additionally load schedule fixture (reuse `GET /api/schedule?seasonLeagueId=` or include `schedule` on GET matchup response). Prefer **include `schedule` on GET `/api/matchup`** to avoid a second round-trip (small additive change).

---

## 6. Testing

| Layer | Cases |
|---|---|
| Unit | `effectiveGames` counts only started+gamed days; sitting a 2-game player drops PTS; duplicate player cleared from other slot |
| UI | Change Monday PG → board wins/losses or projectedCatWins changes (mock schedule + players) |

---

## 7. Phase 2 note (not in this plan)

Enhance streamers with opponent weak categories + schedule stress (B2B, game volume). Depends on daily board being trustworthy first.
