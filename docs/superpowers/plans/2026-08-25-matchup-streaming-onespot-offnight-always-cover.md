# 1-Spot Off-Night Always Cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On 1-spot plans, always spend an add on off nights when a today-playing FA exists (no remaining-games gate); keep holds on game days; fall back to `pickBestFa` if tier gates starve cover.

**Architecture:** Change the existing `isOffNightNetStarts` branch in `buildStreamingPlan`’s early-swap loop into `isOffNightAlwaysCover`, drop the `upgradeRemaining > heldRemaining` check, and when `pickTodayBlock` returns null on a 1-spot off night, fall back to `pickBestFa` for a today player.

**Tech Stack:** TypeScript, Vitest, existing `streamingPlans.ts` helpers.

## Global Constraints

- 1-spot only for always-cover
- Off night + budget + FA plays today → always `drop_add`
- Game day → keep hold (except existing density `allowsEarlySwap`)
- Remove `upgradeRemaining > heldRemaining` for this path
- If `pickTodayBlock` is null on 1-spot off night → `pickBestFa` fallback
- 2/3-spot must not gain always-cover
- Weak cats only affect who is picked (existing sort), not whether cover fires
- Do not add on-game weak-cat forced swaps

## File map

| File | Role |
|------|------|
| `src/lib/matchup/streamingPlans.ts` | Always-cover branch + FA fallback |
| `tests/unit/streamingPlans.test.ts` | Replace net-starts expectations |

---

### Task 1: Always-cover planner + tests

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (early-swap loop ~385–442)
- Modify: `tests/unit/streamingPlans.test.ts` (`describe("1-spot off-night net-starts swap")` → rename/update)

**Interfaces:**
- Consumes: `pickTodayBlock`, `pickBestFa`, `playsOn`, `remainingGameDays`
- Produces: 1-spot off-night `drop_add` whenever eligible today FA exists

- [ ] **Step 1: Write failing / updated tests**

Rename describe to `1-spot off-night always cover`.

Replace the test that expected **hold** when upgrade has fewer remaining games:

```ts
it("covers off night even when upgrade has fewer remaining games", () => {
  const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
  const bos = player("fa-bos", "BOS", {
    projections: { ...baseProjections(), STL: 200 },
  })
  const chi = player("fa-chi", "CHI", {
    projections: { ...baseProjections(), STL: 150 },
  })
  const state = tinyState([bos, chi], ["fa-bos", "fa-chi"])
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
    { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
    { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    strategyMode: "aggressive",
    addLimit: 7,
  })

  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "add",
    playerId: "fa-bos",
  })
  expect(plan.days[1]!.cells[0]).toMatchObject({
    action: "drop_add",
    playerId: "fa-chi",
    droppedPlayerId: "fa-bos",
  })
})
```

Keep / adjust:

```ts
it("keeps hold on game day (no forced cover)", () => {
  // BOS plays Tue; only other FA also plays Tue but cover must not force swap
  // Use fixture where density early-swap also does not fire (same/low tier).
  // Assert Tue action === "hold" and playerId === "fa-bos"
})
```

Minimal game-day fixture (aggressive, no denser upgrade):

```ts
it("keeps hold on game day when held plays", () => {
  const days = ["2025-11-03", "2025-11-04"]
  const bos = player("fa-bos", "BOS", {
    projections: { ...baseProjections(), STL: 200 },
  })
  const chi = player("fa-chi", "CHI", {
    projections: { ...baseProjections(), STL: 100 },
  })
  const state = tinyState([bos, chi], ["fa-bos", "fa-chi"])
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
    { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "MIA" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
    strategyMode: "conservative",
    addLimit: 7,
  })
  expect(plan.days[1]!.cells[0]).toMatchObject({
    action: "hold",
    playerId: "fa-bos",
  })
})
```

Update 2-spot test title to say always-cover; keep assertion that spot 0 does not `drop_add` BOS→NYK solely via this rule (same fixture as before is fine).

Keep the “swaps when upgrade has more remaining” test (still valid under always-cover).

Add fallback test (optional but preferred):

```ts
it("uses pickBestFa fallback when pickTodayBlock is gated on mid-week off night", () => {
  // strategyMode: "conservative", mid-week thin one-game FA only on Tue off night
  // Expect drop_add to that FA via fallback (not empty hold)
})
```

Use days of length ≥ 4 so Tue is not in “last 3 days” thin window if that would make pickTodayBlock succeed — actually for fallback we need pickTodayBlock to fail: Conservative skips thin until last 3 days. So Tue on a 7-day week, or dayIndex early: use 7 matchup days, off night on day index 1 (Tue), thin CHI only that day → pickTodayBlock null → pickBestFa covers.

- [ ] **Step 2: Run tests — expect RED**

```bash
npm test -- tests/unit/streamingPlans.test.ts
```

Expected: former “keeps hold when fewer remaining” now fails (still hold) until implementation; new cover test fails.

- [ ] **Step 3: Implement**

In early-swap loop, replace net-starts inequality with always-cover + fallback:

```ts
const heldPlaysToday = playsOn(occupant, date, schedule)
const heldRemaining = remainingGameDays(occupant, date, schedule)
if (heldRemaining <= 0) continue

const isOffNightAlwaysCover =
  spotCount === 1 && !heldPlaysToday && heldRemaining > 0

let upgradePlayer: SeasonPlayer | null = null
let droppedFromHoldId = cell.playerId

const todayBlock = pickTodayBlock(
  blocks,
  date,
  seatedToday,
  playersById,
  weakCats,
  strategyMode,
  dayIndex,
  dayCount,
)
if (todayBlock) {
  upgradePlayer = playersById.get(todayBlock.playerId) ?? null
} else if (isOffNightAlwaysCover) {
  upgradePlayer = pickBestFa(
    freeAgents,
    date,
    schedule,
    weakCats,
    seatedToday,
  )
}

if (!upgradePlayer || !playsOn(upgradePlayer, date, schedule)) continue
const upgradeRemaining = remainingGameDays(upgradePlayer, date, schedule)
if (upgradeRemaining <= 0) continue

if (!isOffNightAlwaysCover) {
  if (!heldPlaysToday) continue
  const held = blockFromDate(occupant, date, schedule)
  const heldRank = held ? densityTierRank(held.tier) : 0
  const upgradeBlock = blockFromDate(upgradePlayer, date, schedule)
  const upgradeRank = upgradeBlock
    ? densityTierRank(upgradeBlock.tier)
    : densityTierRank(
        todayBlock?.tier ?? "thin",
      )
  if (
    !allowsEarlySwap(
      strategyMode,
      heldRank,
      todayBlock
        ? densityTierRank(todayBlock.tier)
        : upgradeRank,
    )
  ) {
    continue
  }
}

// existing mutate: drop_add, addsUsed++, addIndex: addsUsed
```

Prefer matching existing code style: keep using `upgrade` block id when from `pickTodayBlock`; when fallback, build drop_add from `upgradePlayer.id` only.

Update loop comment to mention 1-spot off-night always cover.

- [ ] **Step 4: Run tests — expect GREEN**

```bash
npm test -- tests/unit/streamingPlans.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts docs/superpowers/specs/2026-08-25-matchup-streaming-onespot-offnight-always-cover-design.md docs/superpowers/plans/2026-08-25-matchup-streaming-onespot-offnight-always-cover.md
git commit -m "feat(matchup): always cover 1-spot streaming off nights"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| 1-spot off-night always cover | Task 1 |
| No remaining-games gate | Task 1 |
| Game day hold | Task 1 |
| pickBestFa fallback | Task 1 |
| 2-spot exempt | Task 1 |
| No on-game weak-cat force | Task 1 (game-day test) |
