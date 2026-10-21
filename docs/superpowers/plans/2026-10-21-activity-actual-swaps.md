# Activity actual swaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saved past-day swaps for both matchup teams with the adds and drops in the league's recent activity.

**Architecture:** A pure mapper turns `mTransactions2` rows into the existing `PastActualSwap` list, once per team. The matchup route fetches those rows for past scoring periods and returns both lists only when the read succeeds. The grid writes both `localStorage` lists and passes the opponent list only into the opponent plan.

**Tech Stack:** TypeScript, Vitest, React, ESPN `mTransactions2`, `localStorage`.

## Global Constraints

- Recent activity is `mTransactions2`, filtered to `FREEAGENT` and `WAIVER`. A usable transaction has status `EXECUTED`.
- Pair that team's `ADD` items and `DROP` items by index, in item order. A leftover `ADD` uses drop `open_slot`. A leftover `DROP` uses `addedPlayerId: null`.
- Player ids are `String(espnPlayerId)`. Spot indexes on one date are `0`, `1`, `2`, … in transaction order, then pair index.
- Keep both ESPN teams in the current matchup, in separate lists. Keep only dates strictly before `today`. Ignore trades, other transaction types, other teams, and today or later.
- Map `scoringPeriodId` through `schedule.matchup.days` aligned with `schedule.matchup.scoringPeriodIds`. If those arrays differ in length, the read fails.
- User storage key: `matchup-past-swaps:${leagueId}:${matchupStart}`. Opponent storage key: `matchup-past-swaps:${leagueId}:${matchupStart}:opponent`.
- A successful read returns both `pastActualSwaps` and `opponentPastActualSwaps`, then the client replaces both saved lists. An empty team list is `[]`, and those past days stay blank.
- A failed read omits both fields. The client keeps both saved lists. A non-ESPN league omits both fields.
- The user's three plans take `pastActualSwaps`. The opponent plan takes `opponentPastActualSwaps` and does not receive the user's list. The opponent grid has no `실제 교체` control.
- The next successful read replaces both lists, including swaps typed with `실제 교체`. `추천으로 되돌리기` (`aria-label="Reset to suggested plan"`) clears neither list.
- Do not edit opponent past days by hand, do not diff rosters, and do not change how today is planned.
- Match the semicolon style of the file you edit. Commit with `git -c user.name=cbh606-create -c user.email=cbh606@gmail.com`. Never update git config. PowerShell does not accept `&&`. Do not stage `API Keys.txt`, `token code.txt`, `tmp-old-enumerate.ts`, or plan files.
- If `git status` shows unmerged paths, stop and report BLOCKED. Do not finish or abort that merge.

---

### Task 1: Map activity rows to past swaps

**Files:**
- Create: `src/lib/matchup/activitySwaps.ts`
- Test: `tests/unit/activitySwaps.test.ts`

**Interfaces:**
- Consumes: `PastActualSwap` from `src/lib/matchup/pastActualSwaps.ts`
- Produces:
  - `ActivityTransaction = { status?: string; type?: string; scoringPeriodId?: number; items?: ReadonlyArray<{ type?: string; playerId?: number; toTeamId?: number; fromTeamId?: number }> }`
  - `swapsFromTransactions(transactions: readonly ActivityTransaction[], teamId: number, periodDates: ReadonlyMap<number, string>, today: string): PastActualSwap[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/activitySwaps.test.ts`. The test file uses semicolons.

```ts
import { describe, expect, it } from "vitest"
import { swapsFromTransactions } from "@/lib/matchup/activitySwaps"

const periods = new Map<number, string>([
  [10, "2026-10-20"],
  [11, "2026-10-21"],
])

describe("swapsFromTransactions", () => {
  it("pairs one add and one drop for the team on a past day", () => {
    const swaps = swapsFromTransactions(
      [
        {
          status: "EXECUTED",
          type: "WAIVER",
          scoringPeriodId: 10,
          items: [
            { type: "ADD", playerId: 7, toTeamId: 2 },
            { type: "DROP", playerId: 8, fromTeamId: 2 },
          ],
        },
      ],
      2,
      periods,
      "2026-10-21",
    )
    expect(swaps).toEqual([
      { date: "2026-10-20", spotIndex: 0, addedPlayerId: "7", drop: "8" },
    ])
  })

  it("stores an add-only move as open_slot and a drop-only move as no add", () => {
    const swaps = swapsFromTransactions(
      [
        {
          status: "EXECUTED",
          type: "FREEAGENT",
          scoringPeriodId: 10,
          items: [{ type: "ADD", playerId: 7, toTeamId: 2 }],
        },
        {
          status: "EXECUTED",
          type: "FREEAGENT",
          scoringPeriodId: 10,
          items: [{ type: "DROP", playerId: 9, fromTeamId: 2 }],
        },
      ],
      2,
      periods,
      "2026-10-21",
    )
    expect(swaps).toEqual([
      {
        date: "2026-10-20",
        spotIndex: 0,
        addedPlayerId: "7",
        drop: "open_slot",
      },
      {
        date: "2026-10-20",
        spotIndex: 1,
        addedPlayerId: null,
        drop: "9",
      },
    ])
  })

  it("drops other teams, trades, pending waivers, and today", () => {
    const swaps = swapsFromTransactions(
      [
        {
          status: "EXECUTED",
          type: "WAIVER",
          scoringPeriodId: 10,
          items: [
            { type: "ADD", playerId: 1, toTeamId: 3 },
            { type: "DROP", playerId: 2, fromTeamId: 3 },
          ],
        },
        {
          status: "EXECUTED",
          type: "TRADE",
          scoringPeriodId: 10,
          items: [
            { type: "ADD", playerId: 4, toTeamId: 2 },
            { type: "DROP", playerId: 5, fromTeamId: 2 },
          ],
        },
        {
          status: "PENDING",
          type: "WAIVER",
          scoringPeriodId: 10,
          items: [{ type: "ADD", playerId: 6, toTeamId: 2 }],
        },
        {
          status: "EXECUTED",
          type: "WAIVER",
          scoringPeriodId: 11,
          items: [{ type: "ADD", playerId: 12, toTeamId: 2 }],
        },
      ],
      2,
      periods,
      "2026-10-21",
    )
    expect(swaps).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/activitySwaps.test.ts --reporter=verbose`

Expected: FAIL because `src/lib/matchup/activitySwaps.ts` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/matchup/activitySwaps.ts`. No semicolons.

```ts
import type { PastActualSwap } from "@/lib/matchup/pastActualSwaps"

export type ActivityTransaction = {
  status?: string
  type?: string
  scoringPeriodId?: number
  items?: ReadonlyArray<{
    type?: string
    playerId?: number
    toTeamId?: number
    fromTeamId?: number
  }>
}

const isAddDropType = (type: string | undefined): boolean => {
  const normalized = (type ?? "").toUpperCase()
  return normalized === "FREEAGENT" || normalized === "WAIVER"
}

export const swapsFromTransactions = (
  transactions: readonly ActivityTransaction[],
  teamId: number,
  periodDates: ReadonlyMap<number, string>,
  today: string,
): PastActualSwap[] => {
  const swaps: PastActualSwap[] = []
  const nextSpot = new Map<string, number>()
  for (const transaction of transactions) {
    if ((transaction.status ?? "EXECUTED").toUpperCase() !== "EXECUTED") continue
    if (!isAddDropType(transaction.type)) continue
    const period = transaction.scoringPeriodId
    if (typeof period !== "number") continue
    const date = periodDates.get(period)
    if (!date || date >= today) continue
    const adds: string[] = []
    const drops: string[] = []
    for (const item of transaction.items ?? []) {
      const kind = (item.type ?? "").toUpperCase()
      if (typeof item.playerId !== "number") continue
      if (kind === "ADD" && item.toTeamId === teamId) adds.push(String(item.playerId))
      if (kind === "DROP" && item.fromTeamId === teamId) drops.push(String(item.playerId))
    }
    const count = Math.max(adds.length, drops.length)
    for (let index = 0; index < count; index += 1) {
      const spotIndex = nextSpot.get(date) ?? 0
      nextSpot.set(date, spotIndex + 1)
      swaps.push({
        date,
        spotIndex,
        addedPlayerId: adds[index] ?? null,
        drop: drops[index] ?? "open_slot",
      })
    }
  }
  return swaps
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/activitySwaps.test.ts --reporter=verbose`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/matchup/activitySwaps.ts tests/unit/activitySwaps.test.ts
git -c user.name=cbh606-create -c user.email=cbh606@gmail.com commit -m "feat(matchup): map recent activity to past swaps"
```

---

### Task 2: Load both teams' activity on the matchup route

**Files:**
- Create: `src/lib/espn/matchupActivity.ts`
- Modify: `src/app/api/matchup/route.ts` (the JSON response at the end of `GET`)
- Test: `tests/unit/matchupActivity.test.ts`

**Interfaces:**
- Consumes: `swapsFromTransactions` and `ActivityTransaction` from Task 1. `EspnCookies` and `espnCookieHeader` from `src/lib/espn/cookies.ts`. `PastActualSwap` from `src/lib/matchup/pastActualSwaps.ts`.
- Produces:
  - `MatchupActivitySwaps = { pastActualSwaps: PastActualSwap[]; opponentPastActualSwaps: PastActualSwap[] }`
  - `loadMatchupActivitySwaps(input): Promise<MatchupActivitySwaps>`
  - Input fields: `leagueId: string`, `season: number`, `cookies: EspnCookies`, `youTeamId: number`, `oppTeamId: number`, `days: readonly string[]`, `scoringPeriodIds: readonly number[]`, `today: string`, `fetchImpl?: typeof fetch`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/matchupActivity.test.ts`. The test file uses semicolons.

```ts
import { describe, expect, it, vi } from "vitest"
import { loadMatchupActivitySwaps } from "@/lib/espn/matchupActivity"

const cookies = { espnS2: "s2", swid: "{SWID}" }

describe("loadMatchupActivitySwaps", () => {
  it("puts the user's waiver on the user list and the opponent's add on the opponent list", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toContain("view=mTransactions2")
      expect(url).toContain("scoringPeriodId=10")
      return new Response(
        JSON.stringify({
          transactions: [
            {
              status: "EXECUTED",
              type: "WAIVER",
              scoringPeriodId: 10,
              items: [
                { type: "ADD", playerId: 7, toTeamId: 2 },
                { type: "DROP", playerId: 8, fromTeamId: 2 },
              ],
            },
            {
              status: "EXECUTED",
              type: "FREEAGENT",
              scoringPeriodId: 10,
              items: [{ type: "ADD", playerId: 15, toTeamId: 3 }],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    })

    const result = await loadMatchupActivitySwaps({
      leagueId: "42",
      season: 2026,
      cookies,
      youTeamId: 2,
      oppTeamId: 3,
      days: ["2026-10-20", "2026-10-21"],
      scoringPeriodIds: [10, 11],
      today: "2026-10-21",
      fetchImpl,
    })

    expect(result.pastActualSwaps).toEqual([
      { date: "2026-10-20", spotIndex: 0, addedPlayerId: "7", drop: "8" },
    ])
    expect(result.opponentPastActualSwaps).toEqual([
      {
        date: "2026-10-20",
        spotIndex: 0,
        addedPlayerId: "15",
        drop: "open_slot",
      },
    ])
  })

  it("throws when a period request fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }))
    await expect(
      loadMatchupActivitySwaps({
        leagueId: "42",
        season: 2026,
        cookies,
        youTeamId: 2,
        oppTeamId: 3,
        days: ["2026-10-20"],
        scoringPeriodIds: [10],
        today: "2026-10-21",
        fetchImpl,
      }),
    ).rejects.toThrow("espn_activity_failed")
  })

  it("throws when dates and scoring periods differ in length", async () => {
    await expect(
      loadMatchupActivitySwaps({
        leagueId: "42",
        season: 2026,
        cookies,
        youTeamId: 2,
        oppTeamId: 3,
        days: ["2026-10-20", "2026-10-21"],
        scoringPeriodIds: [10],
        today: "2026-10-21",
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow("espn_matchup_period_length_mismatch")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/matchupActivity.test.ts --reporter=verbose`

Expected: FAIL because `src/lib/espn/matchupActivity.ts` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/espn/matchupActivity.ts`. No semicolons. Request only scoring periods whose date is before `today`. Send header `X-Fantasy-Filter` with `{"transactions":{"filterType":{"value":["FREEAGENT","WAIVER"]}}}`.

```ts
import { espnCookieHeader, type EspnCookies } from "@/lib/espn/cookies"
import {
  swapsFromTransactions,
  type ActivityTransaction,
} from "@/lib/matchup/activitySwaps"
import type { PastActualSwap } from "@/lib/matchup/pastActualSwaps"

const FILTER = JSON.stringify({
  transactions: { filterType: { value: ["FREEAGENT", "WAIVER"] } },
})

export type MatchupActivitySwaps = {
  pastActualSwaps: PastActualSwap[]
  opponentPastActualSwaps: PastActualSwap[]
}

const activityUrl = (season: number, leagueId: string, scoringPeriodId: number): URL => {
  const url = new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${season}/segments/0/leagues/${leagueId}`,
  )
  url.searchParams.set("view", "mTransactions2")
  url.searchParams.set("scoringPeriodId", String(scoringPeriodId))
  return url
}

const readTransactions = async (
  url: URL,
  cookies: EspnCookies,
  fetchImpl: typeof fetch,
): Promise<ActivityTransaction[]> => {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: espnCookieHeader(cookies),
      "X-Fantasy-Filter": FILTER,
    },
  })
  if (!response.ok) throw new Error("espn_activity_failed")
  const payload = (await response.json()) as { transactions?: ActivityTransaction[] }
  return payload.transactions ?? []
}

export const loadMatchupActivitySwaps = async (input: {
  leagueId: string
  season: number
  cookies: EspnCookies
  youTeamId: number
  oppTeamId: number
  days: readonly string[]
  scoringPeriodIds: readonly number[]
  today: string
  fetchImpl?: typeof fetch
}): Promise<MatchupActivitySwaps> => {
  if (input.days.length !== input.scoringPeriodIds.length) {
    throw new Error("espn_matchup_period_length_mismatch")
  }
  const fetchImpl = input.fetchImpl ?? fetch
  const periodDates = new Map<number, string>()
  const pastPeriods: number[] = []
  input.days.forEach((date, index) => {
    const period = input.scoringPeriodIds[index]!
    periodDates.set(period, date)
    if (date < input.today) pastPeriods.push(period)
  })
  const transactions: ActivityTransaction[] = []
  for (const period of pastPeriods) {
    const rows = await readTransactions(
      activityUrl(input.season, input.leagueId, period),
      input.cookies,
      fetchImpl,
    )
    transactions.push(...rows)
  }
  return {
    pastActualSwaps: swapsFromTransactions(
      transactions,
      input.youTeamId,
      periodDates,
      input.today,
    ),
    opponentPastActualSwaps: swapsFromTransactions(
      transactions,
      input.oppTeamId,
      periodDates,
      input.today,
    ),
  }
}
```

In `src/app/api/matchup/route.ts`, after `advice` is loaded and `liveActuals` is loaded, and before `return NextResponse.json`. `today` is not a route variable. Derive it from the advice the same way the client does:

```ts
const activityToday =
  "frontierDate" in advice && typeof advice.frontierDate === "string"
    ? advice.frontierDate
    : "frontierDate" in advice && advice.frontierDate === null
      ? dayAfterIso(schedule.matchup.days.at(-1) ?? "")
      : null
```

Add a local `dayAfterIso` that returns the next UTC calendar day as `YYYY-MM-DD`, or copy the helper the client already uses if it is exported. If `activityToday` is null, skip the load.

When `loaded.state.source === "espn"`, `loaded.espnLeagueId` is set, both team ids exist, cookies exist, `schedule.matchup.scoringPeriodIds` is present, and `activityToday` is a date:

```ts
let activitySwaps: MatchupActivitySwaps | null = null
try {
  const cookies = await getUserEspnCookies(userId)
  const oppTeam = loaded.state.teams.find(
    (team) => team.teamIndex === opponentTeamIndex,
  )
  if (
    cookies &&
    loaded.espnLeagueId &&
    loaded.state.espnTeamId != null &&
    oppTeam?.espnTeamId != null &&
    schedule.matchup.scoringPeriodIds
  ) {
    activitySwaps = await loadMatchupActivitySwaps({
      leagueId: loaded.espnLeagueId,
      season: loaded.state.season,
      cookies,
      youTeamId: loaded.state.espnTeamId,
      oppTeamId: oppTeam.espnTeamId,
      days: schedule.matchup.days,
      scoringPeriodIds: schedule.matchup.scoringPeriodIds,
      today: activityToday,
    })
  }
} catch {
  activitySwaps = null
}
```

Use the same `today` value the route already uses for the matchup. Spread `...(activitySwaps ?? {})` onto the JSON body so a failure or a non-ESPN league omits both fields.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/matchupActivity.test.ts tests/unit/activitySwaps.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/espn/matchupActivity.ts src/app/api/matchup/route.ts tests/unit/matchupActivity.test.ts
git -c user.name=cbh606-create -c user.email=cbh606@gmail.com commit -m "feat(matchup): load both teams' recent activity"
```

---

### Task 3: Plan both teams from the activity lists

**Files:**
- Modify: `src/lib/matchup/pastActualSwaps.ts` (`pastActualStorageKey` neighbors)
- Modify: `src/lib/matchup/streamingPlans.ts` (`BuildStreamingPlanInput`, `buildOpponentSelfPlan`, both of its call sites)
- Modify: `src/components/matchup/MatchupWorkspace.tsx` (`MatchupResponse`, the `StreamingPlansPanel` props)
- Modify: `src/components/matchup/StreamingPlansPanel.tsx` (load and write both lists; pass the opponent list through `sharedPlanInput`)
- Test: `tests/unit/pastActualSwaps.test.ts`
- Test: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: `MatchupActivitySwaps` from Task 2. `PastActualSwap`, `readPastActualSwaps`, `writePastActualSwaps`, `parsePastActualSwaps` from `src/lib/matchup/pastActualSwaps.ts`.
- Produces:
  - `opponentPastActualStorageKey(leagueId: string, matchupStart: string): string` returns `matchup-past-swaps:${leagueId}:${matchupStart}:opponent`
  - `readOpponentPastActualSwaps(leagueId: string, matchupStart: string, storage?: Pick<Storage, "getItem" | "setItem">): PastActualSwap[]`
  - `writeOpponentPastActualSwaps(leagueId: string, matchupStart: string, swaps: readonly PastActualSwap[], storage?: Pick<Storage, "getItem" | "setItem">): void`
  - `BuildStreamingPlanInput.opponentPastActualSwaps?: readonly PastActualSwap[]`

- [ ] **Step 1: Write the failing tests**

Use the `memory` helper already in that file:

```ts
it("stores the opponent list on its own key", () => {
  const storage = memory()
  writeOpponentPastActualSwaps("lg", "2026-10-20", [
    { date: "2026-10-20", spotIndex: 0, addedPlayerId: "15", drop: "open_slot" },
  ], storage)
  expect(readPastActualSwaps("lg", "2026-10-20", storage)).toEqual([])
  expect(readOpponentPastActualSwaps("lg", "2026-10-20", storage)).toEqual([
    { date: "2026-10-20", spotIndex: 0, addedPlayerId: "15", drop: "open_slot" },
  ])
})
```

In `tests/unit/streamingPlans.test.ts`, next to "leaves past days empty unless an actual swap was recorded", add a test that copies `tinyState`, `tinySchedule`, and `emptyBoardLosingStl`. Put player `sit` on team index 1. Call `buildStreamingPlan` with `opponentTeamIndex: 1`, `oppSpotCount: 1`, `today: "2026-10-21"`, and `opponentPastActualSwaps: []`. Expect `plan.opponentDays[0].cells[0]` to match `{ playerId: null, action: "empty" }`. Call again with one opponent swap on `2026-10-20`, spot `0`, `addedPlayerId: "fa-out"`, `drop: "sit"`. Expect that same cell's `playerId` to be `"fa-out"` and `roster` drop information to show `sit` on `droppedPlayerId`. Pass no `pastActualSwaps` on the user side, and expect the user's past cell to still be allowed to be non-empty only if the planner invents one. Assert the user's `plan.days[0].cells[0].playerId` is not `"fa-out"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/pastActualSwaps.test.ts tests/unit/streamingPlans.test.ts -t "opponent list|opponent past" --reporter=verbose`

Expected: FAIL because the opponent key and `opponentPastActualSwaps` do not exist.

- [ ] **Step 3: Write the minimal implementation**

Add the opponent key, reader, and writer next to the user ones in `pastActualSwaps.ts`. The reader and writer use `parsePastActualSwaps` and `JSON.stringify`. Default storage is `localStorage`, assigned inside the function, same as `readPastActualSwaps`.

Add `opponentPastActualSwaps?: readonly PastActualSwap[]` to `BuildStreamingPlanInput` and to `buildOpponentSelfPlan`. Pass it into the inner `buildStreamingPlan` as `pastActualSwaps: opponentPastActualSwaps`. Do not pass `opponentPastActualSwaps` into that inner call. At both outer `buildOpponentSelfPlan(...)` call sites, pass `opponentPastActualSwaps`.

In `MatchupResponse`, add optional `pastActualSwaps?: PastActualSwap[]` and `opponentPastActualSwaps?: PastActualSwap[]`.

In `StreamingPlansPanel`, keep the user list state. Add opponent list state initialized from `readOpponentPastActualSwaps(leagueId, schedule.matchup.startDate)`. When both response arrays are present, `writePastActualSwaps` and `writeOpponentPastActualSwaps`, then store both in state. Pass `pastActualSwaps` into the three user builds as today. Pass `opponentPastActualSwaps` on `sharedPlanInput`. Do not add a `실제 교체` control to the opponent grid. Do not change `handleResetToSuggested`.

`MatchupWorkspace` passes the two arrays from `matchupData` into `StreamingPlansPanel` only when both are arrays. Otherwise pass nothing and the panel keeps the saved lists.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/pastActualSwaps.test.ts tests/unit/streamingPlans.test.ts tests/unit/activitySwaps.test.ts tests/unit/matchupActivity.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/matchup/pastActualSwaps.ts src/lib/matchup/streamingPlans.ts src/components/matchup/MatchupWorkspace.tsx src/components/matchup/StreamingPlansPanel.tsx tests/unit/pastActualSwaps.test.ts tests/unit/streamingPlans.test.ts
git -c user.name=cbh606-create -c user.email=cbh606@gmail.com commit -m "feat(matchup): plan both teams from recent activity"
```
