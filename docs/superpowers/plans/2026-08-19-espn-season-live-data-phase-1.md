# ESPN Season Live Data Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Refresh to stored ESPN cookies, fill `availablePlayerIds` from ESPN FA (with ownership fallback), and never overwrite a live season league with fixture data on refresh/import failure.

**Architecture:** Thin patches to `espnSeason` / `espnSeasonLive` / `espnSeasonMap` plus Refresh API. Pure helpers derive or merge FA pools; live fetch optionally pulls `kona_player_info` with `X-Fantasy-Filter`. Fixture remains only for explicit demo/test import when allowed — never for Refresh of ESPN-sourced leagues.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, existing Prisma `SeasonLeague` + `EspnCredential`. Worktree: `.worktrees/feat-season-roster` on `feat/matchup-advisor`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-espn-season-live-data-roadmap-design.md` (Phase 1 only)
- On ESPN failure: **last-good DB state**; never silent fixture overwrite on Refresh
- FA: ESPN FA API → ownership inverse fallback → empty `[]` OK; never fixture FA ids
- Cookies: `getUserEspnCookies` → else env when `ESPN_LIVE=true`; client does not POST cookies on Refresh
- Draft Live sync: out of scope
- Phase 2 schedule / Phase 3 injury: out of scope
- Do not commit unrelated unstaged WIP (league-size 4–20, etc.)
- No semicolons; `handle*` handlers; Tailwind; conventional commits
- Tests: `npx.cmd vitest run --maxWorkers=1 <paths>`

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/adapters/errors.ts` | Add `ESPN_NO_CREDENTIALS` |
| `src/lib/adapters/espnAvailable.ts` | Pure: ownership fallback + merge FA players into state |
| `src/lib/adapters/espnSeasonMap.ts` | Accept optional FA players; stop hardcoding `availablePlayerIds: []` when FA provided |
| `src/lib/adapters/espnSeasonLive.ts` | Fetch FA view + filter; call merge helpers |
| `src/lib/adapters/espnSeason.ts` | `forbidFixture` / live-only path for Refresh |
| `src/app/api/season-leagues/[id]/refresh/route.ts` | Pass user cookies; never fixture |
| `src/app/api/espn/season-import/route.ts` | Ensure live import uses same FA-filled live path (already passes cookies; verify) |
| `src/components/season/SeasonRosterWorkspace.tsx` | Treat `ESPN_NO_CREDENTIALS` like auth reconnect |
| `data/fixtures/espn-api-free-agents-sample.json` | Small FA API sample for unit tests |
| `tests/unit/espnAvailable.test.ts` | Pure FA helper tests |
| `tests/unit/espnSeasonMap.test.ts` | Extend for FA merge |
| `tests/api/seasonLeagues.test.ts` | Refresh cookies / no-credentials / no DB overwrite |
| `tests/unit/espnSeasonAdapter.test.ts` | `forbidFixture` behavior |

---

### Task 1: `ESPN_NO_CREDENTIALS` + pure FA pool helpers

**Files:**
- Modify: `src/lib/adapters/errors.ts`
- Create: `src/lib/adapters/espnAvailable.ts`
- Create: `tests/unit/espnAvailable.test.ts`

**Interfaces:**
- Consumes: `SeasonLeagueState`, `SeasonPlayer` from `@/lib/season/types`
- Produces:
  - `EspnErrorCode` includes `"ESPN_NO_CREDENTIALS"`
  - `rosteredPlayerIds(state: SeasonLeagueState): Set<string>`
  - `deriveAvailableFromOwnership(state: SeasonLeagueState): string[]` — player ids in `state.players` not on any team roster
  - `mergeAvailablePlayers(state, available: SeasonPlayer[], source: "espn_fa" | "ownership"): SeasonLeagueState` — merges players by id, sets `availablePlayerIds`, sets `availability` on those players (`fa` default; preserve if already `waiver`)

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/espnAvailable.test.ts
import { describe, expect, it } from "vitest"
import {
  deriveAvailableFromOwnership,
  mergeAvailablePlayers,
  rosteredPlayerIds,
} from "@/lib/adapters/espnAvailable"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

const blankPlayer = (id: string, name: string): SeasonPlayer => ({
  id,
  name,
  projections: {
    FG_PCT: 0,
    FT_PCT: 0,
    TPM: 0,
    REB: 0,
    AST: 0,
    STL: 0,
    BLK: 0,
    TO: 0,
    PTS: 0,
  },
  shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
})

const baseState = (): SeasonLeagueState => ({
  name: "Test",
  season: 2026,
  categories: [],
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: [
        { slot: "PG", playerId: "p1" },
        { slot: "SG", playerId: null },
      ],
    },
    {
      teamIndex: 1,
      name: "Opp",
      entries: [{ slot: "PG", playerId: "p2" }],
    },
  ],
  players: [
    blankPlayer("p1", "A"),
    blankPlayer("p2", "B"),
    blankPlayer("p3", "C"),
  ],
  availablePlayerIds: [],
  waiverOrder: [0, 1],
  source: "espn",
})

describe("espnAvailable", () => {
  it("collects rostered ids ignoring null slots", () => {
    expect([...rosteredPlayerIds(baseState())].sort()).toEqual(["p1", "p2"])
  })

  it("derives available as players minus rostered", () => {
    expect(deriveAvailableFromOwnership(baseState())).toEqual(["p3"])
  })

  it("merges FA players and sets availablePlayerIds", () => {
    const fa = {
      ...blankPlayer("fa1", "Free"),
      availability: "waiver" as const,
    }
    const next = mergeAvailablePlayers(baseState(), [fa], "espn_fa")
    expect(next.availablePlayerIds).toEqual(["fa1"])
    expect(next.players.find((p) => p.id === "fa1")?.availability).toBe("waiver")
    expect(next.players).toHaveLength(4)
  })

  it("does not mark rostered players as available when merging overlap", () => {
    const next = mergeAvailablePlayers(
      baseState(),
      [blankPlayer("p1", "A"), blankPlayer("fa1", "Free")],
      "espn_fa",
    )
    expect(next.availablePlayerIds).toEqual(["fa1"])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/espnAvailable.test.ts
```

Expected: module not found / FAIL

- [ ] **Step 3: Implement**

```ts
// src/lib/adapters/errors.ts — add to union:
| "ESPN_NO_CREDENTIALS"

// src/lib/adapters/espnAvailable.ts
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

export const rosteredPlayerIds = (state: SeasonLeagueState): Set<string> => {
  const ids = new Set<string>()
  for (const team of state.teams) {
    for (const entry of team.entries) {
      if (entry.playerId) ids.add(entry.playerId)
    }
  }
  return ids
}

export const deriveAvailableFromOwnership = (
  state: SeasonLeagueState,
): string[] => {
  const rostered = rosteredPlayerIds(state)
  return state.players
    .map((player) => player.id)
    .filter((id) => !rostered.has(id))
}

export const mergeAvailablePlayers = (
  state: SeasonLeagueState,
  available: SeasonPlayer[],
  _source: "espn_fa" | "ownership",
): SeasonLeagueState => {
  const rostered = rosteredPlayerIds(state)
  const byId = new Map(state.players.map((player) => [player.id, player]))

  for (const player of available) {
    if (rostered.has(player.id)) continue
    const existing = byId.get(player.id)
    byId.set(player.id, {
      ...existing,
      ...player,
      availability:
        player.availability ?? existing?.availability ?? "fa",
    })
  }

  const availablePlayerIds = available
    .map((player) => player.id)
    .filter((id) => !rostered.has(id))

  return {
    ...state,
    players: [...byId.values()],
    availablePlayerIds,
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/espnAvailable.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add src/lib/adapters/errors.ts src/lib/adapters/espnAvailable.ts tests/unit/espnAvailable.test.ts
git commit -m @"
feat(season): add FA pool merge helpers and ESPN_NO_CREDENTIALS

Pure ownership fallback and merge utilities for live season available players.
"@
```

---

### Task 2: Refresh uses cookies; forbid fixture overwrite

**Files:**
- Modify: `src/lib/adapters/espnSeason.ts`
- Modify: `src/app/api/season-leagues/[id]/refresh/route.ts`
- Modify: `src/app/api/espn/season-import/route.ts` (add `ESPN_NO_CREDENTIALS` to known codes if returned)
- Modify: `tests/unit/espnSeasonAdapter.test.ts`
- Modify: `tests/api/seasonLeagues.test.ts`
- Modify: `src/components/season/SeasonRosterWorkspace.tsx` (NO_CREDENTIALS → authExpired)

**Interfaces:**
- Consumes: `getUserEspnCookies`, `readEnvEspnCookies`, Task 1 error code
- Produces:
  - `espnImportToSeasonLeagueState(params & { forbidFixture?: boolean })`
  - When `forbidFixture: true` and no live cookies path → throw `EspnAdapterError("ESPN_NO_CREDENTIALS")`
  - Refresh always passes `forbidFixture: true` + resolved cookies
  - Refresh never updates DB on adapter error (already true; assert in tests)

- [ ] **Step 1: Write / update failing tests**

```ts
// tests/unit/espnSeasonAdapter.test.ts — add:
it("throws ESPN_NO_CREDENTIALS when forbidFixture and no live cookies", async () => {
  const prev = process.env.ESPN_LIVE
  delete process.env.ESPN_LIVE
  await expect(
    espnImportToSeasonLeagueState({
      leagueId: "fixture-league",
      season: fixture.season,
      teamId: 1,
      forbidFixture: true,
    }),
  ).rejects.toMatchObject({ code: "ESPN_NO_CREDENTIALS" })
  process.env.ESPN_LIVE = prev
})
```

Update `tests/api/seasonLeagues.test.ts` refresh describe:

1. **Keep conflict test working without real ESPN:** `vi.mock` `@/lib/adapters/espnSeason` `espnImportToSeasonLeagueState` to return a fixture-shaped incoming state (or spy). Do **not** rely on silent fixture fallback inside the adapter for Refresh.

2. **Add:** no credentials → 502 with `ESPN_NO_CREDENTIALS`, `stateJson` unchanged.

Example no-credentials test:

```ts
it("does not overwrite state when ESPN credentials are missing", async () => {
  const state = manualToSeasonLeagueState(fixture as ManualSeasonLeagueInput)
  const league = await db.seasonLeague.create({
    data: {
      clerkUserId: currentUserId,
      name: state.name,
      espnLeagueId: "live-league",
      season: state.season,
      perspectiveTeamIndex: state.perspectiveTeamIndex,
      source: "espn",
      stateJson: JSON.stringify(state),
    },
  })

  // ensure no espnCredential row for currentUserId (delete if any)

  const response = await refreshSeasonLeague(
    new Request(`http://localhost/api/season-leagues/${league.id}/refresh`, {
      method: "POST",
    }),
    routeContext(league.id),
  )
  const payload = await response.json()
  const stored = await db.seasonLeague.findUnique({ where: { id: league.id } })

  expect(response.status).toBe(502)
  expect(payload.errorCode).toBe("ESPN_NO_CREDENTIALS")
  expect(stored?.stateJson).toBe(JSON.stringify(state))
})
```

Conflict test: mock import to return ESPN-shaped state that conflicts with local lineup — assert conflict + DB unchanged (same as today).

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/espnSeasonAdapter.test.ts tests/api/seasonLeagues.test.ts
```

- [ ] **Step 3: Implement adapter + refresh**

`espnSeason.ts` core change:

```ts
export const espnImportToSeasonLeagueState = async (
  params: EspnSeasonParams & { forbidFixture?: boolean },
): Promise<SeasonLeagueState> => {
  if (params.forceFail) {
    throw new EspnAdapterError(params.forceFail)
  }

  const useLive =
    Boolean(params.cookies) || process.env.ESPN_LIVE === "true"

  if (useLive) {
    if (
      typeof params.teamId !== "number" ||
      !Number.isInteger(params.teamId)
    ) {
      throw new EspnAdapterError("ESPN_PARTIAL")
    }

    return fetchEspnSeasonLeague({
      leagueId: params.leagueId,
      season: params.season,
      teamId: params.teamId,
      cookies: params.cookies,
    })
  }

  if (params.forbidFixture) {
    throw new EspnAdapterError(
      "ESPN_NO_CREDENTIALS",
      "Connect ESPN cookies before refreshing a live league",
    )
  }

  return {
    ...manualToSeasonLeagueState(
      espnSeasonLeagueFixture as ManualSeasonLeagueInput,
    ),
    id: params.leagueId,
    source: "espn",
    espnTeamId: params.teamId,
  }
}
```

`refresh/route.ts` — after loading league:

```ts
import { getUserEspnCookies } from "@/lib/espn/credentials"
import { readEnvEspnCookies } from "@/lib/espn/cookies"

const userCookies = await getUserEspnCookies(userId)
const envCookies = readEnvEspnCookies()
const cookies =
  userCookies ??
  (process.env.ESPN_LIVE === "true" ? envCookies : null) ??
  undefined

const importedState = await espnImportToSeasonLeagueState({
  leagueId: league.espnLeagueId,
  season: league.season,
  teamId: storedState?.espnTeamId,
  cookies,
  forbidFixture: true,
})
```

`SeasonRosterWorkspace` refresh error handling:

```ts
if (
  refresh.errorCode === "ESPN_AUTH" ||
  refresh.errorCode === "ESPN_NO_CREDENTIALS"
) {
  setAuthExpired(true)
}
```

Ensure import route includes `ESPN_NO_CREDENTIALS` in `ESPN_ERROR_CODES` if that path can throw it.

- [ ] **Step 4: Run tests — expect PASS**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/espnSeasonAdapter.test.ts tests/api/seasonLeagues.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add src/lib/adapters/espnSeason.ts src/app/api/season-leagues/[id]/refresh/route.ts src/app/api/espn/season-import/route.ts src/components/season/SeasonRosterWorkspace.tsx tests/unit/espnSeasonAdapter.test.ts tests/api/seasonLeagues.test.ts
git commit -m @"
fix(season): pass ESPN cookies on refresh and forbid fixture overwrite

Keep last-good season state when credentials are missing or live import fails.
"@
```

---

### Task 3: Live FA fetch + map merge + ownership fallback

**Files:**
- Create: `data/fixtures/espn-api-free-agents-sample.json` (minimal `players[]` with `status` + nested `player`)
- Modify: `src/lib/adapters/espnSeasonMap.ts` — export `playerFromEspn` **or** add `mapEspnFreeAgents(payload, season): SeasonPlayer[]`; optional FA arg on `mapEspnLeagueToSeasonState`
- Modify: `src/lib/adapters/espnSeasonLive.ts` — after roster map, fetch FA; on failure/empty use `deriveAvailableFromOwnership` + `mergeAvailablePlayers`
- Modify: `tests/unit/espnSeasonMap.test.ts`
- Create or extend: `tests/unit/espnSeasonLiveFa.test.ts` (mock `fetch`)

**Interfaces:**
- Consumes: Task 1 helpers; existing `mapEspnLeagueToSeasonState`
- Produces:
  - `mapEspnFreeAgentPlayers(payload, season): SeasonPlayer[]` — reads `payload.players[]`; maps `status` `FREEAGENT`→`fa`, `WAIVERS`→`waiver`
  - `fetchEspnSeasonLeague` returns state with non-empty `availablePlayerIds` when FA sample provided; on FA HTTP failure still returns roster state with ownership fallback (or `[]` if no extra players)

**ESPN FA request (inside `espnSeasonLive.ts`):**

```ts
const faUrl = new URL(
  `https://fantasy.espn.com/apis/v3/games/fba/seasons/${params.season}/segments/0/leagues/${params.leagueId}`,
)
faUrl.searchParams.append("view", "kona_player_info")

const fantasyFilter = JSON.stringify({
  players: {
    filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
    limit: 200,
    sortPercOwned: { sortPriority: 1, sortAsc: false },
  },
})

// same Cookie headers as roster fetch
// Header: "X-Fantasy-Filter": fantasyFilter
```

Sample fixture shape:

```json
{
  "players": [
    {
      "status": "FREEAGENT",
      "player": {
        "id": 9001,
        "fullName": "Sample FA",
        "proTeamId": 1,
        "stats": []
      }
    },
    {
      "status": "WAIVERS",
      "player": {
        "id": 9002,
        "fullName": "Sample Waiver",
        "proTeamId": 2,
        "stats": []
      }
    }
  ]
}
```

Live flow after roster `mapEspnLeagueToSeasonState`:

```ts
let state = mapEspnLeagueToSeasonState(payload, params)

try {
  const faPlayers = await fetchEspnFreeAgents({ ...params, cookies: resolved })
  if (faPlayers.length > 0) {
    return mergeAvailablePlayers(state, faPlayers, "espn_fa")
  }
} catch {
  // fall through to ownership
}

const ownershipIds = deriveAvailableFromOwnership(state)
if (ownershipIds.length === 0) {
  return { ...state, availablePlayerIds: [] }
}

const ownershipPlayers = state.players.filter((p) =>
  ownershipIds.includes(p.id),
)
return mergeAvailablePlayers(state, ownershipPlayers, "ownership")
```

Note: ownership fallback only helps if the roster payload already included unowned players (often it does not). That is OK per spec — empty `[]` beats fixture FA.

- [ ] **Step 1: Write failing map + live tests**

```ts
// espnSeasonMap — mapEspnFreeAgentPlayers from sample → 2 players with fa/waiver
// espnSeasonLiveFa — mock global fetch:
//   1st call roster OK → map
//   2nd call FA OK → availablePlayerIds includes sample ids
// Separate test: FA fetch throws → state.availablePlayerIds from ownership or []
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/espnSeasonMap.test.ts tests/unit/espnSeasonLiveFa.test.ts
```

- [ ] **Step 3: Implement fetch + map + wire**

Keep roster fetch views (`mTeam`, `mRoster`, `mSettings`). Add `fetchEspnFreeAgents` in `espnSeasonLive.ts` (or same file private helper). Reuse `parseEspnJson` / cookie / timeout patterns. Do not fill from `espn-season-league.json` FA ids.

- [ ] **Step 4: Run — expect PASS**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/espnAvailable.test.ts tests/unit/espnSeasonMap.test.ts tests/unit/espnSeasonLiveFa.test.ts tests/unit/espnSeasonAdapter.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add data/fixtures/espn-api-free-agents-sample.json src/lib/adapters/espnSeasonMap.ts src/lib/adapters/espnSeasonLive.ts tests/unit/espnSeasonMap.test.ts tests/unit/espnSeasonLiveFa.test.ts
git commit -m @"
feat(season): fill availablePlayerIds from ESPN free agents

Prefer kona_player_info FA filter; fall back to ownership inverse without fixture FA.
"@
```

---

### Task 4: Import parity smoke + regression sweep

**Files:**
- Modify if needed: `src/app/api/espn/season-import/route.ts` (already passes cookies; confirm live path hits Task 3 FA fill — no extra work if `fetchEspnSeasonLeague` always merges FA)
- Add: `tests/api/espnSeasonImportFa.test.ts` **or** extend `tests/api/espnRoutes.test.ts` — mock `fetchEspnSeasonLeague` / adapter to assert created league `stateJson.availablePlayerIds` length > 0 when live mock returns FA
- Run broader related suite

- [ ] **Step 1: Write import smoke test**

Mock `espnImportToSeasonLeagueState` (or live fetch) so live import returns state with `availablePlayerIds: ["9001"]`. Assert `201` and parsed `stateJson.availablePlayerIds` equals `["9001"]`.

- [ ] **Step 2: Run — expect FAIL then implement any wiring gaps — expect PASS**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/api/espnRoutes.test.ts tests/api/espnSeasonImportFa.test.ts tests/api/seasonLeagues.test.ts tests/unit/espnAvailable.test.ts tests/unit/espnSeasonLiveFa.test.ts
```

(Use whichever test file names you created; skip missing paths.)

- [ ] **Step 3: Full Phase 1 regression**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/espnAvailable.test.ts tests/unit/espnSeasonAdapter.test.ts tests/unit/espnSeasonMap.test.ts tests/unit/espnSeasonLiveFa.test.ts tests/api/seasonLeagues.test.ts
```

Expected: all PASS

- [ ] **Step 4: Commit**

```powershell
git add tests/api/espnSeasonImportFa.test.ts src/app/api/espn/season-import/route.ts
git commit -m @"
test(season): assert live import preserves ESPN free-agent pool

Smoke that season-import persists availablePlayerIds from the live adapter path.
"@
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Refresh uses stored cookies | 2 |
| `forbidFixture` / no fixture overwrite on Refresh | 2 |
| Last-good on failure | 2 (existing catch + tests) |
| FA primary ESPN API | 3 |
| Ownership fallback | 1 + 3 |
| Never fixture FA | 3 |
| Import same FA rules | 3 + 4 |
| `ESPN_NO_CREDENTIALS` + UI reconnect | 1 + 2 |
| Phase 2/3 / Draft Live | Explicitly out of scope |

## Placeholder scan

None intentional. ESPN filter JSON and fixture sample are concrete. If ESPN’s `kona_player_info` shape differs in production, adjust `mapEspnFreeAgentPlayers` only — do not reintroduce fixture FA.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-19-espn-season-live-data-phase-1.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans checkpoints  

Which approach?
