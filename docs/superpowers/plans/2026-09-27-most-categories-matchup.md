# Most Categories Matchup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a Most Categories roster, show the week as 1–0, 0–1, or 0–0–1, and start Punt on categories whose win probability is under 0.28.

**Architecture:** A small `mostCategories` helper turns the existing category board into the week headline and the starting Punt ids. `MatchupBoard` renders that headline only when `scoringMode` is `most_categories`. `StreamingPlansPanel` writes those ids into the Punt state it already passes to streaming, and only when the opponent or stat window changes. Streaming, sit/start, and drop ranking stay on the current expected-category-wins path.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library. Existing `MatchupBoard`, `StreamingPlansPanel`, `CONTESTED_WIN_PROB_MIN`.

## Global Constraints

- A missing `scoringMode` is Each Category. Do not auto-seed Punts for `each_category` or for a missing mode.
- Week headline uses the existing board `wins` and `losses`. Ties do not count as a win. `wins > losses` → `1–0`. `losses > wins` → `0–1`. `wins === losses` → `0–0–1`. The dash is an en dash (`–`, U+2013), the same character the board already uses.
- Nine category columns stay, including each row’s W/L/T. `Proj {projectedCatWins}` stays.
- Seed a category when `winProb` is strictly below `CONTESTED_WIN_PROB_MIN` (`0.28`). `0.28` is not seeded.
- Seeding replaces the previous Punt selection. It does not merge with earlier button presses.
- Seed when the panel first mounts with a board, and again when `opponentTeamIndex` or `statWindow` changes. A board change alone (sit/start, streaming preview) does not seed again. A remount seeds again.
- Do not edit `streamingPlans.ts`, sit/start, drop policy, trade, waivers, or season standings. A week that is already `1–0` does not stop the chase.
- `src/lib/matchup/*.ts` uses semicolons. `MatchupBoard.tsx` and `StreamingPlansPanel.tsx` do not. Tests use semicolons.
- Run tests with `npx.cmd vitest run --maxWorkers=1 <file>`.

## File structure

- `src/lib/matchup/mostCategories.ts` — headline string and seed id list. No React.
- `src/lib/matchup/streamingDropExplain.ts` — export the existing `0.28` constant so the seed cannot drift from chase.
- `src/components/matchup/MatchupBoard.tsx` — pick the headline from `scoringMode`.
- `src/components/matchup/MatchupWorkspace.tsx` — pass `state.scoringMode` into the board.
- `src/components/matchup/StreamingPlansPanel.tsx` — seed Punt state from the helper.
- `tests/unit/mostCategories.test.ts` — threshold and headline.
- `tests/unit/MatchupBoard.test.tsx` — rendered record.
- `tests/unit/StreamingPlansPanel.test.tsx` — which mode seeds, and when a later board update does not.

---

### Task 1: Headline and Punt seed

**Files:**
- Modify: `src/lib/matchup/streamingDropExplain.ts` (the `CONTESTED_WIN_PROB_MIN` declaration)
- Create: `src/lib/matchup/mostCategories.ts`
- Test: `tests/unit/mostCategories.test.ts`

**Interfaces:**
- Consumes: `MatchupBoard` from `src/lib/matchup/types.ts`. `CONTESTED_WIN_PROB_MIN` from `src/lib/matchup/streamingDropExplain.ts`.
- Produces: `mostCategoriesHeadline(wins: number, losses: number): string`. `mostCategoriesSeedPuntIds(board: MatchupBoard): CategoryId[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/mostCategories.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import {
  mostCategoriesHeadline,
  mostCategoriesSeedPuntIds,
} from "@/lib/matchup/mostCategories"
import type { MatchupBoard } from "@/lib/matchup/types"

const row = (categoryId: CategoryId, winProb: number) => ({
  categoryId,
  you: 1,
  opp: 1,
  outcome: "L" as const,
  winProb,
})

const board = (winProbById: [CategoryId, number][]): MatchupBoard => ({
  wins: 5,
  losses: 4,
  ties: 0,
  projectedCatWins: 4.2,
  categories: winProbById.map(([categoryId, winProb]) => row(categoryId, winProb)),
})

describe("mostCategoriesHeadline", () => {
  it("turns a category lead into one week win", () => {
    expect(mostCategoriesHeadline(5, 4)).toBe("1–0")
  })

  it("turns a category deficit into one week loss", () => {
    expect(mostCategoriesHeadline(4, 5)).toBe("0–1")
  })

  it("treats an equal category record as a tie", () => {
    expect(mostCategoriesHeadline(4, 4)).toBe("0–0–1")
    expect(mostCategoriesHeadline(3, 3)).toBe("0–0–1")
  })
})

describe("mostCategoriesSeedPuntIds", () => {
  it("includes only categories strictly below 0.28", () => {
    expect(
      mostCategoriesSeedPuntIds(
        board([
          ["STL", 0.27],
          ["REB", 0.28],
          ["PTS", 0.5],
        ]),
      ),
    ).toEqual(["STL"])
  })
})
```

The expected `"1–0"`, `"0–1"`, and `"0–0–1"` strings use an en dash, not a hyphen.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/mostCategories.test.ts`

Expected: FAIL because `@/lib/matchup/mostCategories` does not exist.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/matchup/streamingDropExplain.ts`, change the constant from a private `const` to an export. Leave the value `0.28`:

```ts
export const CONTESTED_WIN_PROB_MIN = 0.28
```

Create `src/lib/matchup/mostCategories.ts`:

```ts
import type { CategoryId } from "@/lib/domain/types"
import type { MatchupBoard } from "./types"
import { CONTESTED_WIN_PROB_MIN } from "./streamingDropExplain"

export const mostCategoriesHeadline = (wins: number, losses: number): string => {
  if (wins > losses) return "1–0"
  if (losses > wins) return "0–1"
  return "0–0–1"
}

export const mostCategoriesSeedPuntIds = (board: MatchupBoard): CategoryId[] =>
  board.categories
    .filter((row) => row.winProb < CONTESTED_WIN_PROB_MIN)
    .map((row) => row.categoryId)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/mostCategories.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingDropExplain.ts src/lib/matchup/mostCategories.ts tests/unit/mostCategories.test.ts
git commit -m "feat(matchup): score a most-categories week from the category board"
```

---

### Task 2: Week headline on the board

**Files:**
- Modify: `src/components/matchup/MatchupBoard.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx` (the `<MatchupBoard board={liveBoard} />` call)
- Test: `tests/unit/MatchupBoard.test.tsx`

**Interfaces:**
- Consumes: `mostCategoriesHeadline(wins: number, losses: number): string` from Task 1. `SeasonScoringMode` from `src/lib/season/types.ts`.
- Produces: `MatchupBoard` accepts `scoringMode?: SeasonScoringMode`. `most_categories` renders the week headline. Any other value renders `{wins}–{losses}–{ties}`.

- [ ] **Step 1: Write the failing test**

Add these tests to `describe("MatchupBoard")` in `tests/unit/MatchupBoard.test.tsx`. Reuse the file’s existing imports. Add `mostCategories` only as a prop value, not as a new import.

```tsx
it("shows a most-categories lead as one week win", () => {
  render(
    <MatchupBoard
      board={{ ...board, wins: 5, losses: 4, ties: 0, projectedCatWins: 4.2 }}
      scoringMode="most_categories"
    />,
  )

  expect(screen.getByText("1–0")).toBeInTheDocument()
  expect(screen.getByText("Proj 4.20")).toBeInTheDocument()
  expect(screen.getByRole("columnheader", { name: "PTS" })).toBeInTheDocument()
})

it("shows an even most-categories record as a tie", () => {
  render(
    <MatchupBoard
      board={{ ...board, wins: 4, losses: 4, ties: 1 }}
      scoringMode="most_categories"
    />,
  )

  expect(screen.getByText("0–0–1")).toBeInTheDocument()
})

it("keeps the category record for each category", () => {
  render(
    <MatchupBoard
      board={{ ...board, wins: 5, losses: 4, ties: 0 }}
      scoringMode="each_category"
    />,
  )

  expect(screen.getByText("5–4–0")).toBeInTheDocument()
})

it("keeps the category record when scoring mode is missing", () => {
  render(<MatchupBoard board={{ ...board, wins: 2, losses: 1, ties: 0 }} />)

  expect(screen.getByText("2–1–0")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupBoard.test.tsx`

Expected: FAIL because `scoringMode` is not a prop and the headline is still `5–4–0` for the Most Categories case.

- [ ] **Step 3: Write the minimal implementation**

`MatchupBoard.tsx` has no semicolons. Add the imports and the optional prop. Keep the category table as it is. Replace only the big record text.

```tsx
import type { SeasonScoringMode } from "@/lib/season/types"
import { mostCategoriesHeadline } from "@/lib/matchup/mostCategories"
```

```tsx
type MatchupBoardProps = {
  board: MatchupBoardData
  scoringMode?: SeasonScoringMode
}

export const MatchupBoard = ({ board, scoringMode }: MatchupBoardProps) => {
  const headline =
    scoringMode === "most_categories"
      ? mostCategoriesHeadline(board.wins, board.losses)
      : `${board.wins}–${board.losses}–${board.ties}`

  return (
```

The component is currently an implicit return. Change it to a block so `headline` can be computed. Inside the existing `<p>`, render `{headline}` instead of `{board.wins}–{board.losses}–{board.ties}`. End the function with the section’s closing tags, then `)` and `}`.

In `MatchupWorkspace.tsx`, pass the roster mode through. A missing mode stays Each Category because the board only switches on `"most_categories"`:

```tsx
<MatchupBoard board={liveBoard} scoringMode={state.scoringMode} />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupBoard.test.tsx`

Expected: PASS, including the four new tests and the existing lead test.

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/MatchupBoard.tsx src/components/matchup/MatchupWorkspace.tsx tests/unit/MatchupBoard.test.tsx
git commit -m "feat(matchup): show the most-categories week on the board"
```

---

### Task 3: Seed Punt buttons for Most Categories

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx` (the `puntCategoryIds` state, around the `useState` and `handleTogglePunt`)
- Test: `tests/unit/StreamingPlansPanel.test.tsx`

**Interfaces:**
- Consumes: `mostCategoriesSeedPuntIds(board: MatchupBoard): CategoryId[]` from Task 1. `state.scoringMode` already on `StreamingPlansPanelProps`. `opponentTeamIndex` and `statWindow` already on that props type.
- Produces: On `scoringMode === "most_categories"`, `puntCategoryIds` starts as the seed and is replaced when `opponentTeamIndex` or `statWindow` changes. Button clicks still toggle. Other modes leave the selection empty until the user clicks.

- [ ] **Step 1: Write the failing test**

Add this test to `describe("StreamingPlansPanel")` in `tests/unit/StreamingPlansPanel.test.tsx`. The file already has `board`, `schedule`, `state`, `render`, `screen`, `fireEvent`, and `cleanup`. `board` gives STL `winProb` 0.2 and every other category 0.8.

```tsx
it("seeds punts under 0.28 only for most categories", () => {
  const { rerender } = render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg1"
      opponentTeamIndex={1}
      playersById={{}}
      schedule={schedule}
      statWindow="season"
      state={{ ...state, scoringMode: "most_categories" }}
    />,
  )

  expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  expect(screen.getByRole("button", { name: "Punt PTS" })).toHaveAttribute(
    "aria-pressed",
    "false",
  )

  fireEvent.click(screen.getByRole("button", { name: "Punt STL" }))
  fireEvent.click(screen.getByRole("button", { name: "Punt PTS" }))

  rerender(
    <StreamingPlansPanel
      board={{
        ...board,
        categories: board.categories.map((category) =>
          category.categoryId === "STL"
            ? { ...category, you: 2 }
            : category,
        ),
      }}
      leagueId="lg1"
      opponentTeamIndex={1}
      playersById={{}}
      schedule={schedule}
      statWindow="season"
      state={{ ...state, scoringMode: "most_categories" }}
    />,
  )

  expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
    "aria-pressed",
    "false",
  )
  expect(screen.getByRole("button", { name: "Punt PTS" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  rerender(
    <StreamingPlansPanel
      board={{
        ...board,
        categories: board.categories.map((category) => {
          if (category.categoryId === "REB") {
            return { ...category, winProb: 0.27 }
          }
          if (category.categoryId === "STL") {
            return { ...category, winProb: 0.5 }
          }
          return category
        }),
      }}
      leagueId="lg1"
      opponentTeamIndex={2}
      playersById={{}}
      schedule={schedule}
      statWindow="season"
      state={{ ...state, scoringMode: "most_categories" }}
    />,
  )

  expect(screen.getByRole("button", { name: "Punt REB" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
    "aria-pressed",
    "false",
  )
  expect(screen.getByRole("button", { name: "Punt PTS" })).toHaveAttribute(
    "aria-pressed",
    "false",
  )
})

it("does not seed punts for each category", () => {
  render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg1"
      playersById={{}}
      schedule={schedule}
      state={{ ...state, scoringMode: "each_category" }}
    />,
  )

  expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
    "aria-pressed",
    "false",
  )
})

it("seeds again after the panel remounts", () => {
  const { unmount } = render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg1"
      playersById={{}}
      schedule={schedule}
      state={{ ...state, scoringMode: "most_categories" }}
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: "Punt STL" }))
  expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
    "aria-pressed",
    "false",
  )

  unmount()
  render(
    <StreamingPlansPanel
      board={board}
      leagueId="lg1"
      playersById={{}}
      schedule={schedule}
      state={{ ...state, scoringMode: "most_categories" }}
    />,
  )

  expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
})
```

Append this `rerender` immediately after the opponent assertions in `seeds punts under 0.28 only for most categories`:

```tsx
rerender(
  <StreamingPlansPanel
    board={{
      ...board,
      categories: board.categories.map((category) =>
        category.categoryId === "BLK"
          ? { ...category, winProb: 0.1 }
          : { ...category, winProb: 0.6 },
      ),
    }}
    leagueId="lg1"
    opponentTeamIndex={2}
    playersById={{}}
    schedule={schedule}
    statWindow="l7"
    state={{ ...state, scoringMode: "most_categories" }}
  />,
)

expect(screen.getByRole("button", { name: "Punt BLK" })).toHaveAttribute(
  "aria-pressed",
  "true",
)
expect(screen.getByRole("button", { name: "Punt REB" })).toHaveAttribute(
  "aria-pressed",
  "false",
)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/StreamingPlansPanel.test.tsx`

Expected: FAIL on `seeds punts under 0.28 only for most categories` because STL stays `aria-pressed="false"`.

- [ ] **Step 3: Write the minimal implementation**

`StreamingPlansPanel.tsx` has no semicolons. Import the seed helper:

```tsx
import { mostCategoriesSeedPuntIds } from "@/lib/matchup/mostCategories"
```

`useRef` is already imported. Keep `handleTogglePunt`. Immediately after `const [puntCategoryIds, setPuntCategoryIds] = useState<CategoryId[]>([])`, store the latest board and seed only when the mode, opponent, or stat window changes. Reading the board from a ref keeps a sit/start board update from reseeding.

```tsx
const boardForPuntSeedRef = useRef(board)
boardForPuntSeedRef.current = board

useEffect(() => {
  if (state.scoringMode !== "most_categories") return
  setPuntCategoryIds(mostCategoriesSeedPuntIds(boardForPuntSeedRef.current))
}, [state.scoringMode, opponentTeamIndex, statWindow])
```

Do not add `board` to that dependency list. Do not change `buildStreamingPlan` or `puntCategoryIds` beyond this seed. The existing memo already passes `puntCategoryIds` into the plan.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/StreamingPlansPanel.test.tsx`

Expected: PASS, including the three new tests and the existing panel tests. Each Category fixtures in this file omit `scoringMode`, so their Punt buttons stay off.

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/StreamingPlansPanel.tsx tests/unit/StreamingPlansPanel.test.tsx
git commit -m "feat(matchup): seed most-categories punts below a 28 percent win"
```
