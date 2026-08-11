# Season Roster Module — Design Spec

**Date:** 2026-08-11  
**Status:** Approved for implementation planning  
**Product:** Season-long team roster view (separate from Draft)  
**MVP focus:** View + local lineup edits + league category matrix

---

## 1. Goal

Let a category-league manager open a dedicated **Roster** surface (not Draft) to see their full team, understand 9-cat strength/weakness from **all rostered players**, and compare **every team’s category ranks** in a sortable matrix. ESPN import is preferred; manual entry is the required fallback.

### Success criteria (MVP)

- User can create/open a **SeasonLeague** distinct from draft `League` / `LeagueState`.
- Roster shows all slots with no truncation: **10 starters + 3 BE + 1 IL** (14 total).
- Category profile uses **all 14 players** (daily-league depth view).
- 9-cat diverging bars + z-scores for the user’s team vs the 12-team distribution.
- Bottom **12×9 rank matrix** with YOU row highlight and **per-column sort**.
- ESPN refresh preferred; on failure, continue via manual roster.
- Local lineup edits allowed; **not** written back to ESPN. Refresh conflicts prompt the user.

### Non-goals (MVP)

- Writing lineup/adds/drops to ESPN.
- Waiver wire and trade tools.
- Coupling to draft board, mock draft, or simulate APIs.
- Points leagues; non-12-team formats (keep typed extension hooks only).
- Live ESPN E2E in CI (fixtures/mocks only).

---

## 2. Relationship to Draft

| Concern | Draft module | Roster module |
|---|---|---|
| Domain | `League` / `LeagueState` / draft board | `SeasonLeague` / season rosters |
| Primary job | Pick paths & simulation | View & analyze season rosters |
| Navigation | Home → Draft / league draft workspace | Home → **Roster**; optional shortcut from a league card |
| Shared code | Pure helpers only (category ids, z-score utils, player projection types) | Same — **no** import of draft simulate/board/mock |

**Boundary rule:** Draft simulation, board, and mock code must not import season roster UI/domain, and season roster must not import draft engine modules.

---

## 3. Users and product shape

| Decision | Choice |
|---|---|
| Audience | Same public web app users (Clerk) |
| Scoring | H2H Categories, standard 9-cat |
| Team size model | 10 active lineup slots + 3 BE + 1 IL |
| Active lineup slots | `PG`, `SG`, `SF`, `PF`, `C`, `G`, `F`, `UTIL`, `UTIL`, `UTIL` |
| Analysis population | **All 14 rostered players** (starters + BE + IL) |
| Data | ESPN preferred; manual fallback required |
| Local edits | Slot moves / roster tweaks in-app only |
| ESPN writeback | Never (MVP) |
| Refresh conflict | Ask: apply ESPN vs keep app edits |

---

## 4. Screens and UX

### Entry

1. **Home → Roster** — primary entry (list of season leagues / create).
2. Optional shortcut from existing draft-league UI: “Open season roster” (creates or links a SeasonLeague; does not merge domains).

### Roster workspace (single composition, scroll)

**A. Header**

- Season league identity, “You” team label, source badge (`espn` / `manual` / `mixed`), last synced time.
- Actions: `Refresh ESPN`, `Edit lineup`.

**B. All players table (first major block)**

- Sections: Starters (10) · Bench (3) · IL (1).
- Every player visible at once (no “+N more”).
- Columns: slot, player, then shooting + counting stats:
  - `FG%`, **`FGM/FGA`** (paired beside FG% for volume/impact)
  - `FT%`, **`FTM/FTA`** (paired beside FT%)
  - `3PM`, `REB`, `AST`, `STL`, `BLK`, `TO`, `PTS`
- Makes/attempts are per-game (or season-normalized per-game) display fields; they inform judgment of % impact but are **not** separate matrix categories.

**C. Category profile (compact, below roster)**

- Compact 3-column grid of all 9 category diverging bars (thinner than a full vertical stack).
- Based on league-relative z-scores of **full-roster** fantasy metrics (TO inverted).
- Volume columns (`FGM/FGA`, `FTM/FTA`) do not appear here — profile stays 9-cat only.

**D. League category rank matrix (bottom)**

- Rows = 12 teams; columns = 9 cats; cells = rank `#1`…`#12`.
- Heatmap coloring: better ranks greener, worse redder.
- **YOU** row visually emphasized.
- **Column sort:** click category header → sort teams by that category’s rank; first click best-first (`#1` top); second click worst-first; active column indicated; **Reset** restores default team order.

### Edit lineup (MVP)

- In-app reassignment of players among the 14 slots (and empty slots if any).
- Persisted as local season state; never POSTed to ESPN.
- Category profile + matrix recompute from the effective roster after edits.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js UI                                             │
│  Home · Roster list · SeasonRosterWorkspace             │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  API                                                    │
│  season-leagues CRUD · espn/season-import · refresh     │
│  local lineup patch · conflict resolve                  │
└───────┬─────────────────────┬───────────────────────────┘
        │                     │
┌───────▼────────┐   ┌────────▼───────────────────────────┐
│  Persistence   │   │  Season analysis (pure)            │
│  SeasonLeague  │   │  totals · z-scores · rank matrix   │
│  slots/edits   │   └────────────────────────────────────┘
└───────┬────────┘
        ▲
┌───────┴─────────────────────────────────────────────────┐
│  Adapters → SeasonLeagueState                           │
│  EspnSeasonAdapter (unofficial) · ManualSeasonAdapter   │
└─────────────────────────────────────────────────────────┘
```

Draft `EspnAdapter` / `espnImportToLeagueState` remain draft-only. Season uses `EspnSeasonAdapter` (or equivalently named) producing `SeasonLeagueState`.

---

## 6. Domain model (conceptual)

### SeasonLeague

- `id`, `userId`
- `espnLeagueId?`, `season`
- `teams: 12` (MVP fixed)
- `categories` / weights (9-cat default)
- `perspectiveTeamIndex` (user’s team)
- `source`: `espn` | `manual` | `mixed`
- `lastSyncedAt?`

### SeasonRoster

- Per team: ordered slots  
  `["PG","SG","SF","PF","C","G","F","UTIL","UTIL","UTIL","BE","BE","BE","IL"]`
- Each slot: `{ slot, playerId | null }`

### SeasonLineupEdit

- User’s local slot assignments overlaying last ESPN/manual snapshot.
- Conflict detection compares slot→player maps on refresh.

### Player

- Reuse projection shape already used app-wide where possible (`Player` / projections for 9 cats).
- Season module may reference a shared player pool file; must not depend on draft board picks.

### Analysis outputs

- `categoryLevels`: per-cat z, intensity, kind for the user’s team (and optionally all teams).
- `rankMatrix`: for each category, each team’s rank; UI sorts rows client-side or via small helper.

**Fantasy metric:** higher is better; `TO` uses negated average/total consistently with draft category helpers.

---

## 7. API sketch

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/season-leagues` | List user’s season leagues |
| `POST` | `/api/season-leagues` | Create manual or start ESPN import |
| `GET` | `/api/season-leagues/[id]` | Full `SeasonLeagueState` + analysis payload |
| `POST` | `/api/season-leagues/[id]/refresh` | ESPN refresh; returns conflict metadata if local edits differ |
| `POST` | `/api/season-leagues/[id]/resolve-conflict` | `apply_espn` \| `keep_local` |
| `PATCH` | `/api/season-leagues/[id]/lineup` | Persist local slot assignments |
| `POST` | `/api/espn/season-import` | Import → `SeasonLeagueState` (fixture when `ESPN_LIVE=false`) |

Rate-limit refresh similarly to existing ESPN sync limits.

---

## 8. ESPN integration and fallback

- Unofficial ESPN endpoints; may break. `ESPN_LIVE=false` uses fixtures in CI/dev default.
- Credentials (`SWID` / `espnS2`) only on server; never returned to the client.
- Policy: roster workspace must remain usable via **ManualSeasonAdapter** without ESPN.
- Mixed state when local edits diverge from last ESPN snapshot after user chooses keep-local, or after partial sync.

---

## 9. Errors and auth

- Clerk auth required for all season-league routes.
- Ownership checks: only creator can read/write.
- Stable error codes (align with existing ESPN error style where possible):  
  `ESPN_UNAVAILABLE`, `ESPN_AUTH`, `NOT_FOUND`, `CONFLICT`, `VALIDATION`.
- UI maps codes to short recovery actions (retry, enter manually, resolve conflict).

---

## 10. Testing

- **Unit:** full-roster totals (14), TO inversion, z-score/rank matrix, column sort ordering helper.
- **Adapter:** fixture → `SeasonLeagueState` with 14 slots × 12 teams (or sparse empty slots).
- **API:** create/list/get; refresh conflict branches with mocks.
- **UI smoke:** Roster page renders 14 rows for YOU, 9 bars, matrix headers sortable.
- **Out of CI:** live ESPN HTTP.

---

## 11. Visual direction (from approved mockups)

- Nike-ish existing app chrome; Roster as first-class nav item.
- Category bars: vertical list, center baseline, green/red fill.
- Matrix: warm light panel, heatmap cells, dark YOU row, clickable headers with asc/desc affordance.
- Avoid truncating the player list; matrix may horizontal-scroll on small screens.

---

## 12. Implementation sequencing (planning hint)

1. Domain types + Prisma models for SeasonLeague / slots / edits.  
2. Pure analysis + matrix sort helpers + tests.  
3. Manual create path + Roster UI (fixture/mock data).  
4. ESPN season adapter behind `ESPN_LIVE` + refresh/conflict APIs.  
5. Local lineup PATCH + recompute.  
6. Home entry + optional league shortcut.

---

## 13. Open points resolved in brainstorming

| Topic | Decision |
|---|---|
| Domain split | Separate from Draft (Approach A) |
| Data source | ESPN preferred + manual fallback |
| Analysis set | All 14 players |
| Rank UI | Sortable 12×9 matrix (not ladder-only) |
| Column sort | Toggle best-first / worst-first + Reset |
| Section order | Players → compact category profile → matrix |
| Shooting volume | Show FGM/FGA beside FG%, FTM/FTA beside FT% on roster table |
| Local edits | Yes; no ESPN writeback |
| Refresh conflict | Prompt user |

---

## 14. Approval

- Architecture, screens, data/sync, errors/tests — approved in brainstorming session 2026-08-11.  
- Next step: implementation plan via `writing-plans` after user reviews this file.
