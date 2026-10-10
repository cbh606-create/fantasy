# Draft CPU vs Sim Pick Policies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Live CPU auto-picks (pure best ADP) from simulation opponent picks (ADP top-8 + position need + weighted random) so boards stay realistic while sims vary by seed.

**Architecture:** Add two pickers in `src/lib/sim/opponent.ts`. Wire `advanceCpuPicksUntilUserTurn` to the Live picker and `simulateDraft` opponents to the Sim picker. Remove the shared pure-ADP `pickOpponentPlayer` once call sites move. Do not use category-need scoring for either path.

**Tech Stack:** TypeScript, Vitest (`npx.cmd vitest run --maxWorkers=1`), existing `createRng` / `positionNeedBonus` helpers

## Global Constraints

- Live picker: best remaining ADP only; RNG only on ADP ties
- Sim picker: `SIM_ADP_WINDOW = 8`; score = `(1/adp)*100 + positionNeedBonus`; no `categoryNeedBonus`
- Do not change `greedyUserPick` / user recommendation policy
- Do not change ADP data source (`data/players/stats_2025_26.json`)
- PowerShell: use `npx.cmd` / `npm.cmd`, not `npm` / `npx` alone
- No semicolons; match existing file style

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/sim/opponent.ts` | `SIM_ADP_WINDOW`, `pickLiveCpuByAdp`, `pickSimOpponent`, slim sim scoring; remove `pickOpponentPlayer` |
| `src/lib/sim/advanceCpuPicks.ts` | Call `pickLiveCpuByAdp`; drop unused weights/leagueAvg for CPU path |
| `src/lib/sim/engine.ts` | Opponent branch calls `pickSimOpponent` |
| `tests/unit/opponent.test.ts` | Live + Sim picker unit coverage |
| `tests/unit/advanceCpuPicks.test.ts` | Unchanged behavior (still ADP-ordered early fills) — smoke after wire |

---

### Task 1: Live + Sim pickers (TDD in opponent.ts)

**Files:**
- Modify: `src/lib/sim/opponent.ts`
- Modify: `tests/unit/opponent.test.ts`

**Interfaces:**
- Consumes: existing `positionNeedBonus` (module-private), `createRng`, `Player`
- Produces:
  - `export const SIM_ADP_WINDOW = 8`
  - `export const pickLiveCpuByAdp = (remaining: Player[], rng: () => number) => Player`
  - `export const pickSimOpponent = (remaining: Player[], roster: Player[], rng: () => number) => Player`
  - `export const scoreSimOpponent = (player: Player, roster: Player[]) => number` (ADP weight + position only; used by picker + tests)

- [ ] **Step 1: Replace `pickOpponentPlayer` tests with failing Live/Sim tests**

In `tests/unit/opponent.test.ts`, keep `createRng` and `scoreOpponentNeed` describe blocks for now. Replace the `pickOpponentPlayer` describe with:

```ts
import {
  createRng,
  pickLiveCpuByAdp,
  pickSimOpponent,
  scoreOpponentNeed,
  scoreSimOpponent,
  SIM_ADP_WINDOW,
} from "@/lib/sim/opponent"

describe("pickLiveCpuByAdp", () => {
  it("always takes the best remaining ADP", () => {
    const remaining = [
      player("first", ["PG"], 12),
      player("second", ["SG"], 3),
      player("third", ["SF"], 40),
    ]

    expect(pickLiveCpuByAdp(remaining, () => 0.6).id).toBe("second")
  })

  it("breaks ADP ties with the supplied RNG", () => {
    const remaining = [
      player("alpha", ["PG"], 5),
      player("beta", ["SG"], 5),
      player("gamma", ["SF"], 20),
    ]

    expect(pickLiveCpuByAdp(remaining, () => 0).id).toBe("alpha")
    expect(pickLiveCpuByAdp(remaining, () => 0.99).id).toBe("beta")
  })
})

describe("scoreSimOpponent", () => {
  it("combines ADP weight and position need without category bonus", () => {
    const roster = [player("center", ["C"], 20)]
    const guard = player("guard", ["PG"], 10)

    // (1/10)*100 + 50 primary miss = 60
    expect(scoreSimOpponent(guard, roster)).toBe(60)
  })
})

describe("pickSimOpponent", () => {
  it("never selects outside the ADP top window", () => {
    const remaining = Array.from({ length: SIM_ADP_WINDOW + 2 }, (_, index) =>
      player(`p${index + 1}`, ["PG"], index + 1),
    )
    // ADP 1..10; window keeps 1..8. Force rng to end of cumulative mass still inside window.
    const picked = pickSimOpponent(remaining, [], () => 0.999999)

    expect(Number(picked.adp)).toBeLessThanOrEqual(SIM_ADP_WINDOW)
    expect(picked.id).not.toBe("p9")
    expect(picked.id).not.toBe("p10")
  })

  it("can prefer a position fit inside the window over a slightly better ADP", () => {
    const remaining = [
      player("star-c", ["C"], 1),
      player("fit-pg", ["PG"], 2),
    ]
    const roster = [
      player("c1", ["C"], 40),
      player("c2", ["C"], 41),
      player("c3", ["C"], 42),
    ]
    // star-c: 100 + 0 = 100 (primary C covered)
    // fit-pg: 50 + 50 = 100 (primary PG missing)
    // Equal mass; rng in (0.5, 1) selects fit-pg
    expect(pickSimOpponent(remaining, roster, () => 0.75).id).toBe("fit-pg")
  })
})
```

Leave legacy `scoreOpponentNeed` (includes category) unchanged so its existing tests keep passing. New sim scoring goes through `scoreSimOpponent` only.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/opponent.test.ts
```

Expected: FAIL — `pickLiveCpuByAdp` / `pickSimOpponent` / `scoreSimOpponent` not exported

- [ ] **Step 3: Implement pickers in `opponent.ts`**

Add near the bottom of `src/lib/sim/opponent.ts` (keep `positionNeedBonus` private; keep current `pickOpponentPlayer` temporarily so call sites still compile until Task 2):

```ts
export const SIM_ADP_WINDOW = 8

export const scoreSimOpponent = (
  player: Player,
  roster: Player[],
): number => (1 / player.adp) * 100 + positionNeedBonus(player, roster)

export const pickLiveCpuByAdp = (
  remaining: Player[],
  rng: () => number,
): Player => {
  if (remaining.length === 0) {
    throw new RangeError("Cannot pick a live CPU player from an empty pool")
  }

  const bestAdp = remaining.reduce(
    (lowest, player) => Math.min(lowest, player.adp),
    remaining[0].adp,
  )
  const tied = remaining.filter((player) => player.adp === bestAdp)

  if (tied.length === 1) {
    return tied[0]
  }

  const index = Math.min(tied.length - 1, Math.floor(rng() * tied.length))
  return tied[index]
}

export const pickSimOpponent = (
  remaining: Player[],
  roster: Player[],
  rng: () => number,
): Player => {
  if (remaining.length === 0) {
    throw new RangeError("Cannot pick a sim opponent from an empty pool")
  }

  const candidates = [...remaining]
    .sort((left, right) => left.adp - right.adp || left.id.localeCompare(right.id))
    .slice(0, SIM_ADP_WINDOW)

  const scores = candidates.map((player) => scoreSimOpponent(player, roster))
  const totalScore = scores.reduce((total, score) => total + score, 0)
  const threshold = rng() * totalScore
  let cumulativeScore = 0

  for (let index = 0; index < candidates.length; index++) {
    cumulativeScore += scores[index]
    if (threshold < cumulativeScore) {
      return candidates[index]
    }
  }

  return candidates[candidates.length - 1]
}
```

Remove the pure-ADP body from `pickOpponentPlayer` later in Task 2; for this step you may make `pickOpponentPlayer` a deprecated alias of `pickLiveCpuByAdp` that ignores roster/weights/leagueAvg so nothing breaks mid-task:

```ts
export const pickOpponentPlayer = (
  remaining: Player[],
  _roster: Player[],
  _weights: CategoryWeights,
  _leagueAvg: Record<CategoryId, number>,
  rng: () => number,
): Player => pickLiveCpuByAdp(remaining, rng)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/opponent.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sim/opponent.ts tests/unit/opponent.test.ts
git commit -m "feat(draft): add separate live ADP and sim opponent pickers"
```

---

### Task 2: Wire call sites and delete shared picker

**Files:**
- Modify: `src/lib/sim/advanceCpuPicks.ts`
- Modify: `src/lib/sim/engine.ts`
- Modify: `src/lib/sim/opponent.ts` (remove `pickOpponentPlayer`)
- Modify: `tests/unit/opponent.test.ts` (ensure no imports of `pickOpponentPlayer`)

**Interfaces:**
- Consumes: `pickLiveCpuByAdp`, `pickSimOpponent` from Task 1
- Produces: Live advance + sim engine use split policies; no remaining `pickOpponentPlayer` references in `src/`

- [ ] **Step 1: Update `advanceCpuPicks.ts`**

Replace import:

```ts
import { createRng, pickLiveCpuByAdp } from "@/lib/sim/opponent"
```

Remove unused `effectiveWeights` / `averagePlayerProjections` / `weights` / `leagueAvg` if they exist only for the old picker. Keep roster building if still needed for nothing — after Live switch, roster arrays are unused for picking; you may leave roster updates for consistency or delete dead roster code only if it becomes clearly unused. Minimal change: replace the pick call:

```ts
const selectedPlayer = pickLiveCpuByAdp(remaining, rng)
```

Delete the `weights` and `leagueAvg` locals and related imports if the compiler reports them unused.

- [ ] **Step 2: Update `engine.ts` opponent branch**

Replace import of `pickOpponentPlayer` with `pickSimOpponent`:

```ts
import { createRng, pickSimOpponent } from "@/lib/sim/opponent"
```

Opponent branch:

```ts
selectedPlayer = pickSimOpponent(
  remaining,
  rosters[pick.teamIndex],
  rng,
)
```

Keep `weights` / `leagueAvg` in `simulateDraft` if still used by user-policy scoring; only drop them from the opponent call.

- [ ] **Step 3: Delete `pickOpponentPlayer` from `opponent.ts`**

Remove the export entirely. Grep to confirm no remaining references:

```bash
rg "pickOpponentPlayer" src tests
```

Expected: no matches

- [ ] **Step 4: Run focused tests**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/opponent.test.ts tests/unit/advanceCpuPicks.test.ts tests/api/simulate.test.ts tests/unit/DraftWorkspace.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sim/opponent.ts src/lib/sim/advanceCpuPicks.ts src/lib/sim/engine.ts tests/unit/opponent.test.ts
git commit -m "refactor(draft): wire live ADP and sim windowed opponent picks"
```

---

### Task 3: Verification smoke

**Files:**
- None required unless a test failed and needs a small fixture fix

- [ ] **Step 1: Run draft/sim related suites again**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/opponent.test.ts tests/unit/advanceCpuPicks.test.ts tests/api/simulate.test.ts tests/unit/DraftWorkspace.test.tsx
```

Expected: PASS

- [ ] **Step 2: Manual sanity (optional if UI available)**

1. Open a manual draft Live board — early CPU fills should follow ADP (stars, not late-ADP outliers)
2. Run Prep simulation twice (different seeds / repeated Run) — recommendation mix should not be identical every time

- [ ] **Step 3: Commit only if Step 2 required code fixes**

```bash
git add <fixed-files>
git commit -m "fix(draft): tighten sim opponent window fixtures"
```

If no fixes: skip commit.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Live best ADP | Task 1 `pickLiveCpuByAdp`, Task 2 wire |
| Sim ADP top-8 + position + weighted random | Task 1 `pickSimOpponent`, Task 2 wire |
| No category need on opponents | Task 1 `scoreSimOpponent` |
| `advanceCpuPicks` / `engine` call sites | Task 2 |
| Remove shared picker | Task 2 |
| Unit tests for window + position | Task 1 |
| Existing suites still pass | Task 2–3 |
