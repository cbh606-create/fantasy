# Injury → Replacement Pickup — Design Spec

**Date:** 2026-08-18  
**Status:** Approved for implementation planning  
**Product:** Automatic FA/waiver pickup recommendations when an NBA player is injured, using depth-chart backup order (Trae Young OUT → Nickeil Alexander-Walker style)  
**Related:** [Waivers](./2026-08-12-waivers-module-design.md), [Matchup Advisor](./2026-08-12-matchup-advisor-design.md), [Waivers Matchup Stream](./2026-08-18-waivers-matchup-stream-design.md)

---

## 1. Goal

When a notable player is ruled **OUT** (or similar), recommend available **depth-chart backups** as pickups — especially when that backup is on FA/waiver — and surface the advice on **Matchup** (why it matters this week) and **Waivers** (claim path).

### Success criteria (Phase B — this MVP)

- Fixture **depth chart** + fixture **injury events** drive recommendations (no live scrape).
- Engine maps injured player → ordered same-team backups → filter to `availablePlayerIds`.
- Recommendations include score, reasons, depth rank, and **urgency**: `roster` (YOU own the injured player) vs `league` (league-wide event).
- **Matchup** shows Injury alerts (roster urgency first) with deep-link to Waivers `?addPlayerId=`.
- **Waivers** shows Injury pickups section; selecting a rec prefills Add/Drop builder (existing preview/claim).
- Demo fixture includes a Trae Young → Nickeil Alexander-Walker style case.
- Provider interfaces allow Phase A to swap injury source to ESPN status without rewriting UI.
- Unit + API + UI smoke tests.

### Non-goals (Phase B)

- Live scraping of RotoWire / ESPN depth charts (ToS / fragility).
- Push / email / SMS notifications.
- Auto-claim without user confirm.
- Full news feed or injury timeline UI.
- Phase A live ESPN injury ingestion (hook only; implement in a follow-up plan).
- Replacing Matchup stream or season needs recommenders.

### Phase A (follow-up, not this MVP)

- Replace fixture injury events with ESPN (or similar) player injury status (`OUT` / `GTD` / etc.).
- Keep fixture (or later licensed) depth chart until a stable depth API exists.
- Same recommendation engine and UI.

---

## 2. Product decisions

| Decision | Choice |
|---|---|
| Data path | **B then A**: fixture depth + fixture events first; ESPN injury later |
| Surfaces | **Matchup alerts + Waivers pickups** |
| Whose injuries | **League-wide** events; **highlight** when injured player is on YOU roster |
| Action | Deep-link / prefill existing Waivers claim — no auto-claim |
| Depth source (B) | Fixture JSON keyed by NBA `teamAbbr` |
| Injury source (B) | Fixture JSON events |
| Scoring extras | Depth rank primary; optional needs + games-this-week bonuses |

---

## 3. Architecture

### Layers

| Layer | Location | Role |
|---|---|---|
| Fixtures | `data/fixtures/nba-depth-chart.json`, `data/fixtures/injury-events.json` | Phase B data |
| Providers | `src/lib/injuries/providers.ts` (+ fixture impls) | `DepthChartProvider`, `InjuryEventProvider` |
| Domain | `src/lib/injuries/recommend.ts` | Map events → pickup recs |
| Types | `src/lib/injuries/types.ts` | DTOs |
| API | `GET /api/injuries/pickups` | Auth + owned season league + recs |
| Matchup UI | `InjuryAlertsPanel` in Matchup workspace | Alerts + Waivers CTA |
| Waivers UI | `InjuryPickupsPanel` in Waivers workspace | List + builder prefill |

### Data flow

```
InjuryEventProvider.list()
  + DepthChartProvider.backups(teamAbbr, injuredPlayerId)
  + SeasonLeagueState.availablePlayerIds / YOU roster
  + optional gamesMap / needs
  → recommendInjuryPickups(...)
  → GET /api/injuries/pickups
  → Matchup alerts + Waivers injury pickups
  → existing claim path
```

---

## 4. Data shapes

### Depth chart fixture (conceptual)

```ts
{
  teams: Array<{
    teamAbbr: string  // e.g. "ATL"
    slots: Array<{
      // Ordered most-to-least likely to absorb minutes for a given role/line
      // MVP: one primary ladder per team (or per position group if needed)
      playerIds: string[]  // season/fixture player ids aligned with SeasonLeague players
    }>
  }>
}
```

MVP may use **one ordered ladder per team** (simplest) as long as Trae → NAW ordering is correct in the demo. Position-group ladders are allowed if one ladder is too coarse.

### Injury events fixture

```ts
{
  events: Array<{
    playerId: string
    teamAbbr: string
    status: "out" | "gtd"
    note?: string  // e.g. "Right knee"
  }>
}
```

### Recommendation DTO

```ts
type InjuryPickupRecommendation = {
  injuredPlayerId: string
  injuredPlayerName: string
  addPlayerId: string
  addPlayerName: string
  teamAbbr: string
  status: "out" | "gtd"
  depthRank: number  // 1 = immediate backup
  urgency: "roster" | "league"
  score: number
  reasons: string[]
}
```

---

## 5. Scoring (Phase B)

For each injury event with status `out` (include `gtd` but lower weight):

1. Resolve depth backups after the injured player on that team (skip if injured not on chart — fall back: same-team available players by ADP/projections, labeled weaker).
2. Keep only ids in `state.availablePlayerIds`.
3. Base score: `max(0, DEPTH_BASE - (depthRank - 1) * DEPTH_STEP)`  
   - `out` full weight; `gtd` × `GTD_WEIGHT` (e.g. 0.5).
4. Bonuses (optional, capped): YOU need-cat lift; `gamesThisWeek` if schedule loaded.
5. `urgency = "roster"` if `injuredPlayerId` is on YOU’s roster entries; else `"league"`.
6. Sort: urgency roster first, then score desc. Cap top N (e.g. 10).

Reason examples:

- `ATL depth #2 behind Trae Young (OUT)`
- `On your roster — replace minutes`
- `Helps AST · 3 games this week`

---

## 6. API

### `GET /api/injuries/pickups`

**Query:** `seasonLeagueId` (required), `opponentTeamIndex` (optional — only if used for games/needs context)

**Auth:** `requireUserId` + `loadOwnedSeasonLeague` (same as waivers)

**Response:**

```ts
{
  events: InjuryEvent[]
  recommendations: InjuryPickupRecommendation[]
  source: { depth: "fixture"; injuries: "fixture" }
}
```

401 / 400 / 404 / 500 behavior mirrors waivers pool.

---

## 7. UI

### Matchup — `InjuryAlertsPanel`

- Place near streamers / above the fold of advice sidebar.
- List alerts: injured name + status · suggested add · urgency badge.
- Primary CTA → `/waivers/[seasonLeagueId]?addPlayerId=...`
- Empty: hide panel or short empty copy.

### Waivers — `InjuryPickupsPanel`

- Place above or beside Matchup stream / Season needs; clear label **Injury pickups**.
- Click row → `setSelectedAddId` (and clear drop / trigger preview as today).
- Do not auto-open assume modal.

### Copy

- Distinguish from **Season needs** and **Matchup stream** (short-horizon volume).
- Note Phase B: “Based on fixture depth chart & injury events” (or omit in prod UI; keep in empty/dev).

---

## 8. Errors & edge cases

| Case | Behavior |
|---|---|
| No events | Empty recommendations |
| Injured not in depth chart | Same-team FA fallback or skip with no crash |
| Backup not available | Try next depth ranks |
| Backup already on a roster | Not in `availablePlayerIds` → skip |
| Multiple injuries same team | Independent recs; dedupe addPlayerId keep higher score |
| YOU own backup already | Skip that add |

---

## 9. Testing

- **Unit:** Trae OUT + NAW available → NAW top (or present) with depth reason; NAW rostered → skipped; YOU own Trae → `urgency: "roster"`.
- **API:** 401 without auth; 200 shape with fixture league.
- **UI:** Matchup alert CTA href includes `addPlayerId`; Waivers panel click sets add selection.

---

## 10. Implementation sequencing (hint)

1. Types + fixture JSON + providers  
2. `recommendInjuryPickups` + unit tests (Trae→NAW)  
3. GET API  
4. Waivers panel + deep-link  
5. Matchup alerts panel  
6. Polish / Phase A interface stubs documented

---

## 11. Open decisions resolved

| Topic | Resolution |
|---|---|
| Live depth scrape | Deferred |
| Surfaces | Matchup + Waivers |
| Urgency | League-wide + roster highlight |
| Phase order | B (fixtures) then A (ESPN injury) |
