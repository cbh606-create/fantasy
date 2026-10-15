# Trade Vacancy Pickups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When RotoWire reports a completed trade, add one available replacement for the team the player left to the existing Injury pickups list.

**Architecture:** A pure news parser decides whether a headline is a completed trade and which team name it mentions. `selectInjuryReplacements` keeps the current OUT/GTD path and appends trade rows from that news. The injury cache fetches the news endpoint on the same timer as injury updates and passes the items through. The pickups route labels those rows `TRADED`.

**Tech Stack:** TypeScript, Vitest, existing RotoWire cache and `selectInjuryReplacements`.

## Global Constraints

- Injury trigger stays the latest OUT or GTD update in the last 24 hours.
- Return date is not read and is not a gate.
- One-game and long-term OUT rows are not labeled differently.
- Trade source is RotoWire NBA news, server-side, from `GET /Basketball/get-nba-news.php` with `format=json`, `hours=24`, and `with_analysis=0`.
- A completed trade is Headline or Notes containing `traded to`, `traded from`, `has been traded`, `was traded`, or `in exchange for`.
- Reject Headline or Notes that contain `rumor`, `rumour`, `talks`, `unlikely`, `could be traded`, `may be traded`, `trade candidate`, `on the trade block`, or `trade interest`.
- The vacancy is the team the player left. The replacement uses the existing lineup-then-depth rule when that player is still on the chart.
- The window is news `DateTime` in the last 24 hours.
- Trade rows use `status: "traded"` on the same Injury pickups list.
- One row per trade. An injury row and a trade row for the same add both stay.
- Do not infer a trade from last year's team. Do not add a push alert. Do not change breakout selection.

---

### Task 1: Trade news phrases

**Files:**
- Create: `src/lib/injuries/tradeNews.ts`
- Test: `tests/unit/tradeNews.test.ts`

**Interfaces:**
- Consumes: `canonicalTeam` from `src/lib/injuries/crosswalk.ts`
- Produces: `TradeNewsItem`, `parseTradeNews(payload: unknown): TradeNewsItem[]`, `isCompletedTrade(headline: string, notes: string): boolean`, `teamsMentionedAfter(text: string, marker: string): string[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  isCompletedTrade,
  parseTradeNews,
  teamsMentionedAfter,
} from "@/lib/injuries/tradeNews"

describe("isCompletedTrade", () => {
  it("accepts a completed deal and rejects a rumor", () => {
    expect(isCompletedTrade("Traded to the Lakers", "")).toBe(true)
    expect(isCompletedTrade("Could be traded to the Lakers", "")).toBe(false)
    expect(isCompletedTrade("Trade talks continue", "He was traded last year")).toBe(false)
  })
})

describe("teamsMentionedAfter", () => {
  it("reads one destination and ignores a phrase that matches two teams", () => {
    expect(teamsMentionedAfter("Traded to the Lakers", "traded to")).toEqual(["LAL"])
    expect(teamsMentionedAfter("Traded to the Los Angeles Lakers", "traded to")).toEqual(["LAL"])
    expect(teamsMentionedAfter("Traded to Los Angeles", "traded to")).toEqual([])
  })
})

describe("parseTradeNews", () => {
  it("keeps headline, notes, position, and team code", () => {
    expect(
      parseTradeNews({
        Updates: [
          {
            DateTime: "2026-01-14T12:00:00.000Z",
            Headline: "Traded to the Lakers",
            Notes: "Boston traded him.",
            Analysis: "Ignore this.",
            Player: { Id: "rw-jrue", Position: " PG " },
            Team: { Code: "BOS" },
          },
        ],
      }),
    ).toEqual([
      {
        rotowirePlayerId: "rw-jrue",
        teamAbbr: "BOS",
        headline: "Traded to the Lakers",
        notes: "Boston traded him.",
        position: "PG",
        at: "2026-01-14T12:00:00.000Z",
      },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tradeNews.test.ts`

Expected: FAIL because `@/lib/injuries/tradeNews` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/injuries/tradeNews.ts`:

```ts
import { canonicalTeam } from "./crosswalk"

export type TradeNewsItem = {
  rotowirePlayerId: string
  teamAbbr: string
  headline: string
  notes: string
  position: string
  at: string
}

const COMPLETED = [
  "traded to",
  "traded from",
  "has been traded",
  "was traded",
  "in exchange for",
]

const REJECTED = [
  "rumor",
  "rumour",
  "talks",
  "unlikely",
  "could be traded",
  "may be traded",
  "trade candidate",
  "on the trade block",
  "trade interest",
]

const NBA_TEAM_NAMES: Array<{ code: string; names: string[] }> = [
  { code: "ATL", names: ["atlanta hawks", "hawks", "atlanta", "atl"] },
  { code: "BOS", names: ["boston celtics", "celtics", "boston", "bos"] },
  { code: "BKN", names: ["brooklyn nets", "nets", "brooklyn", "bkn"] },
  { code: "CHA", names: ["charlotte hornets", "hornets", "charlotte", "cha"] },
  { code: "CHI", names: ["chicago bulls", "bulls", "chicago", "chi"] },
  { code: "CLE", names: ["cleveland cavaliers", "cavaliers", "cavs", "cleveland", "cle"] },
  { code: "DAL", names: ["dallas mavericks", "mavericks", "mavs", "dallas", "dal"] },
  { code: "DEN", names: ["denver nuggets", "nuggets", "denver", "den"] },
  { code: "DET", names: ["detroit pistons", "pistons", "detroit", "det"] },
  { code: "GSW", names: ["golden state warriors", "warriors", "golden state", "gsw"] },
  { code: "HOU", names: ["houston rockets", "rockets", "houston", "hou"] },
  { code: "IND", names: ["indiana pacers", "pacers", "indiana", "ind"] },
  { code: "LAC", names: ["los angeles clippers", "la clippers", "clippers", "clips", "los angeles", "lac"] },
  { code: "LAL", names: ["los angeles lakers", "lakers", "los angeles", "lal"] },
  { code: "MEM", names: ["memphis grizzlies", "grizzlies", "memphis", "mem"] },
  { code: "MIA", names: ["miami heat", "heat", "miami", "mia"] },
  { code: "MIL", names: ["milwaukee bucks", "bucks", "milwaukee", "mil"] },
  { code: "MIN", names: ["minnesota timberwolves", "timberwolves", "wolves", "minnesota", "min"] },
  { code: "NOP", names: ["new orleans pelicans", "pelicans", "new orleans", "nop"] },
  { code: "NYK", names: ["new york knicks", "knicks", "new york", "nyk"] },
  { code: "OKC", names: ["oklahoma city thunder", "thunder", "oklahoma city", "okc"] },
  { code: "ORL", names: ["orlando magic", "magic", "orlando", "orl"] },
  { code: "PHI", names: ["philadelphia 76ers", "76ers", "sixers", "philadelphia", "phi"] },
  { code: "PHX", names: ["phoenix suns", "suns", "phoenix", "phx"] },
  { code: "POR", names: ["portland trail blazers", "trail blazers", "blazers", "portland", "por"] },
  { code: "SAC", names: ["sacramento kings", "kings", "sacramento", "sac"] },
  { code: "SAS", names: ["san antonio spurs", "spurs", "san antonio", "sas"] },
  { code: "TOR", names: ["toronto raptors", "raptors", "toronto", "tor"] },
  { code: "UTA", names: ["utah jazz", "jazz", "utah", "uta"] },
  { code: "WAS", names: ["washington wizards", "wizards", "washington", "was"] },
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "")

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const spansOf = (
  fragment: string,
  needle: string,
): Array<{ start: number; end: number }> => {
  const found: Array<{ start: number; end: number }> = []
  let from = 0
  while (from <= fragment.length) {
    const start = fragment.indexOf(needle, from)
    if (start === -1) break
    const before = fragment[start - 1] ?? " "
    const after = fragment[start + needle.length] ?? " "
    if (/[^a-z0-9]/.test(before) && /[^a-z0-9]/.test(after)) {
      found.push({ start, end: start + needle.length })
    }
    from = start + needle.length
  }
  return found
}

const uniqueTeamsIn = (fragment: string): string[] => {
  const hits: Array<{ code: string; start: number; end: number }> = []
  for (const team of NBA_TEAM_NAMES) {
    const code = canonicalTeam(team.code)
    for (const name of team.names) {
      for (const span of spansOf(fragment, name)) hits.push({ code, ...span })
    }
  }
  const kept = hits.filter(
    (hit) =>
      !hits.some(
        (other) =>
          other.code !== hit.code &&
          other.start <= hit.start &&
          other.end >= hit.end &&
          other.end - other.start > hit.end - hit.start,
      ),
  )
  return [...new Set(kept.map((hit) => hit.code))]
}

export const isCompletedTrade = (headline: string, notes: string): boolean => {
  const body = `${headline}\n${notes}`.toLowerCase()
  if (REJECTED.some((phrase) => body.includes(phrase))) return false
  return COMPLETED.some((phrase) => body.includes(phrase))
}

export const teamsMentionedAfter = (value: string, marker: string): string[] => {
  const body = value.toLowerCase()
  const index = body.indexOf(marker)
  if (index === -1) return []
  const teams = uniqueTeamsIn(body.slice(index + marker.length))
  return teams.length === 1 ? teams : []
}

export const parseTradeNews = (payload: unknown): TradeNewsItem[] => {
  if (!isRecord(payload)) return []

  return list(payload.Updates).flatMap((update) => {
    const player = isRecord(update.Player) ? update.Player : {}
    const team = isRecord(update.Team) ? update.Team : {}
    const rotowirePlayerId = text(player.Id)
    const at = text(update.DateTime)
    if (rotowirePlayerId.length === 0 || at.length === 0) return []

    return [
      {
        rotowirePlayerId,
        teamAbbr: text(team.Code),
        headline: text(update.Headline),
        notes: text(update.Notes),
        position: text(player.Position),
        at,
      },
    ]
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tradeNews.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/tradeNews.ts tests/unit/tradeNews.test.ts
git commit -m "feat(waivers): parse completed trade news"
```

### Task 2: Select the replacement

**Files:**
- Modify: `src/lib/injuries/selection.ts`
- Test: `tests/unit/injurySelection.test.ts`

**Interfaces:**
- Consumes: `TradeNewsItem`, `isCompletedTrade`, `teamsMentionedAfter` from Task 1. `DepthPosition` and `positionListFor` already in `selection.ts`.
- Produces: `InjurySelectionInputs.news: TradeNewsItem[]`. `InjuryReplacement.status` is `"out" | "gtd" | "traded"`. `selectInjuryReplacements` returns injury rows first, then trade rows.

- [ ] **Step 1: Write the failing test**

Add `news: []` to `baseInputs` in `tests/unit/injurySelection.test.ts`. Append this describe block:

```ts
describe("selectInjuryReplacements trades", () => {
  const traded = (): InjurySelectionInputs => {
    const inputs = baseInputs()
    inputs.updates = []
    inputs.depth = {
      teams: [
        {
          teamAbbr: "BOS",
          positions: [{ position: "PG", playerIds: ["rw-jrue", "rw-white", "rw-pritchard"] }],
        },
      ],
    }
    inputs.crosswalk = new Map([
      ["rw-jrue", "espn-jrue"],
      ["rw-white", "espn-white"],
      ["rw-pritchard", "espn-pritchard"],
    ])
    inputs.availablePlayerIds = ["espn-white"]
    inputs.news = [
      {
        rotowirePlayerId: "rw-jrue",
        teamAbbr: "BOS",
        headline: "Traded to the Lakers",
        notes: "",
        position: "PG",
        at: "2026-01-14T12:00:00.000Z",
      },
    ]
    return inputs
  }

  it("picks the next available player on the team he left", () => {
    expect(selectInjuryReplacements(traded())).toEqual([
      {
        injuredPlayerId: "espn-jrue",
        status: "traded",
        addPlayerId: "espn-white",
        source: "depth",
      },
    ])
  })

  it("picks rank 1 when he is already off the chart", () => {
    const inputs = traded()
    inputs.depth.teams[0]!.positions[0]!.playerIds = ["rw-white", "rw-pritchard"]
    expect(selectInjuryReplacements(inputs)[0]).toMatchObject({
      addPlayerId: "espn-white",
      source: "depth",
      status: "traded",
    })
  })

  it("skips a combined position once he is off the chart", () => {
    const inputs = traded()
    inputs.depth.teams[0]!.positions[0]!.playerIds = ["rw-white"]
    inputs.news[0]!.position = "G/F"
    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("skips a rumor and an item older than 24 hours", () => {
    const rumor = traded()
    rumor.news[0]!.headline = "Could be traded to the Lakers"
    expect(selectInjuryReplacements(rumor)).toEqual([])

    const stale = traded()
    stale.news[0]!.at = "2026-01-13T00:00:00.000Z"
    expect(selectInjuryReplacements(stale)).toEqual([])
  })

  it("lets the latest rumor erase an earlier completed trade", () => {
    const inputs = traded()
    inputs.news.push({
      ...inputs.news[0]!,
      headline: "Trade talks continue",
      at: "2026-01-14T18:00:00.000Z",
    })
    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("keeps an OUT row that has no return date beside a trade row", () => {
    const inputs = traded()
    inputs.updates = [
      {
        rotowirePlayerId: "rw-white",
        teamAbbr: "BOS",
        status: "out",
        at: "2026-01-14T12:00:00.000Z",
      },
    ]
    inputs.crosswalk.set("rw-pritchard", "espn-pritchard")
    inputs.availablePlayerIds = ["espn-pritchard"]
    inputs.depth.teams[0]!.positions[0]!.playerIds = ["rw-jrue", "rw-white", "rw-pritchard"]

    const rows = selectInjuryReplacements(inputs)
    expect(rows.map((row) => row.status)).toEqual(["out", "traded"])
    expect(rows.map((row) => row.addPlayerId)).toEqual(["espn-pritchard", "espn-pritchard"])
  })

  it("skips an unmapped traded player", () => {
    const inputs = traded()
    inputs.crosswalk.delete("rw-jrue")
    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("keeps two rows when two trades select the same add", () => {
    const inputs = traded()
    inputs.depth.teams.push({
      teamAbbr: "MIA",
      positions: [{ position: "PG", playerIds: ["rw-herro", "rw-white"] }],
    })
    inputs.crosswalk.set("rw-herro", "espn-herro")
    inputs.news.push({
      rotowirePlayerId: "rw-herro",
      teamAbbr: "MIA",
      headline: "Traded to the Spurs",
      notes: "",
      position: "PG",
      at: "2026-01-14T13:00:00.000Z",
    })

    expect(selectInjuryReplacements(inputs)).toEqual([
      {
        injuredPlayerId: "espn-jrue",
        status: "traded",
        addPlayerId: "espn-white",
        source: "depth",
      },
      {
        injuredPlayerId: "espn-herro",
        status: "traded",
        addPlayerId: "espn-white",
        source: "depth",
      },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/injurySelection.test.ts`

Expected: FAIL because `news` is not on `InjurySelectionInputs` and no trade rows are returned.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/injuries/selection.ts`, import `isCompletedTrade`, `teamsMentionedAfter`, and `type TradeNewsItem` from `./tradeNews`. Add `news: TradeNewsItem[]` to `InjurySelectionInputs`. Change `InjuryReplacement.status` to `"out" | "gtd" | "traded"`.

Replace the body of `selectInjuryReplacements` with calls to these helpers, placed above the export:

```ts
const SINGLE_POSITIONS = new Set<DepthPosition>(["PG", "SG", "SF", "PF", "C"])

const pickReplacement = (
  inputs: InjurySelectionInputs,
  rotowirePlayerId: string,
  teamAbbr: string,
  available: Set<string>,
): { addPlayerId: string; source: "lineup" | "depth" } | null => {
  const position = positionListFor(inputs.depth, teamAbbr, rotowirePlayerId)
  if (!position) return null

  const lineup = nextLineup(inputs.lineups, teamAbbr, inputs.now)
  const isStarting =
    lineup?.starters.some((starter) => starter.playerId === rotowirePlayerId) ?? false

  if (lineup && !isStarting) {
    const matches = lineup.starters.filter((starter) => {
      if (starter.playerId === rotowirePlayerId) return false
      return starterPosition(starter, inputs.depth, teamAbbr) === position.position
    })
    const matched = matches[0]
    const addPlayerId = matched ? inputs.crosswalk.get(matched.playerId) : undefined
    if (matches.length === 1 && addPlayerId && available.has(addPlayerId)) {
      return { addPlayerId, source: "lineup" }
    }
  }

  const backupId = position.playerIds.slice(position.index + 1).find((playerId) => {
    const espnId = inputs.crosswalk.get(playerId)
    return espnId !== undefined && available.has(espnId)
  })
  const addPlayerId = backupId ? inputs.crosswalk.get(backupId) : undefined
  if (!addPlayerId) return null
  return { addPlayerId, source: "depth" }
}

const pickOpenPosition = (
  inputs: InjurySelectionInputs,
  teamAbbr: string,
  position: string,
  available: Set<string>,
): { addPlayerId: string; source: "depth" } | null => {
  if (!SINGLE_POSITIONS.has(position as DepthPosition)) return null
  const team = inputs.depth.teams.find(
    (entry) => canonicalTeam(entry.teamAbbr) === canonicalTeam(teamAbbr),
  )
  const group = team?.positions.find((entry) => entry.position === position)
  const backupId = group?.playerIds.find((playerId) => {
    const espnId = inputs.crosswalk.get(playerId)
    return espnId !== undefined && available.has(espnId)
  })
  const addPlayerId = backupId ? inputs.crosswalk.get(backupId) : undefined
  if (!addPlayerId) return null
  return { addPlayerId, source: "depth" }
}

const teamsListing = (depth: DepthChart, rotowirePlayerId: string): string[] =>
  depth.teams
    .filter((team) =>
      team.positions.some((group) => group.playerIds.includes(rotowirePlayerId)),
    )
    .map((team) => team.teamAbbr)

const vacatedTeam = (item: TradeNewsItem, depth: DepthChart): string | null => {
  const text = `${item.headline} ${item.notes}`
  const destination = teamsMentionedAfter(text, "traded to")[0] ?? null
  const listed = teamsListing(depth, item.rotowirePlayerId)
  if (listed.length === 1 && canonicalTeam(listed[0]!) !== destination) return listed[0]!

  const origin = teamsMentionedAfter(text, "traded from")[0] ?? null
  if (origin && origin !== destination) return origin

  if (item.teamAbbr.length > 0 && canonicalTeam(item.teamAbbr) !== destination) {
    return item.teamAbbr
  }
  return null
}

const latestCompletedTrades = (items: TradeNewsItem[], now: Date): TradeNewsItem[] => {
  const byPlayer = new Map<string, TradeNewsItem>()
  for (const item of items) {
    const at = new Date(item.at).getTime()
    if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > WINDOW_MS) continue
    const current = byPlayer.get(item.rotowirePlayerId)
    if (!current || at >= new Date(current.at).getTime()) byPlayer.set(item.rotowirePlayerId, item)
  }
  return [...byPlayer.values()].filter((item) => isCompletedTrade(item.headline, item.notes))
}
```

In `src/app/api/injuries/pickups/route.ts`, pass an empty news list until Task 3 loads it. Place `news` after the spread so it wins:

```ts
const rows = selectInjuryReplacements({
  ...cached,
  news: [],
  availablePlayerIds: state.availablePlayerIds,
  now: new Date(),
})
```

`selectInjuryReplacements` keeps the current injury loop, calling `pickReplacement` for each qualifying update. After that loop:

```ts
for (const item of latestCompletedTrades(inputs.news, inputs.now)) {
  const injuredPlayerId = inputs.crosswalk.get(item.rotowirePlayerId)
  const teamAbbr = vacatedTeam(item, inputs.depth)
  if (!injuredPlayerId || !teamAbbr) continue

  const onChart = positionListFor(inputs.depth, teamAbbr, item.rotowirePlayerId)
  const pick = onChart
    ? pickReplacement(inputs, item.rotowirePlayerId, teamAbbr, available)
    : pickOpenPosition(inputs, teamAbbr, item.position, available)
  if (!pick) continue

  rows.push({
    injuredPlayerId,
    status: "traded",
    addPlayerId: pick.addPlayerId,
    source: pick.source,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/injurySelection.test.ts tests/unit/tradeNews.test.ts`

Expected: PASS. Existing OUT/GTD cases stay green, and the trade cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/selection.ts tests/unit/injurySelection.test.ts src/app/api/injuries/pickups/route.ts
git commit -m "feat(waivers): recommend a replacement when a player is traded"
```

### Task 3: Load the news feed

**Files:**
- Modify: `src/lib/injuries/rotowireCache.ts`
- Test: `tests/unit/rotowireCache.test.ts`
- Modify: `tests/api/injuriesPickups.test.ts`
- Modify: `tests/api/breakouts.test.ts`

**Interfaces:**
- Consumes: `parseTradeNews` and `TradeNewsItem` from Task 1
- Produces: `CachedInjuryInputs.news: TradeNewsItem[]` on the object returned by `loadInjurySelectionInputs`

- [ ] **Step 1: Write the failing test**

In `tests/unit/rotowireCache.test.ts`, add a news payload and a branch in one local fetch mock:

```ts
it("parses trade news from the last 24 hours", async () => {
  vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("get-nba-news")) {
      expect(url).toContain("hours=24")
      expect(url).toContain("with_analysis=0")
      return jsonResponse({
        Updates: [
          {
            DateTime: "2026-01-14T12:00:00.000Z",
            Headline: "Traded to the Lakers",
            Notes: "",
            Player: { Id: "rw-jrue", Position: "PG" },
            Team: { Code: "BOS" },
          },
        ],
      })
    }
    if (url.includes("get-nba-injuries")) return jsonResponse(payloads().injuries)
    if (url.includes("get-nba-depth-charts")) return jsonResponse(payloads().depth)
    if (url.includes("get-nba-lineups")) return jsonResponse(payloads().lineups)
    if (url.includes("get-nba-players")) return jsonResponse(payloads().players)
    return new Response("missing", { status: 404 })
  })

  const inputs = await loadInjurySelectionInputs({
    now: new Date("2026-01-15T00:00:00.000Z"),
    espnPlayers: [],
    fetchImpl: fetchImpl as unknown as typeof fetch,
  })

  expect(inputs.news).toEqual([
    {
      rotowirePlayerId: "rw-jrue",
      teamAbbr: "BOS",
      headline: "Traded to the Lakers",
      notes: "",
      position: "PG",
      at: "2026-01-14T12:00:00.000Z",
    },
  ])
})
```

Add `news: []` to `emptyCache` in `tests/api/injuriesPickups.test.ts`, to the seeded `mockResolvedValue` in that file, to `emptyInjury` in `tests/api/breakouts.test.ts`, and to the other `mockResolvedValue` object in that breakouts file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/rotowireCache.test.ts`

Expected: FAIL because `inputs.news` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/injuries/rotowireCache.ts`:

- Import `parseTradeNews` and `TradeNewsItem`.
- Add `news: TradeNewsItem[]` to `CachedInjuryInputs` and to `EMPTY_INPUTS`.
- Add `news: Stamp<TradeNewsItem[]>` to `Memory`, initialized like `updates`.
- When `updates` is stale, also refresh news with the same game-day TTL. Fetch `endpoint("/Basketball/get-nba-news.php", key, 24) + "&with_analysis=0"`. Parse with `parseTradeNews`. On failure, keep the previous stamp.
- `snapshot` copies `cached.news.value` onto `news`.
- The existing `endpoint` helper already sets `hours`. Append `with_analysis=0` only for this URL.
- In `src/app/api/injuries/pickups/route.ts`, delete the temporary `news: []` from Task 2. The spread of `cached` already includes `news`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/rotowireCache.test.ts tests/api/injuriesPickups.test.ts tests/api/breakouts.test.ts`

Expected: PASS. A failed news response leaves the previous news list in place, and a missing key still returns `news: []` without fetching.

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/rotowireCache.ts tests/unit/rotowireCache.test.ts tests/api/injuriesPickups.test.ts tests/api/breakouts.test.ts
git commit -m "feat(waivers): load trade news with injury inputs"
```

### Task 4: Show TRADED on the pickup list

**Files:**
- Modify: `src/lib/injuries/types.ts`
- Modify: `src/app/api/injuries/pickups/route.ts`
- Test: `tests/api/injuriesPickups.test.ts`

**Interfaces:**
- Consumes: `InjuryReplacement.status` of `"traded"` from Task 2, and `CachedInjuryInputs.news` from Task 3
- Produces: `InjuryPickupRecommendation.status: "out" | "gtd" | "traded"`. Trade recommendations include the reason `"Trade"`. `InjuryEvent` stays `"out" | "gtd"` and omits trade rows.

- [ ] **Step 1: Write the failing test**

Add this case to `tests/api/injuriesPickups.test.ts` after the seeded replacement test:

```ts
it("returns a traded player on the same pickup list", async () => {
  vi.mocked(loadInjurySelectionInputs).mockResolvedValue({
    updates: [],
    news: [
      {
        rotowirePlayerId: "rw-trae",
        teamAbbr: "ATL",
        headline: "Traded to the Lakers",
        notes: "",
        position: "PG",
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
  expect(payload.events).toEqual([])
  expect(payload.recommendations).toEqual([
    expect.objectContaining({
      injuredPlayerName: "Trae Young",
      addPlayerName: "Nickeil Alexander-Walker",
      status: "traded",
      reasons: ["Trade", "Depth chart"],
    }),
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/injuriesPickups.test.ts`

Expected: FAIL because the recommendation status is not `traded` or the reason list does not include `Trade`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/injuries/types.ts`, change `InjuryPickupRecommendation.status` to `"out" | "gtd" | "traded"`. Leave `InjuryStatus` and `InjuryEvent.status` as `"out" | "gtd"`.

In `src/app/api/injuries/pickups/route.ts`:

```ts
const events: InjuryEvent[] = rows.flatMap((row) => {
  if (row.status === "traded") return []
  return [
    {
      playerId: row.injuredPlayerId,
      teamAbbr: names.get(row.injuredPlayerId)?.teamAbbr ?? "",
      status: row.status,
    },
  ]
})

const reasonsFor = (row: InjuryReplacement): string[] => {
  const source = row.source === "lineup" ? "Confirmed lineup" : "Depth chart"
  return row.status === "traded" ? ["Trade", source] : [source]
}
```

Pass `reasons: reasonsFor(row)` into each recommendation. `InjuryPickupsPanel` and `InjuryAlertsPanel` already render `status.toUpperCase()`, so the visible label is `TRADED` without a component change.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tradeNews.test.ts tests/unit/injurySelection.test.ts tests/unit/rotowireCache.test.ts tests/api/injuriesPickups.test.ts tests/api/breakouts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/injuries/types.ts src/app/api/injuries/pickups/route.ts tests/api/injuriesPickups.test.ts
git commit -m "feat(waivers): show traded players on injury pickups"
```
