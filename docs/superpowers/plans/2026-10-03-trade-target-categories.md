# Targeted trade suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate fair trade suggestions only after the user picks categories and presses Generate trade suggestions, omitting Do Not Include players from the outgoing side.

**Architecture:** `suggestTrades` still applies the fair-offer rules. A new options argument drops excluded players before combinations, skips them when your side opens a roster spot, and keeps a package only when one requested category rises. The suggestions route returns roster context with an empty list until `categories` is present. The workspace holds the toggle and roster choices locally and requests that filtered list on the button click.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Testing Library.

## Global Constraints

- Nine category ids stay `FG_PCT`, `FT_PCT`, `TPM`, `REB`, `AST`, `STL`, `BLK`, `TO`, `PTS`. The short labels are `FG%`, `FT%`, `3PM`, `REB`, `AST`, `STL`, `BLK`, `TO`, `PTS`.
- A category rises when your post-trade total rises. `TO` rises only when your total falls.
- One rising selected category is enough. The category does not have to be a matched weak.
- Do Not Include players are omitted from `givePlayerIds` and from your roster-spot drop. The counterparty drop rule stays as it is.
- With no `categories` query parameter, or an empty one, `suggestions` is `[]` and packages are not enumerated.
- An unknown category id is HTTP 400. Repeated ids are ignored. An excluded id that is not your non-IL player is ignored.
- Fair-offer acceptance, value bands, sort, and `Show {n} more` stay. Waiver rank helpers stay untouched.
- Before the first completed generate, the list reads `Select a category, then generate trade suggestions.`
- A completed generate with no package reads `No mutually beneficial deals found under current rules.`
- The button label is `Generate trade suggestions`. While the request is in flight it reads `Generating trade suggestions…` and is disabled.
- Changing a toggle or a roster group does not send another request. The next click uses the choices at that moment.
- After a successful generate, select the first suggestion.

---

## File structure

- `src/lib/trade/enumerate.ts` — your combinations omit excluded ids. Opponents stay complete.
- `src/lib/trade/simulate.ts` — your asymmetric drop skips excluded ids and reports when the extra player cannot be placed.
- `src/lib/trade/accept.ts` — `categoriesMovedGood` for every category, not only matched weaks.
- `src/lib/trade/suggest.ts` — options, `youImproved`, target filter, short labels on `reasons[0]`.
- `src/lib/trade/suggestionQuery.ts` — parse `categories` and `excludedPlayerIds`.
- `src/lib/trade/types.ts` — `youImproved` and `SuggestTradesOptions`.
- `src/app/api/trade/suggestions/route.ts` — preview versus generate.
- `src/components/trade/CategoryTargetToggles.tsx` — nine `aria-pressed` toggles.
- `src/components/trade/RosterIncludeGroups.tsx` — `Include` and `Do Not Include`.
- `src/components/trade/TradeWorkspace.tsx` — preview load, generate click, remembered category set.
- `src/components/trade/WeakCategoriesPanel.tsx`, `DealDetail.tsx` — short labels and extra improved lines.

`suggestTrades(state)` with no options still returns every fair package. Existing unit tests depend on that. Only the route withholds enumeration.

---

### Task 1: Omit excluded players from your combinations

**Files:**
- Modify: `src/lib/trade/enumerate.ts`
- Test: `tests/unit/tradeEnumerate.test.ts`

**Interfaces:**
- Consumes: `enumeratePackages(state, totalsByTeam?)` as it exists today.
- Produces: `enumeratePackages(state, totalsByTeam?, excludedPlayerIds?: readonly string[])`. The third argument defaults to `[]`. Your `youPlayerIds` never contain an id from that list. Their combinations are unchanged.

- [ ] **Step 1: Write the failing test**

Add this test inside `describe("enumeratePackages")` in `tests/unit/tradeEnumerate.test.ts`. `state()` is already defined in that file.

```ts
it("omits an excluded player from your combinations only", () => {
  const packages = enumeratePackages(state(), undefined, ["scrub", "not-a-player"])
  const oneForOnes = packages.filter((tradePackage) => tradePackage.shape === "1:1")

  expect(oneForOnes.some((tradePackage) =>
    tradePackage.youPlayerIds.includes("scrub"),
  )).toBe(false)
  expect(oneForOnes.some((tradePackage) =>
    tradePackage.themPlayerIds.includes("them-0"),
  )).toBe(true)
  expect(oneForOnes).toHaveLength(5)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tradeEnumerate.test.ts`

Expected: FAIL. `enumeratePackages` does not accept a third argument, or `scrub` is still present.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/trade/enumerate.ts`, change the signature and filter your ids:

```ts
export const enumeratePackages = (
  state: SeasonLeagueState,
  totalsByTeam: TeamCategoryTotals[] = seasonTeamTotals(state),
  excludedPlayerIds: readonly string[] = [],
): TradePackage[] => {
  const yourTeam = state.teams.find(
    ({ teamIndex }) => teamIndex === state.perspectiveTeamIndex,
  )

  if (!yourTeam) {
    return []
  }

  const excluded = new Set(excludedPlayerIds)
  const yourSides = classifyTeam(totalsByTeam, state.perspectiveTeamIndex)
  const yourCombinations = combinations(
    tradablePlayerIds(yourTeam).filter((playerId) => !excluded.has(playerId)),
  )
```

Leave the rest of the function as it is. Do not filter `tradablePlayerIds(team)` for the opponent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tradeEnumerate.test.ts`

Expected: PASS, including the existing two tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/enumerate.ts tests/unit/tradeEnumerate.test.ts
git commit -m "feat(trade): omit excluded players from outgoing combinations"
```

---

### Task 2: Skip excluded players when you open a roster spot

**Files:**
- Modify: `src/lib/trade/simulate.ts` (`applyTradePackage`, `assignAsymmetricPlayers`, `findLowestValueIndex`)
- Test: `tests/unit/tradeSimulate.test.ts`

**Interfaces:**
- Consumes: `applyTradePackage(state, tradePackage, precomputedValues?)` and `TradeApplication`.
- Produces: `applyTradePackage(state, tradePackage, precomputedValues?, excludedPlayerIds?: readonly string[])`. `TradeApplication` gains `rejected?: boolean`. `rejected` is true only when your side receives the extra player, no empty slot can take them, and every legal drop is in `excludedPlayerIds`. Their drop path is called with an empty protected list.

- [ ] **Step 1: Write the failing test**

Append this describe to `tests/unit/tradeSimulate.test.ts`. It builds its own league so it does not depend on the ESPN fixture.

```ts
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonPlayer } from "@/lib/season/types"

const projectionBase: Record<CategoryId, number> = {
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

const rosterPlayer = (
  id: string,
  points: number,
): SeasonPlayer => ({
  id,
  name: id,
  projections: { ...projectionBase, PTS: points },
  shooting: { FGM: 5, FGA: 10, FTM: 8, FTA: 10 },
})

const twoTeamState = (yourPoints: number[]): SeasonLeagueState => {
  const yourPlayers = yourPoints.map((points, index) =>
    rosterPlayer(`you-${index}`, points))
  const theirPlayers = [
    rosterPlayer("them-0", 20),
    rosterPlayer("them-1", 20),
  ]
  const rosters = [yourPlayers, theirPlayers]

  return {
    name: "Drop exclusion",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: rosters.map((teamPlayers, teamIndex) => ({
      teamIndex,
      name: `Team ${teamIndex}`,
      entries: teamPlayers.map((player) => ({
        slot: "UTIL" as const,
        playerId: player.id,
      })),
    })),
    players: rosters.flat(),
    availablePlayerIds: [],
    waiverOrder: [0, 1],
    source: "manual",
  }
}

describe("applyTradePackage excluded drops", () => {
  const incoming: TradePackage = {
    shape: "1:2",
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-0"],
    themPlayerIds: ["them-0", "them-1"],
  }

  it("drops the next included player when the lowest is excluded", () => {
    const league = twoTeamState([18, 1, 12])
    const { droppedPlayerId, rejected } = applyTradePackage(
      league,
      incoming,
      undefined,
      ["you-1"],
    )

    expect(rejected).toBeUndefined()
    expect(droppedPlayerId).toBe("you-2")
  })

  it("rejects the package when every remaining player is excluded", () => {
    const league = twoTeamState([18, 1])
    const { rejected, droppedPlayerId } = applyTradePackage(
      league,
      incoming,
      undefined,
      ["you-1"],
    )

    expect(rejected).toBe(true)
    expect(droppedPlayerId).toBeUndefined()
  })
})
```

`you-1` has `PTS: 1`, so it is the lowest-value teammate. `you-2` is the next. The existing full-roster 2:1 test must stay green because that drop is on the counterparty.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tradeSimulate.test.ts`

Expected: FAIL. The fourth argument is ignored, so the drop is `you-1`, and the two-player roster does not set `rejected`.

- [ ] **Step 3: Write minimal implementation**

Change `findLowestValueIndex` to take protected ids:

```ts
const findLowestValueIndex = (
  entries: SeasonRosterEntry[],
  excludedIndexes: number[],
  values: Map<string, number>,
  protectedPlayerIds: ReadonlySet<string>,
): number => {
  let lowestIndex = -1
  let lowestValue = Number.POSITIVE_INFINITY

  entries.forEach((entry, index) => {
    if (
      excludedIndexes.includes(index)
      || !entry.playerId
      || protectedPlayerIds.has(entry.playerId)
    ) {
      return
    }

    const value = values.get(entry.playerId) ?? 0

    if (value < lowestValue) {
      lowestValue = value
      lowestIndex = index
    }
  })

  return lowestIndex
}
```

Change `assignAsymmetricPlayers` so the last argument is `protectedPlayerIds: readonly string[] = []`, and pass `new Set(protectedPlayerIds)` into `findLowestValueIndex`. When `dropIndex < 0` and `protectedPlayerIds.length > 0`, return `{ unplaceable: true }`. Otherwise keep today's return of the extra incoming id when nothing can be cut. Change the function's return to:

```ts
{ droppedPlayerId?: string, unplaceable: boolean }
```

The open-slot and one-player paths return `{ unplaceable: false }`. The successful drop path returns `{ droppedPlayerId, unplaceable: false }`.

On `TradeApplication`, add `rejected?: boolean`.

In `applyTradePackage`, add the fourth parameter `excludedPlayerIds: readonly string[] = []`. Call your side with that list and their side with `[]`:

```ts
const yourDrop = assignAsymmetricPlayers(
  yourTeam.entries,
  yourIndexes,
  tradePackage.themPlayerIds,
  values,
  excludedPlayerIds,
)
const theirDrop = assignAsymmetricPlayers(
  theirTeam.entries,
  theirIndexes,
  tradePackage.youPlayerIds,
  values,
)

if (yourDrop.unplaceable) {
  return { state: { ...state, teams }, rejected: true }
}

const droppedPlayerId = yourDrop.droppedPlayerId ?? theirDrop.droppedPlayerId

return {
  state: { ...state, teams },
  ...(droppedPlayerId ? { droppedPlayerId } : {}),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tradeSimulate.test.ts`

Expected: PASS, including the existing 2:1 drop test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/simulate.ts tests/unit/tradeSimulate.test.ts
git commit -m "feat(trade): skip excluded players when opening your roster spot"
```

---

### Task 3: Keep packages that raise a requested category

**Files:**
- Modify: `src/lib/trade/accept.ts`
- Modify: `src/lib/trade/suggest.ts`
- Modify: `src/lib/trade/types.ts`
- Modify: `tests/unit/tradeAccept.test.ts`
- Modify: `tests/unit/tradeSuggest.test.ts`
- Modify: `tests/unit/DealDetail.test.tsx`, `tests/unit/SuggestionList.test.tsx`, `tests/unit/TradeWorkspace.test.tsx` — add `youImproved: []` to each `TradeSuggestion` literal so the required field typechecks.

**Interfaces:**
- Consumes: `enumeratePackages(..., excludedPlayerIds?)` and `applyTradePackage(..., excludedPlayerIds?)` with `rejected`.
- Produces:

```ts
export type SuggestTradesOptions = {
  targetCategoryIds?: readonly CategoryId[]
  excludedPlayerIds?: readonly string[]
}

export const categoriesMovedGood: (
  before: CategoryTotalMap,
  after: CategoryTotalMap,
) => CategoryTotalMove[]

export const suggestTrades: (
  state: SeasonLeagueState,
  options?: SuggestTradesOptions,
) => {
  suggestions: TradeSuggestion[]
  youWeak: CategoryId[]
  youStrong: CategoryId[]
}
```

`TradeSuggestion.youImproved` is `{ categoryId, before, after }[]`. `youGains` stays the matched-weak subset. When `targetCategoryIds` is omitted, no target filter runs. When it is present, a package is kept only if `youImproved` shares one of those ids.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/tradeAccept.test.ts`:

```ts
import { categoriesMovedGood } from "@/lib/trade/accept"

it("counts a risen total and a fallen turnover", () => {
  const before = {
    FG_PCT: 0.45,
    FT_PCT: 0.8,
    TPM: 2,
    REB: 8,
    AST: 4,
    STL: 1,
    BLK: 1,
    TO: 4,
    PTS: 18,
  }
  const after = { ...before, AST: 6, TO: 3, PTS: 16, TPM: 2 }

  expect(categoriesMovedGood(before, after).map((move) => move.categoryId))
    .toEqual(["AST", "TO"])
})
```

Add inside `describe("suggestTrades")` in `tests/unit/tradeSuggest.test.ts`. `createPlayer`, `buildLeague`, and `findSuggestion` are already in that file.

```ts
it("returns a package when the requested category rises outside the matched weaks", () => {
  const league = buildLeague(
    [
      createPlayer("you-star", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
      createPlayer("you-b", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
      createPlayer("you-c", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
      createPlayer("you-d", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
      createPlayer("you-e", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
    ],
    [
      createPlayer("them-star", { REB: 2, AST: 16, PTS: 24, TPM: 0 }),
      createPlayer("them-b", { REB: 2, AST: 16, PTS: 10, TPM: 0 }),
      createPlayer("them-c", { REB: 2, AST: 16, PTS: 10, TPM: 0 }),
      createPlayer("them-d", { REB: 2, AST: 16, PTS: 10, TPM: 0 }),
      createPlayer("them-e", { REB: 2, AST: 16, PTS: 10, TPM: 0 }),
    ],
    [],
    6,
  )
  const { suggestions } = suggestTrades(league, { targetCategoryIds: ["PTS"] })
  const suggestion = findSuggestion(suggestions, ["you-star"], ["them-star"])

  expect(suggestion).toBeDefined()
  expect(suggestion!.youGains.map((gain) => gain.categoryId)).not.toContain("PTS")
  expect(suggestion!.youImproved.map((move) => move.categoryId)).toContain("PTS")
  expect(suggestion!.reasons[0]).toContain("3PM")
  expect(suggestion!.reasons[0]).not.toContain("TPM")
})

it("omits a package that raises none of the requested categories", () => {
  const { suggestions } = suggestTrades(mirrorState, {
    targetCategoryIds: ["TPM"],
  })

  expect(
    findSuggestion(suggestions, ["you-star"], ["them-star"]),
  ).toBeUndefined()
})

it("omits a package that would send an excluded player", () => {
  const { suggestions } = suggestTrades(mirrorState, {
    targetCategoryIds: ["AST"],
    excludedPlayerIds: ["you-star"],
  })

  expect(
    suggestions.some((suggestion) =>
      suggestion.givePlayerIds.includes("you-star")),
  ).toBe(false)
})
```

In the existing test `"accepts a 2:1 with overpay and mutual category gains"`, replace:

```ts
expect(suggestion!.reasons[0]).toContain(suggestion!.themGains[0].categoryId)
```

with:

```ts
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"

expect(suggestion!.reasons[0]).toContain(
  CATEGORY_SHORT_LABELS[suggestion!.themGains[0].categoryId],
)
```

Also, when `application.rejected` is true, `suggestTrades` must not return that package. Cover it by the excluded-player test above only if a 1:2 would otherwise pass. Do not add a second fixture for that path in this task. Task 2 already locks `rejected`. This task only has to honor the flag.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tradeAccept.test.ts tests/unit/tradeSuggest.test.ts`

Expected: FAIL. `categoriesMovedGood` is missing, and `suggestTrades` ignores the options object.

- [ ] **Step 3: Write minimal implementation**

Export this from `src/lib/trade/accept.ts` and use it inside `assessSide` in place of the private `movedGood`:

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"

export const categoryMovedGood = (
  categoryId: CategoryId,
  before: number,
  after: number,
) => (categoryId === "TO" ? after < before : after > before)

export const categoriesMovedGood = (
  before: CategoryTotalMap,
  after: CategoryTotalMap,
): CategoryTotalMove[] =>
  ALL_CATEGORY_IDS.filter((categoryId) =>
    categoryMovedGood(categoryId, before[categoryId], after[categoryId]),
  ).map((categoryId) => ({
    categoryId,
    before: before[categoryId],
    after: after[categoryId],
  }))
```

Add to `TradeSuggestion` in `src/lib/trade/types.ts`:

```ts
youImproved: CategoryTotalMove[]
```

Add the options type in the same file:

```ts
export type SuggestTradesOptions = {
  targetCategoryIds?: readonly CategoryId[]
  excludedPlayerIds?: readonly string[]
}
```

`CategoryId` is already imported there. `CategoryTotalMove` is already imported there.

Change `suggestTrades` to:

```ts
export const suggestTrades = (
  state: SeasonLeagueState,
  options: SuggestTradesOptions = {},
) => {
```

Pass `options.excludedPlayerIds ?? []` as the third argument to `enumeratePackages` and the fourth argument to `applyTradePackage`.

After the existing strength checks, add:

```ts
if (application.rejected) {
  return []
}

const youImproved = categoriesMovedGood(
  totalsFor(context.totalsByTeam, state.perspectiveTeamIndex),
  totalsFor(afterTotals, state.perspectiveTeamIndex),
)
const targetCategoryIds = options.targetCategoryIds ?? []

if (
  targetCategoryIds.length > 0
  && !youImproved.some((move) => targetCategoryIds.includes(move.categoryId))
) {
  return []
}
```

Set `youImproved` on the returned suggestion. Build `reasons[0]` with short labels:

```ts
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"

`Gains ${themAssessment.gains
  .map(({ categoryId }) => CATEGORY_SHORT_LABELS[categoryId])
  .join(", ")}`
```

Add `youImproved: []` to every object that is typed as `TradeSuggestion` in:

- `tests/unit/DealDetail.test.tsx`
- `tests/unit/SuggestionList.test.tsx`
- `tests/unit/TradeWorkspace.test.tsx`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tradeAccept.test.ts tests/unit/tradeSuggest.test.ts tests/unit/DealDetail.test.tsx tests/unit/SuggestionList.test.tsx tests/unit/TradeWorkspace.test.tsx`

Expected: PASS.

If the PTS case is also a matched weak, the roster totals are wrong. Fillers use the base `PTS: 18`. Your five players are at 20, so your PTS total is above a league whose other non-target teams sit at 18 and whose target teammates sit at 10. `PTS` must stay out of `youGains`. Do not weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/accept.ts src/lib/trade/suggest.ts src/lib/trade/types.ts tests/unit/tradeAccept.test.ts tests/unit/tradeSuggest.test.ts tests/unit/DealDetail.test.tsx tests/unit/SuggestionList.test.tsx tests/unit/TradeWorkspace.test.tsx
git commit -m "feat(trade): filter offers by categories that rise"
```

---

### Task 4: Preview the league, then generate from the query

**Files:**
- Create: `src/lib/trade/suggestionQuery.ts`
- Create: `tests/unit/suggestionQuery.test.ts`
- Modify: `src/app/api/trade/suggestions/route.ts`
- Modify: `tests/api/tradeSuggestions.test.ts`

**Interfaces:**
- Consumes: `suggestTrades(state, options)`, `createTradeAnalysisContext`, `classifyTeam`.
- Produces:

```ts
export type SuggestionQuery =
  | { mode: "preview" }
  | { mode: "invalid" }
  | {
      mode: "generate"
      targetCategoryIds: CategoryId[]
      excludedPlayerIds: string[]
    }

export const parseSuggestionQuery: (url: URL) => SuggestionQuery
```

Missing or blank `categories` is `preview`. An unknown category id is `invalid`. Otherwise ids are de-duplicated in first-seen order. `excludedPlayerIds` splits on commas, trims, and drops empty pieces. Repeats stay; enumerate treats them as a set.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/suggestionQuery.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { parseSuggestionQuery } from "@/lib/trade/suggestionQuery"

describe("parseSuggestionQuery", () => {
  it("previews when categories is missing or blank", () => {
    expect(parseSuggestionQuery(new URL("http://localhost/api/trade/suggestions?seasonLeagueId=1")))
      .toEqual({ mode: "preview" })
    expect(parseSuggestionQuery(new URL("http://localhost/api/trade/suggestions?seasonLeagueId=1&categories=")))
      .toEqual({ mode: "preview" })
  })

  it("rejects an unknown category and keeps the first copy of a repeat", () => {
    expect(parseSuggestionQuery(new URL("http://localhost/api/trade/suggestions?categories=DD")))
      .toEqual({ mode: "invalid" })
    expect(parseSuggestionQuery(new URL("http://localhost/api/trade/suggestions?categories=PTS,PTS,AST&excludedPlayerIds=a,,b")))
      .toEqual({
        mode: "generate",
        targetCategoryIds: ["PTS", "AST"],
        excludedPlayerIds: ["a", "b"],
      })
  })
})
```

In `tests/api/tradeSuggestions.test.ts`, change `"returns computed suggestions for a manual season league"` so the no-`categories` response expects `suggestions` to equal `[]`. Add:

```ts
it("returns 400 for an unknown category", async () => {
  const createResponse = await createSeasonLeague(
    new Request("http://localhost/api/season-leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Trade suggestions league",
        manual: true,
      }),
    }),
  )
  const league = await createResponse.json()
  const response = await GET(
    new Request(
      `http://localhost/api/trade/suggestions?seasonLeagueId=${league.id}&categories=DD`,
    ),
  )

  expect(response.status).toBe(400)
})

it("returns suggestions that rise one of the requested categories", async () => {
  const createResponse = await createSeasonLeague(
    new Request("http://localhost/api/season-leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Trade suggestions league",
        manual: true,
      }),
    }),
  )
  const league = await createResponse.json()
  const categories = "FG_PCT,FT_PCT,TPM,REB,AST,STL,BLK,TO,PTS"
  const response = await GET(
    new Request(
      `http://localhost/api/trade/suggestions?seasonLeagueId=${league.id}&categories=${categories}`,
    ),
  )
  const payload = await response.json()

  expect(response.status).toBe(200)
  expect(payload.suggestions.length).toBeGreaterThan(0)
  for (const suggestion of payload.suggestions) {
    expect(suggestion.youImproved.length).toBeGreaterThan(0)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/suggestionQuery.test.ts tests/api/tradeSuggestions.test.ts`

Expected: FAIL. The parser module is missing, and the preview response still has a non-empty `suggestions` array.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/trade/suggestionQuery.ts`:

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"

export type SuggestionQuery =
  | { mode: "preview" }
  | { mode: "invalid" }
  | {
      mode: "generate"
      targetCategoryIds: CategoryId[]
      excludedPlayerIds: string[]
    }

const splitList = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)

export const parseSuggestionQuery = (url: URL): SuggestionQuery => {
  const categories = splitList(url.searchParams.get("categories"))

  if (!categories.length) {
    return { mode: "preview" }
  }

  if (categories.some((categoryId) =>
    !ALL_CATEGORY_IDS.includes(categoryId as CategoryId))) {
    return { mode: "invalid" }
  }

  return {
    mode: "generate",
    targetCategoryIds: [...new Set(categories)] as CategoryId[],
    excludedPlayerIds: splitList(url.searchParams.get("excludedPlayerIds")),
  }
}
```

In `src/app/api/trade/suggestions/route.ts`, after `effectiveState` is built:

```ts
import { classifyTeam } from "@/lib/trade/classify"
import { parseSuggestionQuery } from "@/lib/trade/suggestionQuery"
import { createTradeAnalysisContext } from "@/lib/trade/simulate"
import { suggestTrades } from "@/lib/trade/suggest"

const query = parseSuggestionQuery(new URL(request.url))

if (query.mode === "invalid") {
  return NextResponse.json({ error: "validation" }, { status: 400 })
}

if (query.mode === "preview") {
  const context = createTradeAnalysisContext(effectiveState)
  const sides = classifyTeam(
    context.totalsByTeam,
    effectiveState.perspectiveTeamIndex,
  )

  return NextResponse.json({
    suggestions: [],
    youWeak: sides.weak,
    youStrong: sides.strong,
    analysisPerspectiveTeamIndex: effectiveState.perspectiveTeamIndex,
    state: effectiveState,
  })
}

const result = suggestTrades(effectiveState, {
  targetCategoryIds: query.targetCategoryIds,
  excludedPlayerIds: query.excludedPlayerIds,
})

return NextResponse.json({
  ...result,
  analysisPerspectiveTeamIndex: effectiveState.perspectiveTeamIndex,
  state: effectiveState,
})
```

Delete the old unconditional `suggestTrades(effectiveState)` call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/suggestionQuery.test.ts tests/api/tradeSuggestions.test.ts`

Expected: PASS. The manual-league generate test is the same non-empty set as today's unfiltered run, because every fair package improves at least one category and all nine ids are requested.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/suggestionQuery.ts tests/unit/suggestionQuery.test.ts src/app/api/trade/suggestions/route.ts tests/api/tradeSuggestions.test.ts
git commit -m "feat(trade): generate suggestions only when categories are requested"
```

---

### Task 5: Show short labels and the extra improved category

**Files:**
- Modify: `src/components/trade/WeakCategoriesPanel.tsx`
- Modify: `src/components/trade/DealDetail.tsx`
- Test: `tests/unit/DealDetail.test.tsx`

**Interfaces:**
- Consumes: `CATEGORY_SHORT_LABELS` from `src/lib/season/formatCategoryStat.ts` and `suggestion.youImproved`.
- Produces: `DealDetail` accepts `requestedCategoryIds: CategoryId[]`. After the existing "What you get" gains, it renders each `youImproved` row whose id is in `requestedCategoryIds` and is not already in `youGains`, using the short label and `formatTotal` before → after. Summary pills and every category name in the card use the short label.

- [ ] **Step 1: Write the failing test**

In `tests/unit/DealDetail.test.tsx`, add a suggestion whose `youGains` is AST and whose `youImproved` also contains TPM. Render:

```tsx
render(
  <DealDetail
    requestedCategoryIds={["TPM"]}
    state={state}
    suggestion={{
      ...suggestion,
      youGains: [{ categoryId: "AST", before: 10, after: 12 }],
      youImproved: [
        { categoryId: "AST", before: 10, after: 12 },
        { categoryId: "TPM", before: 1, after: 2 },
      ],
    }}
  />,
)

expect(screen.getByText("3PM")).toBeInTheDocument()
expect(screen.queryByText("TPM")).toBeNull()
expect(screen.getByText("1.0 → 2.0")).toBeInTheDocument()
```

Use the file's existing `suggestion` and `state` constants. `before: 1` formats as `1.0` through `formatTotal`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/DealDetail.test.tsx`

Expected: FAIL. `DealDetail` does not accept `requestedCategoryIds`, and the screen shows `TPM`.

- [ ] **Step 3: Write minimal implementation**

In `WeakCategoriesPanel.tsx`, render `CATEGORY_SHORT_LABELS[categoryId]` instead of `categoryId`.

In `DealDetail.tsx`, add `requestedCategoryIds: CategoryId[]` to the props. Display `CATEGORY_SHORT_LABELS[gain.categoryId]` in `SideGains`, the same for worsened lines, and map `strengthsHeld` through `CATEGORY_SHORT_LABELS` before `join(", ")`.

Under "What you get", render the extra rows:

```tsx
const extraGains = suggestion.youImproved.filter((move) =>
  requestedCategoryIds.includes(move.categoryId)
  && !suggestion.youGains.some((gain) => gain.categoryId === move.categoryId),
)
```

Use the same row markup as `SideGains`. Pass `requestedCategoryIds={[]}` from `TradeWorkspace.tsx` for now so the current call still typechecks. Task 6 replaces that with the set from the click.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/DealDetail.test.tsx tests/unit/TradeWorkspace.test.tsx`

Expected: PASS. Existing AST / REB / STL text still matches those short labels.

- [ ] **Step 5: Commit**

```bash
git add src/components/trade/WeakCategoriesPanel.tsx src/components/trade/DealDetail.tsx src/components/trade/TradeWorkspace.tsx tests/unit/DealDetail.test.tsx
git commit -m "feat(trade): label categories with 3PM and show extra gains"
```

---

### Task 6: Generate from the category toggles and roster groups

**Files:**
- Create: `src/components/trade/CategoryTargetToggles.tsx`
- Create: `src/components/trade/RosterIncludeGroups.tsx`
- Modify: `src/components/trade/TradeWorkspace.tsx`
- Modify: `tests/unit/TradeWorkspace.test.tsx`

**Interfaces:**
- Consumes: preview `GET` without `categories`, generate `GET` with `categories` and `excludedPlayerIds`, `DealDetail` `requestedCategoryIds`.
- Produces:
  - `CategoryTargetToggles` props: `selectedIds: CategoryId[]`, `onToggle: (categoryId: CategoryId) => void`.
  - `RosterIncludeGroups` props: `state: SeasonLeagueState`, `excludedIds: string[]`, `onExclude: (playerId: string) => void`, `onInclude: (playerId: string) => void`.
  - Workspace state: selected category ids start empty, excluded ids start empty, suggestions stay empty until a generate response, and `requestedCategoryIds` is the set sent by the last successful click.

- [ ] **Step 1: Write the failing test**

Replace the fetch stub and the existing workspace test in `tests/unit/TradeWorkspace.test.tsx`. The preview URL returns `suggestions: []` plus the roster state. The generate URL returns the two suggestions. Put `TPM` on `youWeak`. Add `youImproved` to both suggestion fixtures. Set the first suggestion's `reasons[0]` to `Gains 3PM` and add a `youImproved` TPM row that is not in `youGains`.

```ts
const previewUrl = "/api/trade/suggestions?seasonLeagueId=season-1"
const generateUrl = "/api/trade/suggestions?seasonLeagueId=season-1&categories=TPM&excludedPlayerIds="
const excludedUrl = "/api/trade/suggestions?seasonLeagueId=season-1&categories=TPM&excludedPlayerIds=give-1"
const generatedBody = {
  suggestions,
  youWeak: ["AST", "TPM"],
  youStrong: ["PTS"],
  analysisPerspectiveTeamIndex: 0,
  state,
}

vi.stubGlobal("fetch", vi.fn(async (input) => {
  const url = String(input)

  if (url === previewUrl) {
    return new Response(JSON.stringify({
      ...generatedBody,
      suggestions: [],
    }), { status: 200 })
  }

  if (url === generateUrl || url === excludedUrl) {
    return new Response(JSON.stringify(generatedBody), { status: 200 })
  }

  return new Response("missing", { status: 404 })
}))
```

```ts
it("generates after a category is selected and keeps the list until the next click", async () => {
  render(<TradeWorkspace leagueId="season-1" />)

  expect(await screen.findByText(
    "Select a category, then generate trade suggestions.",
  )).toBeInTheDocument()
  const weakSection = screen.getByRole("heading", { name: "Weak categories" }).closest("section")!
  expect(within(weakSection).getByText("3PM")).toBeInTheDocument()
  expect(within(weakSection).queryByText("TPM")).toBeNull()

  const generate = screen.getByRole("button", { name: "Generate trade suggestions" })
  expect(generate).toBeDisabled()

  fireEvent.click(screen.getByRole("button", { name: "3PM" }))
  expect(generate).toBeEnabled()
  fireEvent.click(generate)

  expect(await screen.findByRole("button", {
    name: /trade your guard for their center/i,
  })).toBeInTheDocument()
  expect(screen.getByText("Gains 3PM")).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Their Center" })).toBeInTheDocument()
  expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toContain(generateUrl)

  const callsBefore = vi.mocked(fetch).mock.calls.length
  fireEvent.click(screen.getByRole("button", { name: "AST" }))
  expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore)
})

it("sends Do Not Include ids on the next generate", async () => {
  render(<TradeWorkspace leagueId="season-1" />)
  await screen.findByText("Select a category, then generate trade suggestions.")

  fireEvent.click(screen.getByRole("button", { name: "3PM" }))
  fireEvent.click(screen.getByRole("button", { name: "Do Not Include" }))
  fireEvent.click(screen.getByRole("button", { name: "Generate trade suggestions" }))

  await screen.findByRole("heading", { name: "Their Center" })
  expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toContain(
    "/api/trade/suggestions?seasonLeagueId=season-1&categories=TPM&excludedPlayerIds=give-1",
  )
})
```

The roster fixture has one non-IL player, `give-1` / `Your Guard`, so there is one `Do Not Include` control. `excludedUrl` is already in the stub above.

```ts
it("keeps the current list when generate fails", async () => {
  render(<TradeWorkspace leagueId="season-1" />)
  await screen.findByText("Select a category, then generate trade suggestions.")
  fireEvent.click(screen.getByRole("button", { name: "3PM" }))
  fireEvent.click(screen.getByRole("button", { name: "Generate trade suggestions" }))
  expect(await screen.findByRole("heading", { name: "Their Center" })).toBeInTheDocument()

  vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { status: 500 }))
  fireEvent.click(screen.getByRole("button", { name: "Generate trade suggestions" }))

  expect(await screen.findByText("Unable to load trade suggestions")).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Their Center" })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/TradeWorkspace.test.tsx`

Expected: FAIL. The workspace still renders suggestions on load and has no generate button.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/trade/CategoryTargetToggles.tsx`:

```tsx
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"

type CategoryTargetTogglesProps = {
  selectedIds: CategoryId[]
  onToggle: (categoryId: CategoryId) => void
}

export const CategoryTargetToggles = ({
  selectedIds,
  onToggle,
}: CategoryTargetTogglesProps) => (
  <section className="mt-8">
    <h2 className="text-lg font-semibold">Categories to add</h2>
    <div className="mt-3 flex flex-wrap gap-2">
      {ALL_CATEGORY_IDS.map((categoryId) => {
        const selected = selectedIds.includes(categoryId)

        return (
          <button
            aria-pressed={selected}
            className={
              selected
                ? "rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-[var(--color-hairline)] bg-white px-3 py-1.5 text-sm font-medium"
            }
            key={categoryId}
            onClick={() => onToggle(categoryId)}
            type="button"
          >
            {CATEGORY_SHORT_LABELS[categoryId]}
          </button>
        )
      })}
    </div>
  </section>
)
```

Create `src/components/trade/RosterIncludeGroups.tsx`:

```tsx
import type { SeasonLeagueState } from "@/lib/season/types"

type RosterIncludeGroupsProps = {
  state: SeasonLeagueState
  excludedIds: string[]
  onExclude: (playerId: string) => void
  onInclude: (playerId: string) => void
}

const playerName = (state: SeasonLeagueState, playerId: string) =>
  state.players.find((player) => player.id === playerId)?.name ?? "Unknown player"

export const RosterIncludeGroups = ({
  state,
  excludedIds,
  onExclude,
  onInclude,
}: RosterIncludeGroupsProps) => {
  const excluded = new Set(excludedIds)
  const playerIds = state.teams
    .find((team) => team.teamIndex === state.perspectiveTeamIndex)
    ?.entries.flatMap((entry) =>
      entry.slot === "IL" || !entry.playerId ? [] : [entry.playerId]) ?? []
  const includedIds = playerIds.filter((playerId) => !excluded.has(playerId))
  const excludedPlayerIds = playerIds.filter((playerId) => excluded.has(playerId))

  const renderGroup = (
    title: "Include" | "Do Not Include",
    ids: string[],
    actionLabel: "Do Not Include" | "Include",
    onAction: (playerId: string) => void,
  ) => (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-2">
        {ids.map((playerId) => (
          <li className="flex items-center justify-between gap-3 text-sm" key={playerId}>
            <span>{playerName(state, playerId)}</span>
            <button
              className="rounded-full border border-[var(--color-hairline)] px-3 py-1"
              onClick={() => onAction(playerId)}
              type="button"
            >
              {actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Your roster</h2>
      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        {renderGroup("Include", includedIds, "Do Not Include", onExclude)}
        {renderGroup("Do Not Include", excludedPlayerIds, "Include", onInclude)}
      </div>
    </section>
  )
}
```

In `TradeWorkspace.tsx`:

- Keep the current load effect, but it only stores preview data and does not select a suggestion. The preview response has `suggestions: []`.
- Add `selectedIds`, `excludedIds`, `generatedSuggestions`, `requestedCategoryIds`, and `isGenerating` state.
- Render `WeakCategoriesPanel`, then `CategoryTargetToggles`, then `RosterIncludeGroups`, then the generate button, then the list.
- The list source is `generatedSuggestions`, which starts as `[]`.
- Before `generatedSuggestions` has been loaded at least once, show `Select a category, then generate trade suggestions.` Track that with `hasGenerated` starting `false`.
- The button is disabled when `selectedIds.length === 0` or `isGenerating`. Its text is `Generating trade suggestions…` while `isGenerating`, otherwise `Generate trade suggestions`.
- `handleGenerate` builds:

```ts
const categories = ALL_CATEGORY_IDS.filter((categoryId) =>
  selectedIds.includes(categoryId))
const params = new URLSearchParams({
  seasonLeagueId: leagueId,
  categories: categories.join(","),
  excludedPlayerIds: excludedIds.join(","),
})
```

Fetch `/api/trade/suggestions?${params}`. On success, set `generatedSuggestions`, `requestedCategoryIds` to `categories`, `hasGenerated` true, and `selectedId` to the first suggestion id or `null`. On failure, leave `generatedSuggestions` as they were and set `error` to `Unable to load trade suggestions`. Render that string above the list whenever `error` is set, including after a successful preview. Clear `isGenerating` in `finally`.

- Pass `requestedCategoryIds` into `DealDetail`.
- When `hasGenerated` is true and the list is empty, `SuggestionList` already shows `No mutually beneficial deals found under current rules.` Use that. Do not show the select-a-category sentence after a completed empty generate.
- Toggles and roster buttons only update local state.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/TradeWorkspace.test.tsx tests/unit/DealDetail.test.tsx tests/unit/SuggestionList.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/trade/CategoryTargetToggles.tsx src/components/trade/RosterIncludeGroups.tsx src/components/trade/TradeWorkspace.tsx tests/unit/TradeWorkspace.test.tsx
git commit -m "feat(trade): generate suggestions from selected categories and roster"
```
