# Multi-Spot Density-First Hold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep 1-spot always-cover; make 2/3-spot hold mid-block off nights and only spend adds on dense today-starting blocks (`ok`+) or late-week thin leftover.

**Architecture:** Split the early-swap off-night branch by `spotCount`. Multi-spot accepts upgrades when `pickTodayBlock.tier` rank ≥ `ok`, or `allowsThinFill` + `pickBestFa`. Iterate spots by ascending `addsBySpot` for even budget craft.

**Tech Stack:** TypeScript, Vitest, existing `streamingBlocks` / `streamingStrategy` tiers.

## Global Constraints

- 1-spot always-cover unchanged
- 2/3-spot: default hold on off nights while held has remaining games
- Multi-spot off-night upgrade: tier ≥ `ok`, or late thin via `allowsThinFill`
- No `upgradeRemaining > heldRemaining` gate for multi-spot cover
- Cover/fill prefer lower `addsBySpot` first
- On-game `allowsEarlySwap` unchanged
- Do not change tier definitions in `streamingBlocks.ts`

## File map

| File | Role |
|------|------|
| `src/lib/matchup/streamingPlans.ts` | Split off-night logic; spot order |
| `tests/unit/streamingPlans.test.ts` | Multi-spot density hold/cover tests |
| Spec/plan docs | Commit with feature |

---

### Task 1: Multi-spot density hold + tests

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts`
- Modify: `tests/unit/streamingPlans.test.ts`
- Add/commit: spec + this plan under `docs/superpowers/`

**Interfaces:**
- Consumes: `pickTodayBlock`, `pickBestFa`, `allowsThinFill`, `densityTierRank`, `allowsEarlySwap`
- Produces: 2/3-spot hold mid-block; density/`ok`+ off-night upgrades; late thin

- [ ] **Step 1: Write failing tests**

```ts
describe("2/3-spot density-first off nights", () => {
  const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]

  it("holds 2-spot mid-block off night when only thin FA plays today", () => {
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 150 },
    })
    // Need a second FA so 2-spot can fill spot 1 without taking CHI on Mon if needed
    const atl = player("fa-atl", "ATL", {
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState([bos, chi, atl], ["fa-bos", "fa-chi", "fa-atl"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "NYK" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      addLimit: 7,
    })
    // Spot that holds BOS through Tue must stay hold (thin CHI only)
    const tueBos = plan.days[1]!.cells.find((c) => c.playerId === "fa-bos")
    expect(tueBos?.action).toBe("hold")
  })

  it("drop_adds on 2-spot off night when dense ok+ block starts today", () => {
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    // NYK: Tue+Wed = 2 games in window from Tue → ok or strong if B2B
    const nyk = player("fa-nyk", "NYK", {
      projections: { ...baseProjections(), STL: 190 },
    })
    const atl = player("fa-atl", "ATL", {
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState([bos, nyk, atl], ["fa-bos", "fa-nyk", "fa-atl"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      addLimit: 7,
    })
    const tue = plan.days[1]!.cells.find(
      (c) => c.action === "drop_add" && c.playerId === "fa-nyk",
    )
    expect(tue).toBeTruthy()
    expect(tue?.droppedPlayerId).toBe("fa-bos")
  })
})
```

Update obsolete test `does not apply off-night always-cover rule on 2-spot` inside `1-spot off-night always cover` — either remove or retarget to assert density-hold (thin → hold), since always-cover must not apply but density upgrade may.

Keep all 1-spot always-cover tests green.

- [ ] **Step 2: Run — expect RED** on new density tests if current code always-covers or never upgrades.

```bash
npm test -- tests/unit/streamingPlans.test.ts
```

- [ ] **Step 3: Implement**

In early-swap loop:

```ts
const isOneSpotAlwaysCover =
  spotCount === 1 && !heldPlaysToday && heldRemaining > 0
const isMultiSpotOffNight =
  spotCount > 1 && !heldPlaysToday && heldRemaining > 0

// Build spotOrder once per day before loop:
// [...Array(spotCount).keys()].sort((a,b) => addsBySpot[a]-addsBySpot[b] || a-b)

let upgradePlayer: SeasonPlayer | null = null
const todayBlock = pickTodayBlock(...)

if (todayBlock) {
  upgradePlayer = playersById.get(todayBlock.playerId) ?? null
} else if (isOneSpotAlwaysCover) {
  upgradePlayer = pickBestFa(...)
} else if (
  isMultiSpotOffNight &&
  allowsThinFill(strategyMode, dayIndex, dayCount)
) {
  upgradePlayer = pickBestFa(...)
}

if (!upgradePlayer || !playsOn(...)) continue
if (remainingGameDays(upgradePlayer, ...) <= 0) continue

if (isOneSpotAlwaysCover) {
  // accept
} else if (isMultiSpotOffNight) {
  const tier = todayBlock?.tier ?? "thin"
  const denseEnough = densityTierRank(tier) >= densityTierRank("ok")
  const lateThin =
    !todayBlock && allowsThinFill(strategyMode, dayIndex, dayCount)
  if (!denseEnough && !lateThin) continue
  // if todayBlock exists but thin, only accept when allowsThinFill
  if (todayBlock && !denseEnough && !allowsThinFill(...)) continue
} else {
  // existing on-game allowsEarlySwap path; require heldPlaysToday
  ...
}
```

Clarify accept for multi-spot when `todayBlock` is thin: only if `allowsThinFill`. When `todayBlock` is ok+: always accept (strategy already filtered via `pickTodayBlock`).

Update comment above loop.

- [ ] **Step 4: GREEN**

```bash
npm test -- tests/unit/streamingPlans.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts \
  docs/superpowers/specs/2026-08-25-matchup-streaming-multispot-density-hold-design.md \
  docs/superpowers/plans/2026-08-25-matchup-streaming-multispot-density-hold.md
git commit -m "feat(matchup): density-first off-night holds for 2/3-spot plans"
```

---

## Spec coverage

| Requirement | Task |
|-------------|------|
| 1-spot unchanged | Task 1 regression |
| 2/3 hold mid-block thin off night | Task 1 |
| 2/3 density ok+ upgrade | Task 1 |
| Late thin leftover | Task 1 (impl + optional test) |
| addsBySpot order | Task 1 impl |
