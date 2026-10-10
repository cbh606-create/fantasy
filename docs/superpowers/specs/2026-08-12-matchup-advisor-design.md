# Matchup Advisor — Design Spec

**Date:** 2026-08-12  
**Status:** Approved for implementation planning  
**Product:** Core weekly head-to-head matchup advisor for category leagues (separate from Roster, Trade, Waivers, Draft)  
**Related:** [Season Roster](./2026-08-11-season-roster-module-design.md), [Roster Schedule Tab](./2026-08-11-roster-schedule-tab-design.md), [Trade](./2026-08-11-trade-module-design.md), [Waivers](./2026-08-12-waivers-module-design.md)

---

## 1. Goal

Help a category-league manager open the app, pick this week’s H2H opponent, see **projected category W/L/T**, get **Sit/Start** swaps they can apply locally, and see **streamer** hints that deep-link into Waivers — all on one board-first screen.

This is the **core product surface**: navigation and home CTAs treat Matchup as primary among season tools.

### Success criteria (MVP)

- Dedicated **Matchup** surface: `/matchup` + `/matchup/[seasonLeagueId]`.
- Reuses existing `SeasonLeague` (same IDs as Roster / Trade / Waivers).
- Manual **opponent team** selection (persist in UI session; optional local preference later).
- **Active lineup only** (slots `PG`…`UTIL`, 10 slots). `BE` / `IL` excluded from H2H totals.
- Weekly projections: `(seasonTotal / ASSUMED_SEASON_GAMES) × gamesThisWeek` using the existing NBA matchup schedule fixture; FG%/FT% via scaled makes/attempts then ratio.
- H2H board: per-category **W / L / T**, summary score, and projected category-win expectancy (sigmoid on YOU−opponent weekly deltas).
- **Sit/Start**: greedy Top K single swaps (BE ↑ / active ↓), scored by expected category-win improvement; **Apply** writes `localLineupJson` (no ESPN writeback).
- **Streamers**: Top N from `availablePlayerIds` favoring high `gamesThisWeek` and categories YOU are losing/tying; CTA deep-links to Waivers (preview/claim reuse).
- SiteNav places Matchup ahead of other season tools; home CTA prioritizes Matchup.
- Unit + API + UI smoke tests; no draft imports; no ESPN lineup/pairing writeback.

### Non-goals (MVP)

- ESPN live H2H pairing import (planned follow-up: replace manual opponent select).
- ESPN lineup writeback.
- Full combinatorial / ILP lineup optimizer.
- Opponent bench optimization (opponent uses their current active 10 only).
- Strict NBA position eligibility beyond existing season slots (season players have no `positions` field).
- Injury / rest / news feeds.
- Multi-week history, standings, or playoff projector.
- Duplicating full Waivers claim UI inside Matchup.

---

## 2. Why a separate module

| Concern | Roster | Schedule tab | Trade | Waivers | **Matchup** |
|---|---|---|---|---|---|
| Primary job | Season ranks / edit lineup | YOUR NBA games | Win-win trades | Add/drop pool | **Win this week’s H2H** |
| Opponent | League matrix (all) | None (NBA only) | Counterparty package | N/A | **Selected H2H team** |
| Time scope | Season totals | Current period games | Season ranks | Season needs | **This scoring period** |
| Actions | Local lineup | View | Suggestions | Local claim | **Local sit/start + streamer link** |

Matchup **consumes** roster state, schedule joins, analysis/needs ideas, and waivers pool — it does not replace those modules.

---

## 3. Architecture

### Layers

| Layer | Location | Role |
|---|---|---|
| State | `SeasonLeagueState` + schedule fixture | Rosters, projections, NBA week |
| Engine | `src/lib/matchup/*` | Pure: weekly scale, board, sit/start, streamers |
| API | `/api/matchup/*` | Auth, owner load, DTO, apply lineup |
| UI | `/matchup`, `src/components/matchup/*` | Board-first workspace |
| Persist | `SeasonLeague.localLineupJson` | Sit/Start apply only |

**Domain rule:** Season only. No imports from draft sim/board/mock.

### Data flow

1. Load league → `applyLocalLineup` → `normalizeSeasonAvailability` (same helper pattern as Trade/Waivers).
2. Client supplies `opponentTeamIndex` (≠ perspective, in range).
3. Join schedule → `gamesThisWeek` per player (`teamAbbr` missing → **0** games).
4. Build weekly totals for YOU and opponent **active 10**.
5. Compare → W/L/T + expectancy; generate sit/start + streamers.
6. Apply sit/start → update `localLineupJson`; streamers → Waivers routes.

### Constants (explicit)

| Name | MVP value | Notes |
|---|---|---|
| `ASSUMED_SEASON_GAMES` | `82` | Per-game rate divisor for counting / shooting volume |
| `MAX_SIT_START` | `5` | Greedy swap recommendations |
| `MAX_STREAMERS` | `8` | Available-pool recommendations |
| `MIN_STREAMER_GAMES` | `2` | Prefer ≥ this many games this week |
| Active slots | `PG, SG, SF, PF, C, G, F, UTIL, UTIL, UTIL` | From `SEASON_ROSTER_SLOTS` prefix |

---

## 4. Engine

### 4.1 Weekly projection

For each player with `gamesThisWeek = g`:

- Counting cats (`TPM, REB, AST, STL, BLK, TO, PTS`):  
  `weekly = (seasonProjection / ASSUMED_SEASON_GAMES) * g`
- Shooting: scale `FGM, FGA, FTM, FTA` the same way;  
  `FG% = FGM/FGA` (0 if FGA=0), `FT%` likewise.
- Team weekly total for a side = sum over **active** entries’ weekly stats (empty slot contributes 0).

### 4.2 H2H board

For each enabled category:

- Compare YOU weekly vs opponent weekly (TO: lower wins).
- Outcome: `W` | `L` | `T` (exact tie → `T`).
- Expectancy: map signed weekly delta through a sigmoid (adapt draft `categoryWinExpectancies` idea to **pairwise delta**, not league-mean). Persist the scale constant in `src/lib/matchup/constants.ts`.
- Summary: counts of W/L/T + sum of expectancies as `projectedCatWins`.

Opponent side uses that team’s **current** active 10 only (no opponent sit/start in MVP).

### 4.3 Sit/Start (greedy)

1. Enumerate single swaps: each filled `BE` player with each filled active slot (or empty active if any).
2. Score = Δ `projectedCatWins` after swap (primary); tie-break: more games on the promoted player, then player id.
3. Return Top `MAX_SIT_START` improving swaps (`delta > 0`). If none improve, return empty list (UI: “Lineup looks solid”).
4. **Apply:** rewrite perspective team entries for the chosen swap into `localLineup` shape used by Roster; save `localLineupJson`; clear nothing else required (roster IDs unchanged — only slot placement).

Slot legality MVP: only swap between `BE` and an active slot index; do not invent position checks.

### 4.4 Streamers

1. Candidates = `availablePlayerIds` with `gamesThisWeek >= MIN_STREAMER_GAMES` (if fewer than N qualify, relax to `>= 1`).
2. Score with categories where board outcome is `L` or `T` (and/or existing `teamNeedsAndSurplus` needs), using weekly per-game contribution × games.
3. Top `MAX_STREAMERS` with short reasons (`Helps STL · 3 games`).
4. UI links to `/waivers/[id]` with query `?addPlayerId=` when feasible; claim stays on Waivers APIs.

---

## 5. UI

### Layout (Board-first stack) — approved

Top → bottom on `/matchup/[id]`:

1. Header + opponent `<select>` (all teams except YOU).
2. **Hero board:** YOU–Opp–Tie summary + 9-cat W/L/T (and optional expectancy %).
3. **Sit/Start** list + Apply per row (or apply selected).
4. **Streamers** list → Waivers deep-link.

`/matchup` mirrors Trade/Waivers league picker.

### Nav / home

- `SiteNav`: Matchup link; active via `pathname.startsWith("/matchup")`; place as first season destination after Home (before Draft or immediately after Home — **implementation: Home, Matchup, Draft, Roster, Trade, Waivers**).
- Home page: primary CTA opens Matchup (league list or last league if only one).

### Visual language

Match existing season Tailwind / density patterns (Trade/Waivers/Roster). No new design system. Avoid dashboard clutter: one composition, board is the hero.

---

## 6. API

### Load helper

Shared `loadOwnedSeasonLeague` pattern (auth → owner → parse → `applyLocalLineup` → `normalizeSeasonAvailability`). Prefer extending or reusing the waivers loader if it stays generic; otherwise a thin `src/lib/matchup/loadSeasonLeague.ts`.

### Endpoints

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/matchup` | `seasonLeagueId`, `opponentTeamIndex` | `{ opponentTeamIndex, youWaiverContext?, board, sitStart, streamers, playersById subset, scoringPeriod }` |
| POST | `/api/matchup/apply-lineup` | `{ seasonLeagueId, swap: { benchPlayerId, activePlayerId } }` | `{ ok: true }` or error |

**Errors**

| Code | When |
|---|---|
| 401 | Unauthenticated |
| 404 | League not found / not owned |
| 400 | Missing/invalid opponent; invalid swap payload |
| 409 | `stale_lineup` — swap players not in expected slots |
| 429 | Rate limit on apply (10/min/user) |

GET may omit rate limit if cheap; apply must rate-limit.

---

## 7. Persistence & future ESPN pairing

| Concern | MVP | Later |
|---|---|---|
| Opponent | Query/UI select each visit (may remember in `localStorage` key per league id) | ESPN H2H schedule → `opponentTeamIndex` for `scoringPeriodId` |
| Lineup | `localLineupJson` | Optional ESPN writeback |
| Schedule | Fixture `nba-matchup-schedule.json` | Live scoring-period sync |

Do **not** block MVP on ESPN pairing. Keep opponent as an explicit input to the engine so C can replace the source without changing board math.

---

## 8. Testing

| Layer | Cases |
|---|---|
| Unit | Weekly scale; active-only totals; W/L/T incl. TO invert; expectancy monotonic in delta; sit/start picks improving swap; streamer prefers weak-cat + games |
| API | 401; 404; 400 bad opponent; GET board shape; apply updates `localLineupJson`; 409 stale swap |
| UI | Opponent select renders board; sit/start section appears when recommendations exist |

---

## 9. File map (planned)

| Path | Purpose |
|---|---|
| `src/lib/matchup/constants.ts` | Caps, assumed games, sigmoid scale |
| `src/lib/matchup/types.ts` | Board / sit-start / streamer DTOs |
| `src/lib/matchup/weekly.ts` | Per-player weekly projection |
| `src/lib/matchup/board.ts` | H2H W/L/T + expectancy |
| `src/lib/matchup/sitStart.ts` | Greedy swaps |
| `src/lib/matchup/streamers.ts` | FA/waiver recommendations |
| `src/lib/matchup/advise.ts` | Orchestrate board + actions |
| `src/app/api/matchup/route.ts` | GET |
| `src/app/api/matchup/apply-lineup/route.ts` | POST |
| `src/components/matchup/*` | Workspace, board, sit/start, streamers |
| `src/app/matchup/page.tsx`, `[id]/page.tsx` | Routes |
| `src/components/SiteNav.tsx`, `src/app/page.tsx` | Nav + home primacy |
| `tests/unit/matchup*.test.ts`, `tests/api/matchup.test.ts`, UI smoke | Coverage |

---

## 10. Spec self-review notes

- No TBD placeholders; ASSUMED_SEASON_GAMES and caps are fixed for MVP.
- Opponent source is explicitly manual now / ESPN later without engine rewrite.
- Active-only vs season-long Roster analysis difference is intentional and documented.
- Streamers do not reimplement claim; Waivers remain source of truth for transactions.
- Scope fits one implementation plan (engine → API → UI → nav/home → verify).
