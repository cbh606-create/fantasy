# Mock Stats Peek + Next Picks Diversity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Mock player rows stable while showing projections under Recommendations, and make Next picks frequencies look like real multi-sim shares via softmax user picks plus softer RecPanel display.

**Architecture:** Softmax top-K sampling lives in `userPolicy` (shared by Prep/Live/Mock sims). `RecPanel` formats true frequencies as `~N%` and shows `Based on N sims`. Mock-only: `PlayerPool` reports hover id; `PlayerStatsPeek` under `RecPanel` renders that player’s projections.

**Tech Stack:** Next.js / React client components, Vitest + Testing Library, existing `categoryWinExpectancies` scoring.

**Spec:** `docs/superpowers/specs/2026-08-26-mock-stats-rec-diversity-design.md`

## Global Constraints

- No fake frequency rescaling in the UI — only true `count / simCount`.
- Opponent CPU policy unchanged.
- Prep/Live do not get the stats peek panel.
- Do not raise `MOCK_SIM_COUNT` or disable `fastRecommendations` in this plan.
- Player pool compact rows must not expand on hover.

## File map

| File | Role |
|------|------|
| `src/lib/sim/userPolicy.ts` | Softmax top-K user pick (`K=8`, `τ=0.08`) |
| `tests/unit/userPolicy.test.ts` | Spread vs dominance tests |
| `src/lib/sim/formatNextPickFrequency.ts` | Pure `~N%` formatter (new, tiny) |
| `src/components/draft/RecPanel.tsx` | Use formatter + sims footnote |
| `tests/unit/RecPanel.test.tsx` | Assert `~` and `Based on N sims` |
| `src/components/draft/PlayerStatsPeek.tsx` | Empty / active projection panel (new) |
| `tests/unit/PlayerStatsPeek.test.tsx` | Empty + player rendering |
| `src/components/draft/PlayerPool.tsx` | Remove inline stats; `onHoverPlayerId` |
| `tests/unit/PlayerPool.test.tsx` | Callback + no inline tooltip |
| `src/components/draft/MockDraftView.tsx` | Wire hover → peek under RecPanel |

---

### Task 1: Softmax user pick policy

**Files:**
- Modify: `src/lib/sim/userPolicy.ts`
- Modify: `tests/unit/userPolicy.test.ts`
- Keep: `src/lib/sim/engine.ts` imports of `greedyUserPick` (same export name, new behavior)

**Interfaces:**
- Consumes: existing `scorePlayer` / `categoryWinExpectancies` path inside `userPolicy.ts`
- Produces: `greedyUserPick(remaining, userRoster, allRosters, weights, rng): Player` samples from softmax over top-K scored candidates; constants `USER_PICK_TOP_K = 8`, `USER_PICK_SOFTMAX_TAU = 0.08`

- [ ] **Step 1: Write the failing tests**

Replace/extend `tests/unit/userPolicy.test.ts` so the existing “higher points wins with rng `() => 0`” case still holds for a clear leader, and add spread/dominance cases:

```ts
describe("greedyUserPick softmax", () => {
  it("usually picks the clear points leader across many draws", () => {
    const lowPoints = player("low-points", { PTS: 10 })
    const highPoints = player("high-points", { PTS: 40 })
    const baselines = [
      [player("baseline-low", { PTS: 5 })],
      [player("baseline-high", { PTS: 15 })],
    ]
    const w = weights({ PTS: 1 })

    let highCount = 0
    for (let i = 0; i < 80; i += 1) {
      const rng = () => (i + 0.5) / 80
      const picked = greedyUserPick(
        [lowPoints, highPoints],
        [],
        baselines,
        w,
        rng,
      )
      if (picked.id === "high-points") highCount += 1
    }

    expect(highCount).toBeGreaterThan(60)
  })

  it("spreads picks across near-tied scorers", () => {
    const a = player("a", { PTS: 20 })
    const b = player("b", { PTS: 19.5 })
    const c = player("c", { PTS: 19 })
    const baselines = [
      [player("baseline-low", { PTS: 5 })],
      [player("baseline-high", { PTS: 15 })],
    ]
    const w = weights({ PTS: 1 })
    const counts = new Map<string, number>()

    for (let i = 0; i < 120; i += 1) {
      const rng = () => (i + 0.5) / 120
      const picked = greedyUserPick([a, b, c], [], baselines, w, rng)
      counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1)
    }

    expect(counts.size).toBeGreaterThanOrEqual(2)
    expect(counts.get("a") ?? 0).toBeGreaterThan(0)
  })
})
```

Keep the existing `evaluateForcePick` test unchanged.

- [ ] **Step 2: Run tests to verify they fail (or old greedy always-picks-leader makes spread fail)**

Run: `npx vitest run tests/unit/userPolicy.test.ts`

Expected: spread test FAILS under pure greedy (counts.size === 1), or new describe fails if not implemented.

- [ ] **Step 3: Implement softmax in `greedyUserPick`**

In `src/lib/sim/userPolicy.ts`, replace the “best score only” selection with:

```ts
export const USER_PICK_TOP_K = 8
export const USER_PICK_SOFTMAX_TAU = 0.08

// inside greedyUserPick after scoring every remaining player into { player, score }[]:
// 1. sort by score desc, id asc for ties
// 2. take top min(K, n)
// 3. maxScore = top[0].score
// 4. weights_i = exp((score_i - maxScore) / TAU)
// 5. sample with rng() against cumulative weights
```

Keep `evaluateForcePick` calling `greedyUserPick` on the single-player filtered list (softmax of one remains that player).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/userPolicy.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sim/userPolicy.ts tests/unit/userPolicy.test.ts
git commit -m "feat(sim): sample user picks with softmax top-K"
```

---

### Task 2: RecPanel approximate frequency + sims footnote

**Files:**
- Create: `src/lib/sim/formatNextPickFrequency.ts`
- Create: `tests/unit/formatNextPickFrequency.test.ts`
- Modify: `src/components/draft/RecPanel.tsx`
- Modify: `tests/unit/RecPanel.test.tsx`

**Interfaces:**
- Consumes: `pick.frequency: number`, `result.meta.simCount: number`
- Produces: `formatNextPickFrequency(frequency: number): string` → e.g. `"~50%"` for `0.5`; `"~100%"` for `1`

- [ ] **Step 1: Write failing formatter + RecPanel tests**

`tests/unit/formatNextPickFrequency.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { formatNextPickFrequency } from "@/lib/sim/formatNextPickFrequency"

describe("formatNextPickFrequency", () => {
  it("prefixes a rounded percent with tilde", () => {
    expect(formatNextPickFrequency(0.5)).toBe("~50%")
    expect(formatNextPickFrequency(1)).toBe("~100%")
    expect(formatNextPickFrequency(0.333)).toBe("~33%")
  })
})
```

In `tests/unit/RecPanel.test.tsx`, add:

```ts
  it("shows approximate frequencies and sim count", () => {
    render(
      <RecPanel
        maxNextPicks={3}
        players={players}
        result={result}
        showCategoryOutlook={false}
      />,
    )

    expect(screen.getByText("~50%")).toBeInTheDocument()
    expect(screen.getByText("~30%")).toBeInTheDocument()
    expect(screen.getByText(/Based on 10 sims/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/formatNextPickFrequency.test.ts tests/unit/RecPanel.test.tsx`

Expected: FAIL (module missing / still shows `50%` without `~` / no sims line)

- [ ] **Step 3: Implement formatter and RecPanel UI**

`src/lib/sim/formatNextPickFrequency.ts`:

```ts
export const formatNextPickFrequency = (frequency: number): string => {
  const pct = Math.round(Math.min(1, Math.max(0, frequency)) * 100)
  return `~${pct}%`
}
```

In `RecPanel.tsx`:
- Import `formatNextPickFrequency`
- Replace `{Math.round(pick.frequency * 100)}%` with `{formatNextPickFrequency(pick.frequency)}`
- When `result` is non-null, under the Next picks heading (both `stack` and `row`), render:

```tsx
<p className="text-xs text-[var(--color-mute)]">
  Based on {result.meta.simCount} sims
</p>
```

Place it so row layout still fits (beside or under the heading cluster).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/formatNextPickFrequency.test.ts tests/unit/RecPanel.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sim/formatNextPickFrequency.ts tests/unit/formatNextPickFrequency.test.ts src/components/draft/RecPanel.tsx tests/unit/RecPanel.test.tsx
git commit -m "feat(draft): show approximate Next picks percent and sim count"
```

---

### Task 3: PlayerStatsPeek component

**Files:**
- Create: `src/components/draft/PlayerStatsPeek.tsx`
- Create: `tests/unit/PlayerStatsPeek.test.tsx`

**Interfaces:**
- Consumes: `player: Player | null`
- Produces: React component showing empty copy or name + 9-cat `projections`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PlayerStatsPeek } from "@/components/draft/PlayerStatsPeek"
import type { Player } from "@/lib/domain/types"

const player: Player = {
  id: "a",
  name: "Alpha",
  positions: ["PG"],
  teamAbbr: "NYK",
  projections: {
    FG_PCT: 0.45,
    FT_PCT: 0.8,
    TPM: 100,
    REB: 400,
    AST: 300,
    STL: 50,
    BLK: 20,
    TO: 150,
    PTS: 1200,
  },
  adp: 1,
}

afterEach(() => cleanup())

describe("PlayerStatsPeek", () => {
  it("shows empty copy when no player", () => {
    render(<PlayerStatsPeek player={null} />)
    expect(
      screen.getByText(/Hover a player to see projections/i),
    ).toBeInTheDocument()
  })

  it("shows nine-cat projections for the player", () => {
    render(<PlayerStatsPeek player={player} />)
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("PTS")).toBeInTheDocument()
    expect(screen.getByText("1200")).toBeInTheDocument()
    expect(screen.getByText("0.450")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/PlayerStatsPeek.test.tsx`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement `PlayerStatsPeek`**

```tsx
"use client"

import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, Player } from "@/lib/domain/types"

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

const formatProjection = (categoryId: CategoryId, value: number) => {
  if (categoryId === "FG_PCT" || categoryId === "FT_PCT") {
    return value.toFixed(3)
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

type PlayerStatsPeekProps = {
  player: Player | null
}

export const PlayerStatsPeek = ({ player }: PlayerStatsPeekProps) => {
  return (
    <section
      aria-label="Player projections"
      className="mt-3 rounded-2xl border border-[var(--color-hairline)] bg-white px-4 py-3"
    >
      {player ? (
        <>
          <p className="text-sm font-semibold">
            {player.name}
            <span className="ml-1.5 font-normal text-[var(--color-mute)]">
              {player.teamAbbr ?? "—"}
            </span>
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs sm:grid-cols-5">
            {ALL_CATEGORY_IDS.map((categoryId) => (
              <div className="flex justify-between gap-1" key={categoryId}>
                <dt className="text-[var(--color-mute)]">
                  {CATEGORY_LABELS[categoryId]}
                </dt>
                <dd className="tabular-nums font-medium">
                  {formatProjection(categoryId, player.projections[categoryId])}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-sm text-[var(--color-mute)]">
          Hover a player to see projections
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/PlayerStatsPeek.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/draft/PlayerStatsPeek.tsx tests/unit/PlayerStatsPeek.test.tsx
git commit -m "feat(draft): add PlayerStatsPeek panel"
```

---

### Task 4: PlayerPool hover callback without row expansion

**Files:**
- Modify: `src/components/draft/PlayerPool.tsx`
- Modify: `tests/unit/PlayerPool.test.tsx`

**Interfaces:**
- Consumes: optional `onHoverPlayerId?: (playerId: string | null) => void`
- Produces: fires callback on compact row enter/leave/focus/blur; no inline `role="tooltip"` stats under the name

- [ ] **Step 1: Update PlayerPool tests (failing until callback + no tooltip)**

Replace the existing “shows projection stats under the player on hover” test with:

```ts
  it("does not expand inline stats and reports hover id", () => {
    const onHoverPlayerId = vi.fn()
    render(
      <PlayerPool
        compact
        onHoverPlayerId={onHoverPlayerId}
        onMarkPicked={vi.fn()}
        pickedPlayerIds={[]}
        players={players}
      />,
    )

    const row = screen.getByText(/Amy Player/).closest("tr")!
    fireEvent.mouseEnter(row)
    expect(onHoverPlayerId).toHaveBeenCalledWith("b")
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    fireEvent.mouseLeave(row)
    expect(onHoverPlayerId).toHaveBeenCalledWith(null)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/PlayerPool.test.tsx`

Expected: FAIL (prop missing and/or tooltip still present)

- [ ] **Step 3: Implement callback; remove inline stats block**

In `PlayerPool.tsx`:
- Add `onHoverPlayerId?: (playerId: string | null) => void` to props
- Remove local `hoveredPlayerId` state used for inline stats
- On compact row `onMouseEnter` / `onFocus`: `onHoverPlayerId?.(player.id)`
- On `onMouseLeave` / blur-out: `onHoverPlayerId?.(null)`
- Delete the inline `<dl role="tooltip">…</dl>` block under the name

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/PlayerPool.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/draft/PlayerPool.tsx tests/unit/PlayerPool.test.tsx
git commit -m "fix(draft): report pool hover without expanding rows"
```

---

### Task 5: Wire MockDraftView peek under Recommendations

**Files:**
- Modify: `src/components/draft/MockDraftView.tsx`
- Create: `tests/unit/MockDraftView.test.tsx`

**Interfaces:**
- Consumes: `PlayerStatsPeek`, `PlayerPool.onHoverPlayerId`, `players` list
- Produces: hover id state → peek player under `RecPanel`

- [ ] **Step 1: Write failing MockDraftView hover wiring test**

Create `tests/unit/MockDraftView.test.tsx` with the smallest valid props (reuse board/player fixtures from other draft tests). Assert empty peek copy, then hover a pool row and expect projections (`PTS`) inside `getByLabelText(/player projections/i)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/MockDraftView.test.tsx`

Expected: FAIL (peek not wired)

- [ ] **Step 3: Wire state in `MockDraftView`**

```tsx
const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null)
const hoveredPlayer =
  hoveredPlayerId === null
    ? null
    : (players.find((player) => player.id === hoveredPlayerId) ?? null)

// directly under RecPanel:
<PlayerStatsPeek player={hoveredPlayer} />

// PlayerPool:
onHoverPlayerId={setHoveredPlayerId}
```

Import `useState` and `PlayerStatsPeek`.

- [ ] **Step 4: Run related tests**

Run: `npx vitest run tests/unit/MockDraftView.test.tsx tests/unit/PlayerPool.test.tsx tests/unit/RecPanel.test.tsx tests/unit/userPolicy.test.ts tests/unit/PlayerStatsPeek.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/draft/MockDraftView.tsx tests/unit/MockDraftView.test.tsx
git commit -m "feat(mock): show hovered player stats under recommendations"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| No row expansion; hover reports player | Task 4 |
| Stats under Mock Recommendations | Task 3 + 5 |
| Prep/Live no peek | Task 5 only touches Mock |
| Softmax top-K user policy | Task 1 |
| True frequencies only | Task 1–2 (no rescale) |
| `~N%` + Based on N sims | Task 2 |
| Opponent unchanged | No opponent edits |
| Tests listed in spec | Tasks 1–5 |

## Placeholder / consistency review

- Export name stays `greedyUserPick` so `engine.ts` needs no import rename.
- `USER_PICK_TOP_K = 8`, `USER_PICK_SOFTMAX_TAU = 0.08` fixed in Task 1; tune only if spread/dominance tests need a one-line constant change.
- Empty copy exact string: `Hover a player to see projections`.
