# Needs-Aware Draft Recs + Mock Strategy Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User Mock/sim picks score roster category needs + position gaps (with punt/focus weights), editable Punt/Focus chips on Mock, and remove the Prep tab.

**Architecture:** Extract shared `positionNeedBonus` into `src/lib/sim/rosterNeeds.ts`. Extend `greedyUserPick` scoring with a scaled position term on top of existing EV + pool z-score. Remove Prep from `DraftWorkspace`; add Mock strategy chips that PATCH league settings and reschedule mock sims.

**Tech Stack:** TypeScript, React, Vitest + Testing Library (jsdom), existing `/api/leagues/[id]` PATCH, `effectiveWeights`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-27-draft-needs-aware-recs-design.md`
- No ADP prior in user scoring
- Opponent CPU stays ADP + position (no category-need restore)
- Do not port Prep “Run N sims” / top combinations into Mock
- Punt ↔ Focus mutual exclusion matches `LeagueSetupForm.handleStrategyToggle`
- Position bonus raw values are ~0/25/50; scale into EV+z space with `USER_PICK_POSITION_NEED_SCALE = 1/25` (max +2.0)

---

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/sim/rosterNeeds.ts` | Shared `positionNeedBonus(player, roster): number` (move from opponent) |
| `src/lib/sim/opponent.ts` | Import shared bonus; keep opponent scoring otherwise |
| `src/lib/sim/userPolicy.ts` | `score = EV + z + scale * positionNeedBonus` |
| `src/components/draft/MockDraftView.tsx` | Punt/Focus chip UI + `onStrategyChange` |
| `src/components/draft/DraftWorkspace.tsx` | Tabs Mock\|Live; persist strategy; resim |
| `src/components/draft/PrepView.tsx` | Delete when unreferenced |
| `src/components/league/LeagueSetupForm.tsx` | Default draft tab after create: `"mock"` instead of `"prep"` |
| `tests/unit/userPolicy.test.ts` | Need / punt / position cases |
| `tests/unit/rosterNeeds.test.ts` | Position bonus unit cases |
| `tests/unit/DraftWorkspace.tabs.test.tsx` | Prep gone; Mock chips present (jsdom smoke) |

---

### Task 1: Shared `positionNeedBonus`

**Files:**
- Create: `src/lib/sim/rosterNeeds.ts`
- Modify: `src/lib/sim/opponent.ts` (re-export or import shared helper; remove local duplicate of full `positionNeedBonus` used by `scoreOpponentNeed` / `pickSimOpponent` if applicable — keep `positionNeedBonusLight` for mock CPU if still used)
- Test: `tests/unit/rosterNeeds.test.ts`

**Interfaces:**
- Produces: `export const positionNeedBonus = (player: Player, roster: Player[]): number`
- Behavior: copy exact logic from current `opponent.ts` `positionNeedBonus` (50 uncovered primary, 25 secondary fit improves starter count, else 0)

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/rosterNeeds.test.ts
import { describe, expect, it } from "vitest"
import type { Player } from "@/lib/domain/types"
import { positionNeedBonus } from "@/lib/sim/rosterNeeds"

const player = (id: string, positions: Player["positions"]): Player => ({
  id,
  name: id,
  positions,
  projections: {
    FG_PCT: 0.5, FT_PCT: 0.8, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0,
  },
  adp: 50,
})

describe("positionNeedBonus", () => {
  it("returns 50 when primary position is missing from roster", () => {
    expect(positionNeedBonus(player("pg", ["PG"]), [])).toBe(50)
  })

  it("returns 0 when primary position already covered", () => {
    expect(
      positionNeedBonus(player("pg2", ["PG"]), [player("pg1", ["PG"])]),
    ).toBe(0)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npx vitest run tests/unit/rosterNeeds.test.ts`  
Expected: FAIL cannot find module `@/lib/sim/rosterNeeds`

- [ ] **Step 3: Implement `rosterNeeds.ts` by moving logic from `opponent.ts`**

Move `canFillSlot`, `maximumStarterFits`, `DEFAULT_STARTER_SLOTS`, guards, and `positionNeedBonus` into `rosterNeeds.ts`. Update `opponent.ts` to import `positionNeedBonus` from `./rosterNeeds` (and keep light variant local or also move if simpler).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/unit/rosterNeeds.test.ts`  
Also: `npx vitest run tests/unit/opponentPolicy.test.ts` or whatever existing opponent tests are named — ensure green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sim/rosterNeeds.ts src/lib/sim/opponent.ts tests/unit/rosterNeeds.test.ts
git commit -m "refactor(sim): extract shared positionNeedBonus"
```

---

### Task 2: User policy + position need term

**Files:**
- Modify: `src/lib/sim/userPolicy.ts`
- Test: `tests/unit/userPolicy.test.ts`

**Interfaces:**
- Consumes: `positionNeedBonus` from `@/lib/sim/rosterNeeds`
- Produces: `USER_PICK_POSITION_NEED_SCALE = 1/25`  
  `scorePlayer = categoryEV + talentZ + USER_PICK_POSITION_NEED_SCALE * positionNeedBonus(...)`

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/userPolicy.test.ts`:

```ts
describe("greedyUserPick position need", () => {
  it("prefers uncovered primary position when projections are equal", () => {
    const sameStats = {
      FG_PCT: 0.5, FT_PCT: 0.8, TPM: 100, REB: 400, AST: 300,
      STL: 50, BLK: 50, TO: 150, PTS: 1200,
    }
    const needPg = player("need-pg", sameStats, 10)
    needPg.positions = ["PG"]
    const extraC = player("extra-c", sameStats, 10)
    extraC.positions = ["C"]
    const roster = [player("have-c", sameStats, 10)]
    roster[0].positions = ["C"]
    const emptyOthers = Array.from({ length: 11 }, () => [] as Player[])
    const allRosters = [roster, ...emptyOthers]
    const w = Object.fromEntries(ALL_CATEGORY_IDS.map((id) => [id, 1])) as Record<CategoryId, number>

    const picked = greedyUserPick(
      [extraC, needPg],
      roster,
      allRosters,
      w,
      () => 0,
    )
    expect(picked.id).toBe("need-pg")
  })
})

describe("greedyUserPick punt", () => {
  it("ignores punt category when ranking specialists", () => {
    const rebGod = player("reb-god", { REB: 900, PTS: 800, STL: 40 }, 20)
    const stlGod = player("stl-god", { REB: 300, PTS: 800, STL: 120 }, 20)
    const fillers = Array.from({ length: 15 }, (_, i) =>
      player(`f${i}`, { REB: 300, PTS: 700, STL: 50 }, 40 + i),
    )
    const emptyLeague = Array.from({ length: 12 }, () => [] as Player[])
    const puntReb = Object.fromEntries(
      ALL_CATEGORY_IDS.map((id) => [id, id === "REB" ? 0 : 1]),
    ) as Record<CategoryId, number>

    const picked = greedyUserPick(
      [rebGod, stlGod, ...fillers],
      [],
      emptyLeague,
      puntReb,
      () => 0,
    )
    expect(picked.id).toBe("stl-god")
  })
})
```

(Adjust `player()` helper if it does not yet accept mutating positions — set `positions` on the object as shown.)

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/unit/userPolicy.test.ts`  
Expected: FAIL on position-need case (extra-c may win without bonus)

- [ ] **Step 3: Implement scoring change**

In `userPolicy.ts`:

```ts
import { positionNeedBonus } from "@/lib/sim/rosterNeeds"

export const USER_PICK_POSITION_NEED_SCALE = 1 / 25

// inside scorePlayer:
return (
  categoryScore +
  talentScore +
  USER_PICK_POSITION_NEED_SCALE * positionNeedBonus(player, userRoster)
)
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/unit/userPolicy.test.ts tests/unit/engine.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sim/userPolicy.ts tests/unit/userPolicy.test.ts
git commit -m "feat(sim): add position need to user pick score"
```

---

### Task 3: Remove Prep tab; Mock strategy chips + persist

**Files:**
- Modify: `src/components/draft/DraftWorkspace.tsx`
- Modify: `src/components/draft/MockDraftView.tsx`
- Modify: `src/components/league/LeagueSetupForm.tsx` (default `draftTab` → `"mock"`)
- Delete: `src/components/draft/PrepView.tsx` (if no remaining imports)
- Test: `tests/unit/DraftWorkspace.tabs.test.tsx` (jsdom)

**Interfaces:**
- `MockDraftView` new props:
  - `onStrategyChange: (next: { puntCategoryIds: CategoryId[]; focusCategoryIds: CategoryId[] }) => void`
- `DraftWorkspace.handleStrategyChange`: update `state.settings`, `PATCH /api/leagues/${leagueId}` with full state (same pattern as live board save), then `scheduleMockSimulation` with updated mock state

- [ ] **Step 1: Write failing workspace smoke test**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
// Mock heavy children / fetch as needed so DraftWorkspace mounts
// Assert:
// - no tab named Prep
// - tabs include Mock and Live
// - when activeTab mock (default), strategy chip group exists (getByRole or label /Punt/i)
```

Keep the smoke minimal: if full `DraftWorkspace` is hard to mount, test a small extracted `DraftStrategyChips` component instead — prefer extract if DraftWorkspace tests are heavy.

**Preferred extract (if smoke is hard):**

- Create `src/components/draft/DraftStrategyChips.tsx` with props `{ puntCategoryIds, focusCategoryIds, onToggle(strategy, categoryId) }`
- Unit-test that component in jsdom
- Still remove Prep from DraftWorkspace in this task

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement chips + Prep removal**

Chip toggle logic (mirror LeagueSetupForm):

```ts
const toggle = (strategy: "punt" | "focus", categoryId: CategoryId) => {
  let punt = [...state.settings.puntCategoryIds]
  let focus = [...state.settings.focusCategoryIds]
  if (strategy === "punt") {
    punt = punt.includes(categoryId) ? punt.filter((id) => id !== categoryId) : [...punt, categoryId]
    focus = focus.filter((id) => id !== categoryId)
  } else {
    focus = focus.includes(categoryId) ? focus.filter((id) => id !== categoryId) : [...focus, categoryId]
    punt = punt.filter((id) => id !== categoryId)
  }
  onStrategyChange({ puntCategoryIds: punt, focusCategoryIds: focus })
}
```

UI: two rows labeled Punt / Focus; buttons for each of `ALL_CATEGORY_IDS` with short labels (FG%, …). Active chip: ink fill (focus) / soft-cloud (punt) matching setup form.

DraftWorkspace:
- Remove `"prep"` from tab map / rendering
- Default `activeTab` to `"mock"`
- `handleStrategyChange`: `setState` with new settings → PATCH league → `scheduleMockSimulation(toMockLeagueState(...))`
- LeagueSetupForm: change default `draftTab` parameter from `"prep"` to `"mock"`; any `?tab=prep` links → mock

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/DraftWorkspace.tabs.test.tsx tests/unit/userPolicy.test.ts`  
Manual: open Draft → only Mock|Live; toggle Punt TO; recommendations refresh.

- [ ] **Step 5: Commit**

```bash
git add src/components/draft/DraftWorkspace.tsx src/components/draft/MockDraftView.tsx src/components/draft/DraftStrategyChips.tsx src/components/league/LeagueSetupForm.tsx tests/unit/DraftWorkspace.tabs.test.tsx
git rm src/components/draft/PrepView.tsx   # if deleted
git commit -m "feat(draft): Mock punt/focus chips and remove Prep tab"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run focused + related suites**

```bash
npx vitest run tests/unit/rosterNeeds.test.ts tests/unit/userPolicy.test.ts tests/unit/engine.test.ts tests/unit/DraftWorkspace.tabs.test.tsx
```

Expected: all PASS

- [ ] **Step 2: Grep for dead Prep references**

```bash
rg -n "PrepView|activeTab.*prep|tab=prep" src tests
```

Expected: no remaining required references (docs/specs mentioning Prep historically OK)

- [ ] **Step 3: Commit any leftover fixups** if needed

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Category needs via EV on roster∪player | Task 2 (already partially present; covered by punt/gap tests) |
| Position needs via shared bonus | Tasks 1–2 |
| Punt/Focus via effectiveWeights + Mock chips | Tasks 2–3 |
| Remove Prep; Mock\|Live only | Task 3 |
| Persist settings + resim | Task 3 |
| No ADP prior | Task 2 (do not reintroduce) |
| Scale position bonus | Task 2 (`1/25`) |

## Placeholder / consistency review

- No TBD steps; scale constant fixed at `1/25`
- `positionNeedBonus` name consistent across tasks
- Strategy change payload `{ puntCategoryIds, focusCategoryIds }` consistent
