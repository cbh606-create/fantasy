# Fair Trade Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest every fair trade the roster can make, and show why the other manager would take it, 20 at a time.

**Architecture:** Classify weak and strong categories from pre-trade team totals versus the league mean. Enumerate every non-IL player on a matching team. Keep the existing value band, then accept a package when each side improves at least one matched weak total and no pre-trade strength finishes on the bad side of the post-trade mean. The API returns the full sorted list. The workspace reveals 20 rows at a time and the card states gains, held strengths, value, and worsened weaknesses.

**Tech Stack:** TypeScript, Next.js 15, Vitest, Testing Library, existing `teamTotals` / `analyzeTeamTotals`.

## Global Constraints

- Counting totals are sums of season projections for every rostered player, including bench and IL. `FG_PCT` and `FT_PCT` are roster makes divided by roster attempts when every player has attempts.
- The league mean is the arithmetic mean of team totals. Team count is not fixed at 12.
- The good side is a higher total, except `TO`, where the good side is a lower total. A total equal to the mean is neither weak nor strong.
- A match needs both intersections: you weak and them strong, and them weak and you strong. Those sets do not share a category.
- Do not change `teamNeedsAndSurplus` or `needsScore`. Waivers still use the rank floors.
- Every non-IL player with an id is eligible. No value-ranked candidate pool.
- `1:1` and `2:2` pass only when `|give − get| / max(give, get, ε) ≤ 0.25` on the current softplus values. `2:1` and `1:2` pass only when the two-player side is at least `1.2` times the one-player side.
- Acceptance compares each team’s own total before and after. A matched weak improves when the total rises, or when `TO` falls. One matched weak is enough.
- A pre-trade strength fails the package only when it lands on the bad side of the post-trade mean. Landing exactly on that mean passes.
- A pre-trade weak total that moves further the bad way stays a suggestion and is listed on the card. Rank numbers are not an acceptance input.
- Sort by the harmonic mean of the two sides’ positive z sums. A side sum `≤ 0` sorts after every positive harmonic mean. The server does not truncate.
- The list shows 20, then `Show {n} more`. No second request.
- Even-shape copy: `Your package is larger by {n}%`, `Their package is larger by {n}%`, or `Packages are even`. Asymmetric copy: `The two-player side is {overpayRatio}× the one-player side`.
- No ESPN trade submission. No shapes larger than `2:2`. No punt flag. No schedule weighting.

---

### Task 1: Classify weak and strong from the league mean

**Files:**
- Create: `src/lib/trade/classify.ts`
- Test: `tests/unit/tradeClassify.test.ts`

**Interfaces:**
- Consumes: `TeamCategoryTotals` from `@/lib/season/analysis`
- Produces:
  - `export type CategoryTotalMap = Record<CategoryId, number>`
  - `export type TeamCategorySides = { weak: CategoryId[]; strong: CategoryId[] }`
  - `export const leagueMeans = (totalsByTeam: TeamCategoryTotals[]) => CategoryTotalMap`
  - `export const classifyTeam = (totalsByTeam: TeamCategoryTotals[], teamIndex: number) => TeamCategorySides`
  - `export const teamsMatch = (you: TeamCategorySides, them: TeamCategorySides) => boolean`
  - `export const matchedWeaks = (self: TeamCategorySides, other: TeamCategorySides) => CategoryId[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import type { TeamCategoryTotals } from "@/lib/season/analysis"
import {
  classifyTeam,
  matchedWeaks,
  teamsMatch,
} from "@/lib/trade/classify"

const totals = (
  teamIndex: number,
  overrides: Partial<Record<CategoryId, number>>,
): TeamCategoryTotals => ({
  teamIndex,
  totals: {
    FG_PCT: 0.45,
    FT_PCT: 0.75,
    TPM: 10,
    REB: 40,
    AST: 20,
    STL: 8,
    BLK: 4,
    TO: 12,
    PTS: 100,
    ...overrides,
  },
})

describe("classifyTeam", () => {
  const league = [
    totals(0, { AST: 10, REB: 50, TO: 20, PTS: 100 }),
    totals(1, { AST: 30, REB: 10, TO: 4, PTS: 100 }),
  ]

  it("marks the bad side weak and the good side strong, including turnovers", () => {
    const you = classifyTeam(league, 0)

    expect(you.weak).toContain("AST")
    expect(you.weak).toContain("TO")
    expect(you.strong).toContain("REB")
    expect(you.weak).not.toContain("PTS")
    expect(you.strong).not.toContain("PTS")
  })

  it("matches teams that swap different categories", () => {
    const you = classifyTeam(league, 0)
    const them = classifyTeam(league, 1)

    expect(teamsMatch(you, them)).toBe(true)
    expect(matchedWeaks(you, them)).toEqual(expect.arrayContaining(["AST", "TO"]))
    expect(matchedWeaks(them, you)).toContain("REB")
    expect(matchedWeaks(you, them).some((categoryId) =>
      matchedWeaks(them, you).includes(categoryId),
    )).toBe(false)
  })

  it("does not match a team with no strong category", () => {
    const flat = [totals(0), totals(1)]

    expect(teamsMatch(classifyTeam(flat, 0), classifyTeam(flat, 1))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/tradeClassify.test.ts`

Expected: FAIL because `@/lib/trade/classify` does not exist.

- [ ] **Step 3: Write the classifier**

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { TeamCategoryTotals } from "@/lib/season/analysis"

export type CategoryTotalMap = Record<CategoryId, number>

export type TeamCategorySides = {
  weak: CategoryId[]
  strong: CategoryId[]
}

const isGoodSide = (categoryId: CategoryId, total: number, mean: number) =>
  categoryId === "TO" ? total < mean : total > mean

const isBadSide = (categoryId: CategoryId, total: number, mean: number) =>
  categoryId === "TO" ? total > mean : total < mean

export const leagueMeans = (
  totalsByTeam: TeamCategoryTotals[],
): CategoryTotalMap =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => {
      const sum = totalsByTeam.reduce(
        (total, team) => total + team.totals[categoryId],
        0,
      )

      return [categoryId, sum / totalsByTeam.length]
    }),
  ) as CategoryTotalMap

export const classifyTeam = (
  totalsByTeam: TeamCategoryTotals[],
  teamIndex: number,
): TeamCategorySides => {
  const totals = totalsByTeam.find((team) => team.teamIndex === teamIndex)?.totals
  const weak: CategoryId[] = []
  const strong: CategoryId[] = []

  if (!totals) {
    return { weak, strong }
  }

  const means = leagueMeans(totalsByTeam)

  for (const categoryId of ALL_CATEGORY_IDS) {
    const total = totals[categoryId]
    const mean = means[categoryId]

    if (isBadSide(categoryId, total, mean)) weak.push(categoryId)
    if (isGoodSide(categoryId, total, mean)) strong.push(categoryId)
  }

  return { weak, strong }
}

export const teamsMatch = (
  you: TeamCategorySides,
  them: TeamCategorySides,
) =>
  you.weak.some((categoryId) => them.strong.includes(categoryId))
  && them.weak.some((categoryId) => you.strong.includes(categoryId))

export const matchedWeaks = (
  self: TeamCategorySides,
  other: TeamCategorySides,
) => self.weak.filter((categoryId) => other.strong.includes(categoryId))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/tradeClassify.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/classify.ts tests/unit/tradeClassify.test.ts
git commit -m "feat(trade): classify weak and strong sides from the league mean"
```

---

### Task 2: Enumerate every non-IL player on a matching team

**Files:**
- Modify: `src/lib/trade/enumerate.ts`
- Modify: `src/lib/trade/constants.ts`
- Modify: `src/lib/trade/suggest.ts` (call site only)
- Modify: `tests/unit/tradeConstants.test.ts`
- Modify: `tests/unit/tradeSuggest.test.ts` (the `enumeratePackages` call)
- Test: `tests/unit/tradeEnumerate.test.ts`

**Interfaces:**
- Consumes: `classifyTeam`, `teamsMatch` from Task 1. `seasonTeamTotals` from `@/lib/season/analysis`.
- Produces: `export const enumeratePackages = (state: SeasonLeagueState) => TradePackage[]`
- `MAX_CANDIDATES_PER_TEAM` is deleted. `NEED_RANK_FLOOR`, `SURPLUS_RANK_CEILING`, `FAIRNESS_BAND`, `OVERPAY_RATIO`, and `MAX_SUGGESTIONS` stay until Task 4 removes the slice.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { enumeratePackages } from "@/lib/trade/enumerate"

const base: Record<CategoryId, number> = {
  FG_PCT: 0.5,
  FT_PCT: 0.75,
  TPM: 2,
  REB: 8,
  AST: 8,
  STL: 2,
  BLK: 1,
  TO: 4,
  PTS: 18,
}

const player = (
  id: string,
  overrides: Partial<Record<CategoryId, number>> = {},
): SeasonPlayer => {
  const projections = { ...base, ...overrides }

  return {
    id,
    name: id,
    projections,
    shooting: {
      FGM: projections.FG_PCT * 10,
      FGA: 10,
      FTM: projections.FT_PCT * 10,
      FTA: 10,
    },
  }
}

const state = (): SeasonLeagueState => {
  const you = [
    player("scrub", { PTS: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TPM: 0, TO: 9 }),
    ...Array.from({ length: 5 }, (_, index) =>
      player(`you-${index}`, { REB: 20, AST: 1 })),
  ]
  const them = [player("them-0", { REB: 1, AST: 20 })]
  const filler = [player("filler")]
  const rosters = [you, them, ...Array.from({ length: 10 }, () => filler)]

  return {
    name: "Enumerate",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: rosters.map((teamPlayers, teamIndex) => ({
      teamIndex,
      name: `Team ${teamIndex}`,
      entries: teamPlayers.map((rosterPlayer) => ({
        slot: "UTIL" as const,
        playerId: rosterPlayer.id,
      })),
    })),
    players: rosters.flat(),
    availablePlayerIds: [],
    waiverOrder: rosters.map((_, teamIndex) => teamIndex),
    source: "manual",
  }
}

describe("enumeratePackages", () => {
  it("includes the lowest-value non-IL player", () => {
    const packages = enumeratePackages(state())
    const oneForOnes = packages.filter((tradePackage) => tradePackage.shape === "1:1")

    expect(oneForOnes).toHaveLength(6)
    expect(oneForOnes.some((tradePackage) =>
      tradePackage.youPlayerIds.includes("scrub"),
    )).toBe(true)
  })

  it("skips a team that is weak and strong in the same categories", () => {
    const league = state()
    league.players = league.players.map((rosterPlayer) =>
      rosterPlayer.id === "them-0"
        ? { ...rosterPlayer, projections: { ...base, REB: 20, AST: 1 } }
        : rosterPlayer,
    )

    expect(enumeratePackages(league)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/tradeEnumerate.test.ts`

Expected: FAIL. `enumeratePackages` still takes an analysis argument, or the scrub is outside the top five.

- [ ] **Step 3: Drop the candidate cap and match on sides**

Replace `src/lib/trade/enumerate.ts` with:

```ts
import type { SeasonLeagueState, SeasonTeamRoster } from "@/lib/season/types"
import { seasonTeamTotals } from "@/lib/season/analysis"
import { classifyTeam, teamsMatch } from "./classify"
import type { TradePackage, TradeShape } from "./types"

const tradablePlayerIds = (team: SeasonTeamRoster): string[] =>
  team.entries
    .flatMap((entry) =>
      entry.slot === "IL" || !entry.playerId ? [] : [entry.playerId])
    .sort()

const combinations = (playerIds: string[]): string[][] => [
  ...playerIds.map((playerId) => [playerId]),
  ...playerIds.flatMap((playerId, index) =>
    playerIds.slice(index + 1).map((other) => [playerId, other])),
]

export const enumeratePackages = (
  state: SeasonLeagueState,
): TradePackage[] => {
  const yourTeam = state.teams.find(
    ({ teamIndex }) => teamIndex === state.perspectiveTeamIndex,
  )

  if (!yourTeam) {
    return []
  }

  const totalsByTeam = seasonTeamTotals(state)
  const yourSides = classifyTeam(totalsByTeam, state.perspectiveTeamIndex)
  const yourCombinations = combinations(tradablePlayerIds(yourTeam))

  return state.teams.flatMap((team) => {
    if (team.teamIndex === state.perspectiveTeamIndex) {
      return []
    }

    if (!teamsMatch(yourSides, classifyTeam(totalsByTeam, team.teamIndex))) {
      return []
    }

    return yourCombinations.flatMap((youPlayerIds) =>
      combinations(tradablePlayerIds(team)).map((themPlayerIds) => ({
        shape: `${youPlayerIds.length}:${themPlayerIds.length}` as TradeShape,
        counterpartyTeamIndex: team.teamIndex,
        youPlayerIds,
        themPlayerIds,
      })))
  })
}
```

Delete `MAX_CANDIDATES_PER_TEAM` from `src/lib/trade/constants.ts`.

In `src/lib/trade/suggest.ts`, change the enumerate call to `enumeratePackages(state)` and delete the unused `analyzeSeasonLeague` import only if this task’s edit makes it unused. Leave the rest of `suggest.ts` alone. `analysis` from `createTradeAnalysisContext` is still used.

In `tests/unit/tradeSuggest.test.ts`, change `enumeratePackages(mirrorState, analyzeSeasonLeague(mirrorState))` to `enumeratePackages(mirrorState)` and remove the `analyzeSeasonLeague` import if nothing else in that file uses it.

In `tests/unit/tradeConstants.test.ts`, stop importing and asserting `MAX_CANDIDATES_PER_TEAM`. It is not imported there today. No constant-test change is required for this deletion. Do not remove `MAX_SUGGESTIONS` yet.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/tradeEnumerate.test.ts tests/unit/tradeSuggest.test.ts tests/unit/tradeConstants.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/enumerate.ts src/lib/trade/constants.ts src/lib/trade/suggest.ts tests/unit/tradeEnumerate.test.ts tests/unit/tradeSuggest.test.ts
git commit -m "feat(trade): enumerate every non-IL player on a matching team"
```

---

### Task 3: Judge a package from totals

**Files:**
- Create: `src/lib/trade/accept.ts`
- Modify: `src/lib/trade/simulate.ts`
- Test: `tests/unit/tradeAccept.test.ts`

**Interfaces:**
- Consumes: `CategoryTotalMap` from Task 1. `CategoryId`.
- Produces:
  - `export type CategoryTotalMove = { categoryId: CategoryId; before: number; after: number }`
  - `export type SideAssessment = { gains: CategoryTotalMove[]; worsened: CategoryTotalMove[]; strengthsHeld: CategoryId[]; improved: boolean; strengthsIntact: boolean }`
  - `export const assessSide = (input: { before: CategoryTotalMap; after: CategoryTotalMap; beforeMean: CategoryTotalMap; afterMean: CategoryTotalMap; weak: CategoryId[]; strong: CategoryId[]; matchedWeak: CategoryId[] }) => SideAssessment`
  - `export const totalsAfterTrade = (afterState: SeasonLeagueState, tradePackage: TradePackage, context: TradeAnalysisContext) => TeamCategoryTotals[]`

`evaluateTrade` keeps returning `you` and `them` side impacts so `tests/unit/tradeSimulate.test.ts` stays green. The suggestion stops using those fields in Task 4.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import { assessSide, type CategoryTotalMap } from "@/lib/trade/accept"

const line = (overrides: Partial<CategoryTotalMap> = {}): CategoryTotalMap => ({
  FG_PCT: 0.45,
  FT_PCT: 0.75,
  TPM: 10,
  REB: 40,
  AST: 20,
  STL: 8,
  BLK: 4,
  TO: 12,
  PTS: 100,
  ...overrides,
})

const assess = (
  before: Partial<CategoryTotalMap>,
  after: Partial<CategoryTotalMap>,
  matchedWeak: CategoryId[],
) => assessSide({
  before: line(before),
  after: line(after),
  beforeMean: line(),
  afterMean: line(),
  weak: ["AST", "STL", "FG_PCT", "TO"],
  strong: ["REB"],
  matchedWeak,
})

describe("assessSide", () => {
  it("passes when one matched total improves and a strength stays above the mean", () => {
    const result = assess({ AST: 10, REB: 50 }, { AST: 14, REB: 45 }, ["AST", "STL"])

    expect(result.improved).toBe(true)
    expect(result.gains.map((gain) => gain.categoryId)).toEqual(["AST"])
    expect(result.strengthsIntact).toBe(true)
    expect(result.strengthsHeld).toEqual(["REB"])
  })

  it("rejects a strength that finishes on the bad side of the post-trade mean", () => {
    const result = assess({ AST: 10, REB: 50 }, { AST: 14, REB: 30 }, ["AST"])

    expect(result.strengthsIntact).toBe(false)
    expect(result.strengthsHeld).not.toContain("REB")
  })

  it("keeps a strength that lands exactly on the post-trade mean", () => {
    const result = assess({ AST: 10, REB: 50 }, { AST: 14, REB: 40 }, ["AST"])

    expect(result.strengthsIntact).toBe(true)
    expect(result.strengthsHeld).not.toContain("REB")
  })

  it("lists a weak category that gets worse without failing the side", () => {
    const result = assess(
      { AST: 10, STL: 4 },
      { AST: 14, STL: 2 },
      ["AST"],
    )

    expect(result.improved).toBe(true)
    expect(result.worsened).toEqual([
      { categoryId: "STL", before: 4, after: 2 },
    ])
  })

  it("treats a falling turnover total and a rising field-goal percentage as gains", () => {
    const turnovers = assess({ TO: 18 }, { TO: 11 }, ["TO"])
    const shooting = assess({ FG_PCT: 0.4 }, { FG_PCT: 0.48 }, ["FG_PCT"])

    expect(turnovers.gains).toEqual([{ categoryId: "TO", before: 18, after: 11 }])
    expect(shooting.gains[0]?.categoryId).toBe("FG_PCT")
    expect(assess({ TO: 18 }, { TO: 19 }, ["TO"]).improved).toBe(false)
    expect(assess({ FG_PCT: 0.4 }, { FG_PCT: 0.39 }, ["FG_PCT"]).improved).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/tradeAccept.test.ts`

Expected: FAIL because `@/lib/trade/accept` does not exist.

- [ ] **Step 3: Write the assessment and the post-trade totals helper**

Create `src/lib/trade/accept.ts`:

```ts
import type { CategoryId } from "@/lib/domain/types"
import type { CategoryTotalMap } from "./classify"

export type CategoryTotalMove = {
  categoryId: CategoryId
  before: number
  after: number
}

export type SideAssessment = {
  gains: CategoryTotalMove[]
  worsened: CategoryTotalMove[]
  strengthsHeld: CategoryId[]
  improved: boolean
  strengthsIntact: boolean
}

const movedGood = (categoryId: CategoryId, before: number, after: number) =>
  categoryId === "TO" ? after < before : after > before

const onGoodSide = (categoryId: CategoryId, total: number, mean: number) =>
  categoryId === "TO" ? total < mean : total > mean

const onBadSide = (categoryId: CategoryId, total: number, mean: number) =>
  categoryId === "TO" ? total > mean : total < mean

export const assessSide = ({
  before,
  after,
  beforeMean,
  afterMean,
  weak,
  strong,
  matchedWeak,
}: {
  before: CategoryTotalMap
  after: CategoryTotalMap
  beforeMean: CategoryTotalMap
  afterMean: CategoryTotalMap
  weak: CategoryId[]
  strong: CategoryId[]
  matchedWeak: CategoryId[]
}): SideAssessment => {
  const gains = matchedWeak
    .filter((categoryId) =>
      movedGood(categoryId, before[categoryId], after[categoryId]))
    .map((categoryId) => ({
      categoryId,
      before: before[categoryId],
      after: after[categoryId],
    }))
  const worsened = weak
    .filter((categoryId) =>
      !movedGood(categoryId, before[categoryId], after[categoryId])
      && before[categoryId] !== after[categoryId])
    .map((categoryId) => ({
      categoryId,
      before: before[categoryId],
      after: after[categoryId],
    }))
  const strengthsHeld = strong.filter((categoryId) =>
    onGoodSide(categoryId, after[categoryId], afterMean[categoryId]))
  const strengthsIntact = strong.every((categoryId) =>
    !onBadSide(categoryId, after[categoryId], afterMean[categoryId]))

  return {
    gains,
    worsened,
    strengthsHeld,
    improved: gains.length > 0,
    strengthsIntact,
  }
}
```

`worsened` uses “not moved good, and the total changed” so an unchanged weak category is omitted. A turnover that rises is not `movedGood`, so it is worsened. A field-goal percentage that falls is worsened.

In `src/lib/trade/simulate.ts`, export this helper and point the private after-analysis at it:

```ts
export const totalsAfterTrade = (
  afterState: SeasonLeagueState,
  tradePackage: TradePackage,
  context: TradeAnalysisContext,
): TeamCategoryTotals[] => {
  const tradedTeamIndexes = [
    afterState.perspectiveTeamIndex,
    tradePackage.counterpartyTeamIndex,
  ]

  return context.totalsByTeam.map((entry) => {
    if (!tradedTeamIndexes.includes(entry.teamIndex)) {
      return entry
    }

    const team = afterState.teams.find(
      ({ teamIndex }) => teamIndex === entry.teamIndex,
    )!

    return {
      teamIndex: entry.teamIndex,
      totals: teamTotals(rosterPlayers(team, context.playersById)),
    }
  })
}
```

Replace the body of `analyzeAfterTrade` with `return analyzeTeamTotals(totalsAfterTrade(afterState, tradePackage, context))`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/tradeAccept.test.ts tests/unit/tradeSimulate.test.ts`

Expected: PASS. The simulate file still asserts the old side impacts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/accept.ts src/lib/trade/simulate.ts tests/unit/tradeAccept.test.ts
git commit -m "feat(trade): accept offers from category totals"
```

---

### Task 4: Return the full sorted offer list

**Files:**
- Modify: `src/lib/trade/types.ts`
- Modify: `src/lib/trade/score.ts`
- Modify: `src/lib/trade/suggest.ts`
- Modify: `src/lib/trade/constants.ts`
- Modify: `tests/unit/tradeSuggest.test.ts`
- Modify: `tests/unit/tradeConstants.test.ts`
- Modify: `tests/api/tradeSuggestions.test.ts`
- Modify: `src/components/trade/DealDetail.tsx`, `WeakCategoriesPanel.tsx`, `SuggestionList.tsx`, `src/components/trade/TradeWorkspace.tsx`, and `tests/unit/TradeWorkspace.test.tsx` only enough to keep the current UI compiling against the new suggestion fields. Task 5 replaces the visible copy.

**Interfaces:**
- Consumes: `assessSide`, `leagueMeans`, `classifyTeam`, `matchedWeaks`, `enumeratePackages`, `passesShapeRules`, `applyTradePackage`, `totalsAfterTrade`, `createTradeAnalysisContext`, `analyzeTeamTotals`.
- Produces: `suggestTrades(state) => { suggestions: TradeSuggestion[]; youWeak: CategoryId[]; youStrong: CategoryId[] }`
- `TradeSuggestion` loses `you` and `them`. It gains `youGains`, `themGains`, `youWorsened`, `themWorsened`, `youStrengthsHeld`, `themStrengthsHeld`, and optional `valueGap`.
- `export const offerSortScore = (youSum: number, themSum: number) => number` in `score.ts`. `RESIDUAL_SCORE_OFFSET = 1_000_000`.
- `TRADE_PAGE_SIZE = 20` replaces `MAX_SUGGESTIONS`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/tradeSuggest.test.ts`:

```ts
it("returns the mirrored 1:1 and does not slice at 20", () => {
  const { suggestions, youWeak, youStrong } = suggestTrades(mirrorState)
  const suggestion = findSuggestion(suggestions, ["you-star"], ["them-star"])

  expect(youWeak).toContain("AST")
  expect(youStrong).toContain("REB")
  expect(suggestion).toBeDefined()
  expect(suggestion!.youGains.map((gain) => gain.categoryId)).toContain("AST")
  expect(suggestion!.themGains.map((gain) => gain.categoryId)).toContain("REB")
  expect(suggestion!.youWorsened).toEqual([])
  expect(suggestion!.valueGap).toBeLessThanOrEqual(0.25)
  expect(suggestion!.overpayRatio).toBeUndefined()
  expect(suggestions.length).toBeGreaterThan(20)
})
```

Replace `mirrorState` in that file so each side has five tradable stars and each filler team has five baseline players. Keep the ids `you-star` and `them-star`. Add `you-b` through `you-e` with the same projections as `you-star`, and `them-b` through `them-e` with the same projections as `them-star`. Add one IL player `you-il` with baseline projections and keep the IL assertion on `you-il`. Five against five is 25 even 1:1 packages of equal mirror value, which is the `length > 20` assertion. Do not use rank 9 or rank 4 as the thing this fixture proves.

Replace the old `you.needsScoreAfter` assertions in this file with:

- the 1:1 suggestion’s `youGains` includes `AST` and `themGains` includes `REB`
- the 2:1 suggestion is `you-star` plus `you-b` for `them-star`, and its `overpayRatio` is at least `OVERPAY_RATIO`
- `reasons[0]` contains the counterparty gain id
- `you` and `them` are not on the suggestion

Keep the `passesShapeRules` expectations that reject the star-state 2:1 and 2:2. Delete the `evaluateTrade` needs-score lines in those two tests. Rejection is still `findSuggestion(...)` being undefined plus `shapeCheck.ok === false`.

Add to `tests/unit/tradeConstants.test.ts` an assertion `expect(TRADE_PAGE_SIZE).toBe(20)` and remove `MAX_SUGGESTIONS`.

Add a unit test for the sort key in `tests/unit/tradeSuggest.test.ts`:

```ts
it("ranks a positive harmonic mean ahead of a residual sum", () => {
  expect(offerSortScore(2, 2)).toBe(2)
  expect(offerSortScore(4, -1)).toBeLessThan(0)
  expect(offerSortScore(2, 2)).toBeGreaterThan(offerSortScore(4, -1))
})
```

In `tests/api/tradeSuggestions.test.ts`, replace `youNeeds` and `youSurplus` with `youWeak` and `youStrong`. Keep `suggestions.length > 0`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/tradeSuggest.test.ts tests/unit/tradeConstants.test.ts tests/api/tradeSuggestions.test.ts`

Expected: FAIL on `youGains`, `offerSortScore`, or `youWeak`.

- [ ] **Step 3: Replace the suggestion builder**

In `src/lib/trade/types.ts`, replace `TradeSideImpact` use on the suggestion. Keep exporting `CategoryDelta` and `TradeSideImpact` because `evaluateTrade` and `src/lib/waivers/types.ts` still use `CategoryDelta`.

```ts
export type TradeSuggestion = {
  id: string
  shape: TradeShape
  counterpartyTeamIndex: number
  givePlayerIds: string[]
  getPlayerIds: string[]
  reasons: string[]
  mutualScore: number
  overpayRatio?: number
  valueGap?: number
  droppedPlayerId?: string
  youGains: CategoryTotalMove[]
  themGains: CategoryTotalMove[]
  youWorsened: CategoryTotalMove[]
  themWorsened: CategoryTotalMove[]
  youStrengthsHeld: CategoryId[]
  themStrengthsHeld: CategoryId[]
}
```

Import `CategoryTotalMove` from `./accept`.

In `src/lib/trade/score.ts`:

```ts
export const RESIDUAL_SCORE_OFFSET = 1_000_000

export const offerSortScore = (youSum: number, themSum: number) => {
  if (youSum > 0 && themSum > 0) {
    return (2 * youSum * themSum) / (youSum + themSum)
  }

  return youSum + themSum - RESIDUAL_SCORE_OFFSET
}
```

Leave `passesShapeRules` and `replacementScaledValues` as they are. `mutualScore` can stay in the file unused, or be deleted if nothing imports it after `suggest.ts` switches. Delete it if the import list no longer needs it.

Replace `suggestTrades` so that it:

1. Builds `createTradeAnalysisContext`, `leagueMeans(context.totalsByTeam)`, and `classifyTeam` for you.
2. Enumerates with `enumeratePackages(state)`.
3. Skips packages that fail `passesShapeRules`.
4. Applies `applyTradePackage`, then `totalsAfterTrade`, then `leagueMeans` on the after totals and `analyzeTeamTotals` on those totals.
5. Runs `assessSide` for you and for them. `matchedWeak` comes from `matchedWeaks`. `weak` and `strong` come from the pre-trade `classifyTeam` result.
6. Skips the package unless both assessments have `improved` and `strengthsIntact`. A non-empty `worsened` array does not skip the package. Assign `youWorsened` and `themWorsened` from those arrays.
7. Sets `mutualScore` to `offerSortScore` of the two z sums. Each z sum adds `zAfter - zBefore` for that side’s `gains` only. Read z from `context.before` and the after analysis.
8. Sets `valueGap` to the even-shape spread from `passesShapeRules`’s inputs (`|give - get| / max(give, get, ε)`). Omit `valueGap` when `overpayRatio` is present.
9. Sets `reasons[0]` to `Gains ${themGains category ids joined by ", "}`.
10. Sets `reasons[1]` to `balanced ${shape}` or `${shape} overpay`.
11. Sorts by `mutualScore` descending, then `id` ascending. Does not slice.
12. Returns `{ suggestions, youWeak: yourSides.weak, youStrong: yourSides.strong }`.

Widen `mirrorState` in the test to six tradable mirrored players per side so more than 20 packages pass. A 1:1 of equal mirror stars stays inside the value band, improves AST for you and REB for them, and keeps the other strength on the good side because each star is one of six and the ten filler teams sit in the middle.

Update the compiling UI in this same commit, before Task 5’s copy:

- `WeakCategoriesPanel` props become `weak` and `strong`. Labels stay `Improve` and `Can trade` until Task 5.
- `TradeWorkspace` reads `youWeak` and `youStrong`.
- `DealDetail` reads `youGains[0]` for a temporary before → after line so the existing “9 → 6” assertion is updated in the workspace test to the gain’s numbers formatted with one decimal. Use the Task 5 formatter if you write it now; otherwise render `${gain.before} → ${gain.after}` for the first `youGains` entry.
- `TradeWorkspace.test.tsx` mock payload uses `youWeak: ["AST", "STL"]`, `youStrong: ["PTS"]`, and suggestions with `youGains: [{ categoryId: "STL", before: 9, after: 6 }]`, empty worsened arrays, and `youStrengthsHeld: ["PTS"]`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/tradeSuggest.test.ts tests/unit/tradeConstants.test.ts tests/unit/tradeSimulate.test.ts tests/unit/TradeWorkspace.test.tsx tests/api/tradeSuggestions.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/types.ts src/lib/trade/score.ts src/lib/trade/suggest.ts src/lib/trade/constants.ts src/components/trade tests/unit/tradeSuggest.test.ts tests/unit/tradeConstants.test.ts tests/unit/TradeWorkspace.test.tsx tests/api/tradeSuggestions.test.ts
git commit -m "feat(trade): return every offer sorted by category gain"
```

---

### Task 5: Show the offer card and the next 20 rows

**Files:**
- Modify: `src/components/trade/WeakCategoriesPanel.tsx`
- Modify: `src/components/trade/SuggestionList.tsx`
- Modify: `src/components/trade/DealDetail.tsx`
- Modify: `src/lib/trade/offerCopy.ts` (create)
- Test: `tests/unit/tradeOfferCopy.test.ts`
- Test: `tests/unit/SuggestionList.test.tsx`
- Test: `tests/unit/DealDetail.test.tsx`
- Modify: `tests/unit/TradeWorkspace.test.tsx`

**Interfaces:**
- Consumes: `TradeSuggestion`, `TRADE_PAGE_SIZE`, `SeasonLeagueState`
- Produces:
  - `export const formatTotal = (categoryId: CategoryId, total: number) => string`
  - `export const formatValueLine = (suggestion: Pick<TradeSuggestion, "valueGap" | "overpayRatio"> & { giveLarger: boolean }) => string`
  - List button name `Show {n} more`
  - Panel labels `Below average` and `Above average`

- [ ] **Step 1: Write the failing tests**

`tests/unit/tradeOfferCopy.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { formatTotal, formatValueLine } from "@/lib/trade/offerCopy"

describe("offer copy", () => {
  it("formats percentages and counting totals", () => {
    expect(formatTotal("FG_PCT", 0.456)).toBe("45.6%")
    expect(formatTotal("AST", 12.34)).toBe("12.3")
  })

  it("names the larger even package and the overpay multiple", () => {
    expect(formatValueLine({ giveLarger: true, valueGap: 0.084 })).toBe(
      "Your package is larger by 8%",
    )
    expect(formatValueLine({ giveLarger: false, valueGap: 0.084 })).toBe(
      "Their package is larger by 8%",
    )
    expect(formatValueLine({ giveLarger: true, valueGap: 0.004 })).toBe(
      "Packages are even",
    )
    expect(formatValueLine({ giveLarger: true, overpayRatio: 1.236 })).toBe(
      "The two-player side is 1.24× the one-player side",
    )
  })
})
```

`tests/unit/SuggestionList.test.tsx` uses jsdom and Testing Library. Build 40 suggestions with ids `offer-0` through `offer-39`, distinct get-player names `Get 0` through `Get 39`, and one shared state. Render the list with `selectedId` `offer-0`.

- Expect 20 buttons whose names match `/trade/i`, and a button named `Show 20 more`.
- Fire that button. Expect a button for `Get 39` and no `Show 20 more`.
- Render 25 suggestions, press `Show 20 more`, and expect the next button’s accessible name to have been `Show 5 more` before the press. After the press, `onSelect` has not been called.

`tests/unit/DealDetail.test.tsx`:

- One suggestion: get `Their Center`, give `Your Guard`, counterparty team name `Rivals`.
- `themGains: [{ categoryId: "REB", before: 40, after: 55 }]`
- `themStrengthsHeld: ["AST"]`
- `valueGap: 0.08` and give value larger. The test can pass `giveLarger` through the rendered line `Your package is larger by 8%`.
- `themWorsened: [{ categoryId: "STL", before: 8, after: 6 }]`
- Expect text `REB`, `40.0 → 55.0`, `AST`, `Your package is larger by 8%`, and `STL`.
- A second render with empty `themWorsened` and empty `youWorsened` does not render `was already below average`.

Update `TradeWorkspace.test.tsx` so the section shows `Below average`, the selected card shows the value sentence instead of `9 → 6`, and selecting the second row still sets `aria-pressed`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/tradeOfferCopy.test.ts tests/unit/SuggestionList.test.tsx tests/unit/DealDetail.test.tsx tests/unit/TradeWorkspace.test.tsx`

Expected: FAIL on the missing module or the old labels.

- [ ] **Step 3: Write the copy, the pager, and the card**

`src/lib/trade/offerCopy.ts`:

```ts
import type { CategoryId } from "@/lib/domain/types"

export const formatTotal = (categoryId: CategoryId, total: number) =>
  categoryId === "FG_PCT" || categoryId === "FT_PCT"
    ? `${(total * 100).toFixed(1)}%`
    : total.toFixed(1)

export const formatValueLine = ({
  giveLarger,
  valueGap,
  overpayRatio,
}: {
  giveLarger: boolean
  valueGap?: number
  overpayRatio?: number
}) => {
  if (overpayRatio !== undefined) {
    return `The two-player side is ${overpayRatio.toFixed(2)}× the one-player side`
  }

  const gapPercent = Math.round((valueGap ?? 0) * 100)

  if (gapPercent === 0) {
    return "Packages are even"
  }

  return giveLarger
    ? `Your package is larger by ${gapPercent}%`
    : `Their package is larger by ${gapPercent}%`
}
```

`giveLarger` is true when the softplus sum of `givePlayerIds` is greater than the sum of `getPlayerIds`. `DealDetail` computes that from `replacementScaledValues(buildPlayerValueMap(state))` and does not trust a missing `valueGap` to imply direction. When `overpayRatio` is set, ignore `giveLarger`.

`SuggestionList` holds `visibleCount` state, initially `TRADE_PAGE_SIZE`. When the joined suggestion ids change, reset `visibleCount` to `TRADE_PAGE_SIZE` during render. Render `suggestions.slice(0, visibleCount)`. When `visibleCount < suggestions.length`, render a button after the list:

```tsx
const remaining = suggestions.length - visibleCount
const nextCount = Math.min(TRADE_PAGE_SIZE, remaining)

<button
  className="mt-3 inline-flex items-center gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
  onClick={() => setVisibleCount(visibleCount + nextCount)}
  type="button"
>
  <span aria-hidden="true">↓</span>
  Show {nextCount} more
</button>
```

The accessible name is the visible text `Show {n} more`.

`WeakCategoriesPanel` keeps the heading `Weak categories`. The two kicker labels become `Below average` and `Above average`. Props are `weak` and `strong`.

`DealDetail` renders, for the counterparty and then for you:

- a heading `What they get` / `What you get`
- each gain as `{categoryId} {formatTotal(before)} → {formatTotal(after)}`
- held strengths as a comma-separated line. Omit that line when the array is empty.
- `formatValueLine`
- each worsened move as `{categoryId} was already below average and moves from {before} to {after}` using `formatTotal`
- the dropped player sentence only when `droppedPlayerId` is set

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/tradeOfferCopy.test.ts tests/unit/SuggestionList.test.tsx tests/unit/DealDetail.test.tsx tests/unit/TradeWorkspace.test.tsx tests/unit/tradeSuggest.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/offerCopy.ts src/components/trade tests/unit/tradeOfferCopy.test.ts tests/unit/SuggestionList.test.tsx tests/unit/DealDetail.test.tsx tests/unit/TradeWorkspace.test.tsx
git commit -m "feat(trade): explain each offer and reveal the rest of the list"
```
