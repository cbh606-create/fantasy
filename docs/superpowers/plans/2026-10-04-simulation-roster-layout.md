# Simulation roster layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show both simulation rosters and both rank charts on one screen, and rank that screen on the sum of each player's projected per-game line.

**Architecture:** `perGameTeamLines` turns every roster into category lines by dividing each player's season total by that player's projected games. `simulateTrade` ranks and displays those lines, and keeps suggestion-rule sentences on season totals. `SimulationRoster` draws one vertical photo list. `TradeSimulation` places the user's list and the other team's list on the left and the charts on the right.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Testing Library, Tailwind, SVG.

## Global Constraints

- The Simulation panel fills the space under the tab list and does not grow the page. The page does not scroll to reveal more of this panel.
- The left column holds two rosters side by side. The user's roster is first. The other team's roster is second. Each roster is a vertical list of one-line rows. A row that does not fit scrolls inside that list.
- Each row is a button: a round photo, then the player's name on one line. A long name truncates. A numeric player id loads the ESPN headshot. A missing image, or an image that fails to load, shows the player's initials.
- IL entries and empty slots are absent from the pickers.
- Pressed means the player is in the package. A pressed send or receive row uses the filled ink style. At most two players can be pressed on each roster. Pressing a third player does nothing. Pressing a selected player clears that player.
- The other roster has one team select above the list. The control's accessible name is `Team`. There is no row of team-name buttons. Before a team is chosen, that roster is empty. Choosing a different team clears the players received from the previous team, and clears a drop that is no longer legal.
- A drop is required only when the user receives more players than they send and the user's roster has no open non-IL slot. Only then, a player who is not being sent can show `Drop`. That row is not filled. Pressing `Drop` again clears the drop. A player who is being sent cannot be the drop.
- Until the package is complete, the right column shows the first missing-piece sentence and no charts: `Choose another team.` `Choose who to receive.` `Choose who to send.` `Choose who to drop.`
- When the package fits, the right column shows two nonagons side by side. Above each: `Overall #6 → #4 (rank sum 48 → 41)`. Those numbers are a format example. Under each nonagon are nine rows: the short category label, the per-game sum `before → after`, and the rank `#before → #after`. Counting stats and percentages use `formatTotal`.
- Under those rows: the value sentence, then `Drops {name} to open a roster spot` when present, then `They drop {name} to open a roster spot` when present, then the rule sentence when present.
- The nonagons shrink to the right column. Their rank geometry does not change. If the rows and sentences do not fit, the right column scrolls inside itself.
- A package that cannot fit shows `Your roster cannot fit the extra player.` or `Their roster cannot fit the extra player.` and no charts.
- A player's projected games are `projectedGames` when that number is greater than zero. Otherwise they are `ASSUMED_SEASON_GAMES` (82).
- For 3PM, REB, AST, STL, BLK, TO, and PTS, the team value is the sum of season total divided by projected games, across every roster player, including IL. An empty slot adds nothing.
- FG% and FT% do not add percentages and do not divide by projected games. Add makes, add attempts, then divide makes by attempts. When the summed attempts are 0, average the players' percentage projections.
- Simulation ranks use these per-game lines for every team. A higher line is better except TO. An equal line gives the better rank to the lower `teamIndex`. Overall place is the sum of the nine ranks.
- Suggestion ranks, the rank matrix, and `seasonTeamTotals` stay on season totals. Rule sentences still use season-total suggestion rules.
- Suggestions is unchanged. No new request when picks change. No chart library. No ESPN write. No expected-wins number.
- Commit as author `cbh606-create <cbh606@gmail.com>` through the environment. Do not change git config. Do not stage unrelated dirty files or secrets.

## File structure

- `src/lib/trade/perGameLine.ts` — per-game team lines from the loaded league.
- `src/lib/trade/simulateTrade.ts` — ranks and displayed numbers use those lines. Rule sentences still use season totals.
- `src/components/trade/SimulationRoster.tsx` — one vertical roster, optional team select, optional `Drop` control.
- `src/components/trade/TradeSimulation.tsx` — left rosters, right charts, existing pick state.
- `src/components/trade/RankNonagon.tsx` — add `w-full` so the existing SVG scales down. Do not change `rankRadius` or the viewBox.
- Tests live in `tests/unit/`.

---

### Task 1: Sum projected per-game lines

**Files:**
- Create: `src/lib/trade/perGameLine.ts`
- Test: `tests/unit/perGameLine.test.ts`

**Interfaces:**
- Consumes: `rosterPlayers` from `@/lib/season/analysis`, `ASSUMED_SEASON_GAMES` from `@/lib/matchup/constants`, `SeasonLeagueState`, `SeasonPlayer`.
- Produces: `perGameTeamLines(state: SeasonLeagueState): TeamCategoryTotals[]`. `TeamCategoryTotals` is the existing `{ teamIndex: number, totals: Record<CategoryId, number> }` from `@/lib/season/analysis`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/perGameLine.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer, SeasonSlot } from "@/lib/season/types"
import { perGameTeamLines } from "@/lib/trade/perGameLine"

const zeros = (): Record<CategoryId, number> => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 0,
  REB: 0,
  AST: 0,
  STL: 0,
  BLK: 0,
  TO: 0,
  PTS: 0,
})

const player = (
  id: string,
  projections: Partial<Record<CategoryId, number>>,
  games?: number,
  shooting?: SeasonPlayer["shooting"],
): SeasonPlayer => ({
  id,
  name: id,
  projectedGames: games,
  projections: { ...zeros(), ...projections },
  shooting: shooting ?? { FGM: 82, FGA: 164, FTM: 82, FTA: 100 },
})

const stateWith = (
  entries: { slot: SeasonSlot, playerId: string | null }[],
  players: SeasonPlayer[],
): SeasonLeagueState => ({
  name: "Per game",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  teams: [{ teamIndex: 0, name: "Mine", entries }],
  players,
  availablePlayerIds: [],
  waiverOrder: [0],
  source: "manual",
})

describe("perGameTeamLines", () => {
  it("sums counting stats after dividing each player by that player's games", () => {
    const state = stateWith(
      [
        { slot: "UTIL", playerId: "short" },
        { slot: "UTIL", playerId: "full" },
      ],
      [
        player("short", { PTS: 820 }, 41),
        player("full", { PTS: 820 }, 82),
      ],
    )

    expect(perGameTeamLines(state)[0].totals.PTS).toBeCloseTo(30)
  })

  it("uses 82 games when projected games are missing", () => {
    const state = stateWith(
      [{ slot: "UTIL", playerId: "plain" }],
      [player("plain", { PTS: 820 })],
    )

    expect(perGameTeamLines(state)[0].totals.PTS).toBeCloseTo(10)
  })

  it("includes an IL player and ignores an empty slot", () => {
    const state = stateWith(
      [
        { slot: "UTIL", playerId: "active" },
        { slot: "IL", playerId: "hurt" },
        { slot: "BE", playerId: null },
      ],
      [player("active", { REB: 82 }, 82), player("hurt", { REB: 164 }, 82)],
    )

    expect(perGameTeamLines(state)[0].totals.REB).toBeCloseTo(3)
  })

  it("builds FG% from total makes divided by total attempts", () => {
    const state = stateWith(
      [
        { slot: "UTIL", playerId: "one" },
        { slot: "UTIL", playerId: "two" },
      ],
      [
        player("one", {}, 82, { FGM: 82, FGA: 164, FTM: 0, FTA: 1 }),
        player("two", {}, 41, { FGM: 41, FGA: 41, FTM: 0, FTA: 1 }),
      ],
    )

    expect(perGameTeamLines(state)[0].totals.FG_PCT).toBeCloseTo(123 / 205)
  })

  it("averages percentage projections when the roster has no shooting volume", () => {
    const shooter = player("bare", { FG_PCT: 0.4 }, 82, { FGM: 0, FGA: 0, FTM: 0, FTA: 0 })
    const state = stateWith([{ slot: "UTIL", playerId: "bare" }], [shooter])

    expect(perGameTeamLines(state)[0].totals.FG_PCT).toBeCloseTo(0.4)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/perGameLine.test.ts`

Expected: FAIL because `@/lib/trade/perGameLine` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/trade/perGameLine.ts`:

```ts
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { ASSUMED_SEASON_GAMES } from "@/lib/matchup/constants"
import { rosterPlayers, type TeamCategoryTotals } from "@/lib/season/analysis"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

const COUNTING_IDS: CategoryId[] = ["TPM", "REB", "AST", "STL", "BLK", "TO", "PTS"]

const emptyTotals = (): Record<CategoryId, number> =>
  Object.fromEntries(ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0])) as Record<CategoryId, number>

const projectedGamesFor = (player: SeasonPlayer) =>
  typeof player.projectedGames === "number" && player.projectedGames > 0
    ? player.projectedGames
    : ASSUMED_SEASON_GAMES

const percentageLine = (
  players: SeasonPlayer[],
  categoryId: "FG_PCT" | "FT_PCT",
) => {
  if (players.length === 0) return 0

  const makesKey = categoryId === "FG_PCT" ? "FGM" : "FTM"
  const attemptsKey = categoryId === "FG_PCT" ? "FGA" : "FTA"
  const makes = players.reduce((sum, player) => sum + (player.shooting?.[makesKey] ?? 0), 0)
  const attempts = players.reduce((sum, player) => sum + (player.shooting?.[attemptsKey] ?? 0), 0)

  if (attempts === 0) {
    return players.reduce((sum, player) => sum + player.projections[categoryId], 0) / players.length
  }

  return makes / attempts
}

export const perGameTotals = (players: SeasonPlayer[]): Record<CategoryId, number> => {
  const totals = emptyTotals()

  for (const player of players) {
    const games = projectedGamesFor(player)
    for (const categoryId of COUNTING_IDS) {
      totals[categoryId] += player.projections[categoryId] / games
    }
  }

  totals.FG_PCT = percentageLine(players, "FG_PCT")
  totals.FT_PCT = percentageLine(players, "FT_PCT")

  return totals
}

export const perGameTeamLines = (state: SeasonLeagueState): TeamCategoryTotals[] => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))

  return state.teams.map((team) => ({
    teamIndex: team.teamIndex,
    totals: perGameTotals(rosterPlayers(team, playersById)),
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/perGameLine.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/perGameLine.ts tests/unit/perGameLine.test.ts
git commit -m "feat(trade): sum roster lines from projected per-game stats"
```

---

### Task 2: Rank a simulation on per-game lines

**Files:**
- Modify: `src/lib/trade/simulateTrade.ts`
- Test: `tests/unit/simulateTrade.test.ts`

**Interfaces:**
- Consumes: `perGameTeamLines(state)` from Task 1. Existing `analyzeTeamTotals`, `overallPlaces`, `totalsAfterTrade`, `createTradeAnalysisContext`.
- Produces: the same `simulateTrade` result. `beforeTotal` and `afterTotal` are per-game team lines. Ranks are ordered from those lines. `ruleSentence` still comes from season totals.

- [ ] **Step 1: Write the failing test**

Change `createPlayer` in `tests/unit/simulateTrade.test.ts` to take projected games:

```ts
const createPlayer = (
  id: string,
  overrides: Partial<Record<CategoryId, number>> = {},
  projectedGames?: number,
): SeasonPlayer => {
  const projections = { ...baseProjections, ...overrides }

  return {
    id,
    name: id,
    ...(typeof projectedGames === "number" ? { projectedGames } : {}),
    projections,
    shooting: {
      FGM: projections.FG_PCT * 10,
      FGA: 10,
      FTM: projections.FT_PCT * 10,
      FTA: 10,
    },
  }
}
```

Add this test to `describe("simulateTrade")`. `leagueOf` builds the two teams this test needs.

```ts
it("ranks and reports the per-game sum instead of the season total", () => {
  const state = leagueOf(
    [createPlayer("you-scorer", { PTS: 820 }, 41)],
    [createPlayer("them-scorer", { PTS: 820 }, 82)],
  )
  const result = simulateTrade(state, {
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-scorer"],
    themPlayerIds: ["them-scorer"],
  })

  expect(result?.status).toBe("ready")
  if (result?.status !== "ready") return
  const points = result.you.categories.find((category) => category.categoryId === "PTS")

  expect(points!.beforeTotal).toBeCloseTo(20)
  expect(points!.rankBefore).toBe(1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/simulateTrade.test.ts`

Expected: FAIL because `beforeTotal` is the season total `820`, not `20`.

- [ ] **Step 3: Write the minimal implementation**

In `simulateTrade`, import `perGameTeamLines` from `./perGameLine`. Keep `context.totalsByTeam` and `totalsAfterTrade` for `ruleFields` only. Rank and display from per-game lines of the original state and of `application.state`:

```ts
const context = createTradeAnalysisContext(state)
const beforeTotals = context.totalsByTeam
const afterTotals = totalsAfterTrade(application.state, tradePackage, context)
const beforeLines = perGameTeamLines(state)
const afterLines = perGameTeamLines(application.state)
const before = analyzeTeamTotals(beforeLines)
const after = analyzeTeamTotals(afterLines)
const beforePlaces = overallPlaces(beforeLines.map((team) => ({
  teamIndex: team.teamIndex,
  ranks: ranksFor(before, team.teamIndex),
})))
const afterPlaces = overallPlaces(afterLines.map((team) => ({
  teamIndex: team.teamIndex,
  ranks: ranksFor(after, team.teamIndex),
})))
const side = (teamIndex: number): SideRankReport => {
  const beforePlace = beforePlaces.find((place) => place.teamIndex === teamIndex)!
  const afterPlace = afterPlaces.find((place) => place.teamIndex === teamIndex)!
  const beforeTeam = beforeLines.find((team) => team.teamIndex === teamIndex)!.totals
  const afterTeam = afterLines.find((team) => team.teamIndex === teamIndex)!.totals

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
```

Leave the `ruleFields(...)` call on `beforeTotals` and `afterTotals`. Do not change `seasonTeamTotals` or `analyzeSeasonLeague`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/simulateTrade.test.ts tests/unit/perGameLine.test.ts tests/unit/seasonAnalysis.test.ts`

Expected: PASS. Existing simulation rank inequalities still pass when every player is divided by the same 82 games. The season analysis file still uses season totals.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trade/simulateTrade.ts tests/unit/simulateTrade.test.ts
git commit -m "feat(trade): rank a simulation from per-game team lines"
```

---

### Task 3: Draw one vertical roster

**Files:**
- Create: `src/components/trade/SimulationRoster.tsx`
- Test: `tests/unit/SimulationRoster.test.tsx`

**Interfaces:**
- Consumes: `PlayerAvatar`.
- Produces:

```ts
export type SimulationRosterPlayer = { id: string, name: string }

export type SimulationRosterProps = {
  label: string
  players: SimulationRosterPlayer[]
  pressedIds: string[]
  onPress: (playerId: string) => void
  dropId?: string | null
  droppableIds?: string[]
  onDrop?: (playerId: string) => void
  teamOptions?: { teamIndex: number, name: string }[]
  teamIndex?: number | null
  onTeamChange?: (teamIndex: number) => void
}

export const SimulationRoster: (props: SimulationRosterProps) => JSX.Element
```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/SimulationRoster.test.tsx`:

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SimulationRoster } from "@/components/trade/SimulationRoster"

afterEach(() => {
  cleanup()
})

const players = [
  { id: "123", name: "Photo Guard" },
  { id: "give-1", name: "Your Guard" },
]

describe("SimulationRoster", () => {
  it("lists players vertically with a photo or initials", () => {
    render(
      <SimulationRoster
        label="My Team"
        onPress={vi.fn()}
        players={players}
        pressedIds={[]}
      />,
    )

    const group = screen.getByRole("group", { name: "My Team" })
    const buttons = within(group).getAllByRole("button")

    expect(buttons[0]).toHaveAccessibleName("Photo Guard")
    expect(buttons[1]).toHaveAccessibleName("Your Guard")
    expect(group.querySelector("img")).toHaveAttribute(
      "src",
      "https://a.espncdn.com/i/headshots/nba/players/full/123.png",
    )
    expect(within(group).getByText("YG")).toBeInTheDocument()
    expect(group).toHaveClass("flex-col")
  })

  it("presses at the row and offers Drop only for a droppable player", () => {
    const onPress = vi.fn()
    const onDrop = vi.fn()
    render(
      <SimulationRoster
        dropId={null}
        droppableIds={["give-1"]}
        label="My Team"
        onDrop={onDrop}
        onPress={onPress}
        players={players}
        pressedIds={["123"]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Photo Guard" }))
    fireEvent.click(screen.getByRole("button", { name: "Drop" }))

    expect(onPress).toHaveBeenCalledWith("123")
    expect(onDrop).toHaveBeenCalledWith("give-1")
    expect(screen.getAllByRole("button", { name: "Drop" })).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Photo Guard" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Your Guard" })).toHaveAttribute("aria-pressed", "false")
  })

  it("chooses the other team from one select", () => {
    const onTeamChange = vi.fn()
    render(
      <SimulationRoster
        label="Rivals"
        onPress={vi.fn()}
        onTeamChange={onTeamChange}
        players={[]}
        pressedIds={[]}
        teamIndex={null}
        teamOptions={[{ teamIndex: 1, name: "Rivals" }]}
      />,
    )

    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })

    expect(onTeamChange).toHaveBeenCalledWith(1)
    expect(screen.queryByRole("button", { name: "Rivals" })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/SimulationRoster.test.tsx`

Expected: FAIL because `SimulationRoster` is not defined.

- [ ] **Step 3: Write the minimal implementation**

Create `src/components/trade/SimulationRoster.tsx`:

```tsx
"use client"

import { PlayerAvatar } from "@/components/draft/PlayerAvatar"

export type SimulationRosterPlayer = {
  id: string
  name: string
}

export type SimulationRosterProps = {
  label: string
  players: SimulationRosterPlayer[]
  pressedIds: string[]
  onPress: (playerId: string) => void
  dropId?: string | null
  droppableIds?: string[]
  onDrop?: (playerId: string) => void
  teamOptions?: { teamIndex: number, name: string }[]
  teamIndex?: number | null
  onTeamChange?: (teamIndex: number) => void
}

const pressedClass = "bg-[var(--color-ink)] text-white"
const quietClass = "border border-[var(--color-hairline)]"

export const SimulationRoster = ({
  label,
  players,
  pressedIds,
  onPress,
  dropId = null,
  droppableIds = [],
  onDrop,
  teamOptions,
  teamIndex = null,
  onTeamChange,
}: SimulationRosterProps) => {
  const handleTeamChange = (value: string) => {
    if (!onTeamChange || value === "") return
    onTeamChange(Number(value))
  }

  return (
    <section className="flex min-h-0 flex-col">
      <h3 className="text-sm font-semibold">{label}</h3>
      {teamOptions ? (
        <select
          aria-label="Team"
          className="mt-2 rounded border border-[var(--color-hairline)] px-2 py-1 text-sm"
          onChange={(event) => handleTeamChange(event.target.value)}
          value={teamIndex ?? ""}
        >
          <option value="">Choose a team</option>
          {teamOptions.map((team) => (
            <option key={team.teamIndex} value={team.teamIndex}>
              {team.name}
            </option>
          ))}
        </select>
      ) : null}
      <div aria-label={label} className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" role="group">
        {players.map((player) => {
          const pressed = pressedIds.includes(player.id)
          const showDrop = droppableIds.includes(player.id)

          return (
            <div className="flex items-center gap-1" key={player.id}>
              <button
                aria-pressed={pressed}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm ${pressed ? pressedClass : quietClass}`}
                onClick={() => onPress(player.id)}
                type="button"
              >
                <PlayerAvatar nameShown player={{ id: player.id, name: player.name }} size="sm" />
                <span className="truncate">{player.name}</span>
              </button>
              {showDrop ? (
                <button
                  aria-pressed={dropId === player.id}
                  className={`rounded px-2 py-1 text-xs ${dropId === player.id ? quietClass : "text-[var(--color-mute)]"}`}
                  onClick={() => onDrop?.(player.id)}
                  type="button"
                >
                  Drop
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
```

The name button's accessible name is the player name. `PlayerAvatar` hides its initials from the accessible name when `nameShown` is true, and a numeric id renders an image whose accessible name is empty. The initials text `YG` is still in the document.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/SimulationRoster.test.tsx`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/trade/SimulationRoster.tsx tests/unit/SimulationRoster.test.tsx
git commit -m "feat(trade): list a simulation roster in a vertical photo column"
```

---

### Task 4: Place both rosters beside the charts

**Files:**
- Modify: `src/components/trade/TradeSimulation.tsx`
- Modify: `src/components/trade/RankNonagon.tsx`
- Modify: `tests/unit/TradeSimulation.test.tsx`
- Modify: `tests/unit/TradeWorkspace.test.tsx`

**Interfaces:**
- Consumes: `SimulationRoster` from Task 3. Existing `simulateTrade`, `formatTotal`, `RankNonagon`, and the pick state already in `TradeSimulation`.
- Produces: the Simulation screen described in the global constraints. `TradeWorkspace` is not given new state.

- [ ] **Step 1: Write the failing test**

In `tests/unit/TradeSimulation.test.tsx`, change the team choice from a button click to the select, and change the drop choice from the `Drop` group to the `Drop` button inside the user's roster. Keep the missing-piece sentences.

Replace the Rivals click:

```tsx
fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
```

`Rivals` is team index 1 in this fixture. Player rows stay buttons named `Their Center`, `Their Wing`, `Your Guard`, and `Your Big`.

Replace the drop click:

```tsx
fireEvent.click(
  within(screen.getByRole("group", { name: "My Team" })).getByRole("button", { name: "Drop" }),
)
```

Add this test in the same describe:

```tsx
it("shows per-game sums under the charts after a complete package", () => {
  const scored = stateOf([
    { ...yourGuard, projections: { ...yourGuard.projections, PTS: 820 }, projectedGames: 41 },
    yourBig,
  ])
  render(<TradeSimulation state={scored} />)

  fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
  fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
  fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))

  const mine = screen.getByRole("region", { name: "My Team" })
  expect(within(mine).getByText("20.0")).toBeInTheDocument()
  expect(screen.queryByText("820.0")).toBeNull()
  expect(mine.querySelector("svg")).toBeTruthy()
})
```

`SideColumn` must use `aria-label` on a `section`, which Testing Library exposes as a region. The before PTS line for My Team is `820 / 41 = 20`, formatted by `formatTotal` as `20.0`. Your Big still adds `18 / 82`, so the row text is `20.2 → …` unless Your Guard is the only PTS source. Set Your Big's PTS to 0 in this test's copy of the player so the visible before number is exactly `20.0 →`.

```tsx
const quietBig = { ...yourBig, projections: { ...yourBig.projections, PTS: 0 } }
const scored = stateOf([
  { ...yourGuard, projections: { ...yourGuard.projections, PTS: 820 }, projectedGames: 41 },
  quietBig,
])
```

Then the My Team PTS row contains `20.0`.

Also add these two tests in the same describe:

```tsx
it("clears the received player when the other team changes", () => {
  render(<TradeSimulation state={state} />)
  fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
  fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
  expect(screen.getByRole("button", { name: "Their Center" })).toHaveAttribute("aria-pressed", "true")

  fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "2" } })

  expect(screen.queryByRole("button", { name: "Their Center" })).toBeNull()
  expect(screen.getByText("Choose who to receive.")).toBeInTheDocument()
})

it("does not add a third player on a full side", () => {
  render(<TradeSimulation state={fullState} />)
  fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
  fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))
  fireEvent.click(screen.getByRole("button", { name: "Your Big" }))
  fireEvent.click(screen.getByRole("button", { name: "Your Stay" }))

  expect(screen.getByRole("button", { name: "Your Stay" })).toHaveAttribute("aria-pressed", "false")
})

it("shows a cannot-fit sentence and no chart when the extra player has nowhere to go", () => {
  render(<TradeSimulation state={stateOf([yourGuard])} />)
  fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
  fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
  fireEvent.click(screen.getByRole("button", { name: "Their Wing" }))
  fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))

  expect(screen.getByText("Your roster cannot fit the extra player.")).toBeInTheDocument()
  expect(document.querySelector("svg")).toBeNull()
})
```

The fixture's third team is `Filler` at team index 2, so changing the select to `"2"` removes Rivals' players. In the existing first test, beside `Choose another team.`, assert `expect(document.querySelector("svg")).toBeNull()`.

In `tests/unit/TradeWorkspace.test.tsx`, the test `keeps simulation picks after visiting suggestions` clicks a `Rivals` button and expects `aria-pressed`. Change it to the team select and expect the value to survive the tab round trip:

```tsx
fireEvent.click(screen.getByRole("tab", { name: "Simulation" }))
fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
expect(screen.getByRole("combobox", { name: "Team" })).toHaveValue("1")

fireEvent.click(screen.getByRole("tab", { name: "Suggestions" }))
expect(screen.getByRole("button", { name: "Generate trade suggestions" })).toBeInTheDocument()

fireEvent.click(screen.getByRole("tab", { name: "Simulation" }))
expect(screen.getByRole("combobox", { name: "Team" })).toHaveValue("1")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/TradeSimulation.test.tsx tests/unit/TradeWorkspace.test.tsx`

Expected: FAIL because the team control is still a button named `Rivals`, and there is no combobox named `Team`.

- [ ] **Step 3: Write the minimal implementation**

On the root `<svg>` in `RankNonagon.tsx`, add `className="h-auto w-full"`. Do not change `rankRadius`, `CENTER`, `OUTER_RADIUS`, or the viewBox.

In `TradeSimulation.tsx`, remove `ChoiceButton`, `ChoiceGroup`, and the team button row. Keep the state and handlers. Render:

```tsx
const yourRoster = (
  <SimulationRoster
    dropId={dropId}
    droppableIds={dropRequired ? dropOptions.map((player) => player.id) : []}
    label={yourTeam?.name ?? "You"}
    onDrop={handleDropSelect}
    onPress={handleSendSelect}
    players={yourPlayers}
    pressedIds={sendIds}
  />
)
const theirRoster = (
  <SimulationRoster
    label={counterparty?.name ?? "Other team"}
    onPress={handleReceiveSelect}
    onTeamChange={handleTeamSelect}
    players={theirPlayers}
    pressedIds={receiveIds}
    teamIndex={teamIndex}
    teamOptions={otherTeams.map((team) => ({ teamIndex: team.teamIndex, name: team.name }))}
  />
)

return (
  <div className="grid h-[calc(100dvh-11rem)] min-h-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 overflow-hidden">
    <div className="grid min-h-0 grid-cols-2 gap-3 overflow-hidden">
      {yourRoster}
      {theirRoster}
    </div>
    <div className="min-h-0 overflow-y-auto">
      {renderResult()}
    </div>
  </div>
)
```

`renderResult` stays the current sentences, two `SideColumn`s, value line, drop sentences, and rule sentence. Put the two `SideColumn`s in `grid grid-cols-2 gap-3`. Do not remove the nine `formatTotal` rows. `yourPlayers` and `theirPlayers` already omit IL entries and empty slots. Pass `{ id, name }` rows to `SimulationRoster`.

`handleDropSelect` already toggles. A pressed `Drop` calls it with the same id and clears the drop.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/TradeSimulation.test.tsx tests/unit/TradeWorkspace.test.tsx tests/unit/SimulationRoster.test.tsx tests/unit/RankNonagon.test.tsx tests/unit/simulateTrade.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/trade/TradeSimulation.tsx src/components/trade/RankNonagon.tsx tests/unit/TradeSimulation.test.tsx tests/unit/TradeWorkspace.test.tsx
git commit -m "feat(trade): put simulation rosters beside the rank charts"
```
