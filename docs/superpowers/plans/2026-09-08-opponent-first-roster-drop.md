# Opponent First Roster Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let us name the opponent’s first roster cut per streaming spot so the simulator matches the cut we can already see on ESPN.

**Architecture:** Session array `forcedOpponentRosterDrops: (string | null)[]` (index = opp `spotIndex`) is owned by `MatchupWorkspace`, edited on `MatchupPlanBar`, and passed into every `buildStreamingPlan` call. `fillOpponentSpotsForDate` uses a forced id only on that spot’s first **roster** cut (not open-slot adds, not expired-streamer swaps). `Auto` (`null`) keeps today’s greedy + core protection.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS 4, Vitest. Branch `feat/published-nba-schedule`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-08-opponent-first-roster-drop-design.md`
- UI copy English: label `Opp drop`, option `Auto`, `aria-label` `Opp drop spot N` (1-based)
- No Hold / Open slot options on Opp drop
- Forced cut bypasses ADP/core protection and `requirePositiveDelta`; Auto keeps both
- Same array for our 1/2/3-spot plans; session-only; reset when opponent `teamIndex` changes
- No semicolons; `handle*` event handlers; Tailwind only
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>`
- Windows PowerShell: no `&&`; chain with `;`. Commit with a PowerShell here-string, not bash HEREDOC
- Do not commit unless the user asked. Skip each task’s Commit step until then
- Out of scope: opponent Hold, per-day opponent drop calendar, persisting the map, streamer-to-streamer forced drops

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/matchup/streamingPlans.ts` | `forcedOpponentRosterDrops` on input; first roster-cut override in `fillOpponentSpotsForDate` |
| `src/components/matchup/MatchupPlanBar.tsx` | `Opp drop` `<select>`s, one per resolved opp spot |
| `src/components/matchup/MatchupWorkspace.tsx` | Session state, reset on opponent change, pass into panel |
| `src/components/matchup/StreamingPlansPanel.tsx` | Forward array into every `buildStreamingPlan` |
| `tests/unit/streamingPlans.test.ts` | Planner cases in §7 of the spec |
| `tests/unit/MatchupPlanBar.test.tsx` | Select count, Auto default, callback |
| `tests/unit/MatchupWorkspace.test.tsx` | Wiring + opponent-change reset |

---

### Task 1: Planner honors forced opponent roster drops

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (`BuildStreamingPlanInput`, `fillOpponentSpotsForDate`, `buildStreamingPlan`)
- Test: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: existing `fillOpponentSpotsForDate` fill order (expired streamer → open slot → roster cut)
- Produces:
  - `forcedOpponentRosterDrops?: (string | null)[]` on `BuildStreamingPlanInput` — index is opp `spotIndex`; `null` / omitted / unknown id → Auto
  - Same optional array on `fillOpponentSpotsForDate`’s argument object
  - Forced roster cut: `tryOppMove({ kind: "player", playerId: forcedId }, false)` then `weekDropped.add(forcedId)` on success
  - Fallback: today’s `rankRosterDropPlayerIds(..., protectCoreRoster: true)` loop with `requirePositiveDelta: true`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` at the end of `tests/unit/streamingPlans.test.ts` (reuse existing `player`, `tinyState`, `tinySchedule`, `baseProjections`, `emptyBoardLosingStl`, `packedActiveSlots`, `packedTeamAbbrs`):

```ts
describe("forced opponent roster drops", () => {
  const packedPositions = [
    ["PG"],
    ["SG"],
    ["SF"],
    ["PF"],
    ["C"],
    ["PG", "SG"],
    ["SF", "PF"],
    ["SG"],
    ["PG"],
    ["SF"],
  ] as const

  const packedOppRoster = () =>
    packedTeamAbbrs.map((team, index) =>
      player(`r${index}`, team, {
        positions: [...packedPositions[index]!],
        projections: {
          ...baseProjections(),
          STL: index === 7 ? 5 : index === 8 ? 8 : 80,
        },
      }),
    )

  const packedOppState = (
    fas: SeasonPlayer[],
    availablePlayerIds: string[],
  ) => {
    const rostered = packedOppRoster()
    const you = player("you-1", "CHI")
    const state = tinyState(
      [...rostered, you, ...fas],
      availablePlayerIds,
    )
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: null }]
    state.teams[1]!.entries = rostered.map((entry, index) => ({
      slot: packedActiveSlots[index]!,
      playerId: entry.id,
    }))
    return { state, rostered }
  }

  const packedGames = (days: string[], extra: ScheduleResponse["games"] = []) =>
    tinySchedule(days, [
      ...days.flatMap((date) =>
        packedTeamAbbrs.map((homeAbbr, index) => ({
          date,
          homeAbbr,
          awayAbbr: index % 2 === 0 ? "MEM" : "CHA",
        })),
      ),
      ...extra,
    ])

  it("uses the forced roster player as the first opp cut when the roster is full", () => {
    const days = ["2025-11-03"]
    const faOpp = player("fa-opp-1", "WAS", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const { state } = packedOppState([faOpp], ["fa-opp-1"])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["r0"],
    })
    expect(plan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "add",
      droppedPlayerId: "r0",
      playerId: "fa-opp-1",
    })
  })

  it("does not use a forced drop when the opponent has an open non-IL slot", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const opp = player("opp-1", "ATL")
    const you = player("you-1", "CHI")
    const state = tinyState([faA, you, opp], ["fa-a"])
    state.teams[0]!.entries = [
      { slot: "PG", playerId: "you-1" },
      { slot: "UTIL", playerId: null },
    ]
    state.teams[1]!.entries = [
      { slot: "PG", playerId: "opp-1" },
      { slot: "UTIL", playerId: null },
    ]
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: tinySchedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
      ]),
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["opp-1"],
    })
    expect(plan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "add",
      droppedPlayerId: null,
      playerId: "fa-a",
    })
  })

  it("falls back to Auto when the forced id is missing", () => {
    const days = ["2025-11-03"]
    const faOpp = player("fa-opp-1", "WAS", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const { state } = packedOppState([faOpp], ["fa-opp-1"])
    const autoPlan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      oppSpotCount: 1,
    })
    const forcedPlan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["nobody"],
    })
    expect(forcedPlan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe(
      autoPlan.opponentDays[0]!.cells[0]!.droppedPlayerId,
    )
  })

  it("uses distinct forced drops for two opp spots", () => {
    const days = ["2025-11-03"]
    const faOpp1 = player("fa-opp-1", "WAS", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const faOpp2 = player("fa-opp-2", "ORL", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 150 },
    })
    const { state } = packedOppState(
      [faOpp1, faOpp2],
      ["fa-opp-1", "fa-opp-2"],
    )
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
        { date: "2025-11-03", homeAbbr: "ORL", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      oppSpotCount: 2,
      forcedOpponentRosterDrops: ["r0", "r1"],
    })
    expect(plan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe("r0")
    expect(plan.opponentDays[0]!.cells[1]!.droppedPlayerId).toBe("r1")
  })

  it("falls back to Auto on spot 1 when both spots force the same player", () => {
    const days = ["2025-11-03"]
    const faOpp1 = player("fa-opp-1", "WAS", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const faOpp2 = player("fa-opp-2", "ORL", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 150 },
    })
    const { state } = packedOppState(
      [faOpp1, faOpp2],
      ["fa-opp-1", "fa-opp-2"],
    )
    const autoPlan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
        { date: "2025-11-03", homeAbbr: "ORL", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      oppSpotCount: 2,
    })
    const forcedPlan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
        { date: "2025-11-03", homeAbbr: "ORL", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      oppSpotCount: 2,
      forcedOpponentRosterDrops: ["r0", "r0"],
    })
    expect(forcedPlan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe("r0")
    expect(forcedPlan.opponentDays[0]!.cells[1]!.droppedPlayerId).not.toBe("r0")
    expect(forcedPlan.opponentDays[0]!.cells[1]!.droppedPlayerId).toBe(
      autoPlan.opponentDays[0]!.cells[1]!.droppedPlayerId,
    )
  })

  it("does not consume a forced roster drop when replacing an expired streamer", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faMon = player("fa-mon", "TOR", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const faTue = player("fa-tue", "WAS", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 150 },
    })
    const opp = player("opp-1", "ATL")
    const you = player("you-1", "CHI")
    const state = tinyState([faMon, faTue, you, opp], ["fa-mon", "fa-tue"])
    state.teams[0]!.entries = [
      { slot: "PG", playerId: "you-1" },
      { slot: "UTIL", playerId: null },
    ]
    state.teams[1]!.entries = [
      { slot: "PG", playerId: "opp-1" },
      { slot: "UTIL", playerId: null },
    ]
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: tinySchedule(days, [
        { date: "2025-11-03", homeAbbr: "TOR", awayAbbr: "BKN" },
        { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
        { date: "2025-11-04", homeAbbr: "WAS", awayAbbr: "BKN" },
        { date: "2025-11-04", homeAbbr: "ATL", awayAbbr: "CLE" },
      ]),
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["opp-1"],
    })
    expect(plan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBeNull()
    expect(plan.opponentDays[0]!.cells[0]!.playerId).toBe("fa-mon")
    expect(plan.opponentDays[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      droppedPlayerId: "fa-mon",
      playerId: "fa-tue",
    })
  })

  it("drops an ADP-protected player when that id is forced", () => {
    const days = ["2025-11-03"]
    const faOpp = player("fa-opp-1", "WAS", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const { state } = packedOppState([faOpp], ["fa-opp-1"])
    const adpByPlayerId = Object.fromEntries(
      packedOppRoster().map((entry) => [entry.id, 10]),
    )
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      oppSpotCount: 1,
      adpByPlayerId,
      forcedOpponentRosterDrops: ["r0"],
    })
    expect(plan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe("r0")
  })
})
```

Add `import type { ScheduleResponse }` only if the file does not already import it (it does).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts -t "forced opponent roster drops"`

Expected: FAIL — `forcedOpponentRosterDrops` is not a `buildStreamingPlan` option, and/or first packed-roster cell does not drop `r0`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/matchup/streamingPlans.ts`, add to `BuildStreamingPlanInput`:

```ts
  /**
   * Opp spotIndex → roster player id to cut the first time that spot
   * needs a roster drop. `null` / omitted = Auto.
   */
  forcedOpponentRosterDrops?: (string | null)[]
```

Add the same field to `fillOpponentSpotsForDate`’s destructured args and type (`forcedOpponentRosterDrops?: (string | null)[]`).

In the needFill loop, replace the roster-cut `else` branch (the `rankRosterDropPlayerIds` loop) with:

```ts
    } else {
      const forcedId = forcedOpponentRosterDrops?.[spotIndex]
      const forcedOnRoster =
        typeof forcedId === "string" &&
        !weekDropped.has(forcedId) &&
        oppEntries.some(
          (entry) =>
            entry.slot !== "IL" && entry.playerId === forcedId,
        )
      if (forcedOnRoster) {
        const forcedPick = tryOppMove(
          { kind: "player", playerId: forcedId },
          false,
        )
        if (forcedPick) {
          picked = forcedPick
          rosterDrop = { kind: "player", playerId: forcedId }
        }
      }
      if (!picked) {
        for (const dropId of rankRosterDropPlayerIds(
          oppEntries,
          playersById,
          date,
          schedule,
          weakCats,
          weekDropped,
          adpByPlayerId,
          injuryOutDaysByPlayerId,
          board,
          false,
          true,
        )) {
          const result = tryOppMove({ kind: "player", playerId: dropId }, true)
          if (!result) continue
          picked = result
          rosterDrop = { kind: "player", playerId: dropId }
          break
        }
      }
    }
```

Do **not** read `forcedOpponentRosterDrops` in the `previousId` branch or the `hasOpenNonIlSlot` branch, or in the later off-night swap loop.

In `buildStreamingPlan`, destructure `forcedOpponentRosterDrops` and pass it into `fillOpponentSpotsForDate({ ..., forcedOpponentRosterDrops })`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/streamingPlans.test.ts`

Expected: PASS (including the new describe and existing interleaved opponent tests).

If the 2-spot same-player Auto fallback does not match `autoPlan`’s spot-1 drop because greedy ranking shifted after `r0` was removed, keep the assertion `not.toBe("r0")` and drop the equality-to-autoPlan assertion.

- [ ] **Step 5: Commit** (skip unless the user asked)

```powershell
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m @"
feat(matchup): honor forced opponent first roster drops

"@
```

---

### Task 2: Opp drop selects on MatchupPlanBar

**Files:**
- Modify: `src/components/matchup/MatchupPlanBar.tsx`
- Test: `tests/unit/MatchupPlanBar.test.tsx`

**Interfaces:**
- Consumes: `eligibleRosterDropPlayerIds(entries, playersById, earlierDroppedIds)` from `src/lib/matchup/streamingDropOptions.ts`
- Produces: `MatchupPlanBar` extra props:
  - `resolvedOppSpotCount?: 1 | 2 | 3`
  - `forcedOpponentRosterDrops?: (string | null)[]`
  - `onForcedOpponentRosterDropChange?: (spotIndex: number, playerId: string | null) => void`
  - `opponentEntries?: SeasonRosterEntry[]`
  - `playersById?: Record<string, SeasonPlayer>`
- When `resolvedOppSpotCount` is omitted, render no Opp drop group (existing tests keep passing)

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/MatchupPlanBar.test.tsx`:

```ts
  it("renders one Opp drop select per resolved spot and reports a player pick", () => {
    const onForcedOpponentRosterDropChange = vi.fn()
    render(
      <MatchupPlanBar
        openSeatCount={0}
        oppSpotChoice={2}
        onOppSpotChoiceChange={vi.fn()}
        onYouSpotCountChange={vi.fn()}
        youSpotCount={null}
        resolvedOppSpotCount={2}
        forcedOpponentRosterDrops={[null, null]}
        onForcedOpponentRosterDropChange={onForcedOpponentRosterDropChange}
        opponentEntries={[
          { slot: "PG", playerId: "r0" },
          { slot: "SG", playerId: "r1" },
          { slot: "IL", playerId: "il-1" },
        ]}
        playersById={{
          r0: {
            id: "r0",
            name: "Drop One",
            teamAbbr: "NYK",
            projections: {
              FG_PCT: 0.5,
              FT_PCT: 0.8,
              TPM: 1,
              REB: 5,
              AST: 2,
              STL: 1,
              BLK: 1,
              TO: 2,
              PTS: 10,
            },
            shooting: { FGM: 4, FGA: 8, FTM: 2, FTA: 2 },
          },
          r1: {
            id: "r1",
            name: "Drop Two",
            teamAbbr: "BOS",
            projections: {
              FG_PCT: 0.5,
              FT_PCT: 0.8,
              TPM: 1,
              REB: 5,
              AST: 2,
              STL: 1,
              BLK: 1,
              TO: 2,
              PTS: 10,
            },
            shooting: { FGM: 4, FGA: 8, FTM: 2, FTA: 2 },
          },
          "il-1": {
            id: "il-1",
            name: "Injured",
            teamAbbr: "CHI",
            projections: {
              FG_PCT: 0.5,
              FT_PCT: 0.8,
              TPM: 1,
              REB: 5,
              AST: 2,
              STL: 1,
              BLK: 1,
              TO: 2,
              PTS: 10,
            },
            shooting: { FGM: 4, FGA: 8, FTM: 2, FTA: 2 },
          },
        }}
      />,
    )

    const spot1 = screen.getByLabelText("Opp drop spot 1")
    const spot2 = screen.getByLabelText("Opp drop spot 2")
    expect(spot1).toHaveDisplayValue("Auto")
    expect(spot2).toHaveDisplayValue("Auto")
    expect(screen.queryByText("Injured")).not.toBeInTheDocument()
    fireEvent.change(spot1, { target: { value: "r0" } })
    expect(onForcedOpponentRosterDropChange).toHaveBeenCalledWith(0, "r0")
  })
```

Keep the existing “lets you pick You and Opp plans” test unchanged (no new required props).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupPlanBar.test.tsx`

Expected: FAIL — `Opp drop spot 1` not found.

- [ ] **Step 3: Write minimal implementation**

Update `src/components/matchup/MatchupPlanBar.tsx`:

```tsx
import type { SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import { eligibleRosterDropPlayerIds } from "@/lib/matchup/streamingDropOptions"
import type { OppSpotChoice } from "@/lib/matchup/types"
```

Extend the component props with the five optional fields listed in Interfaces. After the Opp spots button group, when `resolvedOppSpotCount` is `1 | 2 | 3`:

```tsx
      {resolvedOppSpotCount ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--color-mute)]">Opp drop</span>
          {Array.from({ length: resolvedOppSpotCount }, (_, spotIndex) => {
            const earlier = (forcedOpponentRosterDrops ?? [])
              .slice(0, spotIndex)
              .filter((id): id is string => Boolean(id))
            const eligible = eligibleRosterDropPlayerIds(
              opponentEntries ?? [],
              playersById ?? {},
              earlier,
            )
            const selected = forcedOpponentRosterDrops?.[spotIndex] ?? null
            const selectValue =
              selected && eligible.includes(selected) ? selected : ""
            const handleOppDropChange = (
              event: React.ChangeEvent<HTMLSelectElement>,
            ) => {
              const value = event.target.value
              onForcedOpponentRosterDropChange?.(
                spotIndex,
                value === "" ? null : value,
              )
            }
            return (
              <label
                className="flex items-center gap-1"
                key={spotIndex}
              >
                <span className="sr-only">{`Opp drop spot ${spotIndex + 1}`}</span>
                <select
                  aria-label={`Opp drop spot ${spotIndex + 1}`}
                  className="rounded-full border border-[var(--color-hairline)] bg-transparent px-2.5 py-1 font-medium text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                  onChange={handleOppDropChange}
                  value={selectValue}
                >
                  <option value="">Auto</option>
                  {eligible.map((playerId) => (
                    <option key={playerId} value={playerId}>
                      {playersById?.[playerId]?.name ?? playerId}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </div>
      ) : null}
```

If the project has no `sr-only` utility, drop the inner `<span className="sr-only">` and keep `aria-label` on the select.

Do not add Hold or Open slot options.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupPlanBar.test.tsx`

Expected: PASS both tests.

- [ ] **Step 5: Commit** (skip unless the user asked)

```powershell
git add src/components/matchup/MatchupPlanBar.tsx tests/unit/MatchupPlanBar.test.tsx
git commit -m @"
feat(matchup): add Opp drop selects on the plan bar

"@
```

---

### Task 3: Wire session state through workspace and plans

**Files:**
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Test: `tests/unit/MatchupWorkspace.test.tsx`
- Test: `tests/unit/StreamingPlansPanel.test.tsx` only if an existing panel test asserts `buildStreamingPlan` args — otherwise skip; the workspace test covers the shared map

**Interfaces:**
- Consumes: Task 1 `forcedOpponentRosterDrops` on `buildStreamingPlan`; Task 2 PlanBar props
- Produces:
  - `MatchupWorkspace` state `forcedOpponentRosterDrops: (string | null)[]`
  - `handleForcedOpponentRosterDropChange(spotIndex, playerId)`
  - `handleOpponentChange` also `setForcedOpponentRosterDrops([])`
  - `StreamingPlansPanelProps.forcedOpponentRosterDrops?: (string | null)[]` passed into every `buildStreamingPlan` in the `[1,2,3].map` `useMemo`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/MatchupWorkspace.test.tsx`, the current Rivals team has `{ slot: "C", playerId: null }`. Add a named opponent roster player so the select has an option. Update the existing `state.teams[1]` entries to:

```ts
    {
      teamIndex: 1,
      name: "Rivals",
      entries: [
        { slot: "C", playerId: "opp-big" },
        { slot: "UTIL", playerId: null },
      ],
    },
    {
      teamIndex: 2,
      name: "Other Club",
      entries: [{ slot: "PF", playerId: "other-1" }],
    },
```

Add players:

```ts
    {
      id: "opp-big",
      name: "Opp Big",
      teamAbbr: "ATL",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
    {
      id: "other-1",
      name: "Other Forward",
      teamAbbr: "MIA",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
```

If `matchupAdvice.teams` is a separate list, add `{ teamIndex: 2, name: "Other Club" }` there too so `OpponentPicker` can change teams.

Add a test (or extend the render test):

```ts
  it("resets Opp drop to Auto when the opponent team changes", async () => {
    render(<MatchupWorkspace leagueId="season-1" />)
    expect(
      await screen.findByLabelText("Opp drop spot 1"),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Opp drop spot 1"), {
      target: { value: "opp-big" },
    })
    expect(screen.getByLabelText("Opp drop spot 1")).toHaveValue("opp-big")

    fireEvent.click(screen.getByRole("combobox", { name: /opponent/i }))
    fireEvent.click(screen.getByRole("option", { name: "Other Club" }))

    await waitFor(() => {
      expect(screen.getByLabelText("Opp drop spot 1")).toHaveValue("")
    })
  })
```

If `OpponentPicker` is not a combobox, read `src/components/matchup/OpponentPicker.tsx` and click the actual control that calls `onChange(2)`. The assertion that matters is: after `onChange` to team 2, Opp drop spot 1 is `Auto` (`value=""`).

Also click `Opp 3-spot` and expect three labels `Opp drop spot 1` / `2` / `3`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupWorkspace.test.tsx -t "resets Opp drop"`

Expected: FAIL — `Opp drop spot 1` not in the document (PlanBar not wired).

- [ ] **Step 3: Write minimal implementation**

`StreamingPlansPanel.tsx` — add to props:

```ts
  forcedOpponentRosterDrops?: (string | null)[]
```

Destructure `forcedOpponentRosterDrops` next to `oppSpotCount`. Inside `buildStreamingPlan({...})` add:

```ts
          ...(forcedOpponentRosterDrops
            ? { forcedOpponentRosterDrops }
            : {}),
```

Add `forcedOpponentRosterDrops` to the `useMemo` dependency array.

`MatchupWorkspace.tsx`:

```ts
  const [forcedOpponentRosterDrops, setForcedOpponentRosterDrops] = useState<
    (string | null)[]
  >([])
```

```ts
  const handleForcedOpponentRosterDropChange = (
    spotIndex: number,
    playerId: string | null,
  ) => {
    setForcedOpponentRosterDrops((prev) => {
      const next = prev.slice()
      while (next.length <= spotIndex) next.push(null)
      next[spotIndex] = playerId
      return next
    })
  }
```

At the start of `handleOpponentChange`, before the fetch:

```ts
    setForcedOpponentRosterDrops([])
```

Pass into `MatchupPlanBar`:

```tsx
          forcedOpponentRosterDrops={forcedOpponentRosterDrops}
          onForcedOpponentRosterDropChange={handleForcedOpponentRosterDropChange}
          opponentEntries={oppTeam?.entries}
          playersById={playersMap}
          resolvedOppSpotCount={oppSpotCount}
```

`playersMap` is declared later in the current file. Either move PlanBar below that declaration or pass `matchupData.playersById` merged with `state.players` the same way `playersMap` is built. Do not use PlanBar before `oppTeam` exists without optional chaining — `oppSpotCount` is already `undefined` when there is no opp team, which hides the selects.

Pass into `StreamingPlansPanel`:

```tsx
            forcedOpponentRosterDrops={forcedOpponentRosterDrops}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupWorkspace.test.tsx tests/unit/MatchupPlanBar.test.tsx tests/unit/streamingPlans.test.ts tests/unit/StreamingPlansPanel.test.tsx`

Expected: PASS. If OpponentPicker interaction cannot be matched, keep a PlanBar-level change test and a workspace test that the select is present; still implement the `setForcedOpponentRosterDrops([])` reset.

Browser (after tests pass): packed opponent roster, choose `Opp drop spot 1`, confirm Opponent week strip first cell `drop → add` uses that name.

- [ ] **Step 5: Commit** (skip unless the user asked)

```powershell
git add src/components/matchup/MatchupWorkspace.tsx src/components/matchup/StreamingPlansPanel.tsx src/components/matchup/MatchupPlanBar.tsx tests/unit/MatchupWorkspace.test.tsx tests/unit/MatchupPlanBar.test.tsx
git commit -m @"
feat(matchup): wire opponent first-drop picks into plans

"@
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| `forcedOpponentRosterDrops` per spot, Auto default | 1, 3 |
| Roster-cut only; open slot ignored | 1 |
| Expired streamer replace does not consume | 1 |
| Two spots, two ids; duplicate → Auto on later spot | 1 |
| Unknown id → Auto | 1 |
| Forced bypasses ADP/core and positive delta | 1 (`requirePositiveDelta: false` + ADP test) |
| PlanBar N selects, English copy, no Hold | 2 |
| Shared map for 1/2/3 plans | 3 (`StreamingPlansPanel` useMemo) |
| Session only; reset on opponent change | 3 |
| Week strip stays read-only | no code change |
