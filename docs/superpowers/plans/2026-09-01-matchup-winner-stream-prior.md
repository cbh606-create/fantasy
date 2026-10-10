# Matchup Winner Stream Prior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank Matchup streaming adds with a tiny bonus from this ESPN league’s week-winning teams’ add recipes, plus one mute hint under Strategy.

**Architecture:** Pure recipe/bonus math in `winnerStreamPrior.ts`. ESPN parse/fetch (cookies, 15s timeout, login-page → skip) in `winnerStreamHistory.ts` with a 6h in-memory cache. `pickBestStreamerMove` sorts `delta` then recipe hits (never mix ε into displayed delta). Matchup GET loads recipes best-effort and returns them so the client planner can reuse them.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS 4, Vitest. Branch `feat/published-nba-schedule`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-01-matchup-winner-stream-prior-design.md`
- Bonus only after schedule gates and `delta > 0`; do not replace Aggressive/Balanced/Conservative
- ESPN fail / manual league / empty history → empty recipes, no throw, no blocking error
- No Prisma for recipes; cache key `espnLeagueId + season`, TTL 6 hours
- UI copy English; hint mute under Strategy chips
- No live HTTP in CI; fixture + unit tests only
- No semicolons; `handle*` handlers; tests: `npx.cmd vitest run --maxWorkers=1 <path>`

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/matchup/winnerStreamPrior.ts` | Slot group, add kinds, recipes, hits, hint |
| `src/lib/espn/winnerStreamHistory.ts` | Map ESPN JSON; fetch + 6h cache |
| `data/fixtures/espn-winner-stream-sample.json` | Tiny 2 completed weeks + 1 current |
| `src/lib/matchup/streamerMove.ts` | Sort hits after delta |
| `src/lib/matchup/streamingPlans.ts` | Pass recipes into picker |
| `src/lib/matchup/streamers.ts` | Same hits as score tie-break |
| `src/lib/matchup/advise.ts` / `types.ts` | `winnerStreamRecipes` on advice |
| `src/lib/waivers/loadSeasonLeague.ts` | Return `espnLeagueId` |
| `src/app/api/matchup/route.ts` | Best-effort fetch recipes |
| `src/components/matchup/StreamingPlansPanel.tsx` | Hint + pass recipes into planner |
| `src/components/matchup/MatchupWorkspace.tsx` | Forward recipes |
| `tests/unit/winnerStreamPrior.test.ts` | Spec §7 |
| `tests/unit/winnerStreamHistory.test.ts` | Mapper: winner / loser / current week |
| `tests/unit/StreamingPlansPanel.test.tsx` | Hint present / absent |

---

### Task 1: Pure prior (recipes, hits, hint)

**Files:**
- Create: `src/lib/matchup/winnerStreamPrior.ts`
- Create: `tests/unit/winnerStreamPrior.test.ts`

**Produces:**
- `COUNTING_KIND_TIEBREAK: CategoryId[]` = `STL, BLK, AST, REB, TPM, PTS`
- `playerSlotGroup(player): "G" | "F" | "C"`
- `playerAddKinds(player, enabledCats): CategoryId[]` — top 1–2 counting cats; second if ≥ 85% of top
- `buildWinnerStreamRecipes(input): WinnerStreamRecipe[]`
- `winnerPriorHits(player, board, recipes): number`
- `winnerStreamHint(board, recipes): string | null` — e.g. `Winners here streamed STL/BLK when trailing those cats`
- Keep pairs with count ≥ 2, or ≥ 1 if `completedPeriodCount < 8`; cap top 6 by count

- [ ] **Step 1: Write failing tests** in `tests/unit/winnerStreamPrior.test.ts` covering spec §7.1–7.6 plus hint copy
- [ ] **Step 2: Run** `npx.cmd vitest run --maxWorkers=1 tests/unit/winnerStreamPrior.test.ts` — FAIL (module missing)
- [ ] **Step 3: Implement** `winnerStreamPrior.ts`
- [ ] **Step 4: Re-run tests** — PASS

---

### Task 2: ESPN fixture + mapper

**Files:**
- Create: `data/fixtures/espn-winner-stream-sample.json`
- Create: `src/lib/espn/winnerStreamHistory.ts`
- Create: `tests/unit/winnerStreamHistory.test.ts`

**Produces:**
- `mapEspnWinnerStreamPayload(payload, players, enabledCats, currentMatchupPeriod): WinnerStreamRecipe[]`
- Join: `settings.scheduleSettings.matchupPeriods` maps scoringPeriodId → matchupPeriodId; fallback identity
- Winner = more `cumulativeScore.wins` (else count `scoreByStat` WIN); equal wins → exclude both
- Skip `matchupPeriodId >= currentMatchupPeriod`
- Keep FREEAGENT/WAIVER ADD+DROP; ignore TRADE
- `loadWinnerStreamRecipes({ leagueId, season, cookies, players, enabledCats, currentScoringPeriodId })` — cache 6h; catch all errors → `[]`
- Reuse Cookie header / 15s abort / login-page HTML skip from `espnSeasonLive.ts` (do not throw ESPN_AUTH to Matchup)
- Fetch: one `mTransactions`+`mSettings` call, then `mScoreboard&scoringPeriodId=` last day of each **completed** matchup period (cap 20)

- [ ] **Step 1: Write failing mapper tests** against the fixture
- [ ] **Step 2: Run** — FAIL
- [ ] **Step 3: Implement mapper + fetch/cache**
- [ ] **Step 4: Re-run** — PASS

---

### Task 3: Apply in planner + API + hint

**Files:**
- Modify: `src/lib/matchup/streamerMove.ts` — `options?.recipes`; sort delta then hits then index
- Modify: `src/lib/matchup/streamingPlans.ts` — `winnerStreamRecipes?: WinnerStreamRecipe[]`
- Modify: `src/lib/matchup/streamers.ts` — optional recipes; tie-break after score/games
- Modify: `src/lib/matchup/types.ts` — `winnerStreamRecipes?: WinnerStreamRecipe[]`
- Modify: `src/lib/matchup/advise.ts` — pass through
- Modify: `src/lib/waivers/loadSeasonLeague.ts` — `espnLeagueId: string | null`
- Modify: `src/app/api/matchup/route.ts` — cookies + `loadWinnerStreamRecipes` best-effort
- Modify: `src/components/matchup/StreamingPlansPanel.tsx` — hint under Strategy; pass recipes
- Modify: `src/components/matchup/MatchupWorkspace.tsx` — forward recipes
- Create: `tests/unit/StreamingPlansPanel.test.tsx`
- Modify: `tests/unit/winnerStreamPrior.test.ts` — equal vs unequal delta via `pickBestStreamerMove` or sort helper

**Sort (do not add ε to displayed `delta`):**
```
if (right.delta !== left.delta) return right.delta - left.delta
if (rightHits !== leftHits) return rightHits - leftHits
return left.index - right.index
```

- [ ] **Step 1: Failing tests** for delta 0.12 vs 0.10; equal-delta recipe winner; panel hint
- [ ] **Step 2: Implement wiring**
- [ ] **Step 3: Run** `npx.cmd vitest run --maxWorkers=1 tests/unit/winnerStreamPrior.test.ts tests/unit/winnerStreamHistory.test.ts tests/unit/StreamingPlansPanel.test.tsx tests/api/matchup.test.ts`
- [ ] **Step 4: Commit + push** `feat/published-nba-schedule` (PR #9). Do not open a second PR.

---

## Self-review

- Spec §1–5 covered by Tasks 1–3
- Non-goals: no Prisma, no strategy-chip replacement, no live-at-click board
- `espnLeagueId` comes from Prisma `SeasonLeague`, not `SeasonLeagueState`
