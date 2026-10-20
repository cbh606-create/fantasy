# Chase Three Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When three or more in-range losses are still required to reach five category wins, chase those three highest-winProb losses instead of stopping at two.

**Architecture:** `chaseCategoryIds` already marks the losses that complete five wins and sorts them ahead of closer leads. This plan only raises the returned-list cap from 2 to 3 when that path has at least three categories. `streamingChaseNote` must keep all three ids and report no pair penalty. Acquisition order in `pickBestStreamerMove` stays as it is, so three ids are already equal weight.

**Tech Stack:** TypeScript, Vitest, existing matchup board types.

## Global Constraints

- Week target is five category wins. `flipsNeeded` is `max(0, 5 - wins)`.
- A win is any board row with outcome `W` that is not punted, including a blowout. Ties are not wins.
- Candidates stay contested, `winProb` below `0.7`, and not punted.
- Path size 0, 1, or 2 keeps cap 2, including the spare closer-lead slot.
- Path size 3 or more returns the three highest-`winProb` path losses. Do not chase a fourth. Do not replace one of them with a lead.
- If only two losses are in range, path size is 2 and the cap stays 2.
- Chase tiebreak sums one delta per chase category. No extra coefficient. No nested tiebreak.
- Negative-correlation penalty applies only when the chase list length is 2.
- A chase note whose length is not 2 returns every id, `r: null`, and `penalty: 0`. Do not invent a correlation of 0.
- Do not change punt thresholds, the contested band, or `pickBestStreamerMove` sort order.
- Do not set git config. If a commit fails because author identity is missing, stop and report that. Leave the code changes in place.
- Match each file's existing style. `streamingDropExplain.ts` and `chasePair.ts` have no semicolons. The test files use semicolons.

---

## File structure

- Modify `src/lib/matchup/streamingDropExplain.ts` — cap inside `chaseCategoryIds` only.
- Modify `src/lib/matchup/chasePair.ts` — `streamingChaseNote` returns the full list unless length is exactly 2.
- Test `tests/unit/streamingDropExplain.test.ts` — cap 3, cap 2 when fewer than three losses are in range.
- Test `tests/unit/chasePairPenalty.test.ts` — three-id note has no penalty.
- Do not modify `src/lib/matchup/streamerMove.ts` or `src/components/matchup/StreamingPlansPanel.tsx`. The ranker already sums every chase id and applies the penalty only at length 2. The panel formatter already prints a null `r` as a dash and the penalty as `0.000`.

### Task 1: Raise the chase cap to three

**Files:**
- Modify: `src/lib/matchup/streamingDropExplain.ts` (`chaseCategoryIds`, the `.slice(0, 2)` call)
- Test: `tests/unit/streamingDropExplain.test.ts`

**Interfaces:**
- Consumes: `chaseCategoryIds(board: MatchupBoard, puntCategoryIds?: ReadonlySet<CategoryId>): CategoryId[]`
- Produces: the same function. When `pathIds.size >= 3` it returns 3 ids. Otherwise it returns at most 2.

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the `streamingDropExplain` describe, after `uses the spare chase slot on the closer lead once one flip reaches 5`.

```ts
it("chases three in-range losses when two wins leave three flips to reach five", () => {
  const board: MatchupBoard = {
    categories: ALL_CATEGORY_IDS.map((categoryId) => {
      if (categoryId === "FG_PCT") {
        return { categoryId, you: 10, opp: 9, outcome: "W" as const, winProb: 0.54 }
      }
      if (categoryId === "AST") {
        return { categoryId, you: 10, opp: 8, outcome: "W" as const, winProb: 0.8 }
      }
      if (categoryId === "REB") {
        return { categoryId, you: 9, opp: 10, outcome: "L" as const, winProb: 0.47 }
      }
      if (categoryId === "STL") {
        return { categoryId, you: 4, opp: 5, outcome: "L" as const, winProb: 0.43 }
      }
      if (categoryId === "FT_PCT") {
        return { categoryId, you: 0.7, opp: 0.8, outcome: "L" as const, winProb: 0.4 }
      }
      return { categoryId, you: 1, opp: 10, outcome: "L" as const, winProb: 0.1 }
    }),
    wins: 2,
    losses: 7,
    ties: 0,
    projectedCatWins: 2,
  }
  expect(chaseCategoryIds(board)).toEqual(["REB", "STL", "FT_PCT"])
})

it("chases only the three closest losses when four flips are required", () => {
  const board: MatchupBoard = {
    categories: ALL_CATEGORY_IDS.map((categoryId) => {
      if (categoryId === "FG_PCT") {
        return { categoryId, you: 10, opp: 9, outcome: "W" as const, winProb: 0.54 }
      }
      if (categoryId === "REB") {
        return { categoryId, you: 9, opp: 10, outcome: "L" as const, winProb: 0.47 }
      }
      if (categoryId === "STL") {
        return { categoryId, you: 4, opp: 5, outcome: "L" as const, winProb: 0.43 }
      }
      if (categoryId === "FT_PCT") {
        return { categoryId, you: 0.7, opp: 0.8, outcome: "L" as const, winProb: 0.4 }
      }
      if (categoryId === "TPM") {
        return { categoryId, you: 3, opp: 6, outcome: "L" as const, winProb: 0.36 }
      }
      return { categoryId, you: 1, opp: 10, outcome: "L" as const, winProb: 0.1 }
    }),
    wins: 1,
    losses: 8,
    ties: 0,
    projectedCatWins: 1,
  }
  expect(chaseCategoryIds(board)).toEqual(["REB", "STL", "FT_PCT"])
})

it("stays at two when only two losses are inside the chase range", () => {
  const board: MatchupBoard = {
    categories: ALL_CATEGORY_IDS.map((categoryId) => {
      if (categoryId === "FG_PCT") {
        return { categoryId, you: 10, opp: 9, outcome: "W" as const, winProb: 0.54 }
      }
      if (categoryId === "AST") {
        return { categoryId, you: 10, opp: 8, outcome: "W" as const, winProb: 0.8 }
      }
      if (categoryId === "REB") {
        return { categoryId, you: 9, opp: 10, outcome: "L" as const, winProb: 0.47 }
      }
      if (categoryId === "FT_PCT") {
        return { categoryId, you: 0.7, opp: 0.8, outcome: "L" as const, winProb: 0.4 }
      }
      return { categoryId, you: 1, opp: 10, outcome: "L" as const, winProb: 0.1 }
    }),
    wins: 2,
    losses: 7,
    ties: 0,
    projectedCatWins: 2,
  }
  expect(chaseCategoryIds(board)).toEqual(["REB", "FT_PCT"])
})
```

- [ ] **Step 2: Run the tests to verify the new cap fails**

Run: `npx vitest run tests/unit/streamingDropExplain.test.ts -t "three in-range|three closest|only two losses"`

Expected: FAIL. `chases three in-range losses...` receives `["REB", "STL"]`. `chases only the three closest losses...` receives `["REB", "STL"]`. `stays at two when only two losses...` passes.

- [ ] **Step 3: Write the minimal implementation**

In `chaseCategoryIds`, replace the final `return` so the slice length depends on the path size. Leave the filter and the sort as they are.

```ts
  const chaseCap = pathIds.size >= 3 ? 3 : 2
  return [...contested]
    .sort((left, right) => {
      const leftOnPath = pathIds.has(left.categoryId) ? 0 : 1
      const rightOnPath = pathIds.has(right.categoryId) ? 0 : 1
      if (leftOnPath !== rightOnPath) return leftOnPath - rightOnPath
      if (leftOnPath === 0) return right.winProb - left.winProb
      return compareChaseRows(left, right)
    })
    .slice(0, chaseCap)
    .map((row) => row.categoryId)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/streamingDropExplain.test.ts tests/unit/chasePairPenalty.test.ts`

Expected: PASS, including the older two-slot tests (`chases in-range losses that reach 5 wins ahead of a closer lead`, `keeps the closer cat when 5 wins are already on the board`, `uses the spare chase slot on the closer lead once one flip reaches 5`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingDropExplain.ts tests/unit/streamingDropExplain.test.ts
git commit -m "feat(matchup): chase three losses when five wins need them"
```

Do not stage other dirty files.

### Task 2: Keep three chase names and drop the pair penalty

**Files:**
- Modify: `src/lib/matchup/chasePair.ts` (`streamingChaseNote`)
- Test: `tests/unit/chasePairPenalty.test.ts`

**Interfaces:**
- Consumes: `streamingChaseNote(chaseIds: readonly CategoryId[], pairs?: readonly StatPairRow[]): StreamingChaseNote`
- Produces: the same function. Length 2 still returns that pair's `r` and `penalty`. Any other length returns `[...chaseIds]`, `r: null`, `penalty: 0`.

- [ ] **Step 1: Write the failing test**

Add this test inside the `streamingChaseNote` describe, after `charges the measured negative pair`. Use the `pairs` array already in that describe (`AST`/`STL` is a measured pair with `r` 0.2).

```ts
it("returns every id and no penalty when three cats are chased", () => {
  expect(streamingChaseNote(["AST", "STL", "REB"], pairs)).toEqual({
    categoryIds: ["AST", "STL", "REB"],
    r: null,
    penalty: 0,
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/chasePairPenalty.test.ts -t "three cats are chased"`

Expected: FAIL. Received `categoryIds` is `["AST", "STL"]` and `r` is `0.2`, because the note keeps only the first pair.

- [ ] **Step 3: Write the minimal implementation**

Replace the opening length check in `streamingChaseNote`. The length-2 pair lookup below it stays.

```ts
  if (chaseIds.length !== 2) {
    return { categoryIds: [...chaseIds], r: null, penalty: 0 }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/chasePairPenalty.test.ts tests/unit/streamingDropExplain.test.ts`

Expected: PASS. The existing one-id note still has penalty 0. The existing two-id notes still return that pair's `r` and penalty. `pickBestStreamerMove` is unchanged, so a three-id chase still skips the penalty through `chaseIds.length === 2`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/chasePair.ts tests/unit/chasePairPenalty.test.ts docs/superpowers/specs/2026-10-20-chase-three-for-five-wins-design.md
git commit -m "feat(matchup): show three chase cats without a pair penalty"
```

Include the spec in this commit. Do not stage other dirty files.
