# Injury Replacement Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select one available FA/waiver replacement for each NBA player who became OUT or GTD in the last 24 hours, using a confirmed lineup when it exists and the RotoWire depth chart otherwise.

**Architecture:** A pure crosswalk maps RotoWire ids to ESPN ids. A pure `selectInjuryReplacements` chooses the add. A server cache turns RotoWire JSON into those inputs and refreshes on the spec's TTLs. `GET /api/injuries/pickups` calls the selector and adapts rows onto the existing pickup DTO so the current panels keep rendering. The selector never calls the network.

**Tech Stack:** TypeScript, Vitest, Next.js route handlers, `fetch`.

## Global Constraints

- Injury source is RotoWire, server-side. The API key stays in `ROTOWIRE_API_KEY`.
- The injured player may be any mapped NBA player. The add must be in `availablePlayerIds`.
- Statuses that qualify are `OUT` and `GTD` on RotoWire `Injury.Status`. `NBAInjuryStatus` alone does not qualify.
- The window is the latest update in the last 24 hours, measured from the selector's `now` against `DateTime`.
- Before a confirmed lineup, use the RotoWire depth chart. A projected lineup does not change the pick.
- After a confirmed lineup, the new starter at the injured player's depth-chart position is the pick when there is exactly one available match.
- Player identity is a saved map from RotoWire id to ESPN player id. Name matching lowercases, removes punctuation, collapses whitespace, and drops suffixes `jr`, `sr`, `ii`, `iii`, and `iv`.
- Team aliases: `PHO` = `PHX`, `BRK` = `BKN`, `CHO` = `CHA`, `GS` = `GSW`, `SA` = `SAS`, `NY` = `NYK`, `NO` = `NOP`, `WSH` = `WAS`.
- One row per injury. Duplicate add ids stay. Two ESPN players for one normalized name and team store neither id.
- An injured player on no depth-chart position list produces no row.
- A failed refresh keeps the previous cache. An input that has never loaded is empty. Fixture injuries and the fixture depth chart do not fill a live miss.
- Do not implement minutes scoring, category re-sort, breakout pickups, messenger alerts, or a cron.
- Cache TTLs: injuries 5 minutes on a game day and 30 minutes otherwise; depth 60 minutes on a game day and 6 hours otherwise; lineups 5 minutes from 2 hours before the next tip; player list 6 hours.
- Leave `recommendInjuryPickups` and its unit tests in place. The route stops calling the fixture providers.

---

### Task 1: RotoWire to ESPN crosswalk

**Files:**
- Create: `src/lib/injuries/crosswalk.ts`
- Test: `tests/unit/injuryCrosswalk.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `normalizePersonName(value: string): string`
  - `canonicalTeam(code: string): string`
  - `buildCrosswalk(espnPlayers: CrosswalkEspnPlayer[], rotowirePlayers: CrosswalkRotoPlayer[], aliases?: readonly CrosswalkAlias[]): Map<string, string>`
  - `CrosswalkEspnPlayer = { id: string; name: string; teamAbbr?: string }`
  - `CrosswalkRotoPlayer = { id: string; firstName: string; lastName: string; teamAbbr: string }`
  - `CrosswalkAlias = { rotowireId: string; espnId: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { buildCrosswalk, canonicalTeam, normalizePersonName } from "@/lib/injuries/crosswalk"

describe("crosswalk names", () => {
  it("normalizes punctuation, case, and suffixes", () => {
    expect(normalizePersonName("Gary Trent Jr.")).toBe("gary trent")
    expect(canonicalTeam("pho")).toBe("PHX")
  })
})

describe("buildCrosswalk", () => {
  it("maps one RotoWire id to one ESPN id by name and team", () => {
    const map = buildCrosswalk(
      [{ id: "espn-naw", name: "Nickeil Alexander-Walker", teamAbbr: "PHX" }],
      [{ id: "4765", firstName: "Nickeil", lastName: "Alexander-Walker", teamAbbr: "PHO" }],
    )

    expect(map.get("4765")).toBe("espn-naw")
  })

  it("stores neither id when two ESPN players share a name and team", () => {
    const map = buildCrosswalk(
      [
        { id: "espn-a", name: "Chris Johnson", teamAbbr: "ATL" },
        { id: "espn-b", name: "Chris Johnson", teamAbbr: "ATL" },
      ],
      [{ id: "rw-1", firstName: "Chris", lastName: "Johnson", teamAbbr: "ATL" }],
    )

    expect(map.has("rw-1")).toBe(false)
  })

  it("adds an alias only for an id the names did not map", () => {
    const map = buildCrosswalk(
      [{ id: "espn-nic", name: "Nic Claxton", teamAbbr: "BKN" }],
      [{ id: "rw-nic", firstName: "Nicolas", lastName: "Claxton", teamAbbr: "BKN" }],
      [{ rotowireId: "rw-nic", espnId: "espn-nic" }],
    )

    expect(map.get("rw-nic")).toBe("espn-nic")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/injuryCrosswalk.test.ts`

Expected: FAIL with `Cannot find module '@/lib/injuries/crosswalk'`

- [ ] **Step 3: Write minimal implementation**

```ts
export type CrosswalkEspnPlayer = {
  id: string
  name: string
  teamAbbr?: string
}

export type CrosswalkRotoPlayer = {
  id: string
  firstName: string
  lastName: string
  teamAbbr: string
}

export type CrosswalkAlias = {
  rotowireId: string
  espnId: string
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"])

const TEAM_ALIASES: Record<string, string> = {
  PHO: "PHX",
  BRK: "BKN",
  CHO: "CHA",
  GS: "GSW",
  SA: "SAS",
  NY: "NYK",
  NO: "NOP",
  WSH: "WAS",
}

export const normalizePersonName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['.'’]/g, "")
    .split(/\s+/)
    .filter((part) => part.length > 0 && !SUFFIXES.has(part))
    .join(" ")

export const canonicalTeam = (code: string): string => {
  const upper = code.trim().toUpperCase()
  return TEAM_ALIASES[upper] ?? upper
}

const personKey = (name: string, teamAbbr: string): string =>
  `${normalizePersonName(name)}|${canonicalTeam(teamAbbr)}`

const pushId = (groups: Map<string, string[]>, key: string, id: string) => {
  const ids = groups.get(key) ?? []
  ids.push(id)
  groups.set(key, ids)
}

export const buildCrosswalk = (
  espnPlayers: CrosswalkEspnPlayer[],
  rotowirePlayers: CrosswalkRotoPlayer[],
  aliases: readonly CrosswalkAlias[] = [],
): Map<string, string> => {
  const espnByKey = new Map<string, string[]>()
  for (const player of espnPlayers) {
    if (!player.teamAbbr || player.name.trim().length === 0) continue
    pushId(espnByKey, personKey(player.name, player.teamAbbr), player.id)
  }

  const rotowireByKey = new Map<string, string[]>()
  for (const player of rotowirePlayers) {
    pushId(
      rotowireByKey,
      personKey(`${player.firstName} ${player.lastName}`, player.teamAbbr),
      player.id,
    )
  }

  const map = new Map<string, string>()
  for (const [key, rotowireIds] of rotowireByKey) {
    const espnIds = espnByKey.get(key) ?? []
    if (rotowireIds.length !== 1 || espnIds.length !== 1) continue
    map.set(rotowireIds[0]!, espnIds[0]!)
  }

  for (const alias of aliases) {
    if (!map.has(alias.rotowireId)) map.set(alias.rotowireId, alias.espnId)
  }

  return map
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/injuryCrosswalk.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/crosswalk.ts tests/unit/injuryCrosswalk.test.ts
git commit -m "feat(injuries): map RotoWire ids to ESPN ids"
```

---

### Task 2: Replacement selector

**Files:**
- Create: `src/lib/injuries/selection.ts`
- Test: `tests/unit/injurySelection.test.ts`

**Interfaces:**
- Consumes: `canonicalTeam` from `src/lib/injuries/crosswalk.ts`
- Produces:
  - `selectInjuryReplacements(inputs: InjurySelectionInputs): InjuryReplacement[]`
  - `InjuryReplacement = { injuredPlayerId: string; status: "out" | "gtd"; addPlayerId: string; source: "lineup" | "depth" }`
  - `InjurySelectionInputs` with `updates`, `depth`, `lineups`, `crosswalk`, `availablePlayerIds`, `now`
  - Depth positions `"PG" | "SG" | "SF" | "PF" | "C"`. `playerIds` are rank order, index 0 = rank 1.
  - `InjuryUpdate.status` is `"out" | "gtd" | "other"`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  selectInjuryReplacements,
  type InjurySelectionInputs,
} from "@/lib/injuries/selection"

const now = new Date("2026-01-15T00:00:00.000Z")

const baseInputs = (): InjurySelectionInputs => ({
  now,
  availablePlayerIds: ["espn-naw"],
  crosswalk: new Map([
    ["rw-trae", "espn-trae"],
    ["rw-naw", "espn-naw"],
    ["rw-bufkin", "espn-bufkin"],
  ]),
  updates: [
    {
      rotowirePlayerId: "rw-trae",
      teamAbbr: "ATL",
      status: "out",
      at: "2026-01-14T12:00:00.000Z",
    },
  ],
  depth: {
    teams: [
      {
        teamAbbr: "ATL",
        positions: [
          { position: "PG", playerIds: ["rw-trae", "rw-naw", "rw-bufkin"] },
        ],
      },
    ],
  },
  lineups: [],
})

describe("selectInjuryReplacements", () => {
  it("picks the confirmed new starter when exactly one matches the position", () => {
    const inputs = baseInputs()
    inputs.lineups = [
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [{ playerId: "rw-naw", position: "PG" }],
      },
    ]

    expect(selectInjuryReplacements(inputs)).toEqual([
      {
        injuredPlayerId: "espn-trae",
        status: "out",
        addPlayerId: "espn-naw",
        source: "lineup",
      },
    ])
  })

  it("walks the depth chart when that starter is not available", () => {
    const inputs = baseInputs()
    inputs.availablePlayerIds = ["espn-bufkin"]
    inputs.lineups = [
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [{ playerId: "rw-naw", position: "PG" }],
      },
    ]

    expect(selectInjuryReplacements(inputs)).toEqual([
      {
        injuredPlayerId: "espn-trae",
        status: "out",
        addPlayerId: "espn-bufkin",
        source: "depth",
      },
    ])
  })

  it("uses the depth chart when no confirmed lineup is passed in", () => {
    expect(selectInjuryReplacements(baseInputs())).toEqual([
      {
        injuredPlayerId: "espn-trae",
        status: "out",
        addPlayerId: "espn-naw",
        source: "depth",
      },
    ])
  })

  it("uses the depth chart when the injured player is still starting", () => {
    const inputs = baseInputs()
    inputs.lineups = [
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [
          { playerId: "rw-trae", position: "PG" },
          { playerId: "rw-naw", position: "PG" },
        ],
      },
    ]

    expect(selectInjuryReplacements(inputs)[0]?.source).toBe("depth")
  })

  it("uses the depth chart when two confirmed starters match the position", () => {
    const inputs = baseInputs()
    inputs.availablePlayerIds = ["espn-naw", "espn-bufkin"]
    inputs.lineups = [
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [
          { playerId: "rw-naw", position: "PG" },
          { playerId: "rw-bufkin", position: "PG" },
        ],
      },
    ]

    expect(selectInjuryReplacements(inputs)[0]).toMatchObject({
      addPlayerId: "espn-naw",
      source: "depth",
    })
  })

  it("keeps OUT when a later OUT follows GTD inside 24 hours", () => {
    const inputs = baseInputs()
    inputs.updates = [
      {
        rotowirePlayerId: "rw-trae",
        teamAbbr: "ATL",
        status: "gtd",
        at: "2026-01-14T10:00:00.000Z",
      },
      {
        rotowirePlayerId: "rw-trae",
        teamAbbr: "ATL",
        status: "out",
        at: "2026-01-14T18:00:00.000Z",
      },
    ]

    expect(selectInjuryReplacements(inputs)[0]?.status).toBe("out")
  })

  it("drops an update older than 24 hours", () => {
    const inputs = baseInputs()
    inputs.updates[0]!.at = "2026-01-13T00:00:00.000Z"

    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("drops a player whose latest status is neither OUT nor GTD", () => {
    const inputs = baseInputs()
    inputs.updates.push({
      rotowirePlayerId: "rw-trae",
      teamAbbr: "ATL",
      status: "other",
      at: "2026-01-14T20:00:00.000Z",
    })

    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("skips an injured player who is not on a depth-chart position list", () => {
    const inputs = baseInputs()
    inputs.depth = { teams: [] }

    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("skips an unmapped injured player", () => {
    const inputs = baseInputs()
    inputs.crosswalk = new Map([["rw-naw", "espn-naw"]])

    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("emits two rows when two injuries select the same available player", () => {
    const inputs = baseInputs()
    inputs.crosswalk = new Map([
      ["rw-trae", "espn-trae"],
      ["rw-dyson", "espn-dyson"],
      ["rw-naw", "espn-naw"],
    ])
    inputs.depth = {
      teams: [
        {
          teamAbbr: "ATL",
          positions: [
            { position: "PG", playerIds: ["rw-trae", "rw-naw"] },
            { position: "SG", playerIds: ["rw-dyson", "rw-naw"] },
          ],
        },
      ],
    }
    inputs.updates.push({
      rotowirePlayerId: "rw-dyson",
      teamAbbr: "ATL",
      status: "gtd",
      at: "2026-01-14T16:00:00.000Z",
    })

    const rows = selectInjuryReplacements(inputs)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.addPlayerId)).toEqual(["espn-naw", "espn-naw"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/injurySelection.test.ts`

Expected: FAIL with `Cannot find module '@/lib/injuries/selection'`

- [ ] **Step 3: Write minimal implementation**

```ts
import { canonicalTeam } from "./crosswalk"

export type DepthPosition = "PG" | "SG" | "SF" | "PF" | "C"

export type InjuryUpdate = {
  rotowirePlayerId: string
  teamAbbr: string
  status: "out" | "gtd" | "other"
  at: string
}

export type DepthChart = {
  teams: Array<{
    teamAbbr: string
    positions: Array<{ position: DepthPosition; playerIds: string[] }>
  }>
}

export type ConfirmedLineup = {
  teamAbbr: string
  startsAt: string
  starters: Array<{ playerId: string; position?: DepthPosition }>
}

export type InjurySelectionInputs = {
  updates: InjuryUpdate[]
  depth: DepthChart
  lineups: ConfirmedLineup[]
  crosswalk: ReadonlyMap<string, string>
  availablePlayerIds: readonly string[]
  now: Date
}

export type InjuryReplacement = {
  injuredPlayerId: string
  status: "out" | "gtd"
  addPlayerId: string
  source: "lineup" | "depth"
}

const WINDOW_MS = 24 * 60 * 60 * 1000
const POSITIONS = new Set<DepthPosition>(["PG", "SG", "SF", "PF", "C"])

const isPosition = (value: string | undefined): value is DepthPosition =>
  value !== undefined && POSITIONS.has(value as DepthPosition)

type PositionList = {
  position: DepthPosition
  playerIds: string[]
  index: number
}

const positionListFor = (
  depth: DepthChart,
  teamAbbr: string,
  rotowirePlayerId: string,
): PositionList | null => {
  const team = depth.teams.find(
    (entry) => canonicalTeam(entry.teamAbbr) === canonicalTeam(teamAbbr),
  )
  if (!team) return null

  let best: PositionList | null = null
  for (const group of team.positions) {
    const index = group.playerIds.indexOf(rotowirePlayerId)
    if (index === -1) continue
    if (!best || index < best.index) {
      best = { position: group.position, playerIds: group.playerIds, index }
    }
  }

  return best
}

const latestUpdates = (updates: InjuryUpdate[], now: Date): InjuryUpdate[] => {
  const byPlayer = new Map<string, InjuryUpdate>()
  for (const update of updates) {
    const at = new Date(update.at).getTime()
    if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > WINDOW_MS) continue
    const current = byPlayer.get(update.rotowirePlayerId)
    if (!current || at >= new Date(current.at).getTime()) {
      byPlayer.set(update.rotowirePlayerId, update)
    }
  }

  return [...byPlayer.values()].filter(
    (update): update is InjuryUpdate & { status: "out" | "gtd" } =>
      update.status === "out" || update.status === "gtd",
  )
}

const nextLineup = (
  lineups: ConfirmedLineup[],
  teamAbbr: string,
  now: Date,
): ConfirmedLineup | null => {
  const upcoming = lineups
    .filter((lineup) => {
      if (canonicalTeam(lineup.teamAbbr) !== canonicalTeam(teamAbbr)) return false
      const startsAt = new Date(lineup.startsAt).getTime()
      return !Number.isNaN(startsAt) && startsAt > now.getTime()
    })
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    )

  return upcoming[0] ?? null
}

const starterPosition = (
  starter: ConfirmedLineup["starters"][number],
  depth: DepthChart,
  teamAbbr: string,
): DepthPosition | null => {
  if (isPosition(starter.position)) return starter.position
  return positionListFor(depth, teamAbbr, starter.playerId)?.position ?? null
}

export const selectInjuryReplacements = (
  inputs: InjurySelectionInputs,
): InjuryReplacement[] => {
  const available = new Set(inputs.availablePlayerIds)
  const rows: InjuryReplacement[] = []

  for (const update of latestUpdates(inputs.updates, inputs.now)) {
    const injuredEspnId = inputs.crosswalk.get(update.rotowirePlayerId)
    if (!injuredEspnId) continue

    const position = positionListFor(
      inputs.depth,
      update.teamAbbr,
      update.rotowirePlayerId,
    )
    if (!position) continue

    const lineup = nextLineup(inputs.lineups, update.teamAbbr, inputs.now)
    const injuredIsStarting =
      lineup?.starters.some((starter) => starter.playerId === update.rotowirePlayerId) ??
      false

    if (lineup && !injuredIsStarting) {
      const matches = lineup.starters.filter((starter) => {
        if (starter.playerId === update.rotowirePlayerId) return false
        return starterPosition(starter, inputs.depth, update.teamAbbr) === position.position
      })
      const matched = matches[0]
      const addEspnId = matched ? inputs.crosswalk.get(matched.playerId) : undefined
      if (matches.length === 1 && addEspnId && available.has(addEspnId)) {
        rows.push({
          injuredPlayerId: injuredEspnId,
          status: update.status,
          addPlayerId: addEspnId,
          source: "lineup",
        })
        continue
      }
    }

    const backupRotowireId = position.playerIds
      .slice(position.index + 1)
      .find((playerId) => {
        const espnId = inputs.crosswalk.get(playerId)
        return espnId !== undefined && available.has(espnId)
      })
    const addEspnId = backupRotowireId
      ? inputs.crosswalk.get(backupRotowireId)
      : undefined
    if (!addEspnId) continue

    rows.push({
      injuredPlayerId: injuredEspnId,
      status: update.status,
      addPlayerId: addEspnId,
      source: "depth",
    })
  }

  return rows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/injurySelection.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/selection.ts tests/unit/injurySelection.test.ts
git commit -m "feat(injuries): select a lineup or depth-chart replacement"
```

---

### Task 3: Parse RotoWire payloads

**Files:**
- Create: `src/lib/injuries/rotowireParse.ts`
- Test: `tests/unit/rotowireParse.test.ts`

**Interfaces:**
- Consumes: `CrosswalkEspnPlayer`, `CrosswalkRotoPlayer`, `buildCrosswalk` from `src/lib/injuries/crosswalk.ts`; `DepthChart`, `ConfirmedLineup`, `InjuryUpdate` from `src/lib/injuries/selection.ts`
- Produces:
  - `parseInjuryUpdates(payload: unknown): InjuryUpdate[]`
  - `parseDepthChart(payload: unknown): DepthChart`
  - `parseConfirmedLineups(payload: unknown): ConfirmedLineup[]`
  - `parseRotoPlayers(payload: unknown): CrosswalkRotoPlayer[]`
  - A projected or non-confirmed lineup is omitted. `Injury.Status` of `OUT` / `GTD` becomes `out` / `gtd`. Any other status becomes `other`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  parseConfirmedLineups,
  parseDepthChart,
  parseInjuryUpdates,
  parseRotoPlayers,
} from "@/lib/injuries/rotowireParse"

describe("parseInjuryUpdates", () => {
  it("keeps OUT and GTD and marks anything else as other", () => {
    const updates = parseInjuryUpdates({
      Updates: [
        {
          DateTime: "2026-01-14T18:00:00.000Z",
          Injury: { Status: "OUT" },
          Player: { Id: "1" },
          Team: { Code: "ATL" },
        },
        {
          DateTime: "2026-01-14T19:00:00.000Z",
          Injury: { Status: "QUESTIONABLE" },
          Player: { Id: "2" },
          Team: { Code: "BOS" },
        },
      ],
    })

    expect(updates).toEqual([
      {
        rotowirePlayerId: "1",
        teamAbbr: "ATL",
        status: "out",
        at: "2026-01-14T18:00:00.000Z",
      },
      {
        rotowirePlayerId: "2",
        teamAbbr: "BOS",
        status: "other",
        at: "2026-01-14T19:00:00.000Z",
      },
    ])
  })
})

describe("parseDepthChart", () => {
  it("orders each position by rank", () => {
    const depth = parseDepthChart({
      Teams: [
        {
          Code: "ATL",
          Players: [
            { Id: "2", Position: "PG", Rank: "2" },
            { Id: "1", Position: "PG", Rank: "1" },
          ],
        },
      ],
    })

    expect(depth.teams[0]?.positions[0]?.playerIds).toEqual(["1", "2"])
  })
})

describe("parseConfirmedLineups", () => {
  it("drops a lineup that is not confirmed", () => {
    const lineups = parseConfirmedLineups({
      Games: [
        {
          DateTime: "2026-01-15T01:00:00.000Z",
          Status: "Projected",
          Team: { Code: "ATL" },
          Starters: [{ Id: "2", Position: "PG" }],
        },
        {
          DateTime: "2026-01-15T01:00:00.000Z",
          Confirmed: true,
          Team: { Code: "ATL" },
          Starters: [{ Id: "2", Position: "PG" }],
        },
      ],
    })

    expect(lineups).toEqual([
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [{ playerId: "2", position: "PG" }],
      },
    ])
  })
})

describe("parseRotoPlayers", () => {
  it("reads team rosters and free agents", () => {
    const players = parseRotoPlayers({
      FreeAgents: [{ Id: "9", FirstName: "Shaqquan", LastName: "Aaron" }],
      Teams: [
        {
          Code: "ATL",
          Players: [{ Id: "4765", FirstName: "Nickeil", LastName: "Alexander-Walker" }],
        },
      ],
    })

    expect(players).toEqual([
      { id: "9", firstName: "Shaqquan", lastName: "Aaron", teamAbbr: "" },
      {
        id: "4765",
        firstName: "Nickeil",
        lastName: "Alexander-Walker",
        teamAbbr: "ATL",
      },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/rotowireParse.test.ts`

Expected: FAIL with `Cannot find module '@/lib/injuries/rotowireParse'`

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CrosswalkRotoPlayer } from "./crosswalk"
import type { ConfirmedLineup, DepthChart, DepthPosition, InjuryUpdate } from "./selection"

const POSITIONS = new Set<DepthPosition>(["PG", "SG", "SF", "PF", "C"])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "")

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const injuryStatus = (value: string): InjuryUpdate["status"] => {
  const upper = value.toUpperCase()
  if (upper === "OUT") return "out"
  if (upper === "GTD") return "gtd"
  return "other"
}

const positionOf = (value: string): DepthPosition | undefined => {
  const upper = value.trim().toUpperCase()
  return POSITIONS.has(upper as DepthPosition) ? (upper as DepthPosition) : undefined
}

export const parseInjuryUpdates = (payload: unknown): InjuryUpdate[] => {
  if (!isRecord(payload)) return []

  return list(payload.Updates).flatMap((update) => {
    const player = isRecord(update.Player) ? update.Player : {}
    const team = isRecord(update.Team) ? update.Team : {}
    const injury = isRecord(update.Injury) ? update.Injury : {}
    const rotowirePlayerId = text(player.Id)
    const at = text(update.DateTime)
    if (rotowirePlayerId.length === 0 || at.length === 0) return []

    return [
      {
        rotowirePlayerId,
        teamAbbr: text(team.Code),
        status: injuryStatus(text(injury.Status)),
        at,
      },
    ]
  })
}

export const parseDepthChart = (payload: unknown): DepthChart => {
  if (!isRecord(payload)) return { teams: [] }

  return {
    teams: list(payload.Teams).map((team) => {
      const grouped = new Map<DepthPosition, Array<{ id: string; rank: number }>>()
      for (const player of list(team.Players)) {
        const position = positionOf(text(player.Position))
        const id = text(player.Id)
        if (!position || id.length === 0) continue
        const rank = Number(player.Rank)
        const bucket = grouped.get(position) ?? []
        bucket.push({ id, rank: Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER })
        grouped.set(position, bucket)
      }

      return {
        teamAbbr: text(team.Code),
        positions: [...grouped.entries()].map(([position, players]) => ({
          position,
          playerIds: players
            .sort((left, right) => left.rank - right.rank)
            .map((player) => player.id),
        })),
      }
    }),
  }
}

const isConfirmed = (game: Record<string, unknown>): boolean =>
  game.Confirmed === true || text(game.Status).toUpperCase() === "CONFIRMED"

export const parseConfirmedLineups = (payload: unknown): ConfirmedLineup[] => {
  if (!isRecord(payload)) return []

  return list(payload.Games).flatMap((game) => {
    if (!isConfirmed(game)) return []
    const team = isRecord(game.Team) ? game.Team : {}
    const startsAt = text(game.DateTime)
    const teamAbbr = text(team.Code)
    if (startsAt.length === 0 || teamAbbr.length === 0) return []

    return [
      {
        teamAbbr,
        startsAt,
        starters: list(game.Starters).flatMap((starter) => {
          const playerId = text(starter.Id)
          if (playerId.length === 0) return []
          const position = positionOf(text(starter.Position))
          return [{ playerId, ...(position ? { position } : {}) }]
        }),
      },
    ]
  })
}

export const parseRotoPlayers = (payload: unknown): CrosswalkRotoPlayer[] => {
  if (!isRecord(payload)) return []

  const freeAgents = list(payload.FreeAgents).flatMap((player) => {
    const id = text(player.Id)
    if (id.length === 0) return []
    return [
      {
        id,
        firstName: text(player.FirstName),
        lastName: text(player.LastName),
        teamAbbr: "",
      },
    ]
  })

  const rostered = list(payload.Teams).flatMap((team) =>
    list(team.Players).flatMap((player) => {
      const id = text(player.Id)
      if (id.length === 0) return []
      return [
        {
          id,
          firstName: text(player.FirstName),
          lastName: text(player.LastName),
          teamAbbr: text(team.Code),
        },
      ]
    }),
  )

  return [...freeAgents, ...rostered]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/rotowireParse.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/rotowireParse.ts tests/unit/rotowireParse.test.ts
git commit -m "feat(injuries): parse RotoWire injury, depth, and lineup payloads"
```

---

### Task 4: Server cache

**Files:**
- Create: `src/lib/injuries/rotowireCache.ts`
- Test: `tests/unit/rotowireCache.test.ts`

**Interfaces:**
- Consumes: parsers from `src/lib/injuries/rotowireParse.ts`; `buildCrosswalk` and `CrosswalkEspnPlayer` from `src/lib/injuries/crosswalk.ts`; `DepthChart`, `ConfirmedLineup`, `InjuryUpdate` from `src/lib/injuries/selection.ts`
- Produces:
  - `loadInjurySelectionInputs(options: { now: Date; espnPlayers: CrosswalkEspnPlayer[]; fetchImpl?: typeof fetch }): Promise<CachedInjuryInputs>`
  - `clearInjurySelectionCache(): void`
  - `CachedInjuryInputs = { updates: InjuryUpdate[]; depth: DepthChart; lineups: ConfirmedLineup[]; crosswalk: Map<string, string> }`
  - A game day is any cached lineup whose `startsAt` falls on the UTC calendar date of `now`. Before the first lineup fetch, `gameDay` is false.
  - Lineups refetch when the soonest future `startsAt` is within 2 hours, at a 5 minute TTL. Otherwise they refetch every 6 hours.
  - Missing `ROTOWIRE_API_KEY` throws inside the refresh, and the loader returns the previous cache or an empty cache.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearInjurySelectionCache,
  loadInjurySelectionInputs,
} from "@/lib/injuries/rotowireCache"

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })

const payloads = () => ({
  injuries: {
    Updates: [
      {
        DateTime: "2026-01-14T12:00:00.000Z",
        Injury: { Status: "OUT" },
        Player: { Id: "rw-trae" },
        Team: { Code: "ATL" },
      },
    ],
  },
  depth: {
    Teams: [
      {
        Code: "ATL",
        Players: [
          { Id: "rw-trae", Position: "PG", Rank: "1" },
          { Id: "rw-naw", Position: "PG", Rank: "2" },
        ],
      },
    ],
  },
  lineups: { Games: [] },
  players: {
    FreeAgents: [],
    Teams: [
      {
        Code: "ATL",
        Players: [
          { Id: "rw-trae", FirstName: "Trae", LastName: "Young" },
          { Id: "rw-naw", FirstName: "Nickeil", LastName: "Alexander-Walker" },
        ],
      },
    ],
  },
})

const fetchOk = () => {
  const bodies = payloads()
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("get-nba-injuries")) return jsonResponse(bodies.injuries)
    if (url.includes("get-nba-depth-charts")) return jsonResponse(bodies.depth)
    if (url.includes("get-nba-lineups")) return jsonResponse(bodies.lineups)
    if (url.includes("get-nba-players")) return jsonResponse(bodies.players)
    return new Response("missing", { status: 404 })
  })
}

describe("loadInjurySelectionInputs", () => {
  afterEach(() => {
    clearInjurySelectionCache()
    vi.unstubAllEnvs()
  })

  it("returns an empty cache when the key is missing", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "")
    const fetchImpl = fetchOk()

    const inputs = await loadInjurySelectionInputs({
      now: new Date("2026-01-15T00:00:00.000Z"),
      espnPlayers: [],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(inputs.updates).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("maps players and does not refetch injuries inside the off-day TTL", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
    const fetchImpl = fetchOk()
    const now = new Date("2026-01-15T00:00:00.000Z")
    const espnPlayers = [
      { id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" },
      { id: "espn-naw", name: "Nickeil Alexander-Walker", teamAbbr: "ATL" },
    ]

    const first = await loadInjurySelectionInputs({
      now,
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const second = await loadInjurySelectionInputs({
      now: new Date(now.getTime() + 10 * 60 * 1000),
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(first.crosswalk.get("rw-trae")).toBe("espn-trae")
    expect(first.updates[0]?.status).toBe("out")
    expect(second.depth.teams[0]?.positions[0]?.playerIds).toEqual(["rw-trae", "rw-naw"])
    const injuryCalls = fetchImpl.mock.calls.filter((call) =>
      String(call[0]).includes("get-nba-injuries"),
    )
    expect(injuryCalls).toHaveLength(1)
  })

  it("keeps the previous cache when a later refresh fails", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
    const fetchImpl = fetchOk()
    const now = new Date("2026-01-15T00:00:00.000Z")
    await loadInjurySelectionInputs({
      now,
      espnPlayers: [{ id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    fetchImpl.mockImplementation(async () => new Response("down", { status: 500 }))

    const inputs = await loadInjurySelectionInputs({
      now: new Date(now.getTime() + 31 * 60 * 1000),
      espnPlayers: [{ id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(inputs.updates[0]?.rotowirePlayerId).toBe("rw-trae")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/rotowireCache.test.ts`

Expected: FAIL with `Cannot find module '@/lib/injuries/rotowireCache'`

- [ ] **Step 3: Write minimal implementation**

```ts
import { buildCrosswalk, type CrosswalkEspnPlayer } from "./crosswalk"
import {
  parseConfirmedLineups,
  parseDepthChart,
  parseInjuryUpdates,
  parseRotoPlayers,
} from "./rotowireParse"
import type { ConfirmedLineup, DepthChart, InjuryUpdate } from "./selection"

export type CachedInjuryInputs = {
  updates: InjuryUpdate[]
  depth: DepthChart
  lineups: ConfirmedLineup[]
  crosswalk: Map<string, string>
}

const EMPTY_INPUTS = (): CachedInjuryInputs => ({
  updates: [],
  depth: { teams: [] },
  lineups: [],
  crosswalk: new Map(),
})

const FIVE_MINUTES = 5 * 60 * 1000
const THIRTY_MINUTES = 30 * 60 * 1000
const SIXTY_MINUTES = 60 * 60 * 1000
const SIX_HOURS = 6 * 60 * 60 * 1000
const TWO_HOURS = 2 * 60 * 60 * 1000

type Stamp<T> = { value: T; fetchedAt: number }

type Memory = {
  updates: Stamp<InjuryUpdate[]>
  depth: Stamp<DepthChart>
  lineups: Stamp<ConfirmedLineup[]>
  players: Stamp<ReturnType<typeof parseRotoPlayers>>
}

let memory: Memory | null = null

export const clearInjurySelectionCache = (): void => {
  memory = null
}

const sameUtcDate = (left: Date, right: Date): boolean =>
  left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10)

const stale = (stamp: Stamp<unknown> | undefined, now: number, ttl: number): boolean =>
  !stamp || now - stamp.fetchedAt >= ttl

const endpoint = (path: string, key: string, hours?: number): string => {
  const url = new URL(path, "https://api.rotowire.com")
  url.searchParams.set("key", key)
  url.searchParams.set("format", "json")
  if (hours !== undefined) url.searchParams.set("hours", String(hours))
  return url.toString()
}

const readJson = async (fetchImpl: typeof fetch, url: string): Promise<unknown> => {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`RotoWire ${response.status}`)
  return response.json()
}

export const loadInjurySelectionInputs = async (options: {
  now: Date
  espnPlayers: CrosswalkEspnPlayer[]
  fetchImpl?: typeof fetch
}): Promise<CachedInjuryInputs> => {
  const key = process.env.ROTOWIRE_API_KEY?.trim() ?? ""
  if (key.length === 0) return memory ? snapshot(memory, options.espnPlayers) : EMPTY_INPUTS()

  const fetchImpl = options.fetchImpl ?? fetch
  const nowMs = options.now.getTime()
  const gameDay =
    memory?.lineups.value.some((lineup) =>
      sameUtcDate(new Date(lineup.startsAt), options.now),
    ) ?? false
  const nextTip = memory?.lineups.value
    .map((lineup) => new Date(lineup.startsAt).getTime())
    .filter((startsAt) => !Number.isNaN(startsAt) && startsAt > nowMs)
    .sort((left, right) => left - right)[0]
  const lineupTtl =
    nextTip !== undefined && nextTip - nowMs <= TWO_HOURS ? FIVE_MINUTES : SIX_HOURS

  try {
    const next: Memory = {
      updates: memory?.updates ?? { value: [], fetchedAt: 0 },
      depth: memory?.depth ?? { value: { teams: [] }, fetchedAt: 0 },
      lineups: memory?.lineups ?? { value: [], fetchedAt: 0 },
      players: memory?.players ?? { value: [], fetchedAt: 0 },
    }

    if (stale(memory?.updates, nowMs, gameDay ? FIVE_MINUTES : THIRTY_MINUTES)) {
      next.updates = {
        value: parseInjuryUpdates(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-injuries.php", key, 24)),
        ),
        fetchedAt: nowMs,
      }
    }
    if (stale(memory?.depth, nowMs, gameDay ? SIXTY_MINUTES : SIX_HOURS)) {
      next.depth = {
        value: parseDepthChart(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-depth-charts.php", key)),
        ),
        fetchedAt: nowMs,
      }
    }
    if (stale(memory?.lineups, nowMs, lineupTtl)) {
      next.lineups = {
        value: parseConfirmedLineups(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-lineups.php", key)),
        ),
        fetchedAt: nowMs,
      }
    }
    if (stale(memory?.players, nowMs, SIX_HOURS)) {
      next.players = {
        value: parseRotoPlayers(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-players.php", key)),
        ),
        fetchedAt: nowMs,
      }
    }

    memory = next
    return snapshot(next, options.espnPlayers)
  } catch {
    return memory ? snapshot(memory, options.espnPlayers) : EMPTY_INPUTS()
  }
}

const snapshot = (cached: Memory, espnPlayers: CrosswalkEspnPlayer[]): CachedInjuryInputs => ({
  updates: cached.updates.value,
  depth: cached.depth.value,
  lineups: cached.lineups.value,
  crosswalk: buildCrosswalk(espnPlayers, cached.players.value),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/rotowireCache.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/rotowireCache.ts tests/unit/rotowireCache.test.ts
git commit -m "feat(injuries): cache RotoWire inputs on the server"
```

---

### Task 5: Pickups route uses the selector

**Files:**
- Modify: `src/lib/injuries/types.ts`
- Modify: `src/app/api/injuries/pickups/route.ts`
- Modify: `tests/api/injuriesPickups.test.ts`
- Test: `tests/api/injuriesPickups.test.ts`

**Interfaces:**
- Consumes: `selectInjuryReplacements` and `InjurySelectionInputs` from `src/lib/injuries/selection.ts`; `loadInjurySelectionInputs` and `CachedInjuryInputs` from `src/lib/injuries/rotowireCache.ts`; `SeasonPlayer` from `src/lib/season/types.ts`
- Produces: the existing JSON body, with `source` of `{ depth: "rotowire", injuries: "rotowire" }` when any cached input is non-empty, and `{ depth: "empty", injuries: "empty" }` when all four are empty. `score` is `0`. `depthRank` is `1` for `depth` and `0` for `lineup`. `urgency` is `"roster"` when the perspective roster contains the injured ESPN id, otherwise `"league"`.

- [ ] **Step 1: Write the failing test**

In `tests/api/injuriesPickups.test.ts`, add this mock above the `authenticateAs` helper and replace the seeded-league test. Leave the 401, 400, and 404 tests as they are.

```ts
vi.mock("@/lib/injuries/rotowireCache", () => ({
  loadInjurySelectionInputs: vi.fn(),
}))
```

```ts
import { loadInjurySelectionInputs } from "@/lib/injuries/rotowireCache"

const emptyCache = {
  updates: [],
  depth: { teams: [] },
  lineups: [],
  crosswalk: new Map<string, string>(),
}

it("returns an empty pickup list when RotoWire has not loaded", async () => {
  vi.mocked(loadInjurySelectionInputs).mockResolvedValue(emptyCache)
  const league = await seedInjuryPickupLeague()

  const response = await getInjuryPickups(
    new Request(`http://localhost/api/injuries/pickups?seasonLeagueId=${league.id}`),
  )
  const payload = await response.json()

  expect(response.status).toBe(200)
  expect(payload).toEqual({
    events: [],
    recommendations: [],
    source: { depth: "empty", injuries: "empty" },
  })
})

it("returns the selected replacement for a seeded league", async () => {
  vi.mocked(loadInjurySelectionInputs).mockResolvedValue({
    updates: [
      {
        rotowirePlayerId: "rw-trae",
        teamAbbr: "ATL",
        status: "out",
        at: new Date().toISOString(),
      },
    ],
    depth: {
      teams: [
        {
          teamAbbr: "ATL",
          positions: [{ position: "PG", playerIds: ["rw-trae", "rw-naw"] }],
        },
      ],
    },
    lineups: [],
    crosswalk: new Map([
      ["rw-trae", "trae-young"],
      ["rw-naw", "nickeil-alexander-walker"],
    ]),
  })
  const league = await seedInjuryPickupLeague()

  const response = await getInjuryPickups(
    new Request(`http://localhost/api/injuries/pickups?seasonLeagueId=${league.id}`),
  )
  const payload = await response.json()

  expect(response.status).toBe(200)
  expect(payload.source).toEqual({ depth: "rotowire", injuries: "rotowire" })
  expect(payload.recommendations[0]).toMatchObject({
    injuredPlayerId: "trae-young",
    addPlayerId: "nickeil-alexander-walker",
    addPlayerName: "Nickeil Alexander-Walker",
    teamAbbr: "ATL",
    status: "out",
    depthRank: 1,
    urgency: "league",
    score: 0,
  })
})
```

Delete the old test named `returns injury pickup recommendations for a seeded league`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/injuriesPickups.test.ts`

Expected: FAIL because the route still returns `source: { depth: "fixture", injuries: "fixture" }` or does not call the mock.

- [ ] **Step 3: Write minimal implementation**

Widen `InjuryPickupsResult["source"]` in `src/lib/injuries/types.ts`:

```ts
source: {
  depth: "fixture" | "rotowire" | "empty"
  injuries: "fixture" | "rotowire" | "empty"
}
```

Replace the body of `src/app/api/injuries/pickups/route.ts` after the league load. Remove the fixture provider imports.

```ts
import { loadInjurySelectionInputs } from "@/lib/injuries/rotowireCache"
import { selectInjuryReplacements } from "@/lib/injuries/selection"
import type { InjuryEvent, InjuryPickupRecommendation, InjuryPickupsResult } from "@/lib/injuries/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

const youRosterIds = (state: SeasonLeagueState): Set<string> => {
  const youTeam = state.teams.find((team) => team.teamIndex === state.perspectiveTeamIndex)
  return new Set(
    (youTeam?.entries ?? [])
      .map((entry) => entry.playerId)
      .filter((playerId): playerId is string => playerId !== null),
  )
}

const toPickups = (
  state: SeasonLeagueState,
  cached: Awaited<ReturnType<typeof loadInjurySelectionInputs>>,
): InjuryPickupsResult => {
  const names = new Map(state.players.map((player) => [player.id, player]))
  const rosterIds = youRosterIds(state)
  const rows = selectInjuryReplacements({
    ...cached,
    availablePlayerIds: state.availablePlayerIds,
    now: new Date(),
  })
  const loaded =
    cached.updates.length > 0 ||
    cached.depth.teams.length > 0 ||
    cached.lineups.length > 0 ||
    cached.crosswalk.size > 0

  const events: InjuryEvent[] = rows.map((row) => ({
    playerId: row.injuredPlayerId,
    teamAbbr: names.get(row.injuredPlayerId)?.teamAbbr ?? "",
    status: row.status,
  }))

  const recommendations: InjuryPickupRecommendation[] = rows.map((row) => {
    const injured = names.get(row.injuredPlayerId)
    const add = names.get(row.addPlayerId)
    return {
      injuredPlayerId: row.injuredPlayerId,
      injuredPlayerName: injured?.name ?? row.injuredPlayerId,
      addPlayerId: row.addPlayerId,
      addPlayerName: add?.name ?? row.addPlayerId,
      teamAbbr: add?.teamAbbr ?? injured?.teamAbbr ?? "",
      status: row.status,
      depthRank: row.source === "depth" ? 1 : 0,
      urgency: rosterIds.has(row.injuredPlayerId) ? "roster" : "league",
      score: 0,
      reasons: [row.source === "lineup" ? "Confirmed lineup" : "Depth chart"],
    }
  })

  return {
    events,
    recommendations,
    source: loaded
      ? { depth: "rotowire", injuries: "rotowire" }
      : { depth: "empty", injuries: "empty" },
  }
}
```

Inside `GET`, after the `invalid_state` check:

```ts
const cached = await loadInjurySelectionInputs({
  now: new Date(),
  espnPlayers: loaded.state.players.map((player: SeasonPlayer) => ({
    id: player.id,
    name: player.name,
    teamAbbr: player.teamAbbr,
  })),
})

return NextResponse.json(toPickups(loaded.state, cached))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/injuriesPickups.test.ts tests/unit/injuryRecommend.test.ts tests/unit/injurySelection.test.ts tests/unit/injuryCrosswalk.test.ts tests/unit/rotowireParse.test.ts tests/unit/rotowireCache.test.ts`

Expected: PASS. The fixture recommender unit test still passes. The route test no longer expects fixture Trae from the JSON file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/types.ts src/app/api/injuries/pickups/route.ts tests/api/injuriesPickups.test.ts
git commit -m "feat(injuries): serve live replacement picks from the cache"
```
