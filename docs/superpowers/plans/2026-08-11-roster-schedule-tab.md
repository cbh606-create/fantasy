# Roster Schedule Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stats | Schedule tabs on the season roster workspace so YOU’s 14 players show matchup game-days (left) and a day-by-day opponent calendar (right), backed by a fixture schedule API.

**Architecture:** Extend `SeasonPlayer` with optional `teamAbbr`. Pure join helper in `src/lib/season/schedule.ts` maps roster entries + fixture games → per-player rows. `GET /api/schedule` auth-checks season league ownership and returns fixture matchup + games. `SeasonRosterWorkspace` hosts Prep/Live-style tabs; `PlayerSchedulePanel` renders the table.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS 4, Clerk (`requireUserId`), Prisma/libSQL (ownership only), Vitest + Testing Library. Work in `.worktrees/feat-season-roster` on `feat/season-roster`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-roster-schedule-tab-design.md`
- Parent roster domain: `docs/superpowers/specs/2026-08-11-season-roster-module-design.md`
- Season code must not import draft simulate/board/mock; schedule must not import draft modules
- Whose players: YOU only, all 14 slots in `SEASON_ROSTER_SLOTS` order
- Matchup = fantasy scoring period dates from fixture (`matchup.days`)
- Games = count of days with ≥1 game (doubleheader = 1 game-day)
- Opponent labels: away `@OPP`, home `vs OPP`; stacked labels if doubleheader
- Empty slot: Games shown as `—` (null); day cells `—`
- Missing `teamAbbr`: Games `0`; day cells `—`; show “team unknown”
- MVP schedule source: fixture only (`source: "fixture"`)
- No semicolons in TS/TSX; conventional commits; `handle*` for event handlers; Tailwind only
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>` when DB-touching suites flake in parallel

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/season/types.ts` | Add `teamAbbr?` on `SeasonPlayer`; export schedule response types (or keep in `schedule.ts`) |
| `src/lib/season/schedule.ts` | `buildPlayerMatchupSchedule` + label helpers |
| `data/fixtures/nba-matchup-schedule.json` | One scoring-period matchup + NBA games |
| `data/fixtures/espn-season-league.json` | Add `teamAbbr` on players |
| `src/lib/adapters/manualSeason.ts` | Preserve `teamAbbr` in `normalizePlayer` |
| `src/lib/adapters/espnSeason.ts` | Preserve/map `teamAbbr` when present |
| `src/app/api/schedule/route.ts` | `GET` fixture schedule for owned season league |
| `src/components/season/PlayerSchedulePanel.tsx` | Schedule table UI |
| `src/components/season/SeasonRosterWorkspace.tsx` | Stats \| Schedule tabs |
| `tests/unit/seasonSchedule.test.ts` | Join helper unit tests |
| `tests/api/schedule.test.ts` | API auth + fixture shape |
| `tests/unit/PlayerSchedulePanel.test.tsx` | Table render |
| `tests/unit/SeasonRosterWorkspace.test.tsx` | Tab switch + schedule fetch |

---

### Task 1: Schedule types + fixture JSON

**Files:**
- Modify: `src/lib/season/types.ts`
- Create: `data/fixtures/nba-matchup-schedule.json`
- Test: `tests/unit/seasonScheduleTypes.test.ts` (minimal shape assert via import)

**Interfaces:**
- Consumes: existing `SeasonPlayer`
- Produces:
  - `SeasonPlayer.teamAbbr?: string`
  - `ScheduleGame = { date: string; homeAbbr: string; awayAbbr: string }`
  - `ScheduleMatchup = { scoringPeriodId: number; startDate: string; endDate: string; days: string[] }`
  - `ScheduleResponse = { source: "fixture"; matchup: ScheduleMatchup; games: ScheduleGame[] }`

- [ ] **Step 1: Write failing type/fixture smoke test**

```ts
import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/nba-matchup-schedule.json"
import type { ScheduleResponse } from "@/lib/season/types"

describe("nba matchup schedule fixture", () => {
  it("covers a 7-day scoring period with games", () => {
    const schedule = fixture as ScheduleResponse
    expect(schedule.source).toBe("fixture")
    expect(schedule.matchup.days).toHaveLength(7)
    expect(schedule.matchup.startDate).toBe(schedule.matchup.days[0])
    expect(schedule.matchup.endDate).toBe(schedule.matchup.days[6])
    expect(schedule.games.length).toBeGreaterThan(10)
    expect(schedule.games.every((game) => schedule.matchup.days.includes(game.date))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (fixture missing)**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/seasonScheduleTypes.test.ts`  
Expected: FAIL cannot find module / JSON

- [ ] **Step 3: Extend types + add fixture**

In `src/lib/season/types.ts`, add `teamAbbr?: string` to `SeasonPlayer` and export:

```ts
export type ScheduleGame = {
  date: string
  homeAbbr: string
  awayAbbr: string
}

export type ScheduleMatchup = {
  scoringPeriodId: number
  startDate: string
  endDate: string
  days: string[]
}

export type ScheduleResponse = {
  source: "fixture"
  matchup: ScheduleMatchup
  games: ScheduleGame[]
}
```

Create `data/fixtures/nba-matchup-schedule.json` with a concrete Mon–Sun week (use `2026-03-09` … `2026-03-15`), `scoringPeriodId: 18`, and ≥20 games across multiple NBA team abbrs including `BOS`, `LAL`, `NYK`, `GSW`, `MIA`, `MIL`, `DEN`, `OKC`, plus at least one date with two games sharing a team (doubleheader) for later tests — if a true NBA doubleheader is awkward, duplicate two games on the same date for `BOS` in the fixture solely for test coverage.

Example skeleton (expand `games` to ≥20 real-looking rows):

```json
{
  "source": "fixture",
  "matchup": {
    "scoringPeriodId": 18,
    "startDate": "2026-03-09",
    "endDate": "2026-03-15",
    "days": [
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-15"
    ]
  },
  "games": [
    { "date": "2026-03-09", "homeAbbr": "BOS", "awayAbbr": "LAL" },
    { "date": "2026-03-09", "homeAbbr": "NYK", "awayAbbr": "MIA" }
  ]
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/seasonScheduleTypes.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/season/types.ts data/fixtures/nba-matchup-schedule.json tests/unit/seasonScheduleTypes.test.ts
git commit -m "feat(season): add schedule types and matchup fixture"
```

---

### Task 2: `buildPlayerMatchupSchedule` join helper

**Files:**
- Create: `src/lib/season/schedule.ts`
- Test: `tests/unit/seasonSchedule.test.ts`

**Interfaces:**
- Consumes: `SeasonRosterEntry`, `SeasonPlayer`, `ScheduleResponse` from `@/lib/season/types`
- Produces:
  - `OpponentLabel = string` (`@BOS` or `vs LAL`)
  - `PlayerScheduleRow = { slot; playerId: string | null; name: string; teamAbbr: string | null; teamUnknown: boolean; games: number | null; cells: Record<string, OpponentLabel[]> }`
  - `buildPlayerMatchupSchedule({ entries, players, schedule }): PlayerScheduleRow[]`

- [ ] **Step 1: Write failing unit tests**

```ts
import { describe, expect, it } from "vitest"
import { buildPlayerMatchupSchedule } from "@/lib/season/schedule"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-03-09",
    endDate: "2026-03-11",
    days: ["2026-03-09", "2026-03-10", "2026-03-11"],
  },
  games: [
    { date: "2026-03-09", homeAbbr: "BOS", awayAbbr: "LAL" },
    { date: "2026-03-10", homeAbbr: "NYK", awayAbbr: "BOS" },
    { date: "2026-03-10", homeAbbr: "MIA", awayAbbr: "BOS" },
    { date: "2026-03-11", homeAbbr: "GSW", awayAbbr: "DEN" },
  ],
}

const players: SeasonPlayer[] = [
  {
    id: "p1",
    name: "Home Star",
    teamAbbr: "BOS",
    projections: {} as SeasonPlayer["projections"],
    shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
  },
  {
    id: "p2",
    name: "No Team",
    projections: {} as SeasonPlayer["projections"],
    shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
  },
]

const entries: SeasonRosterEntry[] = [
  { slot: "PG", playerId: "p1" },
  { slot: "SG", playerId: null },
  { slot: "SF", playerId: "p2" },
]

describe("buildPlayerMatchupSchedule", () => {
  it("labels home/away, counts doubleheader as one game-day, handles empty and unknown team", () => {
    const rows = buildPlayerMatchupSchedule({ entries, players, schedule })

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      slot: "PG",
      name: "Home Star",
      teamAbbr: "BOS",
      games: 2,
      teamUnknown: false,
    })
    expect(rows[0].cells["2026-03-09"]).toEqual(["vs LAL"])
    expect(rows[0].cells["2026-03-10"]).toEqual(["@NYK", "@MIA"])
    expect(rows[0].cells["2026-03-11"]).toEqual([])

    expect(rows[1]).toMatchObject({
      slot: "SG",
      playerId: null,
      name: "Empty",
      games: null,
      teamUnknown: false,
    })
    expect(rows[1].cells["2026-03-09"]).toEqual([])

    expect(rows[2]).toMatchObject({
      slot: "SF",
      name: "No Team",
      teamAbbr: null,
      games: 0,
      teamUnknown: true,
    })
  })
})
```

Note: if `projections: {} as …` is awkward, import `defaultCategorySettings` / a tiny stub record of all 9 cats with zeros instead.

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/seasonSchedule.test.ts`  
Expected: FAIL cannot find module `@/lib/season/schedule`

- [ ] **Step 3: Implement helper**

```ts
// src/lib/season/schedule.ts
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"

export type OpponentLabel = string

export type PlayerScheduleRow = {
  slot: SeasonSlot
  playerId: string | null
  name: string
  teamAbbr: string | null
  teamUnknown: boolean
  games: number | null
  cells: Record<string, OpponentLabel[]>
}

type BuildArgs = {
  entries: SeasonRosterEntry[]
  players: SeasonPlayer[]
  schedule: ScheduleResponse
}

const emptyCells = (days: string[]): Record<string, OpponentLabel[]> =>
  Object.fromEntries(days.map((day) => [day, [] as OpponentLabel[]]))

export const buildPlayerMatchupSchedule = ({
  entries,
  players,
  schedule,
}: BuildArgs): PlayerScheduleRow[] => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const days = schedule.matchup.days

  return entries.map((entry) => {
    const baseCells = emptyCells(days)

    if (!entry.playerId) {
      return {
        slot: entry.slot,
        playerId: null,
        name: "Empty",
        teamAbbr: null,
        teamUnknown: false,
        games: null,
        cells: baseCells,
      }
    }

    const player = playersById.get(entry.playerId)
    const teamAbbr = player?.teamAbbr?.toUpperCase() ?? null
    const teamUnknown = !teamAbbr
    const cells = emptyCells(days)

    if (teamAbbr) {
      for (const game of schedule.games) {
        if (!days.includes(game.date)) continue
        if (game.homeAbbr.toUpperCase() === teamAbbr) {
          cells[game.date].push(`vs ${game.awayAbbr.toUpperCase()}`)
        } else if (game.awayAbbr.toUpperCase() === teamAbbr) {
          cells[game.date].push(`@${game.homeAbbr.toUpperCase()}`)
        }
      }
    }

    const games = teamUnknown
      ? 0
      : days.filter((day) => cells[day].length > 0).length

    return {
      slot: entry.slot,
      playerId: entry.playerId,
      name: player?.name ?? "Unknown",
      teamAbbr,
      teamUnknown,
      games,
      cells,
    }
  })
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/seasonSchedule.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/season/schedule.ts tests/unit/seasonSchedule.test.ts
git commit -m "feat(season): join roster players to matchup schedule"
```

---

### Task 3: Enrich season fixture + adapters with `teamAbbr`

**Files:**
- Modify: `data/fixtures/espn-season-league.json`
- Modify: `src/lib/adapters/manualSeason.ts`
- Modify: `src/lib/adapters/espnSeason.ts` (if it maps players)
- Test: extend existing adapter test or add assert in `tests/unit/manualSeasonAdapter.test.ts` (create if missing)

**Interfaces:**
- Consumes: `SeasonPlayer.teamAbbr?`
- Produces: fixture players with `teamAbbr`; adapters pass through

- [ ] **Step 1: Write failing adapter assertion**

```ts
import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-season-league.json"
import { manualToSeasonLeagueState } from "@/lib/adapters/manualSeason"

describe("manual season fixture teamAbbr", () => {
  it("preserves teamAbbr on players", () => {
    const state = manualToSeasonLeagueState({
      ...(fixture as never),
      name: "With teams",
    })
    expect(state.players.every((player) => typeof player.teamAbbr === "string" && player.teamAbbr.length >= 2)).toBe(true)
    expect(state.players[0]?.teamAbbr).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect FAIL (no teamAbbr on fixture / stripped)**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/manualSeasonAdapter.test.ts`  
Expected: FAIL

- [ ] **Step 3: Patch `normalizePlayer` + enrich fixture**

```ts
const normalizePlayer = (player: SeasonPlayer): SeasonPlayer => ({
  ...player,
  teamAbbr: player.teamAbbr?.toUpperCase(),
  projections: { ...player.projections },
  shooting: { ...player.shooting },
})
```

Apply the same pass-through in `espnSeason.ts` player mapping.

Enrich fixture with a one-off script (run from worktree root), then delete the script or keep under `scripts/` only if already conventional — prefer inline node `-e` and commit the JSON:

```js
const fs = require("fs")
const path = "data/fixtures/espn-season-league.json"
const data = JSON.parse(fs.readFileSync(path, "utf8"))
const teams = ["ATL","BOS","BKN","CHA","CHI","CLE","DAL","DEN","DET","GSW","HOU","IND","LAC","LAL","MEM","MIA","MIL","MIN","NOP","NYK","OKC","ORL","PHI","PHX","POR","SAC","SAS","TOR","UTA","WAS"]
data.players = data.players.map((player, index) => ({
  ...player,
  teamAbbr: teams[index % teams.length],
}))
fs.writeFileSync(path, JSON.stringify(data, null, 4) + "\n", "utf8")
// Ensure NO UTF-8 BOM (Turbopack JSON import breaks on BOM)
```

Verify first bytes are `{` not `EF BB BF`.

- [ ] **Step 4: Run adapter test — expect PASS**

Also run any existing season adapter tests that parse the fixture.

- [ ] **Step 5: Commit**

```bash
git add data/fixtures/espn-season-league.json src/lib/adapters/manualSeason.ts src/lib/adapters/espnSeason.ts tests/unit/manualSeasonAdapter.test.ts
git commit -m "feat(season): add teamAbbr to season players"
```

---

### Task 4: `GET /api/schedule`

**Files:**
- Create: `src/app/api/schedule/route.ts`
- Test: `tests/api/schedule.test.ts`

**Interfaces:**
- Consumes: `requireUserId`, `db.seasonLeague.findFirst`, fixture JSON
- Produces: `GET(request) => Response` with `ScheduleResponse` JSON; 401 unauthorized; 404 if league missing/not owned; 400 if `seasonLeagueId` missing

- [ ] **Step 1: Write failing API tests**

```ts
import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/schedule/route"
import { POST } from "@/app/api/season-leagues/route"
import { db } from "@/lib/db"

vi.mock("next/headers", () => ({ headers: vi.fn() }))

const testUserPrefix = `schedule-api-${crypto.randomUUID()}`
let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
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

const createLeague = async () => {
  const response = await POST(
    new Request("http://localhost/api/season-leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Schedule league", manual: true }),
    }),
  )
  return (await response.json()) as { id: string }
}

describe("GET /api/schedule", () => {
  it("requires authentication", async () => {
    authenticateAs()
    const response = await GET(
      new Request("http://localhost/api/schedule?seasonLeagueId=x"),
    )
    expect(response.status).toBe(401)
  })

  it("returns fixture matchup for an owned season league", async () => {
    const league = await createLeague()
    const response = await GET(
      new Request(`http://localhost/api/schedule?seasonLeagueId=${league.id}`),
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.source).toBe("fixture")
    expect(body.matchup.days).toHaveLength(7)
    expect(Array.isArray(body.games)).toBe(true)
  })

  it("returns 404 for another user's league", async () => {
    const league = await createLeague()
    authenticateAs(`${testUserPrefix}-other`)
    const response = await GET(
      new Request(`http://localhost/api/schedule?seasonLeagueId=${league.id}`),
    )
    expect(response.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run — expect FAIL (route missing)**

Run: `npx.cmd vitest run --maxWorkers=1 tests/api/schedule.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement route**

```ts
import { NextResponse } from "next/server"
import scheduleFixture from "../../../../data/fixtures/nba-matchup-schedule.json"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import type { ScheduleResponse } from "@/lib/season/types"

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

  const league = await db.seasonLeague.findFirst({
    where: { id: seasonLeagueId, clerkUserId: userId },
    select: { id: true },
  })
  if (!league) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const body = scheduleFixture as ScheduleResponse
  return NextResponse.json(body)
}
```

Ensure the JSON fixture has **no BOM**.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/schedule/route.ts tests/api/schedule.test.ts
git commit -m "feat(season): add fixture schedule API"
```

---

### Task 5: `PlayerSchedulePanel` UI

**Files:**
- Create: `src/components/season/PlayerSchedulePanel.tsx`
- Test: `tests/unit/PlayerSchedulePanel.test.tsx`

**Interfaces:**
- Consumes: `PlayerScheduleRow[]`, `ScheduleMatchup`
- Produces: presentational table (no fetch inside)

- [ ] **Step 1: Write failing component test**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PlayerSchedulePanel } from "@/components/season/PlayerSchedulePanel"

describe("PlayerSchedulePanel", () => {
  it("renders games column and day headers with opponent labels", () => {
    render(
      <PlayerSchedulePanel
        matchup={{
          scoringPeriodId: 18,
          startDate: "2026-03-09",
          endDate: "2026-03-11",
          days: ["2026-03-09", "2026-03-10", "2026-03-11"],
        }}
        rows={[
          {
            slot: "PG",
            playerId: "p1",
            name: "Home Star",
            teamAbbr: "BOS",
            teamUnknown: false,
            games: 2,
            cells: {
              "2026-03-09": ["vs LAL"],
              "2026-03-10": ["@NYK", "@MIA"],
              "2026-03-11": [],
            },
          },
        ]}
      />,
    )

    expect(screen.getByRole("heading", { name: /player schedule/i })).toBeInTheDocument()
    expect(screen.getByText(/matchup/i)).toBeInTheDocument()
    expect(screen.getByText("Games")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("vs LAL")).toBeInTheDocument()
    expect(screen.getByText("@NYK")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/PlayerSchedulePanel.test.tsx`

- [ ] **Step 3: Implement panel**

```tsx
"use client"

import type { ScheduleMatchup } from "@/lib/season/types"
import type { PlayerScheduleRow } from "@/lib/season/schedule"

type PlayerSchedulePanelProps = {
  matchup: ScheduleMatchup
  rows: PlayerScheduleRow[]
}

const formatDayHeader = (isoDate: string) => {
  const date = new Date(`${isoDate}T12:00:00`)
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" })
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${weekday} ${month}/${day}`
}

export const PlayerSchedulePanel = ({
  matchup,
  rows,
}: PlayerSchedulePanelProps) => (
  <section aria-labelledby="player-schedule-heading">
    <div className="mb-4">
      <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
        Matchup · {matchup.startDate} – {matchup.endDate}
      </p>
      <h2 className="mt-1 text-3xl font-semibold" id="player-schedule-heading">
        Player schedule
      </h2>
    </div>
    <div className="overflow-x-auto rounded-[2rem] border border-[var(--color-hairline)]">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead className="bg-[var(--color-soft-cloud)]">
          <tr>
            <th className="px-4 py-3 text-left text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase" scope="col">
              Player
            </th>
            <th className="px-3 py-3 text-center text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase" scope="col">
              Games
            </th>
            {matchup.days.map((day) => (
              <th
                className="px-2 py-3 text-center text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase"
                key={day}
                scope="col"
              >
                {formatDayHeader(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-[var(--color-hairline)]" key={`${row.slot}-${row.playerId ?? "empty"}`}>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium" scope="row">
                <span className="text-[var(--color-mute)]">{row.slot}</span>
                {" · "}
                {row.name}
                {row.teamUnknown ? (
                  <span className="ml-2 text-xs font-normal text-[var(--color-mute)]">team unknown</span>
                ) : null}
              </th>
              <td className="px-3 py-3 text-center tabular-nums font-semibold">
                {row.games === null ? "—" : row.games}
              </td>
              {matchup.days.map((day) => {
                const labels = row.cells[day] ?? []
                return (
                  <td className="px-2 py-3 text-center text-xs" key={day}>
                    {labels.length ? (
                      <span className="flex flex-col gap-0.5">
                        {labels.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
)
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/season/PlayerSchedulePanel.tsx tests/unit/PlayerSchedulePanel.test.tsx
git commit -m "feat(season): add player schedule panel"
```

---

### Task 6: Wire Stats | Schedule tabs in workspace

**Files:**
- Modify: `src/components/season/SeasonRosterWorkspace.tsx`
- Modify: `tests/unit/SeasonRosterWorkspace.test.tsx`

**Interfaces:**
- Consumes: `buildPlayerMatchupSchedule`, `PlayerSchedulePanel`, `GET /api/schedule?seasonLeagueId=`
- Produces: tab state `"stats" | "schedule"`; default `"stats"`; schedule fetch on first Schedule visit (or whenever Schedule is active and data missing)

- [ ] **Step 1: Extend workspace test for tabs**

Add to `tests/unit/SeasonRosterWorkspace.test.tsx` (keep existing analysis assertions):

```tsx
it("switches to schedule tab and loads matchup games", async () => {
  const fetchMock = vi.mocked(fetch)
  fetchMock.mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes("/api/season-leagues/")) {
      return new Response(JSON.stringify({ state }), { status: 200 })
    }
    if (url.includes("/api/schedule")) {
      return new Response(
        JSON.stringify({
          source: "fixture",
          matchup: {
            scoringPeriodId: 18,
            startDate: "2026-03-09",
            endDate: "2026-03-11",
            days: ["2026-03-09", "2026-03-10", "2026-03-11"],
          },
          games: [{ date: "2026-03-09", homeAbbr: "BOS", awayAbbr: "LAL" }],
        }),
        { status: 200 },
      )
    }
    return new Response("missing", { status: 404 })
  })

  // Give YOU's PG a team so a label can appear if desired; optional for this test
  render(<SeasonRosterWorkspace leagueId="season-1" />)

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /test roster/i })).toBeInTheDocument()
  })

  fireEvent.click(screen.getByRole("tab", { name: /schedule/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /player schedule/i })).toBeInTheDocument()
  })
  expect(screen.getByText("Games")).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: /league rank matrix/i })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole("tab", { name: /stats/i }))
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /league rank matrix/i })).toBeInTheDocument()
  })
})
```

Update the existing `state.players` fixtures to include `teamAbbr` on at least player-0 (`"BOS"`) so schedule join is realistic; not required for the tab assertion above.

- [ ] **Step 2: Run — expect FAIL (no tabs)**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/SeasonRosterWorkspace.test.tsx`

- [ ] **Step 3: Implement tabs in `SeasonRosterWorkspace`**

Add state and fetch (sketch — match existing file style, no semicolons):

```tsx
type WorkspaceTab = "stats" | "schedule"

const [tab, setTab] = useState<WorkspaceTab>("stats")
const [schedule, setSchedule] = useState<ScheduleResponse | null>(null)
const [scheduleError, setScheduleError] = useState("")
const [isScheduleLoading, setIsScheduleLoading] = useState(false)

useEffect(() => {
  if (tab !== "schedule" || schedule || !data) return

  const controller = new AbortController()
  const load = async () => {
    setScheduleError("")
    setIsScheduleLoading(true)
    try {
      const response = await fetch(
        `/api/schedule?seasonLeagueId=${leagueId}`,
        { signal: controller.signal },
      )
      if (!response.ok) throw new Error("Unable to load schedule")
      setSchedule((await response.json()) as ScheduleResponse)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setScheduleError(error instanceof Error ? error.message : "Unable to load schedule")
    } finally {
      if (!controller.signal.aborted) setIsScheduleLoading(false)
    }
  }
  void load()
  return () => controller.abort()
}, [tab, schedule, data, leagueId])
```

Under header actions, add tablist (mirror DraftWorkspace pills). Wrap existing All players / profile / matrix in `tab === "stats"`. For `tab === "schedule"`:

- loading → status text
- error → alert in panel only
- success → `PlayerSchedulePanel` with rows from `buildPlayerMatchupSchedule` using YOU team entries (prefer `localLineup` / draft entries currently shown in stats — same source as the player table)

Use the same effective entries the Stats table uses while editing so Schedule stays consistent during lineup edits.

Keep both panels’ React state by toggling visibility with CSS `hidden` **or** conditionally rendering Schedule only while always keeping stats state in parent (parent already holds lineup draft — conditional render of children is OK).

- [ ] **Step 4: Run workspace tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/season/SeasonRosterWorkspace.tsx tests/unit/SeasonRosterWorkspace.test.tsx
git commit -m "feat(season): add stats and schedule tabs"
```

---

### Task 7: Verification smoke

**Files:**
- None required unless fixes surface

- [ ] **Step 1: Lint touched areas**

Run: `npm.cmd run lint`  
Expected: PASS

- [ ] **Step 2: Full unit/API suite (serial)**

Run: `npx.cmd vitest run --maxWorkers=1`  
Expected: all PASS

- [ ] **Step 3: Manual browser check on `http://localhost:3001`**

1. Open `/roster`, create/open a league  
2. Confirm Stats still shows table → profile → matrix  
3. Click Schedule → Matchup label, Games column, 7 day headers, opponent labels for players with `teamAbbr`  
4. Click Stats → matrix still present; lineup edit state preserved if mid-edit  

- [ ] **Step 4: Commit any fixes** (only if Step 1–3 required code changes)

```bash
git add <files>
git commit -m "fix(season): schedule tab verification fixes"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Stats \| Schedule tabs, default Stats | 6 |
| YOU 14 slots order | 2 + 6 (entries from YOU / local lineup) |
| Games = game-days; DH = 1 | 2 |
| Day calendar `@` / `vs`; stacked DH | 2 + 5 |
| Matchup date label | 5 |
| `teamAbbr` on players + fixture demoable | 1 + 3 |
| Fixture schedule API + ownership | 4 |
| Empty / team unknown | 2 + 5 |
| Schedule errors isolated | 6 |
| No draft coupling; no live ESPN MVP | 1–6 |
| Unit + API tests; no E2E | 2, 4, 5, 6, 7 |

## Self-review notes

- No live ESPN path in tasks (post-MVP per spec).
- `ScheduleResponse.source` fixed to `"fixture"` for MVP.
- Fixture JSON must be written **without UTF-8 BOM** (known Turbopack break).
- Workspace must join schedule using the same effective YOU entries as the Stats table (including in-progress lineup edits).
