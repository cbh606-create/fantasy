# Matchup Streaming Team Starts + Hole Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild matchup streaming plans so they maximize team-wide Starts by filling leftover holes only, never holding a streamer on a packed night.

**Architecture:** Extract Pass 1 (`streamingHoleCalendar.ts`) that seats the roster (minus manual Sits and plan cuts) and labels leftover eligible actives as holes. `buildStreamingPlan` Pass 2 walks days, caps streamers at `min(spotCount, holeCount)`, drops everyone on packed nights, and ranks FAs by remaining hole Starts → hole B2B → weak cats. `gameStarts` becomes seated team Starts on the you-side working daily. Opponent fill uses the same calendar. Overlay and Daily lock chrome stay; they already follow plan-cut vs manual Sit.

**Tech Stack:** Next.js 15, TypeScript, Vitest. Existing `src/lib/matchup/streamingPlans.ts`, `dailyLineups.ts`, `streamerMove.ts`, `applyStreamingPlanPreview.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-17-matchup-streaming-team-starts-hole-calendar-design.md`
- Objective: team-wide Starts, not streamer NBA games
- Packed night: 0 leftover actives after roster seating → `empty` / `playerId: null`, no hold
- Hole: leftover active the FA is eligible for (`eligibleForSlot`)
- FA rank: remaining hole Starts, then hole-night B2B, then existing weak-cat score
- Spot cap: `min(spotCount, holeCount)`
- Re-add after drop costs 1 add; weekly add limit unchanged (`streamingAddLimitForSchedule`)
- Auto-cut: not Starting tonight; if several, fewest remaining week game days
- Manual Sit: persist, may become a hole, Start remains reversible
- Plan-cut Start lock only; do not lock manual Sit
- Strategy modes must not override packed / hole / no-starter-cut
- English product UI; no semicolons in TS/TSX
- Tests: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 <files>`
- Do not commit unless the user asked. If they did, one commit per task as written
- Do not rewrite Daily display-row builders unless a test proves overlay and grid disagree
- Do not add week-wide DP, waiver execution, or a new plan page

## File map

| File | Responsibility |
| --- | --- |
| Create `src/lib/matchup/streamingHoleCalendar.ts` | Pass 1: hole lineup, packed, remaining hole Starts, B2B count, team Starts, auto-cut pick |
| Create `tests/unit/streamingHoleCalendar.test.ts` | Hole-calendar unit tests |
| Modify `src/lib/matchup/streamingPlans.ts` | Pass 2 uses the calendar; you + opp day loops |
| Modify `src/lib/matchup/types.ts` | Comment on `gameStarts` only |
| Modify `src/lib/matchup/recommendYouSpot.ts` | Rec by `gameStarts` then `addsUsed` |
| Modify `src/lib/matchup/streamingDropOptions.ts` | Auto drop options omit tonight’s starters |
| Modify `tests/unit/streamingPlans.test.ts` | New planner cases; rewrite packed-hold / packed-opp Auto tests |
| Modify `tests/unit/recommendYouSpot.test.ts` | Rec sort keys |
| Modify `tests/unit/streamingDropOptions.test.ts` | Auto-candidate filter |
| Leave unless a test fails | `applyStreamingPlanPreview.ts`, `streamerMove.ts` (`allowFlexSlots`), `DailyLineupPanel.tsx`, `MatchupWorkspace.tsx`, `StreamingPlansPanel.tsx` |

`streamingPlans.ts` stays one file. Do not split the greedy loop in this plan.

---

### Task 1: Hole calendar helpers

**Files:**
- Create: `src/lib/matchup/streamingHoleCalendar.ts`
- Test: `tests/unit/streamingHoleCalendar.test.ts`
- Consumes: `buildDayLineupFromRoster` from `src/lib/matchup/dailyLineups.ts`, `eligibleForSlot` from `src/lib/matchup/eligibility.ts`, `gameWeightForTeamDate` from `src/lib/matchup/games.ts`

**Interfaces:**
- Produces:
  - `buildHoleDayLineup(args: { day: string, teamEntries: SeasonRosterEntry[], players: SeasonPlayer[], schedule: ScheduleResponse, cutPlayerIds?: ReadonlySet<string>, savedDay?: SeasonRosterEntry[] | undefined, rosterSlots?: SeasonSlot[] }): SeasonRosterEntry[]`
  - `countOpenActiveSlots(entries: SeasonRosterEntry[]): number`
  - `playerHasEligibleHole(player: SeasonPlayer, entries: SeasonRosterEntry[] | undefined): boolean`
  - `remainingHoleStarts(player: SeasonPlayer, fromDate: string, days: string[], holeByDate: Record<string, SeasonRosterEntry[]>, schedule: ScheduleResponse): number`
  - `countHoleB2bPairs(player: SeasonPlayer, fromDate: string, days: string[], holeByDate: Record<string, SeasonRosterEntry[]>, schedule: ScheduleResponse): number`
  - `countTeamStarts(daily: DailyLineups, players: SeasonPlayer[], schedule: ScheduleResponse): number`
  - `pickAutoRosterCut(args: { date: string, days: string[], teamEntries: SeasonRosterEntry[], players: SeasonPlayer[], schedule: ScheduleResponse, seatedTonight: SeasonRosterEntry[] }): string | null`

`buildHoleDayLineup` must:
1. Drop `cutPlayerIds` from a copy of `teamEntries` (those ids become `{ slot, playerId: null }` on matching rows; do not remove the slot).
2. Seat with `buildDayLineupFromRoster`.
3. If `savedDay` is provided, clear any seated id that is absent from `savedDay` (manual Sit).

`countHoleB2bPairs` counts adjacent calendar dates in the player’s remaining hole-start days (date string compare: next day is `+1` via `Date.UTC` year/month/day).

`pickAutoRosterCut` returns a rostered non-IL id who is **not** in `seatedTonight` with a non-null slot. Prefer fewest remaining game days on `days` where `gameWeightForTeamDate > 0`. Tie-break by id ascending. `null` if none.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/streamingHoleCalendar.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { initDailyLineups } from "@/lib/matchup/dailyLineups"
import {
  buildHoleDayLineup,
  countHoleB2bPairs,
  countOpenActiveSlots,
  countTeamStarts,
  pickAutoRosterCut,
  playerHasEligibleHole,
  remainingHoleStarts,
} from "@/lib/matchup/streamingHoleCalendar"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"

const projections = (): SeasonPlayer["projections"] => ({
  FG_PCT: 0.48,
  FT_PCT: 0.78,
  TPM: 80,
  REB: 300,
  AST: 250,
  STL: 60,
  BLK: 30,
  TO: 100,
  PTS: 1400,
})

const shooting = (): SeasonPlayer["shooting"] => ({
  FGM: 500,
  FGA: 1040,
  FTM: 200,
  FTA: 260,
})

const player = (
  id: string,
  teamAbbr: string,
  overrides: Partial<SeasonPlayer> = {},
): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  availability: "fa",
  positions: ["PF", "F"],
  projections: projections(),
  shooting: shooting(),
  ...overrides,
})

const slots = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL"] as const

const emptyActives = (): SeasonRosterEntry[] =>
  slots.map((slot) => ({ slot, playerId: null }))

const scheduleOf = (
  days: string[],
  games: ScheduleResponse["games"],
): ScheduleResponse => ({
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: days[0]!,
    endDate: days[days.length - 1]!,
    days,
  },
  games,
})

describe("buildHoleDayLineup", () => {
  it("marks a night packed when ten roster games fill every active", () => {
    const day = "2025-10-23"
    const teams = ["NYK", "LAL", "PHX", "MIL", "ATL", "DEN", "GSW", "MIA", "CHI", "BOS"] as const
    const positions = [
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
    const players = teams.map((team, index) =>
      player(`r${index}`, team, { positions: [...positions[index]!] }),
    )
    const entries = players.map((rostered, index) => ({
      slot: slots[index]!,
      playerId: rostered.id,
    }))
    const schedule = scheduleOf([day], teams.map((homeAbbr) => ({
      date: day,
      homeAbbr,
      awayAbbr: "SAC",
    })))
    const lineup = buildHoleDayLineup({
      day,
      teamEntries: entries,
      players,
      schedule,
    })
    expect(countOpenActiveSlots(lineup)).toBe(0)
  })

  it("opens a hole when the saved daily sat a rostered starter", () => {
    const day = "2025-10-21"
    const pf = player("r-pf", "LAL", { positions: ["PF"] })
    const pg = player("r-pg", "NYK", { positions: ["PG"] })
    const entries: SeasonRosterEntry[] = [
      { slot: "PG", playerId: "r-pg" },
      { slot: "PF", playerId: "r-pf" },
    ]
    const schedule = scheduleOf([day], [
      { date: day, homeAbbr: "LAL", awayAbbr: "BOS" },
      { date: day, homeAbbr: "NYK", awayAbbr: "CHI" },
    ])
    const seated = buildHoleDayLineup({
      day,
      teamEntries: entries,
      players: [pf, pg],
      schedule,
    })
    const savedDay = seated.map((entry) =>
      entry.playerId === "r-pf" ? { ...entry, playerId: null } : entry,
    )
    const withSit = buildHoleDayLineup({
      day,
      teamEntries: entries,
      players: [pf, pg],
      schedule,
      savedDay,
    })
    expect(playerHasEligibleHole(pf, seated)).toBe(false)
    expect(playerHasEligibleHole(pf, withSit)).toBe(true)
  })

  it("does not seat a plan-cut id", () => {
    const day = "2025-10-21"
    const bench = player("r-be", "DET", { positions: ["PF"] })
    const lineup = buildHoleDayLineup({
      day,
      teamEntries: [{ slot: "PF", playerId: "r-be" }],
      players: [bench],
      schedule: scheduleOf([day], [
        { date: day, homeAbbr: "DET", awayAbbr: "CHA" },
      ]),
      cutPlayerIds: new Set(["r-be"]),
    })
    expect(lineup.some((entry) => entry.playerId === "r-be")).toBe(false)
  })
})

describe("remainingHoleStarts", () => {
  it("skips an NBA game on a packed night", () => {
    const days = ["2025-10-21", "2025-10-23"]
    const fa = player("fa-okc", "OKC", { positions: ["PF"] })
    const openPf = emptyActives().map((entry) =>
      entry.slot === "PF" ? entry : { ...entry, playerId: "r-fill" },
    )
    const packed = emptyActives().map((entry, index) => ({
      ...entry,
      playerId: `r${index}`,
    }))
    const holeByDate = {
      "2025-10-21": openPf,
      "2025-10-23": packed,
    }
    const schedule = scheduleOf(days, [
      { date: "2025-10-21", homeAbbr: "OKC", awayAbbr: "WAS" },
      { date: "2025-10-23", homeAbbr: "OKC", awayAbbr: "ORL" },
    ])
    expect(remainingHoleStarts(fa, "2025-10-21", days, holeByDate, schedule)).toBe(1)
  })
})

describe("countHoleB2bPairs", () => {
  it("counts only adjacent hole nights the FA can sit", () => {
    const days = ["2025-10-20", "2025-10-21", "2025-10-23"]
    const fa = player("fa-b2b", "CHI", { positions: ["PF"] })
    const openPf = emptyActives()
    const holeByDate = {
      "2025-10-20": openPf,
      "2025-10-21": openPf,
      "2025-10-23": openPf,
    }
    const schedule = scheduleOf(days, [
      { date: "2025-10-20", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2025-10-21", homeAbbr: "CHI", awayAbbr: "NYK" },
      { date: "2025-10-23", homeAbbr: "CHI", awayAbbr: "BOS" },
    ])
    expect(countHoleB2bPairs(fa, "2025-10-20", days, holeByDate, schedule)).toBe(1)
  })
})

describe("countTeamStarts", () => {
  it("counts seated games only", () => {
    const days = ["2025-10-21"]
    const starter = player("you-1", "CHI", { positions: ["SG"] })
    const sat = player("you-2", "NYK", { positions: ["PG"] })
    const schedule = scheduleOf(days, [
      { date: "2025-10-21", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2025-10-21", homeAbbr: "NYK", awayAbbr: "BOS" },
    ])
    const daily = initDailyLineups(
      days,
      [
        { slot: "SG", playerId: "you-1" },
        { slot: "PG", playerId: "you-2" },
      ],
      undefined,
      [starter, sat],
      schedule,
    )
    daily["2025-10-21"] = daily["2025-10-21"]!.map((entry) =>
      entry.playerId === "you-2" ? { ...entry, playerId: null } : entry,
    )
    expect(countTeamStarts(daily, [starter, sat], schedule)).toBe(1)
  })
})

describe("pickAutoRosterCut", () => {
  it("skips tonight starters and prefers zero remaining games", () => {
    const days = ["2025-10-21", "2025-10-22"]
    const starter = player("r-on", "CHI", { positions: ["SG"] })
    const leftover = player("r-zero", "DET", { positions: ["PF"] })
    const later = player("r-later", "NYK", { positions: ["PG"] })
    const schedule = scheduleOf(days, [
      { date: "2025-10-21", homeAbbr: "CHI", awayAbbr: "BOS" },
      { date: "2025-10-22", homeAbbr: "NYK", awayAbbr: "BOS" },
    ])
    const seatedTonight: SeasonRosterEntry[] = [
      { slot: "SG", playerId: "r-on" },
      { slot: "PF", playerId: null },
    ]
    const cut = pickAutoRosterCut({
      date: "2025-10-21",
      days,
      teamEntries: [
        { slot: "SG", playerId: "r-on" },
        { slot: "BE", playerId: "r-zero" },
        { slot: "BE", playerId: "r-later" },
      ],
      players: [starter, leftover, later],
      schedule,
      seatedTonight,
    })
    expect(cut).toBe("r-zero")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/streamingHoleCalendar.test.ts`

Expected: FAIL — `streamingHoleCalendar` is not defined / cannot resolve module.

- [ ] **Step 3: Write the helpers**

Create `src/lib/matchup/streamingHoleCalendar.ts` with the exports above. Implementation notes:

- `plays` = `player.teamAbbr` and `gameWeightForTeamDate(player.teamAbbr, date, schedule) > 0`
- `playerHasEligibleHole` = some entry with `playerId === null` and `eligibleForSlot(player, entry.slot)`
- Manual Sit: `savedIds = Set` of non-null `savedDay` playerIds; map seated entries to null when id is missing from that set
- Cuts: before `buildDayLineupFromRoster`, map matching `teamEntries` playerIds to null
- `countTeamStarts`: every daily entry whose player plays that date
- Adjacent B2B: parse `YYYY-MM-DD` as UTC midnight; pair if `end - start === 86400000`

No semicolons.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/streamingHoleCalendar.test.ts`

Expected: PASS (all Task 1 cases).

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/lib/matchup/streamingHoleCalendar.ts tests/unit/streamingHoleCalendar.test.ts
git commit -m "feat(matchup): add streaming hole calendar helpers"
```

---

### Task 2: You-side planner — packed empty, hole rank, cap, re-add, team Starts

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts`
- Modify: `src/lib/matchup/types.ts` (`StreamingPlan.gameStarts` comment: team Starts after you overlay / working daily, not raw FA games)
- Test: `tests/unit/streamingPlans.test.ts` (append inside `describe("buildStreamingPlan")`)

**Interfaces:**
- Consumes: Task 1 helpers. Rebuild `holeByDate` at the start of each you-day from current `cutPlayerIds` (accumulate roster cuts as the loop runs).
- Produces: unchanged `buildStreamingPlan` / `BuildStreamingPlanInput` signatures. `gameStarts` = `countTeamStarts(workingDaily, state.players, schedule)` after the you-day loop (before return). Opponent loop still runs after you cells for that date.

Pass 2 gates (must run before strategy-mode swap helpers):

```ts
const holeLineup = buildHoleDayLineup({
  day: date,
  teamEntries: youEntriesMinusCuts,
  players: state.players,
  schedule,
  cutPlayerIds,
  savedDay: daily?.[date],
})
const holeCount = countOpenActiveSlots(holeLineup)
const streamerCap = Math.min(spotCount, holeCount)

if (holeCount === 0) {
  for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
    occupants[spotIndex] = null
    cells[spotIndex] = {
      spotIndex,
      playerId: null,
      action: "empty",
      droppedPlayerId: null,
      rosterDropPlayerId: null,
      rosterDropKind: "none",
      addIndex: null,
      alternativePlayerIds: [],
      targetCategoryIds: [],
    }
  }
  // do not seat streamers into workingDaily[date]
} else {
  // keep / add / drop_add at most streamerCap occupants who
  // playerHasEligibleHole against remaining holes that day
  // rank unused FAs by remainingHoleStarts, then countHoleB2bPairs,
  // then existing weak-cat rank
}
```

Rebuild `holeByDate` for ranking with current cuts, **without** other streamers occupying future days.

If a held occupant cannot sit tonight, drop them. If adds remain and a better FA can sit, `drop_add`. Packed nights never `hold`.

`rankEligibleFas` / remaining-NBA-game volume must not be the primary sort.

- [ ] **Step 1: Write the failing tests** in `tests/unit/streamingPlans.test.ts`

Reuse existing `player`, `tinyState`, `tinySchedule`, `packedRosterPlayers`, `packedActiveSlots`, `packedTeamAbbrs`, `emptyActive`, `closeLosingRebBoard` already in that file.

```ts
it("does not add or hold a streamer on a 10-roster-game night", () => {
  const days = ["2025-10-23"]
  const packed = packedRosterPlayers()
  const fa = player("fa-okc", "OKC", { positions: ["PF"] })
  const state = tinyState([...packed, fa], ["fa-okc"])
  state.teams[0]!.entries = packed.map((entry, index) => ({
    slot: packedActiveSlots[index]!,
    playerId: entry.id,
  }))
  const schedule = tinySchedule(days, [
    ...packedTeamAbbrs.map((homeAbbr) => ({
      date: "2025-10-23",
      homeAbbr,
      awayAbbr: "SAC",
    })),
    { date: "2025-10-23", homeAbbr: "OKC", awayAbbr: "WAS" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 2,
    state,
    schedule,
    board: closeLosingRebBoard(),
    strategyMode: "aggressive",
  })
  expect(plan.days[0]!.cells.every((cell) => cell.action === "empty")).toBe(true)
  expect(plan.days[0]!.cells.every((cell) => cell.playerId === null)).toBe(true)
  expect(plan.gameStarts).toBe(10)
})

it("caps 2-spot at one streamer when the day has one hole", () => {
  const days = ["2025-10-21"]
  const packed = packedRosterPlayers()
  const faA = player("fa-a", "OKC", { positions: ["PF"], projections: { ...baseProjections(), REB: 400 } })
  const faB = player("fa-b", "POR", { positions: ["PF"], projections: { ...baseProjections(), REB: 390 } })
  const state = tinyState([...packed, faA, faB], ["fa-a", "fa-b"])
  state.teams[0]!.entries = packed.map((entry, index) => ({
    slot: packedActiveSlots[index]!,
    playerId: entry.id,
  }))
  const pfOpen = emptyActive().map((entry, index) => ({
    ...entry,
    playerId: entry.slot === "PF" ? null : packed[index]!.id,
  }))
  const daily = { "2025-10-21": pfOpen }
  const schedule = tinySchedule(days, [
    ...packedTeamAbbrs.map((homeAbbr) => ({
      date: "2025-10-21",
      homeAbbr,
      awayAbbr: "SAC",
    })),
    { date: "2025-10-21", homeAbbr: "OKC", awayAbbr: "WAS" },
    { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 2,
    state,
    schedule,
    board: closeLosingRebBoard(),
    strategyMode: "aggressive",
    daily,
  })
  const seated = plan.days[0]!.cells.filter((cell) => cell.playerId)
  expect(seated).toHaveLength(1)
})

it("re-adds after a packed-night drop and spends one add", () => {
  const days = ["2025-10-21", "2025-10-23", "2025-10-24"]
  const packed = packedRosterPlayers()
  const fa = player("fa-por", "POR", { positions: ["PF"] })
  const state = tinyState([...packed, fa], ["fa-por"])
  state.teams[0]!.entries = packed.map((entry, index) => ({
    slot: packedActiveSlots[index]!,
    playerId: entry.id,
  }))
  const pfOpen = emptyActive().map((entry, index) => ({
    ...entry,
    playerId: entry.slot === "PF" ? null : packed[index]!.id,
  }))
  const packedDay = emptyActive().map((entry, index) => ({
    ...entry,
    playerId: packed[index]!.id,
  }))
  const daily = {
    "2025-10-21": pfOpen.map((entry) => ({ ...entry })),
    "2025-10-23": packedDay,
    "2025-10-24": pfOpen.map((entry) => ({ ...entry })),
  }
  const schedule = tinySchedule(days, [
    ...days.flatMap((date) =>
      packedTeamAbbrs.map((homeAbbr) => ({
        date,
        homeAbbr,
        awayAbbr: "SAC",
      })),
    ),
    { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
    { date: "2025-10-24", homeAbbr: "POR", awayAbbr: "NYK" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: closeLosingRebBoard(),
    strategyMode: "aggressive",
    daily,
  })
  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "add",
    playerId: "fa-por",
    addIndex: 1,
  })
  expect(plan.days[1]!.cells[0]).toMatchObject({
    action: "empty",
    playerId: null,
  })
  expect(plan.days[2]!.cells[0]).toMatchObject({
    action: "add",
    playerId: "fa-por",
    addIndex: 2,
  })
  expect(plan.addsUsed).toBe(2)
})

it("picks a 10/20-21 B2B only when both nights are holes", () => {
  const days = ["2025-10-20", "2025-10-21"]
  const packed = packedRosterPlayers()
  const b2b = player("fa-b2b", "CHI", {
    positions: ["PF"],
    projections: { ...baseProjections(), REB: 200 },
  })
  const oneHole = player("fa-one", "POR", {
    positions: ["PF"],
    projections: { ...baseProjections(), REB: 500 },
  })
  const state = tinyState([...packed, b2b, oneHole], ["fa-b2b", "fa-one"])
  state.teams[0]!.entries = packed.map((entry, index) => ({
    slot: packedActiveSlots[index]!,
    playerId: entry.id,
  }))
  const pfOpen = emptyActive().map((entry, index) => ({
    ...entry,
    playerId: entry.slot === "PF" ? null : packed[index]!.id,
  }))
  const packedDay = emptyActive().map((entry, index) => ({
    ...entry,
    playerId: packed[index]!.id,
  }))
  const daily = {
    "2025-10-20": pfOpen,
    "2025-10-21": packedDay,
  }
  const schedule = tinySchedule(days, [
    ...days.flatMap((date) =>
      packedTeamAbbrs.map((homeAbbr) => ({
        date,
        homeAbbr,
        awayAbbr: "SAC",
      })),
    ),
    { date: "2025-10-20", homeAbbr: "CHI", awayAbbr: "DET" },
    { date: "2025-10-21", homeAbbr: "CHI", awayAbbr: "NYK" },
    { date: "2025-10-20", homeAbbr: "POR", awayAbbr: "ORL" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: closeLosingRebBoard(),
    strategyMode: "aggressive",
    daily,
  })
  expect(plan.days[0]!.cells[0]?.playerId).toBe("fa-one")
  expect(plan.days[1]!.cells[0]?.action).toBe("empty")
})
```

Keep the existing `does not count a remaining game the FA cannot sit when ranking volume` test. It should still pick `fa-two`.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/streamingPlans.test.ts`

Expected: FAIL on packed-night `empty` (current code holds/adds) and/or `gameStarts !== 10`.

- [ ] **Step 3: Wire Pass 2**

In `buildStreamingPlan`’s you-day loop, apply the gate above. Drop strategy-mode early-swap / off-night hold paths that run on `holeCount === 0`. When ranking, sort by `remainingHoleStarts` desc, `countHoleB2bPairs` desc, then current weak-cat comparator.

Set `gameStarts` with `countTeamStarts(workingDaily, state.players, schedule)` at the end instead of incrementing only streamer cells.

Do not pass `workingDaily` into opponent `rankEligibleFas` as a volume source (that old bug stays forbidden).

- [ ] **Step 4: Re-run planner tests**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/streamingPlans.test.ts`

Expected: new Task 2 cases PASS. Older packed-hold / “drop_add when Daily is packed” cases may FAIL — rewrite those in Task 6, not here, unless they block the file. If the file is red only on obsolete assertions, leave them failing until Task 6.

If the whole file is unreadable because of those failures, comment the obsolete `it(...)` titles with `it.skip` **only** for the titles listed in Task 6 Step 1, then re-run.

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/lib/matchup/streamingPlans.ts src/lib/matchup/types.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): plan streamers from leftover holes only"
```

---

### Task 3: Auto-cut non-starters + drop-option filter

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (you-side roster cut when adding)
- Modify: `src/lib/matchup/streamingDropOptions.ts` (`eligibleRosterDropPlayerIds` / `rosterDropSelectOptions`)
- Test: `tests/unit/streamingPlans.test.ts`
- Test: `tests/unit/streamingDropOptions.test.ts`

**Interfaces:**
- Consumes: `pickAutoRosterCut` from Task 1
- When `hasOpenNonIlRosterSlot` is false and tonight `holeCount > 0`, auto `rosterDropPlayerId = pickAutoRosterCut(...)`. If `null`, skip the add (cell stays `empty` for that spot).
- Forced `forcedRosterDrops` starter ids remain honored (user override).
- `eligibleRosterDropPlayerIds` for Auto suggestions must omit ids seated in tonight’s hole lineup (starters).

- [ ] **Step 1: Write the failing tests**

```ts
it("does not auto-cut a tonight starter to add a streamer", () => {
  const days = ["2025-10-21"]
  const packed = packedRosterPlayers()
  const fa = player("fa-por", "POR", { positions: ["PF"] })
  const state = tinyState([...packed, fa], ["fa-por"])
  state.teams[0]!.entries = packed.map((entry, index) => ({
    slot: packedActiveSlots[index]!,
    playerId: entry.id,
  }))
  const pfOpen = emptyActive().map((entry, index) => ({
    ...entry,
    playerId: entry.slot === "PF" ? null : packed[index]!.id,
  }))
  const schedule = tinySchedule(days, [
    ...packedTeamAbbrs.map((homeAbbr) => ({
      date: "2025-10-21",
      homeAbbr,
      awayAbbr: "SAC",
    })),
    { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: closeLosingRebBoard(),
    strategyMode: "aggressive",
    daily: { "2025-10-21": pfOpen },
  })
  const add = plan.days[0]!.cells[0]
  if (add?.action === "add") {
    expect(add.rosterDropKind).not.toBe("player")
    if (add.rosterDropPlayerId) {
      expect(pfOpen.some((entry) => entry.playerId === add.rosterDropPlayerId)).toBe(
        false,
      )
    }
  }
})
```

If the PF-open case has an open roster BE, the add may use `open_slot`. Also add a full-13-roster variant: 10 actives + 3 BE all filled, only BE has no game tonight — that BE id is the only legal auto-cut.

```ts
it("auto-cuts the off-night bench player not a starter", () => {
  const days = ["2025-10-21"]
  const packed = packedRosterPlayers()
  const bench = player("r-be", "DET", { positions: ["C"] })
  const fa = player("fa-por", "POR", { positions: ["PF"] })
  const state = tinyState([...packed, bench, fa], ["fa-por"])
  state.teams[0]!.entries = [
    ...packed.map((entry, index) => ({
      slot: packedActiveSlots[index]!,
      playerId: entry.id,
    })),
    { slot: "BE", playerId: "r-be" },
    { slot: "BE", playerId: null },
    { slot: "BE", playerId: null },
  ]
  const pfOpen = emptyActive().map((entry, index) => ({
    ...entry,
    playerId: entry.slot === "PF" ? null : packed[index]!.id,
  }))
  const schedule = tinySchedule(days, [
    ...packedTeamAbbrs.map((homeAbbr) => ({
      date: "2025-10-21",
      homeAbbr,
      awayAbbr: "SAC",
    })),
    { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: closeLosingRebBoard(),
    strategyMode: "aggressive",
    daily: { "2025-10-21": pfOpen },
  })
  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "add",
    playerId: "fa-por",
    rosterDropKind: "player",
    rosterDropPlayerId: "r-be",
  })
})
```

Current signature:

```ts
eligibleRosterDropPlayerIds(
  entries: SeasonRosterEntry[],
  playersById: Record<string, SeasonPlayer>,
  earlierDroppedIds: string[],
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
  options?: { includeProtected?: boolean },
): string[]
```

Extend `options` with `seatedTonightIds?: ReadonlySet<string>` and omit those ids. In `StreamingPlansPanel`, pass seated ids from `daily?.[editableDate]` (non-null `playerId`s) when building options.

Add to `tests/unit/streamingDropOptions.test.ts`:

```ts
it("omits tonight starters from auto roster-drop options", () => {
  const entries: SeasonRosterEntry[] = [
    { slot: "PG", playerId: "a" },
    { slot: "BE", playerId: "b" },
  ]
  const ids = eligibleRosterDropPlayerIds(
    entries,
    {
      a: player("a", "Alpha"),
      b: player("b", "Beta"),
    },
    [],
    undefined,
    undefined,
    { seatedTonightIds: new Set(["a"]) },
  )
  expect(ids).toEqual(["b"])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/streamingPlans.test.ts`

Expected: FAIL if current expendable-star / surplus cut still picks a seated starter.

- [ ] **Step 3: Implement cut + option filter**

Replace automatic drop ranking that uses surplus/weak expendable as the **legality** gate. Legality is `pickAutoRosterCut`. Keep surplus/weak only if you need a leftover tie-break **after** remaining game-day sort (Task 1 already sorts by remaining games then id).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/streamingPlans.test.ts tests/unit/streamingHoleCalendar.test.ts tests/unit/streamingDropOptions.test.ts`

Expected: Task 3 cases PASS.

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/lib/matchup/streamingPlans.ts src/lib/matchup/streamingDropOptions.ts src/components/matchup/StreamingPlansPanel.tsx tests/unit/streamingPlans.test.ts
git commit -m "fix(matchup): auto-cut only non-starters for hole adds"
```

---

### Task 4: Opponent hole calendar

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (`fillOpponentSpotsForDate` / opponent branch in the day loop)
- Test: `tests/unit/streamingPlans.test.ts` (`describe("forced opponent roster drops")` and a new packed-opp Auto case)

**Interfaces:**
- Consumes: same Task 1 helpers, opponent `teamEntries`, opponent `workingDaily` as `savedDay` only if you already persist opp daily sits (you do not — pass `undefined` for savedDay).
- Packed opponent night: opponent cells are `empty` / `playerId: null`. Do not pick leftover FAs by remaining NBA games.
- Forced `forcedOpponentRosterDrops` starter ids still create a hole (user override) and may add.

- [ ] **Step 1: Write the failing test**

```ts
it("does not stream for the opponent on a packed roster-game night", () => {
  const days = ["2025-11-03"]
  const faOpp = player("fa-opp-1", "WAS", {
    positions: ["PG"],
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
  })
  expect(plan.opponentDays[0]!.cells.every((cell) => cell.action === "empty")).toBe(
    true,
  )
  expect(plan.opponentDays[0]!.cells.every((cell) => cell.playerId === null)).toBe(
    true,
  )
})
```

Place this next to the existing `packedOppState` helper (same describe). `packedGames` / `packedOppState` already exist in that describe — call them, do not copy a second helper.

Keep tests that pass `forcedOpponentRosterDrops: ["r0"]` as override-still-adds.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/streamingPlans.test.ts`

Expected: FAIL — Auto still adds `fa-opp-1` and cuts a starter.

- [ ] **Step 3: Apply the same packed/hole/cap gates to opponent fill**

If `countOpenActiveSlots(buildHoleDayLineup({ day: date, teamEntries: oppEntries, ... })) === 0` and no forced starter cut for that spot, write empty cells and skip `fillOpponentSpotsForDate` adds.

When a forced drop is present, apply that cut first, rebuild the hole lineup, then fill at most `min(oppSpotCount, holeCount)`.

- [ ] **Step 4: Run opponent + you planner tests**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/streamingPlans.test.ts`

Expected: new packed-opp Auto PASS. Forced-drop tests still PASS. Update any Auto-on-packed assertion that required a streamer (Task 6 list).

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "fix(matchup): apply hole calendar to opponent streaming"
```

---

### Task 5: You-spot Rec uses team Starts

**Files:**
- Modify: `src/lib/matchup/recommendYouSpot.ts`
- Test: `tests/unit/recommendYouSpot.test.ts`
- Modify callers of `YouSpotScore` / `scoreYouSpotPlans` (search `projectedCatWins` on that type) so they still compile

**Interfaces:**
- Change:
  - `YouSpotScore = { spot: YouSpotCount, gameStarts: number, addsUsed: number }`
  - `pickRecommendedYouSpot`: sort `gameStarts` desc, then `addsUsed` asc, then `spotRank` (None = 0) asc
  - `scoreYouSpotPlans`: `gameStarts: countTeamStarts(applyStreamingPlanPreview(...) or baseDaily, players, schedule)`
- Do **not** keep `projectedCatWins` as the primary key.

- [ ] **Step 1: Write the failing tests**

Replace `tests/unit/recommendYouSpot.test.ts` score helper and cases:

```ts
import { describe, expect, it } from "vitest"
import {
  pickRecommendedYouSpot,
  shouldAutoApplyYouSpot,
  type YouSpotScore,
} from "@/lib/matchup/recommendYouSpot"

const score = (
  spot: YouSpotScore["spot"],
  gameStarts: number,
  addsUsed = 0,
): YouSpotScore => ({ spot, gameStarts, addsUsed })

describe("pickRecommendedYouSpot", () => {
  it("picks the spot with the most team starts", () => {
    expect(
      pickRecommendedYouSpot([
        score(null, 40),
        score(1, 44),
        score(2, 48),
        score(3, 46),
      ]),
    ).toBe(2)
  })

  it("breaks a start tie toward fewer adds", () => {
    expect(
      pickRecommendedYouSpot([
        score(2, 45, 6),
        score(1, 45, 3),
      ]),
    ).toBe(1)
  })

  it("breaks an equal start and add tie toward fewer spots, treating None as zero", () => {
    expect(
      pickRecommendedYouSpot([
        score(2, 45, 3),
        score(null, 45, 3),
        score(1, 45, 3),
      ]),
    ).toBeNull()
  })

  it("returns undefined when there is nothing to score", () => {
    expect(pickRecommendedYouSpot([])).toBeUndefined()
  })
})
```

Keep the existing `shouldAutoApplyYouSpot` describe unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/recommendYouSpot.test.ts`

Expected: FAIL — `YouSpotScore` still has `projectedCatWins` / sort still uses it.

- [ ] **Step 3: Update scorer and sort**

```ts
import { countTeamStarts } from "./streamingHoleCalendar"

export type YouSpotScore = {
  spot: YouSpotCount
  gameStarts: number
  addsUsed: number
}

export const pickRecommendedYouSpot = (
  scores: readonly YouSpotScore[],
): YouSpotCount | undefined => {
  if (scores.length === 0) return undefined
  return [...scores].sort((left, right) => {
    if (right.gameStarts !== left.gameStarts) {
      return right.gameStarts - left.gameStarts
    }
    if (left.addsUsed !== right.addsUsed) {
      return left.addsUsed - right.addsUsed
    }
    return spotRank(left.spot) - spotRank(right.spot)
  })[0]?.spot
}
```

In `scoreYouSpotPlans`, set `gameStarts` via `countTeamStarts` on `baseDaily` (None) and on `applyStreamingPlanPreview(...)` (each plan).

Fix TypeScript errors at the `YouSpotScore` construction site only.

- [ ] **Step 4: Run Rec and panel tests that construct scores**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/recommendYouSpot.test.ts tests/unit/StreamingPlansPanel.test.tsx tests/unit/MatchupPlanBar.test.tsx`

Expected: PASS. If a panel test still builds `{ projectedCatWins }`, update that object to `{ gameStarts }`.

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/lib/matchup/recommendYouSpot.ts tests/unit/recommendYouSpot.test.ts
git commit -m "feat(matchup): recommend you-spot by team starts"
```

---

### Task 6: Retire conflicting tests + confirm overlay locks

**Files:**
- Modify: `tests/unit/streamingPlans.test.ts` (obsolete assertions)
- Confirm only (do not rewrite unless red): `tests/unit/applyStreamingPlanPreview.test.ts`, `tests/unit/DailyLineupPanel.test.tsx`, `tests/unit/streamerMove.test.ts`

**Obsolete titles to rewrite or delete** (exact strings in `streamingPlans.test.ts`):

- `1-spot drop_adds on an off night even when Daily is packed with other game-day players` — packed middle night must be `empty`, not `drop_add`
- `holds 2-spot mid-block off night when only thin FA plays today` — if that day has a hole, **add** the thin FA who can sit; if packed, `empty`. Do not hold a no-game occupant
- Any Auto opponent test that expects a streamer when `packedOppState` has 10 games and **no** `forcedOpponentRosterDrops` — expect `empty`
- Leave `drop_adds a 2-spot occupant on an off night for more remaining seatable games` if 10/21 and 10/22 are holes; 10/23 packed must not keep DaSilva. Adjust 10/23 cell to `empty` if the fixture now packs that night

Do not keep `it.skip` from Task 2.

Overlay confirmations (already specified; re-run, fix only if red):

- Plan-cut locks Start; manual Sit does not
- Bagley-style UTIL seat with `allowFlexSlots: true`
- Start with no hole returns `full`

- [ ] **Step 1: Rewrite the obsolete planner tests** so they assert the spec (empty packed cells, hole-only adds). Delete a test only when it duplicates a Task 2 case.

- [ ] **Step 2: Run the full related suite**

Run: `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/streamingHoleCalendar.test.ts tests/unit/streamingPlans.test.ts tests/unit/applyStreamingPlanPreview.test.ts tests/unit/DailyLineupPanel.test.tsx tests/unit/streamerMove.test.ts tests/unit/recommendYouSpot.test.ts tests/unit/StreamingPlansPanel.test.tsx tests/unit/MatchupWorkspace.test.tsx`

Expected: PASS. If `MatchupWorkspace.test.tsx` times out, re-run that file alone with `--testTimeout=30000`.

- [ ] **Step 3: Fix only failures caused by this spec** (type errors, stale `projectedCatWins`, packed-hold assertions). Do not drive-by lint.

- [ ] **Step 4: Re-run the same suite**

Expected: PASS.

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add tests/unit/streamingPlans.test.ts tests/unit/applyStreamingPlanPreview.test.ts tests/unit/DailyLineupPanel.test.tsx tests/unit/recommendYouSpot.test.ts src
git commit -m "test(matchup): align streaming plans with hole calendar"
```

---

## Spec coverage (self-review)

| Spec rule | Task |
| --- | --- |
| Team-wide Starts / `gameStarts` meaning | 1 (`countTeamStarts`), 2 |
| Packed night no add/hold | 2, 4 |
| Hole = leftover eligible slot | 1 |
| Rank hole Starts → B2B → weak cats | 1, 2 |
| B2B only on hole nights | 2 (`picks a 10/20-21 B2B only when both nights are holes`) |
| Concurrent `min(spot, holes)` | 2 |
| Re-add costs 1 add | 2 |
| Add limit unchanged | 2 (no `streamingAddLimitForSchedule` edits) |
| Auto-cut non-starter + fewest remaining games | 1, 3 |
| Manual Sit hole | 1, 2 (`savedDay`) |
| Plan-cut lock vs manual Sit | 6 (existing Daily tests) |
| Overlay flex / `full` hint | 6 |
| Opponent same calendar | 4 |
| You-spot Rec | 5 |
| Forced drop dropdown omits starters | 3 |
| Strategy modes cannot override packed/hole | 2 (gates first) |
| No DP / no new page / no waiver execute | Global constraints |

No TBD/TODO placeholders. Helper and `YouSpotScore` names are the same in Tasks 1–5.
