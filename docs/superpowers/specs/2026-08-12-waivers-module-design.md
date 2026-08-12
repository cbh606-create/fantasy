# Waivers / Free Agents Module — Design Spec

**Date:** 2026-08-12  
**Status:** Approved for implementation planning  
**Product:** Season-long waiver & free-agent pickup tool (separate from Roster, Trade, Draft)  
**Related:** [Season Roster](./2026-08-11-season-roster-module-design.md), [Trade](./2026-08-11-trade-module-design.md)

---

## 1. Goal

Help a category-league manager browse **available players**, see **pickups that address YOU weak categories**, **preview add/drop category impact**, and **apply transactions locally** (no ESPN writeback). Supports **FA** (immediate) and a **simplified waiver claim** model.

### Success criteria (MVP)

- Dedicated **Waivers** surface: `/waivers` + `/waivers/[seasonLeagueId]`.
- Reuses existing `SeasonLeague` (same IDs as Roster/Trade).
- Fixture-backed **available player pool** + **waiver order**.
- Weak-category summary + recommended pickups (Top N).
- Available pool list with FA / Waiver badges.
- Add/Drop builder with before/after 9-cat preview.
- Confirm applies locally to season state (roster + available set).
- FA: apply immediately; Waiver: rank 1 applies cleanly; worse rank requires explicit “assume success” acknowledgment.
- Unit + API tests; no ESPN add/drop writeback.

### Non-goals (MVP)

- ESPN / league-site transaction writeback.
- FAAB bidding.
- Full multi-team claim queue / processing clock.
- Live ESPN free-agent import (fixture only for MVP).
- Draft board / simulate coupling.
- Strict position/roster-fit legality beyond “drop someone or use empty slot”.
- Other teams’ simultaneous claim editing UI.

---

## 2. Why a separate module

| Concern | Roster | Trade | **Waivers** |
|---|---|---|---|
| Job | View/analyze YOUR roster + schedule | Win-win trades between teams | Pickups from available pool |
| Scope | YOU + matrix | 12-team packages | Available pool ↔ YOU |
| Nav | `/roster` | `/trade` | `/waivers` |

**Boundary:** Do not hang FA UI as a heavy Roster tab. Do not create a parallel league store. Do not import draft sim/board/mock.

---

## 3. Product decisions

| Decision | Choice |
|---|---|
| Placement | New module + SiteNav **Waivers** |
| League source | Existing `SeasonLeague` |
| Pool source (MVP) | Fixture `available` players (+ waiver order) |
| Persistence | Local season state update only |
| FA | Immediate local add/drop |
| Waiver | Simplified: order list; rank 1 success; else warn + optional assume-success apply |
| Preview | Required before confirm |
| Analysis population | Same as Roster (all 14 after transaction) |
| ESPN writeback | Never (MVP) |

---

## 4. UI

### 4.1 Routes

- `/waivers` — season league picker (mirror `/trade` / `/roster` list).
- `/waivers/[id]` — workspace.

SiteNav: Home · Draft · Roster · Trade · **Waivers**.

### 4.2 Workspace (top → bottom)

1. **Header** — league name, season, **your waiver rank**, links to Roster / Trade.
2. **Your weak categories** — short needs summary (reuse need thresholds from trade/season where practical).
3. **Recommended pickups** — Top N available players with one-line reason (e.g. helps REB/AST).
4. **Available pool** — table/list: name, NBA team abbr, FA|Waiver badge, key projection cols; basic sort.
5. **Add/Drop builder** — select add + drop (or empty slot) → Preview → Confirm.
6. **Waiver warning modal** (when applicable) — explain non-#1 risk; Confirm assume / Cancel.

Density: match compact roster/trade tables (`~0.8125rem`), not ultra-tiny type.

---

## 5. Data model

### 5.1 Season state extensions

Extend `SeasonLeagueState` (backward compatible defaults):

```ts
availablePlayerIds: string[] // unowned; ids must exist in players[]
waiverOrder: number[]        // teamIndex permutation; index 0 = first priority
// SeasonPlayer may include:
availability?: "fa" | "waiver" // only meaningful while in available set; default "fa"
```

Rules:

- Every id in `availablePlayerIds` and all roster `playerId`s must resolve in `players[]`.
- A player is either rostered on exactly one team, or available, not both.
- Manual/ESPN season fixtures updated so demo leagues include a non-empty available pool and a full `waiverOrder` of length = team count.
- Older states missing fields: treat `availablePlayerIds = []`, `waiverOrder = teams.map(t => t.teamIndex)` (or perspective-first then others) until refreshed/migrated in adapter.

### 5.2 Local transaction semantics

On successful claim/apply:

1. Remove `addPlayerId` from `availablePlayerIds`.
2. Place add onto YOU roster: replace `dropPlayerId` entry, or fill a null slot if `dropPlayerId` is null.
3. If dropping a player, append `dropPlayerId` to `availablePlayerIds` (mark `availability: "fa"` unless fixture says otherwise).
4. Persist updated `stateJson`.
5. **Lineup overlay:** clear `localLineupJson` (or rewrite to match new roster) so Roster/Trade/Waivers stay consistent — **MVP choice: clear localLineup on claim**.

---

## 6. Engine

### 6.1 Recommendations

Inputs: analysis needs for YOU, available players’ projections.

- Score each available player by contribution to YOU need cats (e.g. sum of per-need z or raw projection ranks).
- Return Top N (default 15) with `reasons[]`.

### 6.2 Preview

Inputs: `addPlayerId`, `dropPlayerId | null`.

- Clone state, apply transaction in memory, run `analyzeSeasonLeague`.
- Return YOU needsScore before/after + category deltas for all 9 cats (same spirit as Trade detail).

### 6.3 Simplified waiver gate

```ts
youWaiverRank = waiverOrder.indexOf(perspectiveTeamIndex) + 1 // 1-based
```

- `availability === "fa"` (or missing): no special gate.
- `availability === "waiver"`:
  - If `youWaiverRank === 1`: apply.
  - Else: require `assumeSuccess: true` in claim body; API returns warning flag in preview when rank > 1.

No simulation of other teams’ competing claims beyond this acknowledgment.

---

## 7. API

Auth: Clerk `requireUserId`; owner-only season league (404 otherwise).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/waivers/pool?seasonLeagueId=` | Pool, waiverOrder, youRank, youNeeds, recommendations |
| POST | `/api/waivers/preview` | Body: `{ seasonLeagueId, addPlayerId, dropPlayerId \| null }` → deltas |
| POST | `/api/waivers/claim` | Body: `{ seasonLeagueId, addPlayerId, dropPlayerId \| null, assumeSuccess?: boolean }` → apply + summary |

Validation errors → 400; unauthorized → 401; not found → 404.  
Rate limit preview/claim (reuse `rateLimit` helper).

---

## 8. Architecture

| Path | Responsibility |
|---|---|
| `src/lib/waivers/*` | Recommend, preview, apply, waiver rank helpers |
| `src/app/api/waivers/*` | Pool / preview / claim routes |
| `src/app/waivers/*` | Pages |
| `src/components/waivers/*` | Workspace UI |
| `src/lib/season/types.ts` + fixtures/adapters | State extensions |
| `SiteNav` | Waivers link |

Shared OK: season analysis, need thresholds (import from trade/needs or extract shared `src/lib/season/needs.ts` if duplication hurts — prefer extract only if both import the same helpers).

---

## 9. Testing

| Layer | Coverage |
|---|---|
| Unit | Recommend ordering; preview deltas; FA move add/drop; waiver rank-1 apply; waiver non-1 blocked without assumeSuccess |
| API | 401/404; pool shape; claim mutates available/roster; assumeSuccess path |
| UI | Workspace renders recommendations + preview affordance (mocked fetch) |

---

## 10. Follow-ups

- Live ESPN FA / waiver status.
- FAAB.
- Multi-team claim queue.
- Position fit / IR rules.
- Streaming schedule-aware FA value (tie-in to Schedule tab).
