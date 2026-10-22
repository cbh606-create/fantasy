# Recommendation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show breakout, injury-replacement, and season-need adds on the existing waivers page, and select any of them in the current add/drop builder.

**Architecture:** A server cache reads ESPN `kona_player_info` rows into `readBreakoutStatLines` and keeps that snapshot for 6 hours. `GET /api/injuries/breakouts` passes that snapshot plus the existing injury-selection inputs into `selectBreakouts`. The waivers workspace renders a breakouts list above the current injury and season-needs lists. The stream and the available pool stay below them.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, the existing waiver workspace and injury cache.

## Global Constraints

- The address stays `/waivers` and `/waivers/[id]`. The home link keeps the word Waivers. Do not edit `src/app/page.tsx`.
- Lists, top to bottom: Breakouts, injury replacements, season needs, matchup stream, available pool.
- The weak-categories panel stays above the lists.
- The existing add/drop builder stays on the right. One selected add at a time.
- A breakout, an injury add, a season-need add, or a pool player calls `onSelectAdd`. A stream row keeps `onSelectPair`.
- Injury pickups and season needs are not shown a second time.
- A breakout row shows the player name plus `rates`, `lineup`, or both. No minutes or category numbers.
- The injury row and the season-needs row stay as they are.
- Injury and season needs keep their current loaders. Only breakouts get a new GET route.
- The page joins breakout ids to the season player pool. An id with no pool player is omitted.
- Each list loads on its own. One error does not clear the others.
- Do not change `selectBreakouts` or `selectInjuryReplacements`.
- ESPN stat rows use their own 6-hour cache. A failed fetch keeps the previous snapshot. No snapshot returns 200 with an empty list and `source: "empty"`.
- The route does not read `SeasonPlayer.projections`, `seasonRates`, or `recentRates`.
- Const arrow functions. No semicolons. Commit with `git -c user.name="cbh606-create" -c user.email="cbh606@gmail.com"`. Never stage `API Keys.txt`, `token code.txt`, or unrelated dirty trade files.
- On Windows, if the sandbox refuses to start, rerun the command with unrestricted permissions.

---

### Task 1: ESPN stat-line cache

**Files:**
- Create: `src/lib/injuries/espnStatCache.ts`
- Test: `tests/unit/espnStatCache.test.ts`

**Interfaces:**
- Consumes: `readBreakoutStatLines` and `EspnStatRow` from `src/lib/injuries/breakoutStats.ts`. `BreakoutPlayer` from `src/lib/injuries/breakout.ts`.
- Produces:
  - `clearEspnStatCache(): void`
  - `loadEspnBreakoutPlayers(options: { seasonId: number; now: Date; fetchImpl?: typeof fetch }): Promise<{ players: BreakoutPlayer[]; source: "espn" | "empty" }>`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearEspnStatCache,
  loadEspnBreakoutPlayers,
} from "@/lib/injuries/espnStatCache"

const row = (
  id: string,
  sourceId: number,
  splitId: number,
  minutes: number,
  games: number,
) => ({
  id,
  seasonId: 2026,
  statSourceId: sourceId,
  statSplitTypeId: splitId,
  stats: {
    "0": 10 * games,
    "1": games,
    "2": games,
    "3": 2 * games,
    "6": 3 * games,
    "11": games,
    "13": 4 * games,
    "14": 10 * games,
    "15": 2 * games,
    "16": 4 * games,
    "17": games,
    "40": minutes * games,
    "42": games,
  },
})

const payload = [
  {
    id: 44,
    stats: [row("002026", 0, 0, 20, 10), row("102026", 1, 0, 30, 70)],
  },
]

const fetchOk = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))

describe("loadEspnBreakoutPlayers", () => {
  afterEach(() => {
    clearEspnStatCache()
  })

  it("reads minutes from stat totals and reuses the snapshot for 6 hours", async () => {
    const first = await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T12:00:00.000Z"),
      fetchImpl: fetchOk,
    })

    expect(first.source).toBe("espn")
    expect(first.players).toEqual([
      expect.objectContaining({
        id: "44",
        seasonGames: 10,
        season: expect.objectContaining({ minutesPerGame: 20 }),
        projection: expect.objectContaining({ minutesPerGame: 30 }),
      }),
    ])

    const second = await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T17:59:00.000Z"),
      fetchImpl: fetchOk,
    })

    expect(fetchOk).toHaveBeenCalledTimes(1)
    expect(second.players[0]?.id).toBe("44")
  })

  it("keeps the previous snapshot when the refresh fails", async () => {
    await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T12:00:00.000Z"),
      fetchImpl: fetchOk,
    })

    const failed = vi.fn(async () => new Response("nope", { status: 500 }))
    const next = await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T19:00:00.000Z"),
      fetchImpl: failed,
    })

    expect(next.source).toBe("espn")
    expect(next.players[0]?.id).toBe("44")
  })

  it("returns an empty source when the first fetch fails", async () => {
    const failed = vi.fn(async () => {
      throw new Error("offline")
    })
    const result = await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T12:00:00.000Z"),
      fetchImpl: failed,
    })

    expect(result).toEqual({ players: [], source: "empty" })
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/unit/espnStatCache.test.ts`

Expected: FAIL because `loadEspnBreakoutPlayers` is not defined.

- [ ] **Step 3: Add the cache**

Create `src/lib/injuries/espnStatCache.ts`.

```ts
import type { BreakoutPlayer } from "./breakout"
import { readBreakoutStatLines, type EspnStatRow } from "./breakoutStats"

const SIX_HOURS = 6 * 60 * 60 * 1000

const fantasyFilter = {
  players: {
    filterSlotIds: { value: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    limit: 2000,
    offset: 0,
    sortPercOwned: { sortPriority: 1, sortAsc: false },
    filterStatsForSourceIds: { value: [0, 1] },
    useFullProjectionTable: { value: true },
  },
}

type Snapshot = {
  seasonId: number
  players: BreakoutPlayer[]
  fetchedAt: number
}

let memory: Snapshot | null = null

export const clearEspnStatCache = (): void => {
  memory = null
}

const isStatRow = (value: unknown): value is EspnStatRow =>
  typeof value === "object" && value !== null

const playersFromPayload = (payload: unknown, seasonId: number): BreakoutPlayer[] => {
  if (!Array.isArray(payload)) return []

  return payload.flatMap((player) => {
    if (!isStatRow(player)) return []
    const rawId = (player as { id?: unknown }).id
    if (typeof rawId !== "string" && typeof rawId !== "number") return []
    const stats = (player as { stats?: unknown }).stats
    const rows = Array.isArray(stats) ? stats.filter(isStatRow) : []
    return [{ id: String(rawId), ...readBreakoutStatLines(rows, seasonId) }]
  })
}

export const loadEspnBreakoutPlayers = async (options: {
  seasonId: number
  now: Date
  fetchImpl?: typeof fetch
}): Promise<{ players: BreakoutPlayer[]; source: "espn" | "empty" }> => {
  const nowMs = options.now.getTime()
  const fresh =
    memory !== null &&
    memory.seasonId === options.seasonId &&
    nowMs - memory.fetchedAt < SIX_HOURS
  if (fresh && memory) return { players: memory.players, source: "espn" }

  const fetchImpl = options.fetchImpl ?? fetch
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${options.seasonId}/players?scoringPeriodId=0&view=kona_player_info`

  try {
    const response = await fetchImpl(url, {
      headers: {
        "x-fantasy-filter": JSON.stringify(fantasyFilter),
        Accept: "application/json",
      },
    })
    if (!response.ok) throw new Error("espn stat request failed")
    const players = playersFromPayload(await response.json(), options.seasonId)
    memory = { seasonId: options.seasonId, players, fetchedAt: nowMs }
    return { players, source: "espn" }
  } catch {
    if (memory && memory.seasonId === options.seasonId) {
      return { players: memory.players, source: "espn" }
    }
    return { players: [], source: "empty" }
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/espnStatCache.test.ts`

Expected: PASS. 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/espnStatCache.ts tests/unit/espnStatCache.test.ts
git -c user.name="cbh606-create" -c user.email="cbh606@gmail.com" commit -m "feat(injuries): cache ESPN stat lines for breakouts"
```

---

### Task 2: Breakout recommendations route

**Files:**
- Create: `src/app/api/injuries/breakouts/route.ts`
- Test: `tests/api/breakouts.test.ts`

**Interfaces:**
- Consumes: `loadEspnBreakoutPlayers` from Task 1. `loadInjurySelectionInputs` from `src/lib/injuries/rotowireCache.ts`. `selectBreakouts` from `src/lib/injuries/breakout.ts`. `loadOwnedSeasonLeague` and `requireUserId`, matching `src/app/api/injuries/pickups/route.ts`.
- Produces: `GET /api/injuries/breakouts?seasonLeagueId=` returning `BreakoutRecommendationsResult`.

```ts
type BreakoutRecommendation = {
  playerId: string
  reasons: Array<"rates" | "lineup">
}

type BreakoutRecommendationsResult = {
  recommendations: BreakoutRecommendation[]
  source: "espn" | "empty"
}
```

- [ ] **Step 1: Write the failing test**

Follow `tests/api/injuriesPickups.test.ts` for the user header, `db.seasonLeague`, and cleanup. Mock both loaders. Do not mock `selectBreakouts`.

```ts
import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as getBreakouts } from "@/app/api/injuries/breakouts/route"
import { loadEspnBreakoutPlayers } from "@/lib/injuries/espnStatCache"
import { loadInjurySelectionInputs } from "@/lib/injuries/rotowireCache"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { db } from "@/lib/db"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import type { BreakoutPlayer } from "@/lib/injuries/breakout"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

vi.mock("@/lib/injuries/espnStatCache", () => ({
  loadEspnBreakoutPlayers: vi.fn(),
}))

vi.mock("@/lib/injuries/rotowireCache", () => ({
  loadInjurySelectionInputs: vi.fn(),
}))

const rates = (pts: number) => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 3,
  AST: 2,
  STL: 1,
  BLK: 0.5,
  TO: 2,
  PTS: pts,
})

const line = (games: number, minutes: number, pts: number) => ({
  gamesPlayed: games,
  minutesPerGame: minutes,
  rates: rates(pts),
})

const breakoutPlayer = (
  id: string,
  seasonGames: number,
): BreakoutPlayer => ({
  id,
  seasonGames,
  season: seasonGames > 0 ? line(seasonGames, 30, 12) : null,
  last7: null,
  projection: line(70, 20, 12),
})

const emptyInjury = {
  updates: [],
  depth: { teams: [] },
  lineups: [],
  crosswalk: new Map<string, string>(),
}

const testUserPrefix = `breakouts-api-${crypto.randomUUID()}`
let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

const weakProjections: Record<CategoryId, number> = {
  FG_PCT: 0.4,
  FT_PCT: 0.6,
  TPM: 0,
  REB: 2,
  AST: 1,
  STL: 1,
  BLK: 0,
  TO: 6,
  PTS: 8,
}

const createPlayer = (id: string, name: string): SeasonPlayer => ({
  id,
  name,
  teamAbbr: "ATL",
  availability: "fa",
  projections: weakProjections,
  shooting: { FGM: 4, FGA: 10, FTM: 6, FTA: 10 },
})

const seedLeague = async () => {
  const state: SeasonLeagueState = {
    name: "Breakouts API league",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: [
      {
        teamIndex: 0,
        name: "YOU",
        entries: [{ slot: "PG", playerId: "you-filler" }],
      },
    ],
    players: [
      createPlayer("you-filler", "Filler"),
      createPlayer("rates-guy", "Rates Guy"),
      createPlayer("lineup-guy", "Lineup Guy"),
      createPlayer("out-guy", "Out Guy"),
    ],
    availablePlayerIds: ["rates-guy", "lineup-guy", "out-guy"],
    waiverOrder: [0],
    source: "manual",
  }

  return db.seasonLeague.create({
    data: {
      clerkUserId: currentUserId,
      name: state.name,
      season: state.season,
      perspectiveTeamIndex: state.perspectiveTeamIndex,
      source: "manual",
      stateJson: JSON.stringify(state),
    },
  })
}

beforeEach(() => {
  currentUserId = `${testUserPrefix}-${crypto.randomUUID()}`
  authenticateAs(currentUserId)
})

afterEach(async () => {
  await db.seasonLeague.deleteMany({
    where: { clerkUserId: { startsWith: testUserPrefix } },
  })
})

describe("GET /api/injuries/breakouts", () => {
  it("returns rates and lineup rows and omits an OUT player", async () => {
    vi.mocked(loadEspnBreakoutPlayers).mockResolvedValue({
      source: "espn",
      players: [
        breakoutPlayer("rates-guy", 2),
        breakoutPlayer("lineup-guy", 0),
        breakoutPlayer("out-guy", 0),
      ],
    })
    vi.mocked(loadInjurySelectionInputs).mockResolvedValue({
      updates: [
        {
          rotowirePlayerId: "rw-out",
          teamAbbr: "ATL",
          status: "out",
          at: "2026-10-15T11:00:00.000Z",
        },
      ],
      depth: {
        teams: [
          {
            teamAbbr: "ATL",
            positions: [
              { position: "PG", playerIds: ["rw-starter", "rw-lineup"] },
              { position: "SG", playerIds: ["rw-starter", "rw-out"] },
            ],
          },
        ],
      },
      lineups: [
        {
          teamAbbr: "ATL",
          startsAt: "2026-10-15T00:00:00.000Z",
          starters: [
            { playerId: "rw-lineup", position: "PG" },
            { playerId: "rw-out", position: "SG" },
          ],
        },
      ],
      crosswalk: new Map([
        ["rw-starter", "chart-starter"],
        ["rw-lineup", "lineup-guy"],
        ["rw-out", "out-guy"],
      ]),
    })

    const league = await seedLeague()
    const response = await getBreakouts(
      new Request(`http://localhost/api/injuries/breakouts?seasonLeagueId=${league.id}`),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      source: "espn",
      recommendations: [
        { playerId: "rates-guy", reasons: ["rates"] },
        { playerId: "lineup-guy", reasons: ["lineup"] },
      ],
    })
  })

  it("returns an empty list when no ESPN snapshot exists", async () => {
    vi.mocked(loadEspnBreakoutPlayers).mockResolvedValue({
      source: "empty",
      players: [],
    })
    vi.mocked(loadInjurySelectionInputs).mockResolvedValue(emptyInjury)
    const league = await seedLeague()
    const response = await getBreakouts(
      new Request(`http://localhost/api/injuries/breakouts?seasonLeagueId=${league.id}`),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      recommendations: [],
      source: "empty",
    })
  })
})
```

`lineup-guy` has `seasonGames: 0`, so he gets no rates reason. `rates-guy` has higher minutes than his projection in games 1–3, so he gets `rates`. `out-guy` is the unexpected starter and is dropped because his latest status is `out`.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/api/breakouts.test.ts`

Expected: FAIL because the route module does not exist.

- [ ] **Step 3: Add the route**

Create `src/app/api/injuries/breakouts/route.ts`. Copy the auth and league branches from `src/app/api/injuries/pickups/route.ts`. When `loadEspnBreakoutPlayers` returns `source: "empty"`, return `{ recommendations: [], source: "empty" }` without calling `selectBreakouts`.

```ts
import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { selectBreakouts } from "@/lib/injuries/breakout"
import { loadEspnBreakoutPlayers } from "@/lib/injuries/espnStatCache"
import { loadInjurySelectionInputs } from "@/lib/injuries/rotowireCache"
import type { SeasonPlayer } from "@/lib/season/types"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"

export const GET = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const seasonLeagueId = new URL(request.url).searchParams.get("seasonLeagueId")
  if (!seasonLeagueId) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const loaded = await loadOwnedSeasonLeague(seasonLeagueId, userId)
  if (loaded === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (loaded === "invalid_state") {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  const now = new Date()
  const stats = await loadEspnBreakoutPlayers({ seasonId: loaded.state.season, now })
  if (stats.source === "empty") {
    return NextResponse.json({ recommendations: [], source: "empty" })
  }

  const cached = await loadInjurySelectionInputs({
    now,
    espnPlayers: loaded.state.players.map((player: SeasonPlayer) => ({
      id: player.id,
      name: player.name,
      teamAbbr: player.teamAbbr,
    })),
  })
  const recommendations = selectBreakouts({
    players: stats.players,
    availablePlayerIds: loaded.state.availablePlayerIds,
    lineups: cached.lineups,
    depth: cached.depth,
    updates: cached.updates,
    crosswalk: cached.crosswalk,
    now,
  })

  return NextResponse.json({ recommendations, source: "espn" })
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/api/breakouts.test.ts tests/api/injuriesPickups.test.ts`

Expected: PASS. The injury route file is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/injuries/breakouts/route.ts tests/api/breakouts.test.ts
git -c user.name="cbh606-create" -c user.email="cbh606@gmail.com" commit -m "feat(injuries): serve breakout recommendations"
```

---

### Task 3: Breakouts list on the waivers page

**Files:**
- Create: `src/components/waivers/BreakoutsPanel.tsx`
- Modify: `src/components/waivers/WaiversWorkspace.tsx`
- Modify: `src/app/waivers/page.tsx`
- Modify: `tests/unit/WaiversWorkspace.test.tsx`
- Modify: `tests/unit/SeasonToolIndexPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/injuries/breakouts` from Task 2. `playersById` already loaded by `WaiversWorkspace`. `onSelectAdd(playerId: string)`.
- Produces: a Breakouts section. No new export is required by a later task.

- [ ] **Step 1: Write the failing workspace tests**

In the fetch stub inside `tests/unit/WaiversWorkspace.test.tsx`, answer the breakouts URL before the fallback 404:

```ts
if (url === "/api/injuries/breakouts?seasonLeagueId=season-1") {
  return new Response(
    JSON.stringify({
      source: "espn",
      recommendations: [{ playerId: "fa-1", reasons: ["rates", "lineup"] }],
    }),
    { status: 200 },
  )
}
```

The existing pool fixture names Free Agent Guard as `fa-1`.

Add this test:

```ts
it("selects a breakout and keeps the other recommendation lists", async () => {
  render(<WaiversWorkspace leagueId="season-1" />)

  const breakouts = await screen.findByRole("heading", { name: "Breakouts" })
  const injury = await screen.findByRole("heading", { name: "Injury pickups" })
  const needs = await screen.findByRole("heading", { name: "Season needs" })
  const stream = await screen.findByRole("heading", { name: "Matchup stream" })
  const pool = await screen.findByRole("heading", { name: "Available pool" })

  expect(breakouts.compareDocumentPosition(injury) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(injury.compareDocumentPosition(needs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(needs.compareDocumentPosition(stream) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(stream.compareDocumentPosition(pool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  expect(screen.getAllByRole("heading", { name: "Injury pickups" })).toHaveLength(1)
  expect(screen.getAllByRole("heading", { name: "Season needs" })).toHaveLength(1)

  const button = screen.getByRole("button", { name: "Add Free Agent Guard, rates, lineup" })
  fireEvent.click(button)
  expect(button).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByRole("button", { name: "Add Free Agent Guard" })).toBeInTheDocument()
})
```

Add a second test. Make the breakouts fetch return status 500 for that test only, then:

```ts
expect(await screen.findByText("Unable to load breakouts")).toBeInTheDocument()
expect(await screen.findByRole("heading", { name: "Injury pickups" })).toBeInTheDocument()
expect(screen.getByRole("heading", { name: "Season needs" })).toBeInTheDocument()
```

In `tests/unit/SeasonToolIndexPage.test.tsx`, render the waivers index with no active league and assert the description:

```ts
import WaiversListPage from "@/app/waivers/page"

it("names breakouts, injury replacements, and season needs", () => {
  vi.mocked(useRouter).mockReturnValue({ replace } as never)
  vi.mocked(useActiveSeasonLeague).mockReturnValue({
    activeId: "missing-league",
    leagues: [
      {
        id: "league-1",
        name: "Downtown Hoops",
        season: 2026,
        source: "espn",
      },
    ],
    isLoading: false,
    error: "",
    setActiveId: vi.fn(),
    updateLeague: vi.fn(),
    removeLeague: vi.fn(),
  })

  render(<WaiversListPage />)

  expect(screen.getByText(/breakouts, injury replacements, and season needs/)).toBeInTheDocument()
})
```

Copy the `useActiveSeasonLeague` mock from the existing "no valid active league" test, with `activeId: "missing-league"`. Do not change `src/app/page.tsx`.

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/WaiversWorkspace.test.tsx tests/unit/SeasonToolIndexPage.test.tsx`

Expected: FAIL because there is no Breakouts heading and the index description does not name the three lists.

- [ ] **Step 3: Add the panel and reorder the page**

Create `src/components/waivers/BreakoutsPanel.tsx`. Match `InjuryPickupsPanel`: `useEffect`, abort on cleanup, `aria-pressed`, no semicolons.

```tsx
"use client"

import { useEffect, useState } from "react"
import type { SeasonPlayer } from "@/lib/season/types"

type BreakoutReason = "rates" | "lineup"

type BreakoutsPanelProps = {
  leagueId: string
  playersById: Record<string, SeasonPlayer>
  selectedAddId: string | null
  onSelectAdd: (playerId: string) => void
}

export const BreakoutsPanel = ({
  leagueId,
  playersById,
  selectedAddId,
  onSelectAdd,
}: BreakoutsPanelProps) => {
  const [rows, setRows] = useState<Array<{ playerId: string; reasons: BreakoutReason[] }>>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const loadBreakouts = async () => {
      setIsLoading(true)
      setError("")

      try {
        const response = await fetch(
          `/api/injuries/breakouts?seasonLeagueId=${leagueId}`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error("Unable to load breakouts")
        const payload = (await response.json()) as {
          recommendations?: Array<{ playerId: string; reasons: BreakoutReason[] }>
        }
        setRows(payload.recommendations ?? [])
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return
        setRows([])
        setError("Unable to load breakouts")
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadBreakouts()
    return () => controller.abort()
  }, [leagueId])

  const visible = rows.flatMap((row) => {
    const player = playersById[row.playerId]
    if (!player) return []
    return [{ ...row, name: player.name }]
  })

  return (
    <section className="rounded-3xl bg-[var(--color-soft-cloud)] p-5">
      <p className="text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">Role</p>
      <h2 className="mt-1 text-lg font-semibold">Breakouts</h2>
      {isLoading ? (
        <p className="mt-4 text-sm text-[var(--color-mute)]" role="status">Loading breakouts…</p>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-[var(--color-sale)]" role="alert">{error}</p>
      ) : null}
      {!isLoading && !error && visible.length === 0 ? (
        <p className="mt-4 border-y border-[var(--color-hairline)] py-6 text-[0.8125rem] text-[var(--color-mute)]">
          No breakouts right now.
        </p>
      ) : null}
      {visible.length > 0 ? (
        <ul aria-label="Breakouts" className="mt-4 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]">
          {visible.map((row) => {
            const isSelected = selectedAddId === row.playerId
            return (
              <li key={row.playerId}>
                <button
                  aria-label={`Add ${row.name}, ${row.reasons.join(", ")}`}
                  aria-pressed={isSelected}
                  className={`w-full px-3 py-3 text-left text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${isSelected ? "bg-white" : "hover:bg-white"}`}
                  onClick={() => onSelectAdd(row.playerId)}
                  type="button"
                >
                  <span className="font-semibold">{row.name}</span>
                  <span className="mt-1 block text-xs text-[var(--color-info)]">{row.reasons.join(", ")}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
```

In `WaiversWorkspace.tsx`, render `BreakoutsPanel` first inside the left column, then `InjuryPickupsPanel`, then the season-needs section, then `MatchupStreamPanel`, then the available pool. Pass `playersById={poolData.playersById}`. Do not add a second injury panel or a second season-needs section.

In `src/app/waivers/page.tsx`, replace the description with:

`Choose a season roster to see breakouts, injury replacements, and season needs.`

Leave the title `Browse waivers`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/WaiversWorkspace.test.tsx tests/unit/SeasonToolIndexPage.test.tsx tests/api/breakouts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/waivers/BreakoutsPanel.tsx src/components/waivers/WaiversWorkspace.tsx src/app/waivers/page.tsx tests/unit/WaiversWorkspace.test.tsx tests/unit/SeasonToolIndexPage.test.tsx
git -c user.name="cbh606-create" -c user.email="cbh606@gmail.com" commit -m "feat(waivers): show breakouts beside injury and season needs"
```
