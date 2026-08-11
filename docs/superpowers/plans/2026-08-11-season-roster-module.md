# Season Roster Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Draft-separate Season Roster workspace that shows all 14 slots (with FGM/FGA and FTM/FTA), a compact 9-cat profile from all players, and a sortable 12×9 league rank matrix, with ESPN preferred and manual fallback.

**Architecture:** New `SeasonLeague` Prisma model + `SeasonLeagueState` domain (no draft board). Pure analysis in `src/lib/season/`. Adapters (`manualSeason`, `espnSeason`) normalize to the same state. App Router pages under `/roster`. Local lineup edits persist as an overlay; ESPN writeback never happens.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Clerk, Prisma + SQLite/libSQL, Vitest, Zod. Implement inside `.worktrees/feat-draft-mvp` (or a new `feat/season-roster` branch from that tree).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-season-roster-module-design.md`
- Domain split: season code must not import draft simulate/board/mock modules; draft must not import season UI.
- Shared OK: `CategoryId`, `ALL_CATEGORY_IDS`, `defaultCategorySettings`, player projection shape helpers.
- Slots (exact order): `PG SG SF PF C G F UTIL UTIL UTIL BE BE BE IL` (14).
- Analysis population: all 14 rostered players with a playerId.
- Team FG%/FT%: aggregate as `sum(makes)/sum(attempts)` when volume present; else mean of player % (document in tests).
- ESPN live behind `ESPN_LIVE`; default fixtures. No ESPN writeback.
- Refresh conflict: prompt `apply_espn` | `keep_local`.
- Auth: Clerk `requireUserId` on all season APIs; owner-only.
- UI order: Header → All players → compact Category profile → League matrix.
- No semicolons in TS/TSX. Conventional commits.
- Rate limit: reuse pattern from `src/lib/rateLimit.ts` (5 refresh / user / minute).

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/season/types.ts` | `SeasonSlot`, `SeasonPlayer`, `SeasonLeagueState`, analysis types |
| `src/lib/season/slots.ts` | `SEASON_ROSTER_SLOTS` constant + empty roster builder |
| `src/lib/season/analysis.ts` | Full-roster totals, z-scores, rank matrix |
| `src/lib/season/matrixSort.ts` | Column sort helper for matrix rows |
| `src/lib/adapters/manualSeason.ts` | Manual → `SeasonLeagueState` |
| `src/lib/adapters/espnSeason.ts` | ESPN/fixture → `SeasonLeagueState` |
| `data/fixtures/espn-season-league.json` | 12 teams × 14 slots sample |
| `prisma/schema.prisma` | Add `SeasonLeague` model |
| `src/app/api/season-leagues/route.ts` | List + create |
| `src/app/api/season-leagues/[id]/route.ts` | Get |
| `src/app/api/season-leagues/[id]/refresh/route.ts` | ESPN refresh + conflict detect |
| `src/app/api/season-leagues/[id]/resolve-conflict/route.ts` | Resolve conflict |
| `src/app/api/season-leagues/[id]/lineup/route.ts` | PATCH local lineup |
| `src/app/api/espn/season-import/route.ts` | Import entry |
| `src/components/season/*` | Workspace UI pieces |
| `src/app/roster/page.tsx` | Season league list / create entry |
| `src/app/roster/[id]/page.tsx` | Season roster workspace |
| `src/app/page.tsx` | Add Roster CTA / nav |
| `tests/unit/season*.test.ts` | Analysis + sort + adapters |
| `tests/api/seasonLeagues.test.ts` | API smoke with mocks |

---

### Task 1: Season domain types + slot constants

**Files:**
- Create: `src/lib/season/types.ts`
- Create: `src/lib/season/slots.ts`
- Test: `tests/unit/seasonSlots.test.ts`

**Interfaces:**
- Consumes: `CategoryId`, `CategorySetting` from `@/lib/domain/types`
- Produces:
  - `SeasonSlot = "PG"|"SG"|"SF"|"PF"|"C"|"G"|"F"|"UTIL"|"BE"|"IL"`
  - `SEASON_ROSTER_SLOTS: SeasonSlot[]` length 14
  - `SeasonPlayer` with `projections: Record<CategoryId, number>` and `shooting: { FGM, FGA, FTM, FTA }`
  - `SeasonRosterEntry = { slot: SeasonSlot; playerId: string | null }`
  - `SeasonTeamRoster = { teamIndex: number; name: string; entries: SeasonRosterEntry[] }`
  - `SeasonLeagueState = { id?: string; name: string; season: number; categories; perspectiveTeamIndex; teams: SeasonTeamRoster[]; players: SeasonPlayer[]; source; lastSyncedAt?; localLineup?: SeasonRosterEntry[] | null }`

- [ ] **Step 1: Write failing test for slot list**

```ts
import { describe, expect, it } from "vitest"
import { SEASON_ROSTER_SLOTS, buildEmptyTeamEntries } from "@/lib/season/slots"

describe("season slots", () => {
  it("has 10 starters, 3 BE, 1 IL in order", () => {
    expect(SEASON_ROSTER_SLOTS).toEqual([
      "PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL",
      "BE", "BE", "BE", "IL",
    ])
    expect(buildEmptyTeamEntries()).toHaveLength(14)
    expect(buildEmptyTeamEntries().every((e) => e.playerId === null)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npm.cmd test -- tests/unit/seasonSlots.test.ts`  
Expected: FAIL cannot find module

- [ ] **Step 3: Implement types + slots**

```ts
// src/lib/season/slots.ts
import type { SeasonRosterEntry, SeasonSlot } from "./types"

export const SEASON_ROSTER_SLOTS: SeasonSlot[] = [
  "PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL",
  "BE", "BE", "BE", "IL",
]

export const buildEmptyTeamEntries = (): SeasonRosterEntry[] =>
  SEASON_ROSTER_SLOTS.map((slot) => ({ slot, playerId: null }))
```

Define full types in `types.ts` matching Interfaces above. No semicolons.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/season/types.ts src/lib/season/slots.ts tests/unit/seasonSlots.test.ts
git commit -m "feat(season): add season roster slot model"
```

---

### Task 2: Season category analysis (all 14 players)

**Files:**
- Create: `src/lib/season/analysis.ts`
- Test: `tests/unit/seasonAnalysis.test.ts`

**Interfaces:**
- Consumes: `SeasonLeagueState`, `SeasonPlayer`, `ALL_CATEGORY_IDS`
- Produces:
  - `analyzeSeasonLeague(state: SeasonLeagueState): SeasonAnalysis`
  - `SeasonAnalysis = { byTeam: { teamIndex; levels: CategoryLevel[] }[]; byCategory: { categoryId; rows: { teamIndex; rank; z; raw }[] }[] }`
  - Effective roster for analysis = players filled in team entries (all slots including BE/IL)
  - Team `FG_PCT` / `FT_PCT` from summed shooting volume when every filled player has `shooting` and `FGA`/`FTA` > 0; else mean of % projections

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
// build minimal SeasonLeagueState helpers in test file:
// - team0 high AST players → AST rank 1
// - TO lower is better
// - FG% uses volume: player A 1/10 (.100) + player B 9/10 (.900) => team .500 not .500 mean of .100/.900 wait mean is also .5;
//   use A 5/5 (1.0) + B 0/5 (0.0) => volume 5/10=.500 vs mean of % = 0.500 same;
//   use A 9/10 (.9) + B 1/10 (.1) => volume .500, mean of % = .500;
//   Better: A 10/10 (1.0) volume-heavy vs B 1/2 (0.5): volume 11/12≈0.917, mean (1+0.5)/2=0.75 — assert volume path
```

Include assertions:
1. AST rank for stacked team is 1  
2. Lower TO ranks better  
3. When shooting present, team FG_PCT equals totalFGM/totalFGA  

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `analyzeSeasonLeague`**

Reuse patterns from `analyzeLeagueTeamCategories` in draft display **by copying logic into `season/analysis.ts`** (do not import from `@/lib/draft/*`). Invert TO for fantasy metric. Rank 1 = best.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/season/analysis.ts tests/unit/seasonAnalysis.test.ts
git commit -m "feat(season): add full-roster category analysis"
```

---

### Task 3: Matrix column sort helper

**Files:**
- Create: `src/lib/season/matrixSort.ts`
- Test: `tests/unit/seasonMatrixSort.test.ts`

**Interfaces:**
- Consumes: `byCategory` rows from analysis
- Produces: `sortTeamsByCategoryRank({ teamIndexes, ranksByTeam, direction: "asc"|"desc" }): number[]`  
  - `asc` = best first (rank 1 first)  
  - `desc` = worst first  
  - stable tie-break by teamIndex

- [ ] **Step 1: Write failing test** for asc/desc/ties  
- [ ] **Step 2: Run — FAIL**  
- [ ] **Step 3: Implement helper**  
- [ ] **Step 4: Run — PASS**  
- [ ] **Step 5: Commit** `feat(season): add matrix column sort helper`

---

### Task 4: Prisma `SeasonLeague` + DB access

**Files:**
- Modify: `prisma/schema.prisma`
- Create migration via Prisma
- Modify: nothing in draft `League` model

**Schema:**

```prisma
model SeasonLeague {
  id                    String   @id @default(cuid())
  clerkUserId           String
  name                  String
  espnLeagueId          String?
  season                Int
  perspectiveTeamIndex  Int
  source                String
  stateJson             String
  localLineupJson       String?
  lastSyncedAt          DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([clerkUserId])
}
```

- [ ] **Step 1: Add model to schema**  
- [ ] **Step 2: Run** `npx.cmd prisma migrate dev --name season_league`  
- [ ] **Step 3: Commit** `feat(season): add SeasonLeague persistence`

---

### Task 5: Manual season adapter + fixture

**Files:**
- Create: `data/fixtures/espn-season-league.json` (12 teams, YOU at index 2, each with 14 slots; players include `shooting`)
- Create: `src/lib/adapters/manualSeason.ts`
- Test: `tests/unit/manualSeasonAdapter.test.ts`

**Interfaces:**
- Produces: `manualToSeasonLeagueState(input: { name; season; perspectiveTeamIndex; teams; players }): SeasonLeagueState`
- Manual path can start from fixture players assigned into slots for the user’s team only + empty opponents, **or** full fixture clone labeled manual — prefer full 12-team fixture for matrix usefulness in MVP.

- [ ] **Step 1: Write failing adapter test** (14 slots, 12 teams, shooting fields present)  
- [ ] **Step 2: FAIL**  
- [ ] **Step 3: Add fixture + `manualToSeasonLeagueState`**  
- [ ] **Step 4: PASS**  
- [ ] **Step 5: Commit** `feat(season): add manual season adapter and fixture`

---

### Task 6: ESPN season adapter (fixture default)

**Files:**
- Create: `src/lib/adapters/espnSeason.ts`
- Test: `tests/unit/espnSeasonAdapter.test.ts`

**Interfaces:**
- `espnImportToSeasonLeagueState({ leagueId; season; forceFail? }): Promise<SeasonLeagueState>`
- If `ESPN_LIVE !== "true"`: load `espn-season-league.json`, set `source: "espn"`
- If live: throw `EspnAdapterError("ESPN_UNAVAILABLE")` until real HTTP is implemented (same policy as draft adapter MVP)
- `detectLineupConflict(snapshotEntries, localLineup): boolean`

- [ ] **Step 1: Tests for fixture import + conflict true/false**  
- [ ] **Step 2: FAIL**  
- [ ] **Step 3: Implement**  
- [ ] **Step 4: PASS**  
- [ ] **Step 5: Commit** `feat(season): add ESPN season adapter with fixture path`

---

### Task 7: Season league API — list / create / get

**Files:**
- Create: `src/app/api/season-leagues/route.ts`
- Create: `src/app/api/season-leagues/[id]/route.ts`
- Create: `src/app/api/espn/season-import/route.ts`
- Test: `tests/api/seasonLeagues.test.ts` (mock auth + db like existing league API tests if present; else unit-test handlers with dependency injection minimal — follow existing `tests/api` style)

**Behavior:**
- `GET /api/season-leagues` → user’s rows (metadata; state optional)
- `POST /api/season-leagues` body `{ name, manual?: true }` → build from fixture via manual adapter, persist
- `POST /api/espn/season-import` body `{ name, leagueId, season }` → espn adapter → persist
- `GET /api/season-leagues/[id]` → state + `analyzeSeasonLeague(effectiveState)` where effectiveState applies `localLineup` onto perspective team if present

- [ ] **Step 1: Write API tests for unauthorized + create + get**  
- [ ] **Step 2: FAIL**  
- [ ] **Step 3: Implement routes** using `requireUserId`, `db.seasonLeague`  
- [ ] **Step 4: PASS**  
- [ ] **Step 5: Commit** `feat(season): add season league CRUD APIs`

---

### Task 8: Refresh + conflict resolve APIs

**Files:**
- Create: `src/app/api/season-leagues/[id]/refresh/route.ts`
- Create: `src/app/api/season-leagues/[id]/resolve-conflict/route.ts`
- Extend: `tests/api/seasonLeagues.test.ts`

**Behavior:**
- `POST .../refresh`: rate-limited; pull ESPN fixture/live; if `localLineupJson` conflicts with new perspective entries → `{ conflict: true, incomingState }` **without** overwriting local yet; else save snapshot, clear conflict, return state
- `POST .../resolve-conflict` body `{ resolution: "apply_espn" | "keep_local" }`:
  - `apply_espn`: replace state, set `localLineupJson` null, source espn
  - `keep_local`: save incoming espn snapshot into `stateJson` but keep `localLineupJson`, source `mixed`

- [ ] **Step 1: Tests for conflict and both resolutions**  
- [ ] **Step 2–4: TDD implement**  
- [ ] **Step 5: Commit** `feat(season): add refresh and conflict resolution`

---

### Task 9: Local lineup PATCH

**Files:**
- Create: `src/app/api/season-leagues/[id]/lineup/route.ts`
- Extend tests

**Behavior:**
- `PATCH` body `{ entries: SeasonRosterEntry[] }` length 14, slots match `SEASON_ROSTER_SLOTS`
- Validate playerIds ⊆ state.players
- Save `localLineupJson`; set source to `mixed` if was `espn`
- Return analysis for effective roster

- [ ] **Step 1–5: TDD + commit** `feat(season): persist local lineup edits`

---

### Task 10: Season Roster UI

**Files:**
- Create: `src/components/season/SeasonRosterWorkspace.tsx`
- Create: `src/components/season/PlayerRosterTable.tsx`
- Create: `src/components/season/CompactCategoryProfile.tsx`
- Create: `src/components/season/LeagueRankMatrix.tsx`
- Create: `src/components/season/ConflictModal.tsx`
- Create: `src/app/roster/page.tsx`
- Create: `src/app/roster/[id]/page.tsx`
- Modify: `src/app/page.tsx` — add secondary link/button to `/roster`
- Optional: `src/app/leagues/[id]/draft` shortcut link “Season roster” → `/roster` (list) or create-from-draft later; MVP: link to `/roster`

**UI requirements (match approved mock):**
1. `PlayerRosterTable` — all 14 rows; columns Slot, Player, FG%, FGM/A, FT%, FTM/A, 3PM, REB, AST, STL, BLK, TO, PTS  
2. `CompactCategoryProfile` — 3-column thin diverging bars for 9 cats  
3. `LeagueRankMatrix` — heatmap; YOU row; header click uses `sortTeamsByCategoryRank`; Reset button  
4. Header actions call refresh / open edit mode (slot reassignment enough for MVP: select two slots to swap or dropdown per slot)

- [ ] **Step 1: Build pages wired to GET APIs with loading/error states**  
- [ ] **Step 2: Implement table + compact bars + matrix (client sort OK)**  
- [ ] **Step 3: Wire Refresh + ConflictModal + lineup PATCH**  
- [ ] **Step 4: Manual create from `/roster` page**  
- [ ] **Step 5: Commit** `feat(season): add roster workspace UI`

---

### Task 11: Verification smoke

**Files:**
- Optional e2e: `tests/e2e/season-roster.spec.ts` (auth bypass if project already has `E2E_BYPASS_AUTH`)
- Or document manual smoke checklist in commit message if e2e auth is heavy

- [ ] **Step 1: Run** `npm.cmd test` — all unit/api green  
- [ ] **Step 2: Run** `npm.cmd run lint` on touched files  
- [ ] **Step 3: Manual:** `npm.cmd run dev` → `/roster` → create → see 14 players, volume cols, profile under table, sortable matrix  
- [ ] **Step 4: Commit** any fixes `fix(season): …` or `test(season): add roster smoke`

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| Separate SeasonLeague domain | 1, 4 |
| 14 slots including IL | 1, 5, 10 |
| All players in analysis | 2 |
| FGM/FGA + FTM/FTA on table | 1 (`shooting`), 5 fixture, 10 UI |
| Compact profile below roster | 10 |
| Sortable 12×9 matrix | 2, 3, 10 |
| ESPN preferred + manual fallback | 5, 6, 7 |
| Local edits, no ESPN write | 9 |
| Conflict prompt on refresh | 8 |
| Home Roster entry | 10 |
| No draft engine imports | enforced in Tasks 2/10 file placement |
| Tests for analysis/adapter/API | 2, 5, 6, 7, 8, 11 |

---

## Self-review notes

- No TBD placeholders left in tasks.  
- Types named consistently: `SeasonLeagueState`, `SeasonRosterEntry`, `analyzeSeasonLeague`.  
- Volume fields are display + FG%/FT% aggregation inputs; matrix remains 9-cat only.  
- Real ESPN HTTP is explicitly deferred behind `ESPN_UNAVAILABLE` when `ESPN_LIVE=true` until a follow-up — fixture path satisfies MVP success criteria.
