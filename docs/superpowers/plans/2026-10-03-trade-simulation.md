# Trade simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Simulation tab where the user builds one trade and sees category ranks, overall rank, and a nine-sided chart for each team.

**Architecture:** `applyTradePackage` grows an optional explicit drop for the user's side and a flag that ignores empty IL slots. `simulateTrade` applies that package, ranks both leagues with the existing season totals, and attaches the first suggestion-rule sentence. The trade page keeps the current suggestion panel mounted and hides a new simulation panel behind a second tab.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Testing Library, SVG.

## Global Constraints

- Tabs are `Suggestions` and `Simulation`. Suggestions is selected on arrival. Both panels stay mounted. The inactive panel is hidden.
- Simulation does not use category toggles, Hold / Include, or Generate. It does not send a request when picks change.
- The user picks one other team, 1–2 non-IL players to receive, and 1–2 non-IL players to send. IL entries and empty slots are absent from the pickers.
- A drop is required only when the user receives more players than they send and has no open non-IL slot. The drop is a non-IL player who is not being sent. An empty IL slot is not an open slot.
- When the user sends more than they receive, the other team takes an open non-IL slot or else its lowest-value remaining non-IL player. The result names that player.
- Suggestion packages keep today's automatic drop and today's open-slot search. They do not pass `yourDropPlayerId` or `skipEmptyIlSlots`.
- Rank 1 is best. TO is better when the total is lower. An equal category total gives the better rank to the lower `teamIndex`.
- Overall place orders teams by the sum of the nine category ranks. A smaller sum is better. An equal sum gives the better place to the lower `teamIndex`.
- The nonagon is SVG. Vertices clockwise from the top are FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS. Rank 1 is the outer radius. Last place is 15% of that radius. Before is a thin line. After is filled. An unchanged rank reads `#5`. A change reads `#8 → #4`.
- Overall reads `Overall #6 → #4 (rank sum 48 → 41)`. Those numbers are a format example.
- The category table still shows every category's total and rank for both teams. Totals use `formatTotal`.
- Value copy is `formatValueLine`. User drop copy is `Drops {name} to open a roster spot`. Their drop copy is `They drop {name} to open a roster spot`.
- A package that fails a suggestion rule still shows ranks. The sentence is the first failure only: value band, then 1.2×, then complementary categories, then each side's matched weak, then each side's strengths. A passing package has no sentence. The category-toggle filter is not applied.
- No legal spot shows `Your roster cannot fit the extra player.` or `Their roster cannot fit the extra player.` with no chart and no table. The source league is not mutated.
- Missing picks show, in order, `Choose another team.` `Choose who to receive.` `Choose who to send.` `Choose who to drop.`
- No chart library. No ESPN write. No expected-wins number. The rank matrix component stays unchanged.

## File structure

- `src/lib/trade/overallPlace.ts` — overall place from nine category ranks.
- `src/lib/trade/simulate.ts` — optional explicit user drop and IL-aware open slots for simulation only. Existing `evaluateTrade` stays.
- `src/lib/trade/simulateTrade.ts` — one package in, ranks and the rule sentence out.
- `src/components/trade/RankNonagon.tsx` — the chart and `rankRadius`.
- `src/components/trade/TradeSimulation.tsx` — pickers and the result.
- `src/components/trade/TradeWorkspace.tsx` — the tablist. Suggestion state stays here.
- Tests live next to those units in `tests/unit/`.

---

### Task 1: Order teams by the sum of category ranks

**Files:**
- Create: `src/lib/trade/overallPlace.ts`
- Test: `tests/unit/overallPlace.test.ts`

**Interfaces:**
- Consumes: `ALL_CATEGORY_IDS` and `CategoryId`.
- Produces: `overallPlaces(rows: { teamIndex: number, ranks: Record<CategoryId, number> }[]): { teamIndex: number, rank: number, rankSum: number }[]`. Every input team is returned. `rank` is 1-based.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/overallPlace.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { overallPlaces } from "@/lib/trade/overallPlace"

const ranksFor = (rank: number): Record<CategoryId, number> =>
  Object.fromEntries(ALL_CATEGORY_IDS.map((categoryId) => [categoryId, rank])) as Record<CategoryId, number>

describe("overallPlaces", () => {
  it("places the smaller rank sum first and breaks ties by team index", () => {
    const places = overallPlaces([
      { teamIndex: 2, ranks: ranksFor(2) },
      { teamIndex: 0, ranks: ranksFor(1) },
      { teamIndex: 1, ranks: ranksFor(2) },
    ])

    expect(places).toEqual([
      { teamIndex: 0, rank: 1, rankSum: 9 },
      { teamIndex: 1, rank: 2, rankSum: 18 },
      { teamIndex: 2, rank: 3, rankSum: 18 },
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/overallPlace.test.ts`

Expected: FAIL because `@/lib/trade/overallPlace` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/trade/overallPlace.ts`:

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"

export const overallPlaces = (
  rows: { teamIndex: number, ranks: Record<CategoryId, number> }[],
) => {
  const withSums = rows.map((row) => ({
    teamIndex: row.teamIndex,
    rankSum: ALL_CATEGORY_IDS.reduce(
      (sum, categoryId) => sum + row.ranks[categoryId],
      0,
    ),
  }))
  const ordered = [...withSums].sort((left, right) =>
    left.rankSum - right.rankSum || left.teamIndex - right.teamIndex)

  return ordered.map((row, index) => ({ ...row, rank: index + 1 }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/overallPlace.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/overallPlace.ts tests/unit/overallPlace.test.ts
git commit -m "feat(trade): rank teams by the sum of category ranks"
```

---

### Task 2: Let simulation choose the user's drop

**Files:**
- Modify: `src/lib/trade/simulate.ts` (`findOpenIndex`, `assignAsymmetricPlayers`, `applyTradePackage`)
- Test: `tests/unit/tradeSimulate.test.ts`

**Interfaces:**
- Consumes: `applyTradePackage(state, tradePackage, precomputedValues?, excludedPlayerIds?)` as it exists. `twoTeamState` and `rosterPlayer` in the test file.
- Produces: a fifth argument `options?: { yourDropPlayerId?: string, skipEmptyIlSlots?: boolean }`. Omitted options keep today's behavior, including `droppedPlayerId` and `rejected`. When `yourDropPlayerId` is set and that side needs a spot, that player is dropped instead of the lowest-value player. `skipEmptyIlSlots: true` does not treat an empty IL entry as an open slot. The return gains `yourDroppedPlayerId?: string` and `theirDroppedPlayerId?: string`. `droppedPlayerId` remains `yourDroppedPlayerId ?? theirDroppedPlayerId` when a real teammate is cut. The existing IL-leftover case still sets `droppedPlayerId` to the extra incoming id and leaves `rejected` unset.

- [ ] **Step 1: Write the failing tests**

Add these tests inside `describe("applyTradePackage excluded drops")` in `tests/unit/tradeSimulate.test.ts`. `incoming` receives two players for `you-0`.

```ts
it("drops the named player instead of the lowest-value teammate", () => {
  const league = twoTeamState([18, 1, 12])
  const result = applyTradePackage(league, incoming, undefined, [], {
    yourDropPlayerId: "you-2",
  })

  expect(result.rejected).toBeUndefined()
  expect(result.yourDroppedPlayerId).toBe("you-2")
  expect(result.droppedPlayerId).toBe("you-2")
  expect(playerIdsOf(result.state, 0)).toContain("you-1")
  expect(playerIdsOf(result.state, 0)).not.toContain("you-2")
})

it("uses an open non-IL slot before the named drop", () => {
  const league = twoTeamState([18, 1, 12])
  league.teams[0].entries.push({ slot: "BE", playerId: null })
  const result = applyTradePackage(league, incoming, undefined, [], {
    yourDropPlayerId: "you-2",
    skipEmptyIlSlots: true,
  })

  expect(result.yourDroppedPlayerId).toBeUndefined()
  expect(playerIdsOf(result.state, 0)).toContain("you-2")
  expect(playerIdsOf(result.state, 0)).toEqual(
    expect.arrayContaining(["them-0", "them-1"]),
  )
})

it("does not use an empty IL slot when simulation skips IL", () => {
  const league = twoTeamState([18, 12])
  league.teams[0].entries.push({ slot: "IL", playerId: null })
  const result = applyTradePackage(league, incoming, undefined, [], {
    yourDropPlayerId: "you-1",
    skipEmptyIlSlots: true,
  })

  expect(result.yourDroppedPlayerId).toBe("you-1")
  expect(result.state.teams[0].entries.some((entry) =>
    entry.slot === "IL" && entry.playerId === null)).toBe(true)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/tradeSimulate.test.ts`

Expected: FAIL. `yourDroppedPlayerId` is undefined or the fifth argument is ignored.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/trade/simulate.ts`, change `findOpenIndex` so an optional third argument skips IL:

```ts
const findOpenIndex = (
  entries: SeasonRosterEntry[],
  excludedIndexes: number[],
  skipEmptyIlSlots = false,
): number =>
  entries.findIndex(
    (entry, index) =>
      !excludedIndexes.includes(index)
      && entry.playerId === null
      && (!skipEmptyIlSlots || entry.slot !== "IL"),
  )
```

Add `forcedDropPlayerId?: string` and `skipEmptyIlSlots = false` to `assignAsymmetricPlayers`. Pass `skipEmptyIlSlots` into `findOpenIndex`. When there is no open index and `forcedDropPlayerId` is set, find that id among entries that are outside `receivingIndexes`, have a player, and are not IL. If it is missing, return `{ unplaceable: true }`. If it is present, write the extra incoming player there and return `{ droppedPlayerId: forcedDropPlayerId, unplaceable: false }`. Leave the lowest-value branch for when `forcedDropPlayerId` is absent.

Extend the return type:

```ts
export type TradeApplication = {
  state: SeasonLeagueState
  droppedPlayerId?: string
  yourDroppedPlayerId?: string
  theirDroppedPlayerId?: string
  rejected?: boolean
}
```

Add the fifth parameter to `applyTradePackage`:

```ts
options?: { yourDropPlayerId?: string, skipEmptyIlSlots?: boolean }
```

Pass `options?.skipEmptyIlSlots ?? false` and, for the user's side only, `options?.yourDropPlayerId` into `assignAsymmetricPlayers`. Their call gets the skip flag and no forced id. After both calls:

```ts
const yourDroppedPlayerId = yourDrop.droppedPlayerId
const theirDroppedPlayerId = theirDrop.droppedPlayerId
const droppedPlayerId = yourDroppedPlayerId ?? theirDroppedPlayerId

return {
  state: { ...state, teams },
  ...(yourDroppedPlayerId ? { yourDroppedPlayerId } : {}),
  ...(theirDroppedPlayerId ? { theirDroppedPlayerId } : {}),
  ...(droppedPlayerId ? { droppedPlayerId } : {}),
}
```

Do not put the extra incoming id into `yourDroppedPlayerId` or `theirDroppedPlayerId`. The current no-legal-cut branch may still return that id as `droppedPlayerId` so the existing IL-leftover test keeps passing. `rejected: true` still returns the original `state` reference.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/tradeSimulate.test.ts`

Expected: PASS, including the existing drop tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/simulate.ts tests/unit/tradeSimulate.test.ts
git commit -m "feat(trade): let a simulation choose the roster drop"
```

---

### Task 3: Report ranks for one chosen package

**Files:**
- Create: `src/lib/trade/simulateTrade.ts`
- Test: `tests/unit/simulateTrade.test.ts`

**Interfaces:**
- Consumes: `applyTradePackage` with the fifth-argument options from Task 2, `overallPlaces` from Task 1, `analyzeTeamTotals`, `seasonTeamTotals`, `rosterPlayers`, `teamTotals`, `createTradeAnalysisContext`, `totalsAfterTrade`, `classifyTeam`, `teamsMatch`, `matchedWeaks`, `assessSide`, `passesShapeRules`, `evenValueGap`, `replacementScaledValues`, `buildPlayerValueMap`, `formatValueLine`.
- Produces:

```ts
export type SimulateTradeInput = {
  counterpartyTeamIndex: number
  youPlayerIds: string[]
  themPlayerIds: string[]
  yourDropPlayerId?: string
}

export type CategoryRankMove = {
  categoryId: CategoryId
  beforeTotal: number
  afterTotal: number
  rankBefore: number
  rankAfter: number
}

export type SideRankReport = {
  overallBefore: number
  overallAfter: number
  rankSumBefore: number
  rankSumAfter: number
  categories: CategoryRankMove[]
}

export type TradeSimulationResult =
  | {
    status: "unfit"
    sentence:
      | "Your roster cannot fit the extra player."
      | "Their roster cannot fit the extra player."
  }
  | {
    status: "ready"
    you: SideRankReport
    them: SideRankReport
    valueLine: string
    yourDroppedPlayerId?: string
    theirDroppedPlayerId?: string
    ruleSentence?: string
  }

export const simulateTrade: (
  state: SeasonLeagueState,
  input: SimulateTradeInput,
) => TradeSimulationResult | null
```

`null` means a picked id is not on the named team. The source `state` is never mutated.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/simulateTrade.test.ts` with a local `createPlayer` and `leagueOf(yourPlayers, theirPlayers)` that builds two teams, perspective team 0, no empty slots, slot `UTIL`. Use `defaultCategorySettings()` and base projections `{ FG_PCT: 0.5, FT_PCT: 0.75, TPM: 2, REB: 8, AST: 8, STL: 2, BLK: 1, TO: 4, PTS: 18 }`.

```ts
it("improves the category rank when the received total is higher", () => {
  const state = leagueOf(
    [
      createPlayer("you-star", { REB: 16, AST: 2 }),
      createPlayer("you-b", { REB: 16, AST: 2 }),
    ],
    [
      createPlayer("them-star", { REB: 2, AST: 16 }),
      createPlayer("them-b", { REB: 2, AST: 16 }),
    ],
  )
  const result = simulateTrade(state, {
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-star"],
    themPlayerIds: ["them-star"],
  })

  expect(result?.status).toBe("ready")
  if (result?.status !== "ready") return
  const assists = result.you.categories.find((category) => category.categoryId === "AST")
  const rebounds = result.you.categories.find((category) => category.categoryId === "REB")

  expect(assists!.rankAfter).toBeLessThan(assists!.rankBefore)
  expect(rebounds!.rankAfter).toBe(rebounds!.rankBefore)
  expect(result.you.categories).toHaveLength(9)
  expect(result.ruleSentence).toBeUndefined()
  expect(state.teams[0].entries.map((entry) => entry.playerId)).toContain("you-star")
})

it("gives a better TO rank when the total falls", () => {
  const state = leagueOf(
    [createPlayer("you-to", { TO: 6 }), createPlayer("you-b", { TO: 6 })],
    [createPlayer("them-to", { TO: 1 }), createPlayer("them-b", { TO: 6 })],
  )
  const result = simulateTrade(state, {
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-to"],
    themPlayerIds: ["them-to"],
  })

  expect(result?.status).toBe("ready")
  if (result?.status !== "ready") return
  const turnovers = result.you.categories.find((category) => category.categoryId === "TO")

  expect(turnovers!.afterTotal).toBeLessThan(turnovers!.beforeTotal)
  expect(turnovers!.rankAfter).toBeLessThan(turnovers!.rankBefore)
})

it("removes the chosen drop and keeps the lower-value teammate", () => {
  const state = leagueOf(
    [
      createPlayer("you-send", { PTS: 18 }),
      createPlayer("you-scrub", { PTS: 1 }),
      createPlayer("you-keep", { PTS: 30 }),
    ],
    [createPlayer("them-a", { PTS: 20 }), createPlayer("them-b", { PTS: 20 })],
  )
  const result = simulateTrade(state, {
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-send"],
    themPlayerIds: ["them-a", "them-b"],
    yourDropPlayerId: "you-keep",
  })

  expect(result?.status).toBe("ready")
  if (result?.status !== "ready") return
  expect(result.yourDroppedPlayerId).toBe("you-keep")
  expect(result.you.categories.find((category) => category.categoryId === "PTS")!.afterTotal)
    .toBeGreaterThan(0)
})

it("drops the other team's lowest-value remaining player", () => {
  const state = leagueOf(
    [createPlayer("you-a", { PTS: 20 }), createPlayer("you-b", { PTS: 20 })],
    [
      createPlayer("them-send", { PTS: 18 }),
      createPlayer("them-scrub", { PTS: 1 }),
      createPlayer("them-keep", { PTS: 30 }),
    ],
  )
  const result = simulateTrade(state, {
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-a", "you-b"],
    themPlayerIds: ["them-send"],
  })

  expect(result?.status).toBe("ready")
  if (result?.status !== "ready") return
  expect(result.theirDroppedPlayerId).toBe("them-scrub")
})

it("names your roster when the extra player has nowhere to go", () => {
  const state = leagueOf(
    [createPlayer("you-only", { PTS: 18 })],
    [createPlayer("them-a", { PTS: 20 }), createPlayer("them-b", { PTS: 20 })],
  )
  const result = simulateTrade(state, {
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-only"],
    themPlayerIds: ["them-a", "them-b"],
  })

  expect(result).toEqual({
    status: "unfit",
    sentence: "Your roster cannot fit the extra player.",
  })
})

it("names their roster when the extra player has nowhere to go", () => {
  const state = leagueOf(
    [createPlayer("you-a", { PTS: 20 }), createPlayer("you-b", { PTS: 20 })],
    [createPlayer("them-only", { PTS: 18 })],
  )
  const result = simulateTrade(state, {
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-a", "you-b"],
    themPlayerIds: ["them-only"],
  })

  expect(result).toEqual({
    status: "unfit",
    sentence: "Their roster cannot fit the extra player.",
  })
})

it("returns ranks and only the value sentence when the band and the match both fail", () => {
  const state = leagueOf(
    [createPlayer("you-star", { PTS: 40 }), createPlayer("you-b", { PTS: 10 })],
    [createPlayer("them-a", { PTS: 10 }), createPlayer("them-b", { PTS: 10 })],
  )
  const result = simulateTrade(state, {
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-star"],
    themPlayerIds: ["them-a"],
  })

  expect(result?.status).toBe("ready")
  if (result?.status !== "ready") return
  expect(result.you.overallBefore).toBeGreaterThan(0)
  expect(result.ruleSentence).toBe("Your package is more than 10% larger.")
})

it("returns no rule sentence for a mirrored complementary swap", () => {
  const state = leagueOf(
    [
      createPlayer("you-star", { REB: 16, AST: 2 }),
      createPlayer("you-b", { REB: 16, AST: 2 }),
    ],
    [
      createPlayer("them-star", { REB: 2, AST: 16 }),
      createPlayer("them-b", { REB: 2, AST: 16 }),
    ],
  )
  const result = simulateTrade(state, {
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-star"],
    themPlayerIds: ["them-star"],
  })

  expect(result?.status).toBe("ready")
  if (result?.status !== "ready") return
  expect(result.ruleSentence).toBeUndefined()
  expect(result.valueLine.length).toBeGreaterThan(0)
})
```

The PTS-band test is the first-failure test: that package is also not a complementary match, and the value sentence must win. If `you-star` is not the larger package, swap the expected sentence to `Their package is more than 10% larger.` rather than widening the band. The mirrored test must keep `ruleSentence` undefined. If that fixture falls outside the 10% band, change only the projection numbers until `passesShapeRules` passes and both intersections are nonempty. Do not change `FAIRNESS_BAND`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/simulateTrade.test.ts`

Expected: FAIL because `simulateTrade` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/trade/simulateTrade.ts` with the types from this task's interface and this function:

```ts
export const simulateTrade = (
  state: SeasonLeagueState,
  input: SimulateTradeInput,
): TradeSimulationResult | null => {
  const youCount = input.youPlayerIds.length
  const themCount = input.themPlayerIds.length
  const yourIds = idsOnTeam(state, state.perspectiveTeamIndex)
  const theirIds = idsOnTeam(state, input.counterpartyTeamIndex)
  const known = input.youPlayerIds.every((id) => yourIds.has(id))
    && input.themPlayerIds.every((id) => theirIds.has(id))

  if (
    youCount < 1
    || themCount < 1
    || youCount > 2
    || themCount > 2
    || !known
  ) {
    return null
  }

  const tradePackage: TradePackage = {
    shape: shapeFor(youCount, themCount),
    counterpartyTeamIndex: input.counterpartyTeamIndex,
    youPlayerIds: input.youPlayerIds,
    themPlayerIds: input.themPlayerIds,
  }
  const application = applyTradePackage(state, tradePackage, undefined, [], {
    yourDropPlayerId: input.yourDropPlayerId,
    skipEmptyIlSlots: true,
  })
  const landed = (teamIndex: number, incoming: string[]) => {
    const present = idsOnTeam(application.state, teamIndex)

    return incoming.every((id) => present.has(id))
  }
  const youReceiveMore = themCount > youCount

  if (
    application.rejected
    || !landed(state.perspectiveTeamIndex, input.themPlayerIds)
    || !landed(input.counterpartyTeamIndex, input.youPlayerIds)
  ) {
    return {
      status: "unfit",
      sentence: youReceiveMore
        ? "Your roster cannot fit the extra player."
        : "Their roster cannot fit the extra player.",
    }
  }

  const context = createTradeAnalysisContext(state)
  const beforeTotals = context.totalsByTeam
  const afterTotals = totalsAfterTrade(application.state, tradePackage, context)
  const before = analyzeTeamTotals(beforeTotals)
  const after = analyzeTeamTotals(afterTotals)
  const beforePlaces = overallPlaces(beforeTotals.map((team) => ({
    teamIndex: team.teamIndex,
    ranks: ranksFor(before, team.teamIndex),
  })))
  const afterPlaces = overallPlaces(afterTotals.map((team) => ({
    teamIndex: team.teamIndex,
    ranks: ranksFor(after, team.teamIndex),
  })))
  const side = (teamIndex: number): SideRankReport => {
    const beforePlace = beforePlaces.find((place) => place.teamIndex === teamIndex)!
    const afterPlace = afterPlaces.find((place) => place.teamIndex === teamIndex)!
    const beforeTeam = beforeTotals.find((team) => team.teamIndex === teamIndex)!.totals
    const afterTeam = afterTotals.find((team) => team.teamIndex === teamIndex)!.totals

    return {
      overallBefore: beforePlace.rank,
      overallAfter: afterPlace.rank,
      rankSumBefore: beforePlace.rankSum,
      rankSumAfter: afterPlace.rankSum,
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        beforeTotal: beforeTeam[categoryId],
        afterTotal: afterTeam[categoryId],
        rankBefore: ranksFor(before, teamIndex)[categoryId],
        rankAfter: ranksFor(after, teamIndex)[categoryId],
      })),
    }
  }
  const values = replacementScaledValues(buildPlayerValueMap(state))
  const giveTotal = packageTotal(input.youPlayerIds, values)
  const getTotal = packageTotal(input.themPlayerIds, values)
  const shapeCheck = passesShapeRules(tradePackage, values)
  const valueLine = formatValueLine(
    shapeCheck.overpayRatio === undefined
      ? {
        giveLarger: giveTotal > getTotal,
        valueGap: evenValueGap(tradePackage, values),
      }
      : { giveLarger: giveTotal > getTotal, overpayRatio: shapeCheck.overpayRatio },
  )

  return {
    status: "ready",
    you: side(state.perspectiveTeamIndex),
    them: side(input.counterpartyTeamIndex),
    valueLine,
    ...(application.yourDroppedPlayerId
      ? { yourDroppedPlayerId: application.yourDroppedPlayerId }
      : {}),
    ...(application.theirDroppedPlayerId
      ? { theirDroppedPlayerId: application.theirDroppedPlayerId }
      : {}),
    ...ruleFields(state, tradePackage, beforeTotals, afterTotals, values, shapeCheck.ok),
  }
}
```

Add `shapeFor`, `idsOnTeam`, `ranksFor`, `packageTotal`, and `ruleFields` in the same file. `ruleFields` is:

```ts
const ruleFields = (
  state: SeasonLeagueState,
  tradePackage: TradePackage,
  beforeTotals: TeamCategoryTotals[],
  afterTotals: TeamCategoryTotals[],
  values: Map<string, number>,
  shapeOk: boolean,
): { ruleSentence?: string } => {
  const giveTotal = packageTotal(tradePackage.youPlayerIds, values)
  const getTotal = packageTotal(tradePackage.themPlayerIds, values)
  const even = tradePackage.youPlayerIds.length === tradePackage.themPlayerIds.length

  if (!shapeOk && even) {
    return {
      ruleSentence: giveTotal > getTotal
        ? "Your package is more than 10% larger."
        : "Their package is more than 10% larger.",
    }
  }

  if (!shapeOk) {
    return { ruleSentence: "The two-player side is below 1.2× the one-player side." }
  }

  const yourSides = classifyTeam(beforeTotals, state.perspectiveTeamIndex)
  const theirSides = classifyTeam(beforeTotals, tradePackage.counterpartyTeamIndex)

  if (!teamsMatch(yourSides, theirSides)) {
    return { ruleSentence: "These teams do not have complementary categories." }
  }

  const beforeMean = leagueMeans(beforeTotals)
  const afterMean = leagueMeans(afterTotals)
  const totalsFor = (totals: TeamCategoryTotals[], teamIndex: number) =>
    totals.find((team) => team.teamIndex === teamIndex)!.totals
  const youAssessment = assessSide({
    before: totalsFor(beforeTotals, state.perspectiveTeamIndex),
    after: totalsFor(afterTotals, state.perspectiveTeamIndex),
    beforeMean,
    afterMean,
    weak: yourSides.weak,
    strong: yourSides.strong,
    matchedWeak: matchedWeaks(yourSides, theirSides),
  })
  const themAssessment = assessSide({
    before: totalsFor(beforeTotals, tradePackage.counterpartyTeamIndex),
    after: totalsFor(afterTotals, tradePackage.counterpartyTeamIndex),
    beforeMean,
    afterMean,
    weak: theirSides.weak,
    strong: theirSides.strong,
    matchedWeak: matchedWeaks(theirSides, yourSides),
  })

  if (!youAssessment.improved) {
    return { ruleSentence: "None of your matched weak categories improve." }
  }
  if (!themAssessment.improved) {
    return { ruleSentence: "None of their matched weak categories improve." }
  }
  if (!youAssessment.strengthsIntact) {
    return { ruleSentence: "One of your strengths finishes on the bad side of the league mean." }
  }
  if (!themAssessment.strengthsIntact) {
    return { ruleSentence: "One of their strengths finishes on the bad side of the league mean." }
  }

  return {}
}
```

`idsOnTeam` for the landing check reads `application.state`. The id check before `applyTradePackage` reads the input `state`. Do not mutate `state`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/simulateTrade.test.ts tests/unit/tradeSimulate.test.ts tests/unit/overallPlace.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/simulateTrade.ts tests/unit/simulateTrade.test.ts
git commit -m "feat(trade): report rank movement for one chosen package"
```

---

### Task 4: Draw category ranks on a nine-sided chart

**Files:**
- Create: `src/components/trade/RankNonagon.tsx`
- Test: `tests/unit/RankNonagon.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks except the rank numbers the caller passes.
- Produces: `rankRadius(rank: number, teamCount: number, outerRadius: number): number` and `RankNonagon`. Props:

```ts
type RankNonagonProps = {
  teamCount: number
  categories: {
    label: string
    rankBefore: number
    rankAfter: number
  }[]
}
```

`categories` is length 9, already in `ALL_CATEGORY_IDS` order. The first vertex is the top.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/RankNonagon.test.tsx` with the jsdom comment and Testing Library imports used by `tests/unit/TradeWorkspace.test.tsx`.

```ts
it("puts rank 1 on the outer radius and last place at 15 percent", () => {
  expect(rankRadius(1, 12, 100)).toBe(100)
  expect(rankRadius(12, 12, 100)).toBe(15)
  expect(rankRadius(6, 12, 100)).toBeGreaterThan(15)
  expect(rankRadius(6, 12, 100)).toBeLessThan(100)
})

it("labels each vertex with the rank change", () => {
  const labels = ["FG%", "FT%", "3PM", "REB", "AST", "STL", "BLK", "TO", "PTS"]
  render(
    <RankNonagon
      categories={labels.map((label, index) => ({
        label,
        rankBefore: index === 0 ? 8 : 5,
        rankAfter: index === 0 ? 4 : 5,
      }))}
      teamCount={12}
    />,
  )

  expect(screen.getByText("#8 → #4")).toBeInTheDocument()
  expect(screen.getAllByText("#5")).toHaveLength(8)
  for (const label of labels) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/RankNonagon.test.tsx`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/components/trade/RankNonagon.tsx`.

```ts
export const rankRadius = (
  rank: number,
  teamCount: number,
  outerRadius: number,
) => {
  const innerRadius = outerRadius * 0.15
  if (teamCount <= 1) return outerRadius
  const step = (rank - 1) / (teamCount - 1)

  return outerRadius - step * (outerRadius - innerRadius)
}
```

Render an `svg` of viewBox `0 0 240 240`. Center is `120, 120`. Outer radius is `78`. Vertex `index` is at angle `-Math.PI / 2 + index * 2 * Math.PI / 9`. Draw the before polygon with `fill="none"` and `stroke="var(--color-ink)"`. Draw the after polygon with `fill="var(--color-ink)"` and `fillOpacity="0.2"`. Place each label and its rank text just outside the outer radius. Rank text is `#${rankBefore} → #${rankAfter}` when the ranks differ, otherwise `#${rankBefore}`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/RankNonagon.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/trade/RankNonagon.tsx tests/unit/RankNonagon.test.tsx
git commit -m "feat(trade): draw category ranks on a nine-sided chart"
```

---

### Task 5: Build a trade and show its rank effect

**Files:**
- Create: `src/components/trade/TradeSimulation.tsx`
- Test: `tests/unit/TradeSimulation.test.tsx`

**Interfaces:**
- Consumes: `simulateTrade` and `TradeSimulationResult` from Task 3, `RankNonagon` from Task 4, `formatTotal`, `CATEGORY_SHORT_LABELS`.
- Produces: `TradeSimulation({ state }: { state: SeasonLeagueState })`. It owns team, receive, send, and drop selection.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/TradeSimulation.test.tsx` in the same jsdom style. Build a two-team state. Your team is named `My Team` and has `Your Guard` (`give-1`, REB 4) and `Your Big` (`give-2`, REB 20). Their team is named `Rivals` and has `Their Center` (`get-1`, REB 20) and `Their Wing` (`get-2`, REB 4). Add a third filler team of two average REB 10 players so ranks are not only 1 and 2. No empty slots. No IL.

```ts
it("shows overall and category ranks after both sides are chosen", async () => {
  render(<TradeSimulation state={state} />)

  expect(screen.getByText("Choose another team.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Rivals" }))
  expect(screen.getByText("Choose who to receive.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
  expect(screen.getByText("Choose who to send.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))

  expect(screen.getByText(/^Overall #/)).toBeInTheDocument()
  expect(screen.getByText(/rank sum/)).toBeInTheDocument()
  expect(screen.getAllByText("REB").length).toBeGreaterThan(0)
  expect(screen.getByText(/#\d+ → #\d+/)).toBeInTheDocument()
})

it("waits for a drop when two players are received", () => {
  render(<TradeSimulation state={fullState} />)
  fireEvent.click(screen.getByRole("button", { name: "Rivals" }))
  fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
  fireEvent.click(screen.getByRole("button", { name: "Their Wing" }))
  fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))

  expect(screen.getByText("Choose who to drop.")).toBeInTheDocument()
  expect(screen.queryByText(/^Overall #/)).toBeNull()

  fireEvent.click(within(screen.getByRole("group", { name: "Drop" })).getByRole("button", { name: "Your Big" }))
  expect(screen.getByText(/^Overall #/)).toBeInTheDocument()
  expect(screen.getByText("Drops Your Big to open a roster spot")).toBeInTheDocument()
})
```

`fullState` is `state` plus a third user player `Your Stay` so someone remains after the drop. The drop button is the one labeled `Your Big` in the drop group. Give that group `aria-label="Drop"`. The receive and send groups are `aria-label="Receive"` and `aria-label="Send"`. Query the drop button with `within(screen.getByRole("group", { name: "Drop" }))`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/TradeSimulation.test.tsx`

Expected: FAIL because `TradeSimulation` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/components/trade/TradeSimulation.tsx`.

Other teams are `state.teams` whose `teamIndex` is not `perspectiveTeamIndex`. A selectable player is a non-IL entry with a `playerId`. Names come from `state.players`.

Selection rules:

- One team. Changing it clears `receiveIds`.
- Receive and send each hold at most two ids. Clicking a selected id removes it. Clicking a third id does nothing.
- `dropId` clears when it is being sent, when the receive count is no longer greater than the send count, or when an open non-IL slot exists.
- An open non-IL slot is an entry with `playerId === null` and `slot !== "IL"`.

Prompt is the first of: no team, no receive id, no send id, drop required and unset. When a drop is required and the legal drop list is empty, show `Your roster cannot fit the extra player.` instead of calling `simulateTrade`.

Otherwise call `simulateTrade`. `status: "unfit"` shows `result.sentence` only. `status: "ready"` shows two columns. Each column has `Overall #{before} → #{after} (rank sum {beforeSum} → {afterSum})`, a `RankNonagon` whose labels are `CATEGORY_SHORT_LABELS`, and then the nine totals via `formatTotal` next to `#rankBefore → #rankAfter`. Under both columns show `valueLine`, then the drop sentences from the result ids. Show `ruleSentence` only when it is present.

Team and player buttons use `aria-pressed`. The selected team and selected players use `bg-[var(--color-ink)] text-white`. Unselected buttons use a hairline border.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/TradeSimulation.test.tsx tests/unit/RankNonagon.test.tsx tests/unit/simulateTrade.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/trade/TradeSimulation.tsx tests/unit/TradeSimulation.test.tsx
git commit -m "feat(trade): build a trade and show its rank effect"
```

---

### Task 6: Add the Simulation tab beside Suggestions

**Files:**
- Modify: `src/components/trade/TradeWorkspace.tsx`
- Test: `tests/unit/TradeWorkspace.test.tsx`

**Interfaces:**
- Consumes: `TradeSimulation` from Task 5. The suggestion state already in `TradeWorkspace`.
- Produces: a tablist named `Trade workspace view` with tabs `Suggestions` and `Simulation`. Suggestions stays the default visible panel. Simulation receives `state`.

- [ ] **Step 1: Write the failing test**

Add this test to `describe("TradeWorkspace")` in `tests/unit/TradeWorkspace.test.tsx`. The existing fetch stub and `state` stay as they are.

```ts
it("keeps simulation picks after visiting suggestions", async () => {
  render(<TradeWorkspace leagueId="season-1" />)
  await screen.findByText("Select a category, then generate trade suggestions.")

  fireEvent.click(screen.getByRole("tab", { name: "Simulation" }))
  fireEvent.click(screen.getByRole("button", { name: "Rivals" }))
  expect(screen.getByRole("button", { name: "Rivals" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  fireEvent.click(screen.getByRole("tab", { name: "Suggestions" }))
  expect(screen.getByRole("button", { name: "Generate trade suggestions" })).toBeInTheDocument()

  fireEvent.click(screen.getByRole("tab", { name: "Simulation" }))
  expect(screen.getByRole("button", { name: "Rivals" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
})
```

The fixture team name is `Rivals`. If `TradeSimulation` labels the team button with `state.teams` name, this press survives because the panel stays mounted.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/TradeWorkspace.test.tsx`

Expected: FAIL because there is no tab named `Simulation`.

- [ ] **Step 3: Write the minimal implementation**

In `TradeWorkspace`, add `const [tab, setTab] = useState<"suggestions" | "simulation">("suggestions")`. After the league header, render:

```tsx
<div
  aria-label="Trade workspace view"
  className="mb-6 flex w-fit rounded-full bg-[var(--color-soft-cloud)] p-1"
  role="tablist"
>
  {([
    ["suggestions", "Suggestions"],
    ["simulation", "Simulation"],
  ] as const).map(([id, label]) => (
    <button
      aria-controls={`${id}-panel`}
      aria-selected={tab === id}
      className={
        tab === id
          ? "rounded-full bg-[var(--color-ink)] px-6 py-2.5 font-medium text-white"
          : "rounded-full px-6 py-2.5 font-medium text-[var(--color-mute)]"
      }
      id={`${id}-tab`}
      key={id}
      onClick={() => setTab(id)}
      role="tab"
      type="button"
    >
      {label}
    </button>
  ))}
</div>
```

Wrap the current weak-category panel, toggles, roster groups, generate button, and suggestion list in:

```tsx
<div
  aria-labelledby="suggestions-tab"
  hidden={tab !== "suggestions"}
  id="suggestions-panel"
  role="tabpanel"
>
```

Add a sibling panel:

```tsx
<div
  aria-labelledby="simulation-tab"
  hidden={tab !== "simulation"}
  id="simulation-panel"
  role="tabpanel"
>
  <TradeSimulation state={state} />
</div>
```

Do not move suggestion state into the child. Do not unmount either panel.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/TradeWorkspace.test.tsx tests/unit/TradeSimulation.test.tsx tests/unit/simulateTrade.test.ts tests/unit/tradeSimulate.test.ts`

Expected: PASS. The existing generate test still finds `Generate trade suggestions` without clicking a tab.

- [ ] **Step 5: Commit**

```bash
git add src/components/trade/TradeWorkspace.tsx tests/unit/TradeWorkspace.test.tsx
git commit -m "feat(trade): add a simulation tab beside suggestions"
```
