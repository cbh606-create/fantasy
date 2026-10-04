# Matchup Stat Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let matchup switch one rate window (Season / Last 7 / 15 / 30 days) for all weekly projections, ingesting ESPN last-N splits at import with per-player Season fallback.

**Architecture:** Store optional per-game `recentRates` on `SeasonPlayer` during ESPN map. `weeklyPlayerStats(player, games, window)` picks Season vs last-N (empty last-N → Season). Thread `statWindow` through advise, Daily totals, streaming, Sit/Start. One PlanBar `<select>` persists per league; GET `/api/matchup` reads `statWindow`.

**Tech Stack:** TypeScript, React, Vitest. Existing `src/lib/matchup/weekly.ts`, `espnSeasonMap.ts`, `MatchupPlanBar.tsx`. No new ESPN fetches on picker change.

## Global Constraints

- Windows: `season` | `l7` | `l15` | `l30`. Default `season`.
- One window for the whole matchup. No per-player dropdowns.
- Last-N = ESPN actual per-game × this week’s games. Not blended.
- Empty last-N → that player uses Season. Picker stays on last-N.
- UI: PlanBar select, `aria-label="Stat window"`, options `Season`, `Last 7 days`, `Last 15 days`, `Last 30 days`.
- Persist `localStorage` key `matchup-stat-window:{leagueId}`. Invalid → `season`.
- English UI. No semicolons in TS/TSX.
- Tests: `npx.cmd vitest run --maxWorkers=1 [--testTimeout=30000] <file>`.
- Do not commit unless the user asked for a commit.

---

### Task 1: Window types + weeklyPlayerStats

**Files:**
- Modify: `src/lib/season/types.ts` (`SeasonPlayer`)
- Modify: `src/lib/matchup/types.ts` (`StatWindow`)
- Modify: `src/lib/matchup/weekly.ts`
- Test: `tests/unit/matchupWeekly.test.ts`

**Interfaces:**
- Produces:
  - `StatWindow = "season" | "l7" | "l15" | "l30"`
  - `isStatWindow(value: unknown): value is StatWindow`
  - `PlayerRateSet = { projections, shooting }`
  - `SeasonPlayer.recentRates?: Partial<Record<"l7" | "l15" | "l30", PlayerRateSet>>`
  - `weeklyPlayerStats(player, games, window?: StatWindow)` default `"season"`
  - `activeTeamWeeklyTotals(..., window?: StatWindow)`
  - Last-N rates are **per-game**. Season path unchanged.

- [ ] **Step 1: Write failing tests** in `tests/unit/matchupWeekly.test.ts`

```ts
it("uses last-7 per-game rates times games", () => {
  const player: SeasonPlayer = {
    id: "a",
    name: "A",
    projections: {
      FG_PCT: 0.5,
      FT_PCT: 0.8,
      TPM: 82,
      REB: 0,
      AST: 0,
      STL: 0,
      BLK: 0,
      TO: 0,
      PTS: 1640,
    },
    shooting: { FGM: 820, FGA: 1640, FTM: 164, FTA: 205 },
    recentRates: {
      l7: {
        projections: {
          FG_PCT: 0.4,
          FT_PCT: 0.8,
          TPM: 3,
          REB: 1,
          AST: 1,
          STL: 1,
          BLK: 1,
          TO: 1,
          PTS: 30,
        },
        shooting: { FGM: 10, FGA: 25, FTM: 4, FTA: 5 },
      },
    },
  }
  const weekly = weeklyPlayerStats(player, 2, "l7")
  expect(weekly.projections.PTS).toBeCloseTo(60)
  expect(weekly.projections.TPM).toBeCloseTo(6)
  expect(weekly.projections.FG_PCT).toBeCloseTo(10 / 25)
})

it("falls back to Season when last-7 counting stats are empty", () => {
  const player: SeasonPlayer = {
    id: "a",
    name: "A",
    projections: {
      FG_PCT: 0.5,
      FT_PCT: 0.8,
      TPM: 82,
      REB: 0,
      AST: 0,
      STL: 0,
      BLK: 0,
      TO: 0,
      PTS: 1640,
    },
    shooting: { FGM: 820, FGA: 1640, FTM: 164, FTA: 205 },
    recentRates: {
      l7: {
        projections: {
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
        shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
      },
    },
  }
  const season = weeklyPlayerStats(player, 2, "season")
  const l7 = weeklyPlayerStats(player, 2, "l7")
  expect(l7.projections.PTS).toBeCloseTo(season.projections.PTS)
})
```

Keep existing season-total and per-game Season tests (omit `window` / pass `"season"`).

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupWeekly.test.ts`

Expected: FAIL (`window` argument unused / `recentRates` unused).

- [ ] **Step 3: Implement types + scaling**

`src/lib/matchup/types.ts` — add:

```ts
export type StatWindow = "season" | "l7" | "l15" | "l30"

export const isStatWindow = (value: unknown): value is StatWindow =>
  value === "season" || value === "l7" || value === "l15" || value === "l30"
```

`src/lib/season/types.ts` — on `SeasonPlayer`:

```ts
recentRates?: Partial<
  Record<
    "l7" | "l15" | "l30",
    {
      projections: Record<CategoryId, number>
      shooting: SeasonPlayer["shooting"]
    }
  >
>
```

`src/lib/matchup/weekly.ts`:

```ts
import type { StatWindow } from "./types"

const countingRatesLive = (projections: Record<CategoryId, number>) =>
  projections.PTS > 0 ||
  projections.REB > 0 ||
  projections.AST > 0 ||
  projections.TPM > 0

export const weeklyPlayerStats = (
  player: SeasonPlayer,
  games: number,
  window: StatWindow = "season",
): WeeklyPlayerStats => {
  if (window !== "season") {
    const recent = player.recentRates?.[window]
    if (recent && countingRatesLive(recent.projections)) {
      return scalePerGameRates(recent, games)
    }
  }
  return scaleSeasonOrPerGamePlayer(player, games)
}
```

Extract current body into `scaleSeasonOrPerGamePlayer`. `scalePerGameRates` multiplies counting cats + shooting by `games`, then FG% / FT% from scaled makes/attempts (same as current per-game branch).

Pass `window` through `activeTeamWeeklyTotals(..., window = "season")` into `weeklyPlayerStats`.

- [ ] **Step 4: Re-run weekly tests — expect PASS**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupWeekly.test.ts`

---

### Task 2: ESPN map last-N ingest

**Files:**
- Modify: `src/lib/adapters/espnSeasonMap.ts` (`playerFromEspn`)
- Modify: `data/fixtures/espn-api-season-league-sample.json` (add last-7 row on player 201; empty last-7 on 202)
- Test: `tests/unit/espnSeasonMap.test.ts`

**Interfaces:**
- Consumes: ESPN `player.stats[]` with `statSourceId === 0` and `statSplitTypeId` 1/2/3 (`id` `01{season}` / `02{season}` / `03{season}`)
- Produces: `recentRates.l7 | l15 | l30` as **per-game** (do not × 82). Omit a window when counting stats are all 0 / missing. Do not change Season `projections`.
- `applyPoolProjections` already spreads the mapped player first — `recentRates` must survive overlay.

- [ ] **Step 1: Extend fixture + failing test**

On Star Point (`id` 201) append:

```json
{
  "id": "012026",
  "seasonId": 2026,
  "statSourceId": 0,
  "statSplitTypeId": 1,
  "averageStats": {
    "0": 30,
    "1": 0.5,
    "2": 1.2,
    "3": 8,
    "6": 5,
    "11": 3,
    "13": 11,
    "14": 22,
    "15": 4,
    "16": 5,
    "17": 3,
    "19": 0.5,
    "20": 0.8
  }
}
```

On Rim Protector (`id` 202) append empty last-7:

```json
{
  "id": "012026",
  "seasonId": 2026,
  "statSourceId": 0,
  "statSplitTypeId": 1,
  "averageStats": {}
}
```

Test:

```ts
it("attaches per-game last-7 rates and skips empty splits", () => {
  const state = mapEspnLeagueToSeasonState(
    sample as EspnLeaguePayload,
    { leagueId: "120853513", season: 2026, teamId: 9 },
  )
  const star = state.players.find((player) => player.id === "201")
  const rim = state.players.find((player) => player.id === "202")
  expect(star?.recentRates?.l7?.projections.PTS).toBe(30)
  expect(star?.projections.PTS).toBeCloseTo(24.1 * 82)
  expect(rim?.recentRates?.l7).toBeUndefined()
})
```

- [ ] **Step 2: Run espnSeasonMap test — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/espnSeasonMap.test.ts`

- [ ] **Step 3: Implement split reader**

Prefer `statSourceId === 0` + `statSplitTypeId` 1/2/3 for the mapped `season`. If both `id` (`01YYYY`) and split type exist, split type wins.

```ts
const SPLIT_TO_WINDOW = { 1: "l7", 2: "l15", 3: "l30" } as const

const perGameRateSet = (avg: EspnAverageStats) => {
  const fgm = avg["13"] ?? 0
  const fga = avg["14"] ?? 0
  const ftm = avg["15"] ?? 0
  const fta = avg["16"] ?? 0
  return {
    projections: {
      FG_PCT: avg["19"] ?? (fga > 0 ? fgm / fga : 0),
      FT_PCT: avg["20"] ?? (fta > 0 ? ftm / fta : 0),
      TPM: avg["17"] ?? 0,
      REB: avg["6"] ?? 0,
      AST: avg["3"] ?? 0,
      STL: avg["2"] ?? 0,
      BLK: avg["1"] ?? 0,
      TO: avg["11"] ?? 0,
      PTS: avg["0"] ?? 0,
    },
    shooting: { FGM: fgm, FGA: fga, FTM: ftm, FTA: fta },
  }
}
```

Attach only windows where `PTS|REB|AST|TPM > 0`. Same helper from `mapEspnFreeAgentPlayers` via `playerFromEspn`.

- [ ] **Step 4: Re-run espnSeasonMap tests — expect PASS**

---

### Task 3: Thread statWindow through matchup math

**Files:**
- Modify: `src/lib/matchup/advise.ts` — `options.statWindow?: StatWindow`
- Modify: `src/lib/matchup/sitStart.ts` — `SuggestSitStartInput.statWindow?`
- Modify: `src/lib/matchup/streamers.ts` — `SuggestStreamersInput.statWindow?`
- Modify: `src/lib/matchup/streamingPlans.ts` — `BuildStreamingPlanInput.statWindow?`; `categoryContribution` / `shootingHelp` / `weakCatScore` use `weeklyPlayerStats(..., window)`
- Modify: `src/lib/matchup/streamingDropExplain.ts` — pass window into `weeklyPlayerStats`
- Modify: `src/lib/matchup/dailyLineups.ts` — `youTotalsFromDaily(..., statWindow?)`
- Modify: `src/lib/matchup/streamerMove.ts` — `planningMatchupBoard` pass-through
- Modify: `src/app/api/matchup/route.ts` — parse `statWindow` query, default `season`
- Test: `tests/unit/matchupWeekly.test.ts` (totals with window) and a focused advise or streaming test if one already builds a board from players with `recentRates`

**Interfaces:**
- Consumes: `StatWindow` from Task 1, `recentRates` from Task 2
- Produces: every matchup weekly path honors `statWindow` (default `"season"`). Waivers `matchupStream.ts` stays default Season (not on the matchup page picker).

Default omitted `statWindow` to `"season"` so current tests stay green.

- [ ] **Step 1: Failing test — Daily / team totals follow window**

In `matchupWeekly.test.ts`, extend `activeTeamWeeklyTotals` (add optional window arg already from Task 1):

```ts
it("active totals use last-15 when requested", () => {
  const player: SeasonPlayer = {
    id: "active",
    name: "Active",
    teamAbbr: "BOS",
    projections: {
      FG_PCT: 0.5,
      FT_PCT: 0.8,
      TPM: 0,
      REB: 0,
      AST: 0,
      STL: 0,
      BLK: 0,
      TO: 0,
      PTS: 820,
    },
    shooting: { FGM: 410, FGA: 820, FTM: 82, FTA: 102.5 },
    recentRates: {
      l15: {
        projections: {
          FG_PCT: 0.5,
          FT_PCT: 0.8,
          TPM: 0,
          REB: 0,
          AST: 0,
          STL: 0,
          BLK: 0,
          TO: 0,
          PTS: 40,
        },
        shooting: { FGM: 15, FGA: 30, FTM: 5, FTA: 5 },
      },
    },
  }
  const totals = activeTeamWeeklyTotals(
    [{ slot: "UTIL", playerId: "active" }],
    new Map([["active", player]]),
    new Map([["active", 2]]),
    "l15",
  )
  expect(totals.PTS).toBeCloseTo(80)
})
```

- [ ] **Step 2: Run — expect FAIL if Task 1 totals do not take window yet** (should PASS if Task 1 already threaded `activeTeamWeeklyTotals`)

- [ ] **Step 3: Thread `statWindow`**

`adviseMatchup` options:

```ts
statWindow?: StatWindow
```

Pass into `activeTeamWeeklyTotals`, `suggestSitStart`, `suggestStreamers`, `buildAllStreamingPlans`.

`buildStreamingPlan` / `buildAllStreamingPlans`: add `statWindow?: StatWindow` to `BuildStreamingPlanInput`. Inside, `const window = input.statWindow ?? "season"` and use it in every `weeklyPlayerStats` call in that file (`categoryContribution`, `shootingHelp`).

`youTotalsFromDaily(daily, players, schedule, statWindow?)`  
`planningMatchupBoard(..., statWindow?)` forwards to `youTotalsFromDaily`.

API GET:

```ts
const rawWindow = request.nextUrl.searchParams.get("statWindow")
const statWindow = isStatWindow(rawWindow) ? rawWindow : "season"
adviseMatchup(state, schedule, opponent, { ..., statWindow })
```

- [ ] **Step 4: Run**

```
npx.cmd vitest run --maxWorkers=1 tests/unit/matchupWeekly.test.ts tests/api/matchup.test.ts tests/unit/streamingPlans.test.ts
```

Expected: PASS. If `matchup.test.ts` asserts exact board PTS, keep default Season so numbers unchanged.

---

### Task 4: PlanBar Stat window select

**Files:**
- Modify: `src/components/matchup/MatchupPlanBar.tsx`
- Test: `tests/unit/MatchupPlanBar.test.tsx`

**Interfaces:**
- Consumes: `statWindow: StatWindow`, `onStatWindowChange: (window: StatWindow) => void`
- Produces: native `<select aria-label="Stat window">` with options Season, Last 7 days, Last 15 days, Last 30 days. Place as its own row under You (same `flex-col` as Opp drop). Not per player.

- [ ] **Step 1: Failing test**

```ts
it("reports a Stat window change", () => {
  const onStatWindowChange = vi.fn()
  render(
    <MatchupPlanBar
      openSeatCount={1}
      oppSpotChoice="auto"
      onOppSpotChoiceChange={vi.fn()}
      onYouSpotCountChange={vi.fn()}
      youSpotCount={null}
      statWindow="season"
      onStatWindowChange={onStatWindowChange}
    />,
  )
  fireEvent.change(screen.getByLabelText("Stat window"), {
    target: { value: "l15" },
  })
  expect(onStatWindowChange).toHaveBeenCalledWith("l15")
})
```

- [ ] **Step 2: Run PlanBar tests — expect FAIL** (missing select)

- [ ] **Step 3: Add select**

```tsx
<label className="flex flex-wrap items-center gap-2">
  <span className="text-[var(--color-mute)]">Stats</span>
  <select
    aria-label="Stat window"
    className="rounded-full border border-[var(--color-hairline)] bg-transparent px-2.5 py-1 font-medium text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
    onChange={(event) => {
      const value = event.target.value
      if (isStatWindow(value)) onStatWindowChange(value)
    }}
    value={statWindow}
  >
    <option value="season">Season</option>
    <option value="l7">Last 7 days</option>
    <option value="l15">Last 15 days</option>
    <option value="l30">Last 30 days</option>
  </select>
</label>
```

Use `handleStatWindowChange` (not inline if the file prefers named handlers).

- [ ] **Step 4: Run** `npx.cmd vitest run --maxWorkers=1 tests/unit/MatchupPlanBar.test.tsx`

---

### Task 5: Workspace persist + fetch + streaming panel

**Files:**
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Modify: `src/components/matchup/StreamingPlansPanel.tsx` (`statWindow` into `buildStreamingPlan`)
- Modify: `src/lib/matchup/streamerMove.ts` / workspace `planningMatchupBoard` call if Task 3 added the arg
- Test: `tests/unit/MatchupWorkspace.test.tsx`

**Interfaces:**
- Consumes: Tasks 3–4
- Produces: `statWindow` state, `matchup-stat-window:{leagueId}` read/write (mirror `matchup-opponent:{leagueId}`), `fetchMatchup` adds `statWindow` query when not `season` (always send it: `params.set("statWindow", statWindow)`), changing the select refetches advice like opponent change (no ESPN cookie round-trip beyond existing matchup GET). Pass `statWindow` into `StreamingPlansPanel` → `buildStreamingPlan`, `youTotalsFromDaily` / `planningMatchupBoard`, and Rec scoring.

- [ ] **Step 1: Failing workspace test**

Stub `localStorage`. After matchup loads, change Stat window to Last 7 days and expect a fetch to `/api/matchup` whose URL includes `statWindow=l7`.

If the existing workspace test file is heavy, a narrower assertion is enough: PlanBar select present and `onStatWindowChange` triggers `fetch` with `statWindow=l7`.

Also: `localStorage.setItem("matchup-stat-window:league-1", "l15")` before render → first matchup request includes `statWindow=l15`.

- [ ] **Step 2: Run workspace test with `--testTimeout=30000` — expect FAIL**

- [ ] **Step 3: Wire workspace**

```ts
const statWindowStorageKey = (id: string) => `matchup-stat-window:${id}`

const readStoredStatWindow = (id: string): StatWindow => {
  if (typeof window === "undefined") return "season"
  const stored = window.localStorage.getItem(statWindowStorageKey(id))
  return isStatWindow(stored) ? stored : "season"
}
```

`useState<StatWindow>(() => readStoredStatWindow(leagueId))`  
`handleStatWindowChange`: set state, `localStorage.setItem`, `fetchMatchup(opponentTeamIndex, { includeState: false })` with the **next** window in the query (don’t rely on stale state — pass window into `fetchMatchup`).

Extend `fetchMatchup` options with `statWindow?: StatWindow` defaulting to current state.

`StreamingPlansPanel`: new optional `statWindow` prop forwarded to every `buildStreamingPlan` / `noneOpponentPlan` call.

- [ ] **Step 4: Run**

```
npx.cmd vitest run --maxWorkers=1 --testTimeout=30000 tests/unit/MatchupWorkspace.test.tsx tests/unit/MatchupPlanBar.test.tsx tests/unit/StreamingPlansPanel.test.tsx tests/unit/matchupWeekly.test.ts tests/unit/espnSeasonMap.test.ts
```

Expected: PASS.

- [ ] **Step 5: Manual check**

Matchup → Stats dropdown Season / Last 7/15/30. Preseason: Last 7 looks like Season. After ESPN last-N fills, Last 7 moves the board.

---

## Spec coverage

| Spec | Task |
|---|---|
| Windows + default Season | 1, 5 |
| Last-N per-game × weekly games | 1 |
| Per-player Season fallback | 1 |
| ESPN split ingest, no extra fetch | 2, 5 |
| `weeklyPlayerStats` single entry | 1, 3 |
| Whole matchup (board, Daily, streaming, Sit/Start) | 3, 5 |
| One PlanBar dropdown, English copy | 4 |
| localStorage per league | 5 |
| Manual/empty last-N behaves as Season | 1, 2 |
| No per-player UI, no blend, no 2027 ROS scrape | (out of scope) |
