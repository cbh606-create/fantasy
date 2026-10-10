# Mock Draft Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show up to three Monte Carlo next-pick recommendations on the Mock draft right rail, using the same `/api/draft/simulate` engine as Prep/Live, display-only.

**Architecture:** Extend `RecPanel` with optional `maxNextPicks` and `showCategoryOutlook`. Wire a separate `mockResult` in `DraftWorkspace` that runs a debounced simulate only when Mock CPU is idle and it is the user’s turn. `MockDraftView` becomes a three-column layout (pool | board | rec).

**Tech Stack:** Next.js App Router, React client components, Vitest + Testing Library, existing draft simulate API.

## Global Constraints

- No click-to-pick on recommendation rows (display only).
- Mock truncates to top 3 `nextPicks`; hide Category outlook on Mock.
- Prep/Live RecPanel defaults unchanged (`showCategoryOutlook` default true; no max slice unless passed).
- Use existing `simCount` from DraftWorkspace; debounce ~400ms like Live.
- Do not call simulate while `isMockAdvancing` is true.
- No semicolons in TS/TSX; Tailwind for styling; conventional commits.
- Windows shell: use `npx.cmd vitest run …` (not bare `npx` if needed).

## File map

| File | Responsibility |
|------|----------------|
| `src/components/draft/RecPanel.tsx` | Shared rec UI; optional limit + outlook toggle + loading/empty copy |
| `tests/unit/RecPanel.test.tsx` | RecPanel prop behavior |
| `src/components/draft/MockDraftView.tsx` | 3-col layout; mount RecPanel |
| `src/components/draft/DraftWorkspace.tsx` | `mockResult`, mock simulate schedule, pass props |
| `tests/unit/DraftWorkspace.test.tsx` | Mock turn triggers simulate; shows top picks |

---

### Task 1: RecPanel options (max 3 + hide outlook)

**Files:**
- Modify: `src/components/draft/RecPanel.tsx`
- Create: `tests/unit/RecPanel.test.tsx`

**Interfaces:**
- Consumes: `SimulationResult`, `Player` from `@/lib/domain/types`
- Produces: `RecPanelProps` with optional `maxNextPicks?: number`, `showCategoryOutlook?: boolean` (default `true`), `isSimulating?: boolean` (default `false`), `emptyMessage?: string`

- [ ] **Step 1: Write the failing RecPanel tests**

Create `tests/unit/RecPanel.test.tsx`:

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RecPanel } from "@/components/draft/RecPanel"
import type { Player, SimulationResult } from "@/lib/domain/types"

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 7,
  AST: 5,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 20,
}

const players: Player[] = [
  { id: "a", name: "Alpha", positions: ["PG"], projections, adp: 1 },
  { id: "b", name: "Bravo", positions: ["SG"], projections, adp: 2 },
  { id: "c", name: "Charlie", positions: ["SF"], projections, adp: 3 },
  { id: "d", name: "Delta", positions: ["PF"], projections, adp: 4 },
]

const result: SimulationResult = {
  nextPicks: [
    { playerId: "a", score: 1, frequency: 0.5 },
    { playerId: "b", score: 0.9, frequency: 0.3 },
    { playerId: "c", score: 0.8, frequency: 0.15 },
    { playerId: "d", score: 0.7, frequency: 0.05 },
  ],
  topCombinations: [],
  categoryOutlook: {
    FG_PCT: 0.1,
    FT_PCT: 0.1,
    TPM: 0.1,
    REB: 0.1,
    AST: 0.1,
    STL: 0.1,
    BLK: 0.1,
    TO: -0.1,
    PTS: 0.1,
  },
  meta: {
    simCount: 10,
    seed: 1,
    generatedAt: "2026-08-18T00:00:00.000Z",
    latencyMs: 1,
    source: "manual",
  },
}

afterEach(() => cleanup())

describe("RecPanel", () => {
  it("limits next picks when maxNextPicks is set", () => {
    render(
      <RecPanel
        maxNextPicks={3}
        players={players}
        result={result}
        showCategoryOutlook={false}
      />,
    )

    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("Bravo")).toBeInTheDocument()
    expect(screen.getByText("Charlie")).toBeInTheDocument()
    expect(screen.queryByText("Delta")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /category outlook/i })).not.toBeInTheDocument()
  })

  it("shows category outlook by default", () => {
    render(<RecPanel players={players} result={result} />)

    expect(screen.getByRole("heading", { name: /category outlook/i })).toBeInTheDocument()
    expect(screen.getByText("Delta")).toBeInTheDocument()
  })

  it("shows simulating copy when loading without a result", () => {
    render(
      <RecPanel
        emptyMessage="Waiting for your turn…"
        isSimulating
        players={players}
        result={null}
        showCategoryOutlook={false}
      />,
    )

    expect(screen.getByText(/simulating/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx.cmd vitest run tests/unit/RecPanel.test.tsx --maxWorkers=1`

Expected: FAIL (props not accepted / outlook still present / Delta still shown)

- [ ] **Step 3: Implement RecPanel props**

Replace `RecPanel.tsx` with:

```tsx
import type {
  CategoryId,
  Player,
  SimulationResult,
} from "@/lib/domain/types"

const CATEGORY_LABELS: Record<CategoryId, string> = {
  FG_PCT: "FG%",
  FT_PCT: "FT%",
  TPM: "3PM",
  REB: "REB",
  AST: "AST",
  STL: "STL",
  BLK: "BLK",
  TO: "TO",
  PTS: "PTS",
}

type RecPanelProps = {
  emptyMessage?: string
  isSimulating?: boolean
  maxNextPicks?: number
  players: Player[]
  result: SimulationResult | null
  showCategoryOutlook?: boolean
}

export const RecPanel = ({
  emptyMessage = "Run a simulation to rank your best available picks.",
  isSimulating = false,
  maxNextPicks,
  players,
  result,
  showCategoryOutlook = true,
}: RecPanelProps) => {
  const playerNames = new Map(players.map((player) => [player.id, player.name]))
  const nextPicks = result
    ? maxNextPicks === undefined
      ? result.nextPicks
      : result.nextPicks.slice(0, maxNextPicks)
    : []

  return (
    <aside className="space-y-8 rounded-[2rem] bg-[var(--color-soft-cloud)] p-6">
      <section aria-labelledby="next-picks-heading">
        <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
          Recommendations
        </p>
        <h2 className="mt-2 text-2xl font-semibold" id="next-picks-heading">
          Next picks
        </h2>
        {result ? (
          <ol className="mt-5 space-y-3">
            {nextPicks.map((pick, index) => (
              <li
                className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3"
                key={pick.playerId}
              >
                <div>
                  <span className="mr-3 text-sm text-[var(--color-stone)]">
                    {index + 1}
                  </span>
                  <span className="font-medium">
                    {playerNames.get(pick.playerId) ?? pick.playerId}
                  </span>
                </div>
                <span className="text-sm tabular-nums text-[var(--color-mute)]">
                  {Math.round(pick.frequency * 100)}%
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--color-mute)]" role="status">
            {isSimulating ? "Simulating…" : emptyMessage}
          </p>
        )}
      </section>

      {showCategoryOutlook ? (
        <section
          className="border-t border-[var(--color-hairline)] pt-7"
          aria-labelledby="category-outlook-heading"
        >
          <h2 className="text-2xl font-semibold" id="category-outlook-heading">
            Category outlook
          </h2>
          {result ? (
            <dl className="mt-5 grid grid-cols-3 gap-2">
              {Object.entries(result.categoryOutlook).map(([categoryId, score]) => (
                <div className="rounded-2xl bg-white p-3" key={categoryId}>
                  <dt className="text-xs text-[var(--color-mute)]">
                    {CATEGORY_LABELS[categoryId as CategoryId]}
                  </dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {score > 0 ? "+" : ""}
                    {score.toFixed(2)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[var(--color-mute)]">
              Projected category strength will appear here.
            </p>
          )}
        </section>
      ) : null}
    </aside>
  )
}
```

- [ ] **Step 4: Run RecPanel tests to verify they pass**

Run: `npx.cmd vitest run tests/unit/RecPanel.test.tsx --maxWorkers=1`

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/draft/RecPanel.tsx tests/unit/RecPanel.test.tsx
git commit -m "feat(draft): add RecPanel maxNextPicks and outlook toggle"
```

---

### Task 2: MockDraftView three-column RecPanel

**Files:**
- Modify: `src/components/draft/MockDraftView.tsx`
- Test: covered mainly in Task 3; optional smoke via DraftWorkspace after Task 3

**Interfaces:**
- Consumes: `RecPanel` props from Task 1
- Produces: `MockDraftViewProps` gains `isSimulating?: boolean`, `mockResult: SimulationResult | null`

- [ ] **Step 1: Update MockDraftView props and layout**

In `MockDraftView.tsx`:

1. Add imports:

```tsx
import { RecPanel } from "@/components/draft/RecPanel"
import type { DraftBoard, LeagueState, Player, SimulationResult } from "@/lib/domain/types"
```

2. Extend props:

```tsx
type MockDraftViewProps = {
  isAdvancing: boolean
  isSavingPick: boolean
  isSimulating?: boolean
  latestPick: MockLatestPick | null
  mockBoard: DraftBoard
  mockResult: SimulationResult | null
  onMarkPicked: (playerId: string) => void
  onReset: () => void
  onSlotChange: (slot: number) => void
  perspectiveTeamIndex: number
  players: Player[]
  state: LeagueState
}
```

3. Destructure `isSimulating = false` and `mockResult`.

4. Replace the main grid:

```tsx
<div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
  <PlayerPool
    compact
    disabled={busy || !userTurn || draftComplete}
    onMarkPicked={onMarkPicked}
    pickedPlayerIds={pickedPlayerIds}
    players={players}
  />
  <BoardGrid label="Mock draft" state={mockState} />
  <RecPanel
    emptyMessage={
      draftComplete
        ? "Draft complete."
        : busy
          ? "Opponents are picking…"
          : "Waiting for recommendations…"
    }
    isSimulating={isSimulating && userTurn && !draftComplete}
    maxNextPicks={3}
    players={players}
    result={mockResult}
    showCategoryOutlook={false}
  />
</div>
```

Do **not** add click handlers on RecPanel rows.

- [ ] **Step 2: Typecheck that DraftWorkspace still compiles after temporary stub**

Until Task 3 wires props, either complete Task 3 in the same session immediately, or temporarily pass `mockResult={null}` and `isSimulating={false}` in DraftWorkspace so the app typechecks. Prefer finishing Task 3 next without a separate stub commit if working inline.

- [ ] **Step 3: Commit** (only if Task 3 is not immediately following in the same commit; otherwise fold into Task 3 commit)

If committing separately:

```bash
git add src/components/draft/MockDraftView.tsx
git commit -m "feat(draft): add mock recommendations rail layout"
```

---

### Task 3: DraftWorkspace mock simulate wiring

**Files:**
- Modify: `src/components/draft/DraftWorkspace.tsx`
- Modify: `tests/unit/DraftWorkspace.test.tsx`

**Interfaces:**
- Consumes: `toMockLeagueState`, `isUserTurn` from `@/lib/domain/snake`, `runSimulation` pattern
- Produces: `mockResult` state; `scheduleMockSimulation(state)`; passes `mockResult` / `isSimulating` into `MockDraftView`

- [ ] **Step 1: Extend DraftWorkspace mock test for simulate on user turn**

In `tests/unit/DraftWorkspace.test.tsx`, update the existing mock test `"starts a Mock draft and advances CPU until the user turn"`:

1. Ensure `/api/draft/simulate` is mocked when called. In that test’s `fetch` mockImplementation, add:

```tsx
if (url === "/api/draft/simulate") {
  return new Response(
    JSON.stringify({
      nextPicks: [
        { playerId: "player-2", score: 9, frequency: 0.6 },
        { playerId: "player-3", score: 8, frequency: 0.3 },
        { playerId: "player-4", score: 7, frequency: 0.1 },
        { playerId: "player-1", score: 6, frequency: 0.0 },
      ],
      topCombinations: [],
      categoryOutlook: {
        FG_PCT: 0,
        FT_PCT: 0,
        TPM: 0,
        REB: 0,
        AST: 0,
        STL: 0,
        BLK: 0,
        TO: 0,
        PTS: 0,
      },
      meta: {
        simCount: 40,
        seed: 1,
        generatedAt: "2026-08-18T00:00:00.000Z",
        latencyMs: 1,
        source: "manual",
      },
    } satisfies SimulationResult),
    { status: 200 },
  )
}
```

2. After waiting for “your turn to pick”, also wait for recommendations:

```tsx
await waitFor(
  () => {
    expect(screen.getByText("Second Player")).toBeInTheDocument()
  },
  { timeout: 4_000 },
)
expect(screen.getByRole("heading", { name: /next picks/i })).toBeInTheDocument()
expect(screen.queryByRole("heading", { name: /category outlook/i })).not.toBeInTheDocument()
expect(
  vi.mocked(fetch).mock.calls.some((call) => String(call[0]) === "/api/draft/simulate"),
).toBe(true)
```

Note: board cells may also show player names; prefer querying within the recommendations region if flaky:

```tsx
const nextPicksHeading = screen.getByRole("heading", { name: /next picks/i })
const recSection = nextPicksHeading.closest("section")
expect(recSection).toHaveTextContent("Second Player")
```

- [ ] **Step 2: Run the mock DraftWorkspace test — expect fail**

Run: `npx.cmd vitest run tests/unit/DraftWorkspace.test.tsx --maxWorkers=1`

Expected: FAIL (no simulate call / no Next picks on Mock)

- [ ] **Step 3: Implement mock simulation state in DraftWorkspace**

1. Import `isUserTurn`:

```tsx
import {
  buildEmptyBoard,
  DEFAULT_DRAFT_ROUNDS,
  isUserTurn,
  teamIndexForOverall,
} from "@/lib/domain/snake"
```

2. Add state + refs next to existing simulation refs:

```tsx
const [mockResult, setMockResult] = useState<SimulationResult | null>(null)
const [isMockSimulating, setIsMockSimulating] = useState(false)
const mockSimulationControllerRef = useRef<AbortController | null>(null)
const mockSimulationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

3. Clear mock timers/controllers in the existing unmount effect:

```tsx
if (mockSimulationTimerRef.current) clearTimeout(mockSimulationTimerRef.current)
mockSimulationControllerRef.current?.abort()
```

4. Add helpers (alongside `runSimulation` / `scheduleSimulation`):

```tsx
const runMockSimulation = async (
  simulationState: LeagueState,
  controller: AbortController,
) => {
  setIsMockSimulating(true)

  try {
    const response = await fetch("/api/draft/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: simulationState, simCount }),
      signal: controller.signal,
    })

    if (!response.ok) throw new Error("Unable to run the simulation")

    setMockResult((await response.json()) as SimulationResult)
  } catch (requestError) {
    if (requestError instanceof DOMException && requestError.name === "AbortError") {
      return
    }

    setError(
      requestError instanceof Error
        ? requestError.message
        : "Unable to run the simulation",
    )
  } finally {
    if (!controller.signal.aborted) setIsMockSimulating(false)
  }
}

const scheduleMockSimulation = (nextState: LeagueState) => {
  if (mockSimulationTimerRef.current) {
    clearTimeout(mockSimulationTimerRef.current)
  }
  mockSimulationControllerRef.current?.abort()

  mockSimulationTimerRef.current = setTimeout(() => {
    const controller = new AbortController()
    mockSimulationControllerRef.current = controller
    void runMockSimulation(nextState, controller)
  }, 400)
}

const clearMockSimulation = () => {
  if (mockSimulationTimerRef.current) {
    clearTimeout(mockSimulationTimerRef.current)
    mockSimulationTimerRef.current = null
  }
  mockSimulationControllerRef.current?.abort()
  setMockResult(null)
  setIsMockSimulating(false)
}
```

5. At the start of `startMockDraft`, call `clearMockSimulation()`.

6. After `runMockCpuUntilUserTurn` finishes (in `finally`, when this controller is still current), if draft not complete and it is user turn, schedule mock sim:

Inside `runMockCpuUntilUserTurn` `finally` block, after `setIsMockAdvancing(false)`:

```tsx
if (mockAdvanceControllerRef.current === controller) {
  setIsMockAdvancing(false)
  const teams = current.settings.teams
  const total = teams * current.settings.rounds
  const complete = current.board.currentOverall > total
  if (
    !complete &&
    isUserTurn(current.board, current.perspectiveTeamIndex, teams)
  ) {
    scheduleMockSimulation(current)
  }
}
```

Use the local `current` league state from the loop (ensure `let current` is in scope in `finally` — it already is).

7. Pass props into MockDraftView:

```tsx
<MockDraftView
  isAdvancing={isMockAdvancing}
  isSavingPick={isSavingPick}
  isSimulating={isMockSimulating}
  latestPick={latestMockPick}
  mockBoard={mockBoard}
  mockResult={mockResult}
  onMarkPicked={handleMockMarkPicked}
  onReset={handleResetMock}
  onSlotChange={handleMockSlotChange}
  perspectiveTeamIndex={mockPerspectiveTeamIndex}
  players={mockPlayers}
  state={toMockLeagueState(
    state,
    mockPerspectiveTeamIndex,
    mockPlayers,
    mockBoard,
  )}
/>
```

Do **not** write `mockResult` into Prep/Live `result`.

- [ ] **Step 4: Run DraftWorkspace + RecPanel tests**

Run:

```bash
npx.cmd vitest run tests/unit/RecPanel.test.tsx tests/unit/DraftWorkspace.test.tsx --maxWorkers=1
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/draft/DraftWorkspace.tsx src/components/draft/MockDraftView.tsx tests/unit/DraftWorkspace.test.tsx
git commit -m "feat(draft): simulate mock recommendations on user turn"
```

---

### Task 4: Spec self-check + smoke

**Files:** none new (verification only)

- [ ] **Step 1: Spec coverage checklist**

Confirm each success criterion:

| Spec item | Task |
|-----------|------|
| Right rail top 3 | Task 1–2 |
| Monte Carlo `/api/draft/simulate` | Task 3 |
| Display only | Task 2 (no handlers) |
| Refresh on user turn, not while advancing | Task 3 `finally` + no schedule during loop |
| Clear on reset/slot change | Task 3 `clearMockSimulation` in `startMockDraft` |
| Outlook hidden on Mock | Task 2 `showCategoryOutlook={false}` |
| Prep/Live unchanged defaults | Task 1 defaults |

- [ ] **Step 2: Manual smoke (optional if browser available)**

1. Start mock draft → wait for user turn → right rail shows up to 3 names + %.
2. Confirm Category outlook absent on Mock; still present on Live after a sim.
3. Reset mock → recommendations clear then refill on next user turn.

- [ ] **Step 3: Final commit only if smoke fixes needed**; otherwise done.

---

## Self-review (plan vs spec)

1. **Spec coverage:** Layout, RecPanel options, separate `mockResult`, debounce, abort, clear on reset/slot, tests — all mapped to tasks. No API changes (spec §5).
2. **Placeholders:** None; concrete code and commands included.
3. **Types:** `maxNextPicks?: number`, `showCategoryOutlook?: boolean`, `mockResult: SimulationResult | null`, `isMockSimulating` consistent across tasks.
4. **Note:** Uncommitted prior work (13-round ESPN/mock fix) may already touch `DraftWorkspace.tsx`. Implementers should keep those changes and layer this feature on top; do not revert `DEFAULT_DRAFT_ROUNDS` / `toMockLeagueState`.
