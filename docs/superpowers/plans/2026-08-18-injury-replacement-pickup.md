# Injury Replacement Pickup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase B injury→backup FA recommendations (fixture depth chart + injury events), surfaced on Matchup alerts and Waivers injury pickups with existing claim deep-links — including a Trae Young OUT → Nickeil Alexander-Walker demo path.

**Architecture:** Provider interfaces (`DepthChartProvider`, `InjuryEventProvider`) with fixture implementations; pure `recommendInjuryPickups` maps events → available backups with roster/league urgency; `GET /api/injuries/pickups` loads owned season league; Matchup + Waivers panels consume the API. Phase A swaps only the injury provider later.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind, Vitest, existing SeasonLeague + waivers claim path. Worktree: `.worktrees/feat-season-roster` on `feat/matchup-advisor` (or a new branch off it).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-injury-replacement-pickup-design.md`
- Phase B only: fixture depth + fixture injuries — **no live scrape**
- Surfaces: Matchup Injury alerts + Waivers Injury pickups
- Urgency: `roster` if YOU own injured player, else `league`; sort roster first
- Action: prefill / deep-link claim — **no auto-claim**
- Demo: Trae Young OUT → Nickeil Alexander-Walker available
- Provider hooks for Phase A ESPN injury swap
- No semicolons; `handle*` handlers; Tailwind; conventional commits
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>`
- Do not stage unrelated dirty WIP (draft teams / roster Import fixes)

---

## File Structure

| Path | Responsibility |
|---|---|
| `data/fixtures/nba-depth-chart.json` | Team ladders of season player ids |
| `data/fixtures/injury-events.json` | OUT/GTD events for Phase B |
| `src/lib/injuries/types.ts` | Event, depth, recommendation DTOs |
| `src/lib/injuries/constants.ts` | Caps, depth score weights, GTD weight |
| `src/lib/injuries/providers.ts` | Provider interfaces + fixture providers |
| `src/lib/injuries/recommend.ts` | `recommendInjuryPickups` |
| `src/app/api/injuries/pickups/route.ts` | GET API |
| `src/components/waivers/InjuryPickupsPanel.tsx` | Waivers list + select |
| `src/components/matchup/InjuryAlertsPanel.tsx` | Matchup alerts + Waivers CTA |
| `src/components/waivers/WaiversWorkspace.tsx` | Wire panel + fetch |
| `src/components/matchup/MatchupWorkspace.tsx` | Wire alerts panel |
| `tests/unit/injuryRecommend.test.ts` | Domain tests |
| `tests/api/injuriesPickups.test.ts` | API tests |
| `tests/unit/WaiversWorkspace.test.tsx` | Prefill smoke (extend) |
| `tests/unit/MatchupWorkspace.test.tsx` | Alert CTA smoke (extend or create) |

---

### Task 1: Types, constants, fixtures

**Files:**
- Create: `src/lib/injuries/types.ts`
- Create: `src/lib/injuries/constants.ts`
- Create: `data/fixtures/nba-depth-chart.json`
- Create: `data/fixtures/injury-events.json`
- Test: `tests/unit/injuryRecommend.test.ts` (fixture load smoke only in this task — or defer first assert to Task 2; prefer Task 1 exports + JSON parse smoke)

**Interfaces:**
- Produces:
  - `InjuryStatus = "out" | "gtd"`
  - `InjuryEvent`, `DepthChartTeam`, `InjuryPickupRecommendation`
  - `DEPTH_BASE = 100`, `DEPTH_STEP = 15`, `GTD_WEIGHT = 0.5`, `MAX_INJURY_PICKUPS = 10`
  - Fixture player ids used everywhere after this task:
    - `trae-young`, `nickeil-alexander-walker`, optional `atl-bench-3`

- [ ] **Step 1: Write failing smoke test that imports fixtures + constants**

```ts
// tests/unit/injuryRecommend.test.ts
import { describe, expect, it } from "vitest"
import depthChart from "../../data/fixtures/nba-depth-chart.json"
import injuryEvents from "../../data/fixtures/injury-events.json"
import { DEPTH_BASE, MAX_INJURY_PICKUPS } from "@/lib/injuries/constants"

describe("injury fixtures", () => {
  it("includes ATL Trae → NAW depth order and Trae OUT event", () => {
    const atl = depthChart.teams.find((team) => team.teamAbbr === "ATL")
    expect(atl?.slots[0]?.playerIds[0]).toBe("trae-young")
    expect(atl?.slots[0]?.playerIds[1]).toBe("nickeil-alexander-walker")
    expect(injuryEvents.events.some((event) => event.playerId === "trae-young" && event.status === "out")).toBe(true)
    expect(DEPTH_BASE).toBe(100)
    expect(MAX_INJURY_PICKUPS).toBe(10)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (missing modules/fixtures)

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/injuryRecommend.test.ts`

- [ ] **Step 3: Implement types, constants, fixtures**

```ts
// src/lib/injuries/constants.ts
export const DEPTH_BASE = 100
export const DEPTH_STEP = 15
export const GTD_WEIGHT = 0.5
export const MAX_INJURY_PICKUPS = 10
```

```ts
// src/lib/injuries/types.ts
export type InjuryStatus = "out" | "gtd"

export type InjuryEvent = {
  playerId: string
  teamAbbr: string
  status: InjuryStatus
  note?: string
}

export type DepthChartSlot = {
  playerIds: string[]
}

export type DepthChartTeam = {
  teamAbbr: string
  slots: DepthChartSlot[]
}

export type DepthChartFixture = {
  teams: DepthChartTeam[]
}

export type InjuryEventsFixture = {
  events: InjuryEvent[]
}

export type InjuryPickupRecommendation = {
  injuredPlayerId: string
  injuredPlayerName: string
  addPlayerId: string
  addPlayerName: string
  teamAbbr: string
  status: InjuryStatus
  depthRank: number
  urgency: "roster" | "league"
  score: number
  reasons: string[]
}

export type InjuryPickupsResult = {
  events: InjuryEvent[]
  recommendations: InjuryPickupRecommendation[]
  source: { depth: "fixture"; injuries: "fixture" }
}
```

```json
// data/fixtures/nba-depth-chart.json
{
  "teams": [
    {
      "teamAbbr": "ATL",
      "slots": [
        {
          "playerIds": [
            "trae-young",
            "nickeil-alexander-walker",
            "atl-bench-3"
          ]
        }
      ]
    }
  ]
}
```

```json
// data/fixtures/injury-events.json
{
  "events": [
    {
      "playerId": "trae-young",
      "teamAbbr": "ATL",
      "status": "out",
      "note": "Right knee"
    }
  ]
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/types.ts src/lib/injuries/constants.ts data/fixtures/nba-depth-chart.json data/fixtures/injury-events.json tests/unit/injuryRecommend.test.ts
git commit -m "feat(injuries): add Phase B fixtures types and constants"
```

---

### Task 2: Providers + recommendInjuryPickups

**Files:**
- Create: `src/lib/injuries/providers.ts`
- Create: `src/lib/injuries/recommend.ts`
- Modify: `tests/unit/injuryRecommend.test.ts`

**Interfaces:**
- Consumes: fixtures, `SeasonLeagueState`, types/constants
- Produces:
  - `DepthChartProvider { backups(teamAbbr, injuredPlayerId): string[] }`
  - `InjuryEventProvider { list(): InjuryEvent[] }`
  - `fixtureDepthChartProvider`, `fixtureInjuryEventProvider`
  - `recommendInjuryPickups({ state, depth, injuries, playersById? }): InjuryPickupsResult`

`backups`: find slot containing `injuredPlayerId` on that team; return subsequent ids in order. If not found, return `[]` (caller may skip).

Scoring per spec: depth base − (rank−1)*step; GTD × 0.5; filter `availablePlayerIds`; urgency from YOU roster; sort roster first then score; cap `MAX_INJURY_PICKUPS`. Deduplicate `addPlayerId` keep higher score.

- [ ] **Step 1: Write failing domain tests**

Build a tiny `SeasonLeagueState` inline (mirror `tests/unit/matchupStream.test.ts` / waivers tests):

- Players: Trae (ATL), NAW (ATL), filler
- `availablePlayerIds`: includes `nickeil-alexander-walker`
- YOU roster may or may not include Trae depending on case

```ts
describe("recommendInjuryPickups", () => {
  it("recommends NAW when Trae is OUT and NAW is available", () => {
    const result = recommendInjuryPickups({
      state: miniStateFaNaw,
      depth: fixtureDepthChartProvider,
      injuries: fixtureInjuryEventProvider,
    })
    expect(result.recommendations[0]?.addPlayerId).toBe("nickeil-alexander-walker")
    expect(result.recommendations[0]?.injuredPlayerId).toBe("trae-young")
    expect(result.recommendations[0]?.depthRank).toBe(1)
    expect(result.recommendations[0]?.reasons.join(" ")).toMatch(/depth/i)
  })

  it("marks urgency roster when YOU own Trae", () => {
    const result = recommendInjuryPickups({ state: miniStateYouOwnTrae, ... })
    expect(result.recommendations[0]?.urgency).toBe("roster")
  })

  it("skips NAW when not available", () => {
    const result = recommendInjuryPickups({ state: miniStateNawRosteredElsewhere, ... })
    expect(result.recommendations.every((r) => r.addPlayerId !== "nickeil-alexander-walker")).toBe(true)
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement providers + recommend**

```ts
// providers.ts sketch
export type DepthChartProvider = {
  backups: (teamAbbr: string, injuredPlayerId: string) => string[]
}
export type InjuryEventProvider = {
  list: () => InjuryEvent[]
}

export const fixtureDepthChartProvider: DepthChartProvider = {
  backups: (teamAbbr, injuredPlayerId) => { /* load JSON, find slot, slice after injured */ },
}
export const fixtureInjuryEventProvider: InjuryEventProvider = {
  list: () => injuryEventsFixture.events as InjuryEvent[],
}
```

```ts
// recommend.ts sketch
export const recommendInjuryPickups = (input: {
  state: SeasonLeagueState
  depth: DepthChartProvider
  injuries: InjuryEventProvider
}): InjuryPickupsResult => {
  // for each event → backups → available → score → reasons → urgency
  // sort + slice
  return { events, recommendations, source: { depth: "fixture", injuries: "fixture" } }
}
```

Names: resolve from `state.players` by id; fallback to id if missing.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/providers.ts src/lib/injuries/recommend.ts tests/unit/injuryRecommend.test.ts
git commit -m "feat(injuries): recommend depth-chart backups for injury events"
```

---

### Task 3: GET `/api/injuries/pickups`

**Files:**
- Create: `src/app/api/injuries/pickups/route.ts`
- Test: `tests/api/injuriesPickups.test.ts`

**Interfaces:**
- Consumes: `requireUserId`, `loadOwnedSeasonLeague`, `recommendInjuryPickups`, fixture providers
- Query: `seasonLeagueId` required

For API tests: seed a season league whose `stateJson` includes Trae/NAW players and NAW in `availablePlayerIds` (construct state in test — do not require editing the giant espn-season fixture unless convenient).

- [ ] **Step 1: Failing API tests** — 401, 400 missing id, 200 shape with ≥1 recommendation when seeded

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement GET** mirroring `src/app/api/waivers/pool/route.ts` auth pattern

```ts
export const GET = async (request: Request): Promise<Response> => {
  // auth → parse seasonLeagueId → loadOwnedSeasonLeague
  // recommendInjuryPickups({ state, depth: fixtureDepthChartProvider, injuries: fixtureInjuryEventProvider })
  // return NextResponse.json(result)
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/injuries/pickups/route.ts tests/api/injuriesPickups.test.ts
git commit -m "feat(injuries): add injury pickups API"
```

---

### Task 4: Waivers `InjuryPickupsPanel`

**Files:**
- Create: `src/components/waivers/InjuryPickupsPanel.tsx`
- Modify: `src/components/waivers/WaiversWorkspace.tsx`
- Modify: `tests/unit/WaiversWorkspace.test.tsx`

**UI:**
- Soft-cloud aside labeled **Injury pickups**
- List recs: injured (OUT) → add name, urgency badge, reasons
- Click → `onSelectAdd(addPlayerId)`
- Empty: hide or “No injury-driven pickups right now.”
- Place near top of right column / above Matchup stream or Season needs — prefer **above Matchup stream**

Fetch: `GET /api/injuries/pickups?seasonLeagueId=`

- [ ] **Step 1: Extend workspace test** — mock injuries API; click NAW row sets add selection / calls handler

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement panel + wire fetch in workspace (AbortController on unmount)

- [ ] **Step 4: Run WaiversWorkspace tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/waivers/InjuryPickupsPanel.tsx src/components/waivers/WaiversWorkspace.tsx tests/unit/WaiversWorkspace.test.tsx
git commit -m "feat(waivers): show injury pickups panel"
```

---

### Task 5: Matchup `InjuryAlertsPanel`

**Files:**
- Create: `src/components/matchup/InjuryAlertsPanel.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Modify or create: `tests/unit/MatchupWorkspace.test.tsx`

**UI:**
- Near Streamers panel
- Roster urgency first (API already sorts)
- CTA Link: `/waivers/${leagueId}?addPlayerId=${addPlayerId}`
- Hide when no recommendations

- [ ] **Step 1: Failing test** — alert CTA href contains `addPlayerId=nickeil-alexander-walker` (mock fetch)

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement + wire**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/InjuryAlertsPanel.tsx src/components/matchup/MatchupWorkspace.tsx tests/unit/MatchupWorkspace.test.tsx
git commit -m "feat(matchup): show injury replacement alerts"
```

---

### Task 6: Spec cross-check polish

**Files:** any gaps (empty states, Phase B source note optional, ensure season needs / matchup stream labels still distinct)

- [ ] **Step 1: Checklist vs spec §1 success criteria**
- [ ] **Step 2: Run combined tests**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/injuryRecommend.test.ts tests/api/injuriesPickups.test.ts tests/unit/WaiversWorkspace.test.tsx tests/unit/MatchupWorkspace.test.tsx
```

- [ ] **Step 3: Commit chore if needed**

```bash
git commit -m "chore(injuries): polish injury pickup empty states"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| Fixture depth + events | 1 |
| Engine map → available backups | 2 |
| Urgency roster vs league | 2 |
| Trae→NAW demo | 1–2 |
| GET API | 3 |
| Waivers panel + prefill | 4 |
| Matchup alerts + deep-link | 5 |
| Provider swap hook for Phase A | 2 (`InjuryEventProvider` / `DepthChartProvider`) |
| No live scrape / no auto-claim | Global |

No TBD placeholders. Dedicated injuries API (not bolted onto waivers pool) as in spec.

---

## Execution

Plan saved to `docs/superpowers/plans/2026-08-18-injury-replacement-pickup.md`.
