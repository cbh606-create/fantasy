# Trade Module — Design Spec

**Date:** 2026-08-11  
**Status:** Approved for implementation planning  
**Product:** Season-long trade finder (separate from Roster and Draft)  
**Related:** [Season Roster Module](./2026-08-11-season-roster-module-design.md)

---

## 1. Goal

Help a category-league manager find **realistic win-win trades**: surface which categories YOU are weak in, then suggest deals with other teams where **both sides improve**, using needs-matching first and mutual-improvement scoring second. Uneven headcount deals require the side sending **more players to overpay**.

### Success criteria (MVP)

- Dedicated **Trade** surface (not a Roster tab): `/trade` list + `/trade/[seasonLeagueId]` workspace.
- Reuses existing `SeasonLeague` / season category analysis (all-14 roster totals & ranks).
- Shows YOU weak/surplus category summary.
- Suggests ranked deals for shapes: **`1:1`**, **`2:1` / `1:2`**, **`2:2`**.
- Each suggestion explains give/get, counterparty, short reasons, and before/after category impact for both teams.
- Selecting a deal shows a simple before/after 9-cat comparison.
- Pure trade engine is unit-tested (needs filter, win-win, overpay, fairness band).
- No ESPN trade submission.

### Non-goals (MVP)

- Writing trades to ESPN.
- Waiver wire / free-agent pool.
- Shapes `3:1`, `3:2`, `3:3`, and larger (explicit follow-up).
- Draft board / mock / simulate coupling.
- Position/slot legality beyond “player is on that team’s roster” (no PG/SG fit checks).
- Live opponent chat or trade offers inbox.
- Points leagues.

---

## 2. Why a separate module

| Concern | Roster | **Trade** |
|---|---|---|
| Primary job | View & analyze YOUR roster + schedule | Find mutually beneficial trades |
| Scope | YOU-centric tables | League-wide needs matching |
| Navigation | `/roster` | `/trade` |
| Shared | `SeasonLeague`, category totals/ranks | Same — **no** new parallel league store |

**Boundary rule:** Trade must not import draft simulate/board/mock. Roster must not grow a heavy trade explorer tab. Trade may import season analysis helpers and load season league state the same way Roster does.

---

## 3. Product decisions

| Decision | Choice |
|---|---|
| Placement | New module + SiteNav entry **Trade** |
| League source | Existing `SeasonLeague` (same IDs as Roster) |
| Scoring style | H2H 9-cat; analysis population = all 14 rostered players (match Roster) |
| Win-win definition | Needs match **and** both sides improve needs-focused scores after sim |
| Deal shapes (MVP) | `1:1`, `2:1`, `1:2`, `2:2` |
| Asymmetric overpay | Side giving more players must send **meaningfully more value** than the one-player side |
| Symmetric fairness | `1:1` / `2:2`: reject if value sums diverge beyond a fairness band |
| Value proxy | Projection-based composite (category z-sum style); ADP optional later |
| IL players | Excluded from suggestions by default |
| Empty slots | Ignored |
| Top N shown | Cap suggestions (e.g. 20) after sort |
| ESPN writeback | Never (MVP) |

---

## 4. UI

### 4.1 Routes

- `/trade` — list season leagues (reuse mental model of `/roster`; link into trade workspace).
- `/trade/[id]` — trade workspace for that season league id.

SiteNav: Home · Draft · Roster · **Trade**.

### 4.2 Workspace layout (top → bottom)

1. **Header** — league name, season, link back to Roster for same id (optional shortcut).
2. **Your weak categories** — short summary of YOU needs + surplus (ranks/z).
3. **Suggested deals** — interactive list rows/cards (cards only as selection containers):
   - Shape badge (`1:1` / `2:1` / `2:2`)
   - Counterparty team name
   - You give → You get (player names)
   - One-line reason (needs + shape note)
   - Compact both-sides delta chips for key cats
4. **Deal detail** (when a suggestion is selected) — before/after 9-cat for YOU and counterparty.

Default: first suggestion selected, or empty state if none.

### 4.3 Empty / loading / error

- Loading while suggestions compute.
- Empty: “No mutually beneficial deals found under current rules.”
- Error isolated to Trade workspace (does not break Roster).

---

## 5. Engine

### 5.1 Inputs

- `SeasonLeagueState` for one league (teams, players, perspectiveTeamIndex).
- Category totals/ranks from existing season analysis (or equivalent pure recompute).

### 5.2 Player value

Each rostered player gets a scalar `value` from season projections (e.g. sum of per-cat z vs league player pool, or team-relative contribution). Exact formula locked in implementation plan; must be deterministic and unit-tested.

### 5.3 Team needs & surplus

For each team and category, using league ranks (1 = best):

- **Need:** rank ≥ `NEED_RANK_FLOOR` (default **9** in a 12-team league)
- **Surplus:** rank ≤ `SURPLUS_RANK_CEILING` (default **4**)

Constants are named and tunable in one place.

### 5.4 Pipeline

1. **Needs-match filter (pair teams)**  
   Consider YOU vs each other team where there exists complementary need/surplus overlap (YOU need ∩ their surplus, their need ∩ YOU surplus).

2. **Enumerate candidate packages (MVP shapes only)**  
   From non-IL rostered players on each side:
   - `1:1`: one YOU player ↔ one theirs  
   - `2:1`: two YOU ↔ one theirs  
   - `1:2`: one YOU ↔ two theirs  
   - `2:2`: two YOU ↔ two theirs  

   Cap enumeration with pragmatic limits if needed (e.g. only players in surplus cats or top-K value on each side) — document limits in the plan; never silently drop shapes entirely.

3. **Simulate**  
   Apply swap to both team rosters; recompute category totals/ranks for those two teams in league context (other teams unchanged).

4. **Win-win gate**  
   Both teams must improve a **needsScore** (aggregate of their Need categories — lower rank / higher z after trade). If either side’s needsScore does not improve, reject.

5. **Shape rules**  
   - **Symmetric (`1:1`, `2:2`):**  
     `|value(give) - value(get)| / max(value(give), value(get), ε) ≤ FAIRNESS_BAND`  
     (default band ~0.25; exact constant in plan).  
   - **Asymmetric (`2:1`, `1:2`):**  
     Let `multi` = side sending 2 players, `single` = side sending 1.  
     Require `value(multi) ≥ value(single) * OVERPAY_RATIO` (default **1.15–1.25** range; pick one in plan).  
     Ranking may further boost deals where the **single-player receiver** gains more needsScore than the multi side (realistic acceptance bias).

6. **Sort & truncate**  
   Sort by `mutualScore` (e.g. harmonic mean of both needsScore deltas, minus penalty for damaging already-elite cats unnecessarily). Return top **N** (default 20).

### 5.5 Output suggestion object

```ts
type CategoryDelta = {
  categoryId: CategoryId
  rankBefore: number
  rankAfter: number
}

type TradeSideImpact = {
  needsScoreBefore: number
  needsScoreAfter: number
  categoryDeltas: CategoryDelta[] // typically Need cats + any large movers
}

type TradeSuggestion = {
  id: string
  shape: "1:1" | "2:1" | "1:2" | "2:2"
  counterpartyTeamIndex: number
  givePlayerIds: string[]
  getPlayerIds: string[]
  reasons: string[]
  mutualScore: number
  overpayRatio?: number // multiValue / singleValue when shape is 2:1 or 1:2
  you: TradeSideImpact
  them: TradeSideImpact
}
```

---

## 6. API

`GET /api/trade/suggestions?seasonLeagueId={id}`

- Auth: Clerk `requireUserId`; league must be owned by user (404 otherwise).
- Response: `{ suggestions: TradeSuggestion[]; youNeeds: ...; youSurplus: ... }` (exact DTO in plan).
- MVP: synchronous compute from stored season state; fixture leagues must produce at least some suggestions in tests.
- Rate limit: reuse existing rate-limit helper if present (conservative per-user cap).

No POST trade execution endpoint in MVP.

---

## 7. Architecture

| Path | Responsibility |
|---|---|
| `src/lib/trade/*` | Value, needs, enumerate, simulate, score (pure) |
| `src/app/api/trade/suggestions/route.ts` | Auth + load season league + run engine |
| `src/app/trade/page.tsx` | League picker |
| `src/app/trade/[id]/page.tsx` | Workspace shell |
| `src/components/trade/*` | Weak-cats summary, suggestion list, deal detail |
| `src/components/SiteNav.tsx` | Add Trade link |

Shared: season types, `analyzeSeasonLeague` (or extracted pure pieces), auth, db.

---

## 8. Testing

| Layer | Coverage |
|---|---|
| Unit | Needs/surplus tags; 1:1 mutual improve pass/fail; 2:1 rejects without overpay; 2:1 accepts with overpay + mutual gain; 2:2 fairness band |
| API | 401 / 404 / 200 shape with fixture season league |
| Component | Renders weak cats + at least one suggestion row from mocked API |

E2E optional / out of MVP.

---

## 9. Follow-ups (post-MVP)

- `3:1` / `1:3` / `3:2` with the same overpay philosophy (more players ⇒ must overpay).
- ADP / external value into `value`.
- Position/roster-fit constraints.
- Schedule/week-aware trade value (games volume).
- Persist “dismissed” suggestions per user.
- Async job + cache for large enumerations.

---

## 10. Open constants (pin in implementation plan)

| Constant | Intent | MVP default target |
|---|---|---|
| `NEED_RANK_FLOOR` | Rank at/worse counts as need | 9 |
| `SURPLUS_RANK_CEILING` | Rank at/better counts as surplus | 4 |
| `FAIRNESS_BAND` | Max relative value gap for 1:1 / 2:2 | 0.25 |
| `OVERPAY_RATIO` | Min multi/single value for 2:1 / 1:2 | 1.2 |
| `MAX_SUGGESTIONS` | UI/API cap | 20 |
