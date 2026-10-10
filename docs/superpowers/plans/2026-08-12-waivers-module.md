# Waivers / Free Agents Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Waivers workspace that lists fixture available players, recommends pickups for YOU weak categories, previews add/drop category impact, and applies FA/simplified-waiver claims locally on `SeasonLeague` state.

**Architecture:** Extend `SeasonLeagueState` with `availablePlayerIds` + `waiverOrder`. Pure helpers in `src/lib/waivers/*` for recommend/preview/apply. APIs under `/api/waivers/*`. UI at `/waivers` mirroring Trade. Clear `localLineupJson` on successful claim. No ESPN writeback; no draft imports.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS 4, Clerk, Prisma/libSQL, Vitest. Work in `.worktrees/feat-season-roster` on `feat/season-roster`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-waivers-module-design.md`
- Reuse `SeasonLeague`; no parallel league store
- Fixture FA pool only (MVP); ESPN FA live is follow-up
- Local persist only; clear `localLineupJson` on claim
- FA immediate; Waiver rank 1 OK; rank > 1 requires `assumeSuccess: true`
- Need thresholds: reuse `NEED_RANK_FLOOR = 9` from `@/lib/trade/constants` (or re-export) for recommendations
- Top recommendations default **15**
- No draft sim/board/mock imports; no ESPN add/drop writeback
- No semicolons; conventional commits; Tailwind; `handle*` event names
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>`
- UI density ~`text-[0.8125rem]` like Trade/Roster tables

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/season/types.ts` | `availablePlayerIds`, `waiverOrder`, `availability?` |
| `src/lib/season/availability.ts` | Normalize defaults for missing fields |
| `src/lib/adapters/manualSeason.ts` | Preserve new fields |
| `data/fixtures/espn-season-league.json` | Available pool + waiverOrder |
| `src/lib/waivers/constants.ts` | `MAX_RECOMMENDATIONS = 15` |
| `src/lib/waivers/types.ts` | DTO types |
| `src/lib/waivers/apply.ts` | Pure apply add/drop on state |
| `src/lib/waivers/recommend.ts` | Top N pickups for needs |
| `src/lib/waivers/preview.ts` | Before/after analysis deltas |
| `src/lib/waivers/rank.ts` | Waiver rank helper |
| `src/app/api/waivers/pool/route.ts` | GET pool + recommendations |
| `src/app/api/waivers/preview/route.ts` | POST preview |
| `src/app/api/waivers/claim/route.ts` | POST claim + persist |
| `src/app/waivers/page.tsx` | League list |
| `src/app/waivers/[id]/page.tsx` | Workspace page |
| `src/components/waivers/*` | UI |
| `src/components/SiteNav.tsx` | Waivers link |
| `src/app/page.tsx` | Optional CTA |
| `tests/unit/waivers*.test.ts` | Engine tests |
| `tests/api/waivers.test.ts` | API tests |
| `tests/unit/WaiversWorkspace.test.tsx` | UI smoke |

---

### Task 1: Season availability fields + fixture pool

**Files:**
- Modify: `src/lib/season/types.ts`
- Create: `src/lib/season/availability.ts`
- Modify: `src/lib/adapters/manualSeason.ts`
- Modify: `data/fixtures/espn-season-league.json`
- Test: `tests/unit/seasonAvailability.test.ts`

**Interfaces:**
- Produces:
  - `SeasonPlayer.availability?: "fa" | "waiver"`
  - `SeasonLeagueState.availablePlayerIds: string[]`
  - `SeasonLeagueState.waiverOrder: number[]`
  - `normalizeSeasonAvailability(state): SeasonLeagueState` — fills defaults: empty available, `waiverOrder = teams.map(t => t.teamIndex)` if missing; ensures available ids ⊂ players; strips rostered ids from available

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest"
import { normalizeSeasonAvailability } from "@/lib/season/availability"
import type { SeasonLeagueState } from "@/lib/season/types"
// minimal 2-team stub without available fields
describe("normalizeSeasonAvailability", () => {
  it("defaults missing availablePlayerIds and waiverOrder", () => {
    const normalized = normalizeSeasonAvailability(stubWithoutFields)
    expect(normalized.availablePlayerIds).toEqual([])
    expect(normalized.waiverOrder).toEqual([0, 1])
  })
  it("drops available ids that are rostered", () => {
    const normalized = normalizeSeasonAvailability(stubWithOverlap)
    expect(normalized.availablePlayerIds).not.toContain("rostered-id")
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/seasonAvailability.test.ts`

- [ ] **Step 3: Implement types + normalize + fixture enrichment**

Update `SeasonLeagueState`:

```ts
availablePlayerIds: string[]
waiverOrder: number[]
```

Make fields required on the type; adapters/normalize always present them.

Enrich fixture with a Node one-off (no BOM):

- Add **24** new `SeasonPlayer` rows `fa1`…`fa24` with varied projections + `teamAbbr` + mix of `availability: "fa" | "waiver"` (half/half).
- Set `availablePlayerIds` to those ids.
- Set `waiverOrder` to `[0,1,2,...,11]` (or shuffle with perspective team not always #1 — e.g. put `perspectiveTeamIndex` at index 2 so non-#1 waiver path is demoable).

Update `manualToSeasonLeagueState` / `normalizePlayer` to pass `availability` and include `availablePlayerIds` / `waiverOrder` from input (default via `normalizeSeasonAvailability`).

Call `normalizeSeasonAvailability` at the end of `manualToSeasonLeagueState`.

- [ ] **Step 4: Run — expect PASS**; also smoke `manualSeasonAdapter` tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/season/types.ts src/lib/season/availability.ts src/lib/adapters/manualSeason.ts data/fixtures/espn-season-league.json tests/unit/seasonAvailability.test.ts
git commit -m "feat(season): add available player pool and waiver order"
```

---

### Task 2: Apply add/drop transaction

**Files:**
- Create: `src/lib/waivers/apply.ts`
- Create: `src/lib/waivers/types.ts` (minimal shared types if needed)
- Test: `tests/unit/waiversApply.test.ts`

**Interfaces:**
- Produces:
  - `applyAddDrop(state, { addPlayerId, dropPlayerId: string | null }): SeasonLeagueState | { error: string }`
  - Rules: add must be in `availablePlayerIds`; drop must be on YOU roster if non-null; if drop null, YOU must have a null slot; after apply, invariants hold; dropped player gets `availability: "fa"` when returned to pool

- [ ] **Step 1: Write failing tests** — FA add+drop swaps membership; reject add not available; reject drop not on YOU

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `applyAddDrop`**

```ts
export const applyAddDrop = (
  state: SeasonLeagueState,
  input: { addPlayerId: string; dropPlayerId: string | null },
): SeasonLeagueState | { error: string } => {
  const normalized = normalizeSeasonAvailability(state)
  // validate → clone teams/players/availablePlayerIds
  // replace YOU entry playerId
  // update availablePlayerIds
  // optionally update players[].availability for drop
  return nextState
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/waivers/apply.ts src/lib/waivers/types.ts tests/unit/waiversApply.test.ts
git commit -m "feat(waivers): apply local add/drop transactions"
```

---

### Task 3: Recommend + preview + waiver rank

**Files:**
- Create: `src/lib/waivers/constants.ts` — `MAX_RECOMMENDATIONS = 15`
- Create: `src/lib/waivers/rank.ts` — `youWaiverRank(state): number` (1-based; if missing from order, treat as last)
- Create: `src/lib/waivers/recommend.ts`
- Create: `src/lib/waivers/preview.ts`
- Test: `tests/unit/waiversRecommendPreview.test.ts`

**Interfaces:**
- Consumes: `analyzeSeasonLeague`, `teamNeedsAndSurplus` / `needsScore` from `@/lib/trade/needs`, `applyAddDrop`
- Produces:
  - `recommendPickups(state): { playerId, score, reasons: string[] }[]`
  - `previewAddDrop(state, input): { youWaiverRank, requiresAssumeSuccess, before, after, categoryDeltas } | { error }`
  - `requiresAssumeSuccess` = add player `availability === "waiver"` && rank > 1

Recommendation score: for each available player, sum projection values (or player-level z) on YOU need cats only; sort desc; take 15; reason like `Helps AST, REB`.

Preview categoryDeltas: all 9 cats rank before/after for YOU (mirror Trade).

- [ ] **Step 1: Write failing tests** — need-cat specialist ranks above scrub; preview improves a need cat; waiver non-#1 sets requiresAssumeSuccess

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/waivers/constants.ts src/lib/waivers/rank.ts src/lib/waivers/recommend.ts src/lib/waivers/preview.ts tests/unit/waiversRecommendPreview.test.ts
git commit -m "feat(waivers): recommend pickups and preview add/drop"
```

---

### Task 4: Waivers API routes

**Files:**
- Create: `src/app/api/waivers/pool/route.ts`
- Create: `src/app/api/waivers/preview/route.ts`
- Create: `src/app/api/waivers/claim/route.ts`
- Test: `tests/api/waivers.test.ts`

**Interfaces:**
- Load league like trade suggestions (auth, owner, parse state, `applyLocalLineup`, then `normalizeSeasonAvailability`)
- GET pool → `{ available: [...], waiverOrder, youWaiverRank, youNeeds, recommendations, playersById subset }`
- POST preview → preview DTO or 400
- POST claim:
  - if requiresAssumeSuccess && !assumeSuccess → **409** `{ error: "assume_required" }`
  - else applyAddDrop → write `stateJson`, set `localLineupJson: null` → 200 `{ state summary / ok: true, youWaiverRank }`
- Rate limit preview + claim (10/min/user) via `rateLimit`

- [ ] **Step 1: Write API tests** — 401; 404; pool has available length > 0 for manual create; claim moves player; waiver assume_required 409; assumeSuccess 200

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement routes**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/waivers tests/api/waivers.test.ts
git commit -m "feat(waivers): add pool preview and claim APIs"
```

---

### Task 5: Waivers UI + nav

**Files:**
- Create: `src/components/waivers/WaiversWorkspace.tsx`
- Create: `src/components/waivers/RecommendedPickups.tsx`
- Create: `src/components/waivers/AvailablePoolTable.tsx`
- Create: `src/components/waivers/AddDropBuilder.tsx`
- Create: `src/components/waivers/WaiverAssumeModal.tsx`
- Create: `src/app/waivers/page.tsx`
- Create: `src/app/waivers/[id]/page.tsx`
- Modify: `src/components/SiteNav.tsx` — Waivers link (`pathname.startsWith("/waivers")`)
- Modify: `src/app/page.tsx` — optional “Browse waivers” CTA
- Test: `tests/unit/WaiversWorkspace.test.tsx`

**Behavior:**
- Fetch pool on mount
- Clicking a recommendation selects add in builder
- Preview button calls POST preview; show deltas
- Confirm: if `requiresAssumeSuccess`, open modal; else claim
- On success, refetch pool / show updated roster drop list

Mirror Trade list page styling for `/waivers`.

- [ ] **Step 1: Write workspace test** — mock pool; expect recommendations heading; select add; preview shows up

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement UI + nav**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/waivers src/app/waivers src/components/SiteNav.tsx src/app/page.tsx tests/unit/WaiversWorkspace.test.tsx
git commit -m "feat(waivers): add waivers workspace UI and nav"
```

---

### Task 6: Verification smoke

- [ ] **Step 1:** `npm.cmd run lint` — PASS  
- [ ] **Step 2:** `npx.cmd vitest run --maxWorkers=1` — PASS  
- [ ] **Step 3:** Manual `/waivers` — recommendations, preview, FA claim; confirm Roster reflects new player; waiver assume path once  
- [ ] **Step 4:** Commit fixes only if needed  

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| `/waivers` module + nav | 5 |
| SeasonLeague reuse | 4–5 |
| Fixture available + waiverOrder | 1 |
| Recommendations | 3 |
| Pool FA/Waiver badges | 5 |
| Preview 9-cat | 3–5 |
| Local claim + clear localLineup | 2 + 4 |
| FA vs assumeSuccess waiver | 3–4 |
| No ESPN/draft coupling | all |
| Tests | 1–6 |

## Self-review notes

- Pin claim clears `localLineupJson` so Roster matches Waivers.
- Fixture must put perspective team not always first in `waiverOrder` to exercise assume path in manual demos.
- Reuse `teamNeedsAndSurplus` from trade rather than duplicating thresholds.
