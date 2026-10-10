# Waivers Matchup Stream — Design Spec

**Date:** 2026-08-18  
**Status:** Approved for implementation planning  
**Product:** Short-horizon add/drop recommendations on Waivers, scored for the current H2H matchup window  
**Related:** [Waivers](./2026-08-12-waivers-module-design.md), [Matchup Advisor](./2026-08-12-matchup-advisor-design.md), [Matchup Daily Lineup](./2026-08-12-matchup-daily-lineup-design.md)

---

## 1. Goal

Help a category-league manager on **Waivers** decide **whom to add for the next N days (default: full matchup week)** and **whom to drop**, with ranked **add→drop pairs**, short add/drop summaries, and a **live matchup-result delta** as the selected add (or drop) changes — then preview/claim with existing waiver flows.

This closes the follow-up from the Waivers MVP (“streaming schedule-aware FA value”) and reconnects Matchup streamer hints to an actionable claim surface.

### Success criteria (MVP)

- Waivers workspace gains a **Matchup stream** panel (above or beside season-long Recommended Pickups).
- Horizon: **full fixture `matchup.days` by default**, with controls to narrow to **next 2 / 3 / 4 days** (prefix of `matchup.days`).
- Opponent: optional team index; **with opponent → matchup cat W/L/T scoring**; **without → volume + weak-cat fallback** (labeled).
- Main list: top **add→drop pairs** (drop may be `null` if YOU have an empty roster slot).
- Side/secondary: **top adds** and **top drops** summaries on the same score axis.
- Selecting a pair (or changing add/drop in the builder) shows **before → after matchup snapshot** for the same window (cat deltas + one-line summary when opponent is set).
- Pair / builder selection prefills existing Add/Drop builder; Preview / Claim / assume-success unchanged.
- Season-long `recommendPickups` remains; Matchup stream is clearly labeled as short-horizon.
- Unit + API + UI tests; no ESPN writeback.

### Non-goals (MVP)

- ESPN claim / FA writeback.
- FAAB, multi-claim queue, processing clocks.
- Optimizing opponent lineup or multi-week streaming plans.
- Full combinatorial search over all FA × all rostered players (use candidate caps).
- Replacing Matchup Advisor board or daily lineup toggles.
- Injury / news feeds; live schedule import (fixture schedule only).

---

## 2. Product decisions

| Decision | Choice |
|---|---|
| Placement | **Waivers** workspace panel (not a new nav tab) |
| Horizon default | Full current `matchup.days` |
| Horizon narrow | Next **2 / 3 / 4** days = first N entries of `matchup.days` |
| Output shape | **Pairs primary** + top-adds / top-drops summaries |
| Scoring with opponent | Projected **category wins delta** (reuse matchup board helpers) |
| Scoring without opponent | Window **games volume** + YOU **weak-cat** lift (streamer-style); UI label “Volume / needs — pick an opponent for H2H deltas” |
| Empty slot | Allow **add-only** pairs (`dropPlayerId: null`) |
| Live delta | When add or drop selection changes, show matchup **before/after** for the active window + opponent mode |
| Claim path | Existing `/api/waivers/preview` + `/api/waivers/claim` |
| Season recs | Keep existing Recommended Pickups (season needs) |

---

## 3. Architecture

### Layers

| Layer | Location | Role |
|---|---|---|
| Domain | `src/lib/waivers/matchupStream.ts` (new) | Window days, candidate caps, pair search, volume fallback scoring |
| Matchup reuse | `src/lib/matchup/*` | `gamesThisWeek`-style counts on filtered days, `weeklyPlayerStats`, board / cat W-L-T helpers |
| Schedule | Existing fixture via matchup/schedule loaders | `ScheduleResponse.matchup.days` + `games` |
| API list | `GET /api/waivers/matchup-stream` | Ranked pairs + summaries |
| API live delta | `POST /api/waivers/matchup-stream/preview` (or extend waivers preview with matchup fields) | Before/after for one add/drop + window |
| UI | `MatchupStreamPanel` + wire into `WaiversWorkspace` / `AddDropBuilder` | Controls, lists, live delta, prefill |

### Data flow

```
SeasonLeague + Schedule fixture
  → slice windowDays (full | first N)
  → candidate adds (available, gamesInWindow ≥ 1) / drops (YOU filled slots)
  → score pairs (matchup mode | volume mode)
  → GET matchup-stream → MatchupStreamPanel
  → user picks pair or edits builder
  → POST matchup-stream preview → live before/after
  → existing preview/claim for persistence
```

---

## 4. Scoring

### Window contribution

- `gamesInWindow(player)` = distinct dates in `windowDays` where `player.teamAbbr` has a game in `schedule.games`.
- Scale season projections like matchup: `(season / ASSUMED_SEASON_GAMES) × gamesInWindow` (FG%/FT% via scaled makes/attempts then ratio, same as matchup).

### Matchup mode (opponent selected)

1. Build YOU weekly totals for the window from **active lineup slots** after hypothetical add/drop (same active-slot rules as Matchup: `PG`…`UTIL`; if add lands in BE only, document: prefer treating add as replacing dropped active contribution, or as BE with zero H2H until sit/start — **MVP: model add as replacing the dropped player’s window contribution**; add-only into empty active slot counts add’s full window contribution).
2. Opponent totals unchanged (current active 10).
3. Per-category W/L/T before vs after.
4. Pair `score` = **Δ expected category wins** (or Δ raw cat wins if expectancy helper is heavy — prefer same sigmoid expectancy as Matchup when cheap). Tie-break: higher `addGames`, then need-cat lift.
5. Hide or deprioritize pairs with `score ≤ 0`.

### Volume mode (no opponent)

- `score` ≈ add window contribution in YOU need cats − drop window contribution (TO inverted as elsewhere).
- No cat W/L board; live “delta” shows volume/needs lines only.

### Candidate caps (MVP)

| Set | Cap | Heuristic |
|---|---|---|
| Adds | ~40 | `gamesInWindow ≥ 1`, sort by volume / need lift |
| Drops | ~12 | Low `gamesInWindow` or weak alignment with needs |
| Pairs returned | ~8 | Best scores |
| Top adds / drops | ~5 each | Marginal score on same axis |

---

## 5. API

### `GET /api/waivers/matchup-stream`

**Query**

| Param | Required | Notes |
|---|---|---|
| `seasonLeagueId` | yes | Owned league |
| `opponentTeamIndex` | no | If missing/invalid → volume mode (invalid → 400 **or** volume + warning; prefer **volume + `mode: "volume"`** and ignore bad index with message) |
| `dayCount` | no | `2 \| 3 \| 4`; omit = full week. If `dayCount > days.length`, use all days |

**Response (shape)**

```ts
{
  mode: "matchup" | "volume"
  windowDays: string[]
  opponentTeamIndex: number | null
  pairs: Array<{
    addPlayerId: string
    dropPlayerId: string | null
    addGames: number
    dropGames: number
    score: number
    deltaCatWins?: number
    reasons: string[]
  }>
  topAdds: Array<{ playerId: string; games: number; score: number; reasons: string[] }>
  topDrops: Array<{ playerId: string; games: number; score: number; reasons: string[] }>
}
```

Auth/ownership: same as other waivers routes (`loadOwnedSeasonLeague`).

### `POST /api/waivers/matchup-stream/preview`

**Body:** `{ seasonLeagueId, addPlayerId, dropPlayerId: string | null, opponentTeamIndex?: number, dayCount?: number }`

**Response:**

```ts
{
  mode: "matchup" | "volume"
  windowDays: string[]
  before: { catWins: number; catLosses: number; catTies: number; categories: ... }
  after: { ... }
  summary: string  // e.g. "Cats +2 (AST, REB)" or volume-mode text
}
```

Debounced from the client when add/drop changes (~200–300ms). Validation errors mirror waivers preview (`add_not_available`, `drop_not_on_roster`, etc.).

**Alternative allowed in plan:** extend `POST /api/waivers/preview` with optional matchup fields instead of a second route — pick one in the implementation plan; prefer a dedicated route to avoid breaking season needsScore preview consumers.

---

## 6. UI

### Matchup stream panel (`MatchupStreamPanel`)

1. Title + short blurb: short-horizon streaming vs season pickups.
2. Controls: opponent `<select>` (teams except YOU; “No opponent”) · day chips: Full week · 2 · 3 · 4.
3. **Pairs** list (primary): add name, drop name or “Empty slot”, games, score/Δ, reasons; click → prefill builder.
4. **Top adds / Top drops** compact lists; click add or drop updates builder selection and triggers live preview.
5. Empty states: no schedule; no positive pairs; still loading.

### Live matchup delta (builder-adjacent)

- Shown whenever add is set (drop optional if empty slot).
- Matchup mode: compact before→after cat row or W-L-T summary + `summary` string.
- Volume mode: games gained/lost + need-cat note.
- Loading / error inline; does not block claim.

### Existing panels

- Season **Recommended Pickups** unchanged.
- Available pool + Add/Drop builder + assume modal unchanged aside from prefill + delta strip.

---

## 7. Errors & edge cases

| Case | Behavior |
|---|---|
| No schedule fixture | Panel empty state; no crash |
| `dayCount` omitted | Full `matchup.days` |
| Opponent = YOU index | Treat as no opponent (volume) |
| Add not available / drop not on roster | Preview API error; UI message |
| All pairs score ≤ 0 | Empty pairs + hint to widen days or change opponent |
| Waiver rank > 1 | Claim still uses assume-success gate |
| Abort / slow preview | Ignore stale responses (request id / abort controller) |

---

## 8. Testing

- **Unit:** day slicing; gamesInWindow; pair ranking with opponent (positive Δ rises); volume mode ordering; add-only empty slot; score ≤ 0 filtered.
- **API:** auth 401; happy path shape; preview validation errors.
- **UI:** pair click prefills builder; changing add refetches live delta; opponent/dayCount change refetches list.

---

## 9. Implementation sequencing (hint)

1. Domain `matchupStream` + unit tests (window, scoring, caps).
2. GET list API + thin UI panel (pairs + controls).
3. POST live preview + builder delta strip.
4. Prefill + claim path smoke; polish empty states.

---

## 10. Open decisions resolved in this spec

| Topic | Resolution |
|---|---|
| Horizon | Full week default + 2/3/4 day prefix |
| Output | Pairs + summaries |
| Opponent | Optional; matchup vs volume modes |
| Live delta on add change | Required (dedicated preview) |
| Module home | Waivers panel |
