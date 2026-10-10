# Trade Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Draft/Roster-separate Trade workspace that lists win-win `1:1` / `2:1` / `1:2` / `2:2` suggestions from an existing `SeasonLeague`, with needs-matching, mutual improvement, asymmetric overpay, and symmetric fairness.

**Architecture:** Pure engine under `src/lib/trade/*` reads `SeasonLeagueState` + `analyzeSeasonLeague`. API `GET /api/trade/suggestions` auth-checks ownership and returns Top N. UI at `/trade` and `/trade/[id]` with weak-cats summary, suggestion list, and deal detail. No ESPN writeback; no draft imports.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS 4, Clerk, Prisma/libSQL (season league load only), Vitest + Testing Library. Work in `.worktrees/feat-season-roster` on `feat/season-roster` (or a `feat/trade-module` branch cut from it).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-trade-module-design.md`
- Reuse `SeasonLeague` / `analyzeSeasonLeague`; do not create a parallel league store
- Shapes MVP only: `1:1`, `2:1`, `1:2`, `2:2` (no 3:x)
- IL slot players excluded; empty slots ignored
- `NEED_RANK_FLOOR = 9`, `SURPLUS_RANK_CEILING = 4`, `FAIRNESS_BAND = 0.25`, `OVERPAY_RATIO = 1.2`, `MAX_SUGGESTIONS = 20`
- Asymmetric: multi-side value ≥ single-side value × `OVERPAY_RATIO`
- Symmetric: relative value gap ≤ `FAIRNESS_BAND`
- Both sides must improve `needsScore` after sim
- No draft simulate/board/mock imports; no ESPN trade writeback
- No semicolons in TS/TSX; conventional commits; `handle*` for events; Tailwind only
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>` when DB suites flake

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/trade/constants.ts` | Tunable thresholds |
| `src/lib/trade/types.ts` | Suggestion DTOs + engine types |
| `src/lib/trade/value.ts` | Player value from projections |
| `src/lib/trade/needs.ts` | Need/surplus category sets per team |
| `src/lib/trade/simulate.ts` | Apply package swap + re-analyze two teams’ impacts |
| `src/lib/trade/enumerate.ts` | Generate candidate packages with caps |
| `src/lib/trade/score.ts` | Win-win / overpay / fairness filters + mutualScore |
| `src/lib/trade/suggest.ts` | Orchestrate pipeline → Top N |
| `src/app/api/trade/suggestions/route.ts` | Authenticated GET |
| `src/app/trade/page.tsx` | Season league picker |
| `src/app/trade/[id]/page.tsx` | Workspace page |
| `src/components/trade/TradeWorkspace.tsx` | Client workspace |
| `src/components/trade/WeakCategoriesPanel.tsx` | YOU needs/surplus |
| `src/components/trade/SuggestionList.tsx` | Ranked deals |
| `src/components/trade/DealDetail.tsx` | Before/after cats |
| `src/components/SiteNav.tsx` | Add Trade link (commit if still untracked) |
| `src/app/page.tsx` | Optional Trade CTA |
| `tests/unit/trade*.test.ts` | Engine tests |
| `tests/api/tradeSuggestions.test.ts` | API tests |
| `tests/unit/TradeWorkspace.test.tsx` | UI smoke |

---

### Task 1: Trade constants + types

**Files:**
- Create: `src/lib/trade/constants.ts`
- Create: `src/lib/trade/types.ts`
- Test: `tests/unit/tradeConstants.test.ts`

**Interfaces:**
- Produces:
  - `NEED_RANK_FLOOR = 9`, `SURPLUS_RANK_CEILING = 4`, `FAIRNESS_BAND = 0.25`, `OVERPAY_RATIO = 1.2`, `MAX_SUGGESTIONS = 20`
  - `TradeShape = "1:1" | "2:1" | "1:2" | "2:2"`
  - `CategoryDelta`, `TradeSideImpact`, `TradeSuggestion` per spec §5.5
  - `TradePackage = { shape; youPlayerIds: string[]; themPlayerIds: string[]; counterpartyTeamIndex: number }`

- [ ] **Step 1: Write failing constants test**

```ts
import { describe, expect, it } from "vitest"
import {
  FAIRNESS_BAND,
  MAX_SUGGESTIONS,
  NEED_RANK_FLOOR,
  OVERPAY_RATIO,
  SURPLUS_RANK_CEILING,
} from "@/lib/trade/constants"

describe("trade constants", () => {
  it("pins MVP thresholds from the spec", () => {
    expect(NEED_RANK_FLOOR).toBe(9)
    expect(SURPLUS_RANK_CEILING).toBe(4)
    expect(FAIRNESS_BAND).toBe(0.25)
    expect(OVERPAY_RATIO).toBe(1.2)
    expect(MAX_SUGGESTIONS).toBe(20)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/tradeConstants.test.ts`

- [ ] **Step 3: Implement constants + types**

```ts
// src/lib/trade/constants.ts
export const NEED_RANK_FLOOR = 9
export const SURPLUS_RANK_CEILING = 4
export const FAIRNESS_BAND = 0.25
export const OVERPAY_RATIO = 1.2
export const MAX_SUGGESTIONS = 20
```

```ts
// src/lib/trade/types.ts
import type { CategoryId } from "@/lib/domain/types"

export type TradeShape = "1:1" | "2:1" | "1:2" | "2:2"

export type CategoryDelta = {
  categoryId: CategoryId
  rankBefore: number
  rankAfter: number
}

export type TradeSideImpact = {
  needsScoreBefore: number
  needsScoreAfter: number
  categoryDeltas: CategoryDelta[]
}

export type TradeSuggestion = {
  id: string
  shape: TradeShape
  counterpartyTeamIndex: number
  givePlayerIds: string[]
  getPlayerIds: string[]
  reasons: string[]
  mutualScore: number
  overpayRatio?: number
  you: TradeSideImpact
  them: TradeSideImpact
}

export type TradePackage = {
  shape: TradeShape
  counterpartyTeamIndex: number
  youPlayerIds: string[]
  themPlayerIds: string[]
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/constants.ts src/lib/trade/types.ts tests/unit/tradeConstants.test.ts
git commit -m "feat(trade): add trade constants and types"
```

---

### Task 2: Player value + team needs

**Files:**
- Create: `src/lib/trade/value.ts`
- Create: `src/lib/trade/needs.ts`
- Test: `tests/unit/tradeValueNeeds.test.ts`

**Interfaces:**
- Consumes: `SeasonLeagueState`, `SeasonAnalysis` / `analyzeSeasonLeague`, `SeasonPlayer`
- Produces:
  - `playerValue(player: SeasonPlayer, leaguePlayers: SeasonPlayer[]): number` — sum of per-cat z vs league player means (TO inverted)
  - `buildPlayerValueMap(state): Map<string, number>`
  - `teamNeedsAndSurplus(analysis, teamIndex): { need: CategoryId[]; surplus: CategoryId[] }`
  - `needsScore(analysis, teamIndex, needCats: CategoryId[]): number` — higher is better: use average of `(13 - rank)` for need cats (or `12 - rank + 1`); empty need set → `0`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { teamNeedsAndSurplus, buildPlayerValueMap, needsScore } from "@/lib/trade/needs"
// split imports if value is separate: buildPlayerValueMap from value.ts
import type { SeasonLeagueState } from "@/lib/season/types"

// Build a tiny 3-team state where team 0 is weak in AST (rank 3) and strong in STL (rank 1)
// Exact fixture inline in the test file — keep players minimal but valid SeasonPlayer shapes.

describe("trade value and needs", () => {
  it("tags need and surplus from ranks", () => {
    const analysis = analyzeSeasonLeague(state)
    const you = teamNeedsAndSurplus(analysis, 0)
    expect(you.need).toContain("AST")
    expect(you.surplus).toContain("STL")
  })

  it("assigns higher value to stronger projection profiles", () => {
    const values = buildPlayerValueMap(state)
    expect(values.get("star")!).toBeGreaterThan(values.get("scrub")!)
  })
})
```

Implement the inline `state` fully in the test (do not leave placeholders).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `value.ts` + `needs.ts`**

Value approach (deterministic):

```ts
// For each CategoryId, compute mean/stdev across all league players' projections[cat]
// playerValue = sum over cats of z (TO uses -z contribution so lower TO increases value)
```

Needs:

```ts
export const teamNeedsAndSurplus = (analysis: SeasonAnalysis, teamIndex: number) => {
  const need: CategoryId[] = []
  const surplus: CategoryId[] = []
  for (const category of analysis.byCategory) {
    const row = category.rows.find((r) => r.teamIndex === teamIndex)
    if (!row) continue
    if (row.rank >= NEED_RANK_FLOOR) need.push(category.categoryId)
    if (row.rank <= SURPLUS_RANK_CEILING) surplus.push(category.categoryId)
  }
  return { need, surplus }
}
```

Put `needsScore` in `needs.ts`. Put `buildPlayerValueMap` in `value.ts` and re-export from `needs.ts` only if tests want one import path — prefer direct imports.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/value.ts src/lib/trade/needs.ts tests/unit/tradeValueNeeds.test.ts
git commit -m "feat(trade): add player value and team needs"
```

---

### Task 3: Simulate trade packages

**Files:**
- Create: `src/lib/trade/simulate.ts`
- Test: `tests/unit/tradeSimulate.test.ts`

**Interfaces:**
- Consumes: `SeasonLeagueState`, `TradePackage`, `analyzeSeasonLeague`, `needsScore`, `teamNeedsAndSurplus`
- Produces:
  - `applyTradePackage(state, pkg): SeasonLeagueState` — swap playerIds between YOU (`perspectiveTeamIndex`) and counterparty entries (match by playerId on any slot; leave slots otherwise unchanged)
  - `evaluateTrade(state, pkg): { you: TradeSideImpact; them: TradeSideImpact } | null` — analyze before/after; build categoryDeltas for union of both sides’ need cats (before); return null if a listed player missing

- [ ] **Step 1: Write failing test** — 1:1 swap moves AST strength from team B to YOU and improves YOU AST rank

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement simulate**

Algorithm for `applyTradePackage`:

1. Clone teams/entries shallowly (new arrays/objects).
2. Remove `youPlayerIds` from YOU entries (set those slots’ playerId null temporarily) and same for them.
3. Assign received players into freed slots first, then any remaining null slots on that team; if not enough slots, still attach by replacing nulls only — for MVP fixtures always have 14 filled so 1:1/2:2 slot counts match. **Simplest MVP:** swap by exchanging playerIds on the specific entries where those IDs currently sit (pair entries). For 2:1, the single receiver’s one entry gets the first incoming id and the second incoming fills a null created on the multi side’s cleared slots — implement carefully and cover with a 2:1 test in Task 4.

Recommended MVP swap strategy (document in code comment):

- Collect entry indexes for each outgoing id on each team.
- For equal count (`1:1`, `2:2`): pairwise assign `youIndexes[i] <- themIds[i]`, `themIndexes[i] <- youIds[i]`.
- For `2:1`: YOU sends 2 ids, receives 1: set both YOU outgoing slots to null, put received id in first YOU slot; counterparty outgoing slot gets first YOU id; second YOU id goes to first null/BE slot on counterparty (prefer existing BE null after clear). Mirror for `1:2`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/simulate.ts tests/unit/tradeSimulate.test.ts
git commit -m "feat(trade): simulate roster swaps for trade packages"
```

---

### Task 4: Enumerate + score + suggest pipeline

**Files:**
- Create: `src/lib/trade/enumerate.ts`
- Create: `src/lib/trade/score.ts`
- Create: `src/lib/trade/suggest.ts`
- Test: `tests/unit/tradeSuggest.test.ts`

**Interfaces:**
- Consumes: simulate, needs, value, constants, types
- Produces:
  - `enumeratePackages(state, analysis): TradePackage[]`
  - `passesShapeRules(pkg, values): { ok: boolean; overpayRatio?: number }`
  - `mutualScore(youDeltaNeeds, themDeltaNeeds): number` — harmonic mean of positive deltas
  - `suggestTrades(state): { suggestions: TradeSuggestion[]; youNeeds: CategoryId[]; youSurplus: CategoryId[] }`

**Enumeration caps (required for performance):**

- Only consider counterparties with complementary needs/surplus vs YOU.
- Candidate players per team: non-IL entries only; take up to **8** highest-`value` players on that team (constant `MAX_CANDIDATES_PER_TEAM = 8` in constants.ts — add in this task).
- Generate combinations for sizes 1 and 2 from that candidate list only.

**Scoring gates:**

1. Evaluate sim impact; both `needsScoreAfter > needsScoreBefore` else reject.
2. Shape rules via values of give/get sets.
3. Build reasons strings from overlapping need/surplus cats + shape note (`"2:1 overpay"` / `"balanced 1:1"`).
4. Sort by `mutualScore` desc; take `MAX_SUGGESTIONS`.
5. `id` = stable hash or join of shape + sorted ids + counterparty index.

- [ ] **Step 1: Write failing tests**

```ts
describe("suggestTrades", () => {
  it("returns a 1:1 win-win when needs complement", () => { ... })
  it("rejects 2:1 without overpay", () => { ... })
  it("accepts 2:1 with overpay and mutual needs improvement", () => { ... })
  it("rejects 2:2 outside fairness band", () => { ... })
})
```

Use constructed mini-leagues (3–4 teams OK if ranks still use floor 9 — **for tiny leagues, temporarily pass overrides OR build 12 teams with mostly identical fillers** so ranks 9+ exist). Prefer **12 teams** with filler rosters so need/surplus thresholds behave as in production.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement enumerate/score/suggest**

Also add to constants:

```ts
export const MAX_CANDIDATES_PER_TEAM = 8
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/constants.ts src/lib/trade/enumerate.ts src/lib/trade/score.ts src/lib/trade/suggest.ts tests/unit/tradeSuggest.test.ts
git commit -m "feat(trade): suggest win-win trade packages"
```

---

### Task 5: `GET /api/trade/suggestions`

**Files:**
- Create: `src/app/api/trade/suggestions/route.ts`
- Test: `tests/api/tradeSuggestions.test.ts`

**Interfaces:**
- Consumes: `requireUserId`, `db.seasonLeague`, `applyLocalLineup` if Roster uses it for effective state, `suggestTrades`
- Produces: JSON `{ suggestions, youNeeds, youSurplus, analysisPerspectiveTeamIndex }`

Load state like `GET /api/season-leagues/[id]` (parse `stateJson`, apply `localLineupJson` via `applyLocalLineup` when present so Trade matches Roster edits).

Optional: `rateLimit` key `trade-suggestions:${userId}` — 10/min if easy to mirror existing refresh limiter.

- [ ] **Step 1: Write API tests** — 401, 404 other user, 200 with `manual: true` created league returning arrays

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement route**

```ts
export const GET = async (request: Request): Promise<Response> => {
  // auth → seasonLeagueId query → findFirst owner → parse state → apply local lineup → suggestTrades → NextResponse.json
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/trade/suggestions/route.ts tests/api/tradeSuggestions.test.ts
git commit -m "feat(trade): add trade suggestions API"
```

---

### Task 6: Trade UI + nav

**Files:**
- Create: `src/components/trade/WeakCategoriesPanel.tsx`
- Create: `src/components/trade/SuggestionList.tsx`
- Create: `src/components/trade/DealDetail.tsx`
- Create: `src/components/trade/TradeWorkspace.tsx`
- Create: `src/app/trade/page.tsx`
- Create: `src/app/trade/[id]/page.tsx`
- Modify: `src/components/SiteNav.tsx` (add Trade; ensure layout already mounts SiteNav — if SiteNav still untracked from earlier UX work, include it in this commit)
- Modify: `src/app/page.tsx` — add “Find trades” link beside roster CTA
- Test: `tests/unit/TradeWorkspace.test.tsx`

**Interfaces:**
- `TradeWorkspace` fetches `/api/trade/suggestions?seasonLeagueId=` and `/api/season-leagues/${id}` for names if needed
- List page mirrors roster list styling (compact rows)

UI density: match tightened roster tables (`text-[0.8125rem]`, modest padding) — no ultra-tiny 0.65rem.

- [ ] **Step 1: Write workspace test** — mock fetch; expect weak-cats heading + a suggestion button/row; selecting shows deal detail

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement components + pages + nav**

`TradeWorkspace` state: `selectedId`, load suggestions once.

`SuggestionList`: `role="listbox"` or buttons with `aria-pressed`.

`DealDetail`: simple two-column before/after ranks for categoryDeltas.

- [ ] **Step 4: Run UI tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/trade src/app/trade src/components/SiteNav.tsx src/app/page.tsx src/app/layout.tsx tests/unit/TradeWorkspace.test.tsx
git commit -m "feat(trade): add trade workspace UI and nav"
```

Only stage `layout.tsx` if it is required to mount `SiteNav` and not yet committed.

---

### Task 7: Verification smoke

- [ ] **Step 1:** `npm.cmd run lint` — PASS  
- [ ] **Step 2:** `npx.cmd vitest run --maxWorkers=1` — PASS  
- [ ] **Step 3:** Manual — `/trade` → open league → see needs + suggestions → open `2:1` detail; confirm Roster still works  
- [ ] **Step 4:** Commit fixes only if needed  

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| Separate `/trade` module + nav | 6 |
| SeasonLeague reuse + local lineup | 5 |
| Weak/surplus summary | 2 + 6 |
| Shapes 1:1, 2:1, 1:2, 2:2 | 4 |
| Needs match + mutual improve | 4 |
| Overpay / fairness | 4 |
| Deal detail before/after | 3 + 6 |
| API auth/ownership | 5 |
| No draft/ESPN writeback | all |
| Unit + API + UI tests | 1–6 |
| Constants pinned | 1 + 4 |

## Self-review notes

- Enumeration capped via `MAX_CANDIDATES_PER_TEAM` to keep MVP responsive; still exposes all four shapes.
- 12-team test fixtures required for rank thresholds 4 / 9 to be meaningful.
- Slot assignment for asymmetric swaps specified in Task 3; Task 4 must include at least one 2:1 acceptance test exercising that path.
