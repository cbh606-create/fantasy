# Published NBA Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefer ESPN live for the current NY week when it has games; otherwise slice the next week with games from a checked-in 2026–27 published schedule, and keep season roster slots as PG…UTIL×3, BE×3, IL×1 with explicit persistence and validation.

**Architecture:** Extend `ScheduleResponse.source` with `"season"`. Add `scheduleSeason.ts` helpers that load `nba-schedule-2026-27.json` and build a Mon–Sun week starting at the first game date ≥ “today” (NY). Change `getMatchupSchedule` to try live first, then season slice (injectable `now` + `fetchImpl` for tests). Point waivers routes at the same helper. Persist `rosterSlots` on manual create; validate lineup PATCH against `rosterSlotsFor(state)`.

**Tech Stack:** Next.js, TypeScript, Vitest, ESPN public scoreboard API, JSON fixtures

## Global Constraints

- Offseason / empty live → **next Mon–Sun week with games** from published 2026–27 regular season (tip-off 2026-10-20)
- In-season with games → `source: "live"`
- Roster slots: `PG, SG, SF, PF, C, G, F, UTIL, UTIL, UTIL, BE, BE, BE, IL` (IR = `IL`, bench = 3)
- Preseason calendar and slot customizer UI are out of scope
- Windows: use `npm.cmd` / `npx.cmd`
- Do not use semicolons in new/edited TS (match repo style)
- Spec: `docs/superpowers/specs/2026-08-24-published-nba-schedule-design.md`

## File map

| File | Responsibility |
|---|---|
| `data/fixtures/nba-schedule-2026-27.json` | Full regular-season games `{ season, games: ScheduleGame[] }` |
| `scripts/refresh-nba-schedule.mjs` | Build/refresh that JSON from ESPN scoreboard by date |
| `src/lib/matchup/scheduleSeason.ts` | Load season file; `weekContainingDate`; `nextWeekWithGames(games, todayIso)` |
| `src/lib/matchup/scheduleLive.ts` | Live fetch + fallback to season; options `now?`, `fetchImpl?` |
| `src/lib/season/types.ts` | `source: "live" \| "season" \| "fixture"` |
| `data/fixtures/nba-matchup-schedule.json` | Tiny last-resort / legacy test fixture only |
| `src/app/api/waivers/matchup-stream/route.ts` | Use `getMatchupSchedule()` |
| `src/app/api/waivers/matchup-stream/preview/route.ts` | Same |
| `src/lib/adapters/manualSeason.ts` | Persist `rosterSlots: SEASON_ROSTER_SLOTS` |
| `src/app/api/season-leagues/[id]/lineup/route.ts` | Validate vs `rosterSlotsFor(state)` |
| `src/components/matchup/MatchupWorkspace.tsx` | Chip copy for `live` / `season` / `fixture` |
| Tests under `tests/unit/` and existing API tests | Cover resolution + slots |

---

### Task 1: Season schedule types + next-week helper

**Files:**
- Modify: `src/lib/season/types.ts`
- Create: `src/lib/matchup/scheduleSeason.ts`
- Create: `tests/unit/scheduleSeason.test.ts`
- Create (minimal stub for tests if full file not ready): can use inline games in tests without full JSON yet

**Interfaces:**
- Consumes: `ScheduleGame`, `ScheduleResponse`, `buildWeekDays` from `scheduleLive` (or duplicate tiny date helpers in `scheduleSeason` to avoid circular imports — prefer exporting `buildWeekDays` / `previousIsoDate` usage from existing modules)
- Produces:
  - `export type SeasonScheduleFile = { season: string; games: ScheduleGame[] }`
  - `export const mondayOfWeekContaining = (isoDate: string): string`
  - `export const sliceWeekFromSeasonGames = (games: ScheduleGame[], weekStartIso: string): ScheduleResponse` with `source: "season"`
  - `export const nextWeekWithGames = (games: ScheduleGame[], todayIso: string): ScheduleResponse | null`

- [ ] **Step 1: Extend `ScheduleResponse.source`**

In `src/lib/season/types.ts`:

```ts
export type ScheduleResponse = {
  source: "live" | "season" | "fixture"
  matchup: ScheduleMatchup
  games: ScheduleGame[]
}
```

- [ ] **Step 2: Write failing tests for next-week logic**

Create `tests/unit/scheduleSeason.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  mondayOfWeekContaining,
  nextWeekWithGames,
} from "@/lib/matchup/scheduleSeason"
import type { ScheduleGame } from "@/lib/season/types"

const games: ScheduleGame[] = [
  { date: "2026-10-20", homeAbbr: "DET", awayAbbr: "BOS" },
  { date: "2026-10-20", homeAbbr: "NYK", awayAbbr: "PHI" },
  { date: "2026-10-21", homeAbbr: "LAL", awayAbbr: "GSW" },
  { date: "2026-10-26", homeAbbr: "BOS", awayAbbr: "NYK" },
]

describe("scheduleSeason", () => {
  it("mondayOfWeekContaining returns NY-calendar Monday for a Tuesday tip-off", () => {
    expect(mondayOfWeekContaining("2026-10-20")).toBe("2026-10-19")
  })

  it("nextWeekWithGames from offseason picks opening week", () => {
    const schedule = nextWeekWithGames(games, "2026-08-24")
    expect(schedule).not.toBeNull()
    expect(schedule!.source).toBe("season")
    expect(schedule!.matchup.startDate).toBe("2026-10-19")
    expect(schedule!.matchup.endDate).toBe("2026-10-25")
    expect(schedule!.games.every((g) => schedule!.matchup.days.includes(g.date))).toBe(true)
    expect(schedule!.games.length).toBe(3)
  })

  it("nextWeekWithGames returns null when no future games", () => {
    expect(nextWeekWithGames(games, "2027-05-01")).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npm.cmd run test -- tests/unit/scheduleSeason.test.ts --reporter=dot`  
Expected: FAIL (module missing)

- [ ] **Step 4: Implement `scheduleSeason.ts`**

```ts
import { buildWeekDays } from "@/lib/matchup/scheduleLive"
import type { ScheduleGame, ScheduleResponse } from "@/lib/season/types"

export type SeasonScheduleFile = {
  season: string
  games: ScheduleGame[]
}

const parseIsoDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

const formatUtcIsoDate = (date: Date) => date.toISOString().slice(0, 10)

export const mondayOfWeekContaining = (isoDate: string): string => {
  const day = parseIsoDate(isoDate)
  const daysSinceMonday = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - daysSinceMonday)
  return formatUtcIsoDate(day)
}

export const sliceWeekFromSeasonGames = (
  games: ScheduleGame[],
  weekStartIso: string,
): ScheduleResponse => {
  const start = parseIsoDate(weekStartIso)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const endIso = formatUtcIsoDate(end)
  const days = buildWeekDays(weekStartIso, endIso)
  const daySet = new Set(days)
  const lookback = parseIsoDate(weekStartIso)
  lookback.setUTCDate(lookback.getUTCDate() - 1)
  const lookbackIso = formatUtcIsoDate(lookback)

  return {
    source: "season",
    matchup: {
      scoringPeriodId: Number(weekStartIso.replaceAll("-", "")),
      startDate: weekStartIso,
      endDate: endIso,
      days,
    },
    games: games.filter(
      (game) => daySet.has(game.date) || game.date === lookbackIso,
    ),
  }
}

export const nextWeekWithGames = (
  games: ScheduleGame[],
  todayIso: string,
): ScheduleResponse | null => {
  const future = games
    .map((game) => game.date)
    .filter((date) => date >= todayIso)
    .sort()
  const first = future[0]
  if (!first) return null
  return sliceWeekFromSeasonGames(games, mondayOfWeekContaining(first))
}
```

Note: if importing `buildWeekDays` from `scheduleLive` creates a circular dependency once `scheduleLive` imports `scheduleSeason`, move `buildWeekDays` + date helpers into `src/lib/matchup/scheduleDates.ts` in this task and update both imports.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm.cmd run test -- tests/unit/scheduleSeason.test.ts --reporter=dot`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/season/types.ts src/lib/matchup/scheduleSeason.ts src/lib/matchup/scheduleDates.ts tests/unit/scheduleSeason.test.ts
git commit -m "feat(matchup): add next-week slice helpers for published season schedule"
```

---

### Task 2: Refresh script + checked-in 2026–27 schedule JSON

**Files:**
- Create: `scripts/refresh-nba-schedule.mjs`
- Create: `data/fixtures/nba-schedule-2026-27.json`
- Create: `tests/unit/nbaSchedule2026_27.test.ts`

**Interfaces:**
- Consumes: ESPN `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD`
- Produces: JSON `{ "season": "2026-27", "games": ScheduleGame[] }` with abbrs already normalized (`GS→GSW`, etc.)

- [ ] **Step 1: Write failing coverage test for the season file**

```ts
import { describe, expect, it } from "vitest"
import season from "../../data/fixtures/nba-schedule-2026-27.json"

describe("nba-schedule-2026-27", () => {
  it("covers tip-off through late season with all 30 teams", () => {
    expect(season.season).toBe("2026-27")
    expect(season.games.length).toBeGreaterThan(1000)
    const teams = new Set<string>()
    for (const game of season.games) {
      teams.add(game.homeAbbr)
      teams.add(game.awayAbbr)
      expect(game.date >= "2026-10-20").toBe(true)
      expect(game.date <= "2027-04-11").toBe(true)
    }
    expect(teams.size).toBe(30)
    expect(
      season.games.some(
        (g) =>
          g.date === "2026-10-20" &&
          ((g.homeAbbr === "DET" && g.awayAbbr === "BOS") ||
            (g.homeAbbr === "BOS" && g.awayAbbr === "DET")),
      ),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL** (file missing)

Run: `npm.cmd run test -- tests/unit/nbaSchedule2026_27.test.ts --reporter=dot`

- [ ] **Step 3: Implement refresh script**

`scripts/refresh-nba-schedule.mjs` should:

1. Iterate dates from `2026-10-20` through `2027-04-11`
2. `fetch` ESPN scoreboard per day (small concurrency, e.g. 4 at a time; retry once on failure)
3. Normalize events → `{ date: NY ISO, homeAbbr, awayAbbr }` using the same abbr map as `scheduleLive`
4. Dedupe by `date|home|away`
5. Write `data/fixtures/nba-schedule-2026-27.json` with pretty JSON
6. Log game count + team count

Run once with network: `node scripts/refresh-nba-schedule.mjs`  
Expected: file written, ≥1000 games, 30 teams

If ESPN is flaky for far-future dates, document in script header and commit whatever successful pull yields; do not invent games.

- [ ] **Step 4: Run coverage test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-nba-schedule.mjs data/fixtures/nba-schedule-2026-27.json tests/unit/nbaSchedule2026_27.test.ts
git commit -m "feat(matchup): check in published 2026-27 NBA schedule fixture"
```

---

### Task 3: Wire `getMatchupSchedule` live → season → fixture

**Files:**
- Modify: `src/lib/matchup/scheduleLive.ts`
- Modify: `tests/unit/matchupScheduleLive.test.ts`
- Modify: `tests/unit/seasonScheduleTypes.test.ts` (if still asserting old March fiction as product fallback)

**Interfaces:**
- Consumes: `nextWeekWithGames`, season JSON import
- Produces: updated

```ts
type GetMatchupScheduleOptions = {
  fetchImpl?: typeof fetch
  now?: Date
}
```

- [ ] **Step 1: Write failing tests for offseason resolution**

Add to `tests/unit/matchupScheduleLive.test.ts`:

```ts
it("uses published season next week when live returns no games", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-24T16:00:00Z"))
  const schedule = await getMatchupSchedule({
    fetchImpl: async () =>
      new Response(JSON.stringify({ events: [] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
  })
  expect(schedule.source).toBe("season")
  expect(schedule.matchup.startDate).toBe("2026-10-19")
  expect(schedule.games.length).toBeGreaterThan(0)
})

it("keeps live when ESPN returns games for the current week", async () => {
  // existing cache/live test pattern with espn sample — assert source === "live"
})
```

Update the existing “falls back to fixture” tests: empty live should now hit **season**, not March fixture. Fixture remains only if season helpers return null (simulate by exporting a test-only injection later, or keep fixture path for thrown errors before season load — prefer: catch live failure → try season → if null return fixture).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement resolution in `getMatchupSchedule`**

Pseudocode:

```ts
export const getMatchupSchedule = async (options = {}) => {
  const nowDate = options.now ?? new Date()
  const { startIso, endIso } = getNewYorkWeek(nowDate)
  // cache key includes source path: prefer `${startIso}:${endIso}:v2` or include resolved week after
  // 1) try live for current week (include lookback games in array)
  // 2) if uniqueGames filtered to matchup.days is empty OR fetch throws:
  //      const todayIso = formatNewYorkIsoDate(nowDate)
  //      const season = nextWeekWithGames(seasonFile.games, todayIso)
  //      if (season) { cache; return season }
  // 3) return scheduleFixture as ScheduleResponse
}
```

Important: when deciding live emptiness, count only games whose `date` is in `days` (lookback-only does not count as a live week).

Clear or version the in-memory cache key so old live-empty→fixture caches do not stick during tests (`afterEach` reset export if needed: `export const clearMatchupScheduleCache = () => { cachedSchedule = null }`).

- [ ] **Step 4: Run schedule unit tests — expect PASS**

Run: `npm.cmd run test -- tests/unit/matchupScheduleLive.test.ts tests/unit/scheduleSeason.test.ts tests/unit/nbaSchedule2026_27.test.ts --reporter=dot`

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/scheduleLive.ts tests/unit/matchupScheduleLive.test.ts tests/unit/seasonScheduleTypes.test.ts
git commit -m "feat(matchup): fall back to published season week when live slate is empty"
```

---

### Task 4: Waivers share `getMatchupSchedule` + UI chip

**Files:**
- Modify: `src/app/api/waivers/matchup-stream/route.ts`
- Modify: `src/app/api/waivers/matchup-stream/preview/route.ts`
- Modify: `src/components/matchup/MatchupWorkspace.tsx` (schedule chip ~line 432)
- Modify: related waiver API tests if they assume fixture dates

**Interfaces:**
- Consumes: `getMatchupSchedule()`
- Produces: same stream recommendation JSON; schedule chip labels

- [ ] **Step 1: Update chip copy**

```tsx
Schedule:{" "}
{matchupData.schedule.source === "live"
  ? "live"
  : matchupData.schedule.source === "season"
    ? "published · next week with games"
    : "fixture fallback"}
```

- [ ] **Step 2: Replace fixture imports in both waiver routes**

```ts
import { getMatchupSchedule } from "@/lib/matchup/scheduleLive"
// ...
const schedule = await getMatchupSchedule()
```

- [ ] **Step 3: Fix waiver tests** to mock `getMatchupSchedule` like `tests/api/matchup.test.ts` / `schedule.test.ts` already do

- [ ] **Step 4: Run**

`npm.cmd run test -- tests/api tests/unit/matchupScheduleLive.test.ts --reporter=dot`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/waivers/matchup-stream/route.ts src/app/api/waivers/matchup-stream/preview/route.ts src/components/matchup/MatchupWorkspace.tsx tests/api
git commit -m "feat(waivers): use shared matchup schedule helper and clarify schedule chip"
```

---

### Task 5: Persist and validate season roster slots

**Files:**
- Modify: `src/lib/adapters/manualSeason.ts`
- Modify: `src/app/api/season-leagues/[id]/lineup/route.ts`
- Create or modify: `tests/unit/manualSeasonSlots.test.ts` and/or lineup API test

**Interfaces:**
- Consumes: `SEASON_ROSTER_SLOTS`, `rosterSlotsFor`
- Produces: manual state always includes `rosterSlots`; PATCH validates against state’s slots

- [ ] **Step 1: Failing test — manual state includes rosterSlots**

```ts
it("persists SEASON_ROSTER_SLOTS on manual leagues", () => {
  const state = manualToSeasonLeagueState({ /* minimal valid input from existing fixtures */ })
  expect(state.rosterSlots).toEqual([
    "PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL",
    "BE", "BE", "BE", "IL",
  ])
})
```

- [ ] **Step 2: Implement — add to `manualToSeasonLeagueState` return**

```ts
rosterSlots: [...SEASON_ROSTER_SLOTS],
```

- [ ] **Step 3: Fix lineup validation**

Load state first, then:

```ts
const slots = rosterSlotsFor(state)
const isValidLineup = (value: unknown): value is SeasonRosterEntry[] =>
  Array.isArray(value) &&
  value.length === slots.length &&
  value.every((entry, index) => {
    if (!entry || typeof entry !== "object") return false
    const row = entry as Partial<SeasonRosterEntry>
    return (
      row.slot === slots[index] &&
      (typeof row.playerId === "string" || row.playerId === null)
    )
  })
```

Reorder PATCH so validation uses parsed `state.rosterSlots` (validate body shape after load, or validate length/slots against `rosterSlotsFor` after parse). Prefer: parse body as unknown → load league → `rosterSlotsFor(state)` → validate entries.

- [ ] **Step 4: Run related unit/API tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters/manualSeason.ts src/app/api/season-leagues/[id]/lineup/route.ts tests
git commit -m "fix(season): persist default roster slots and validate lineup against them"
```

---

### Task 6: Spec status + verification sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-08-24-published-nba-schedule-design.md` → Status: Implemented
- Optional: short note in README only if schedule refresh script should be discoverable (skip if README already crowded)

- [ ] **Step 1: Run focused suite**

```bash
npm.cmd run test -- tests/unit/scheduleSeason.test.ts tests/unit/nbaSchedule2026_27.test.ts tests/unit/matchupScheduleLive.test.ts tests/unit/seasonScheduleTypes.test.ts tests/api/schedule.test.ts tests/api/matchup.test.ts --reporter=dot
```

Expected: all PASS

- [ ] **Step 2: Manual smoke** (dev server): open Matchup → chip shows `published · next week with games` before tip-off; schedule denser / real team abbrs; no 6-game fiction week

- [ ] **Step 3: Mark spec Implemented; commit**

```bash
git add docs/superpowers/specs/2026-08-24-published-nba-schedule-design.md
git commit -m "docs(matchup): mark published NBA schedule spec implemented"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Live when current week has games | Task 3 |
| Else next week with games from published 2026–27 | Tasks 1–3 |
| Season JSON + refresh script | Task 2 |
| Waivers share helper | Task 4 |
| UI chip live/season/fixture | Task 4 |
| Slots PG…IL×1, persist manual, PATCH vs state | Task 5 |
| No March fiction as product fallback | Task 3 |
| Preseason / slot UI out of scope | — intentionally omitted |

No TBD placeholders. Types: `source: "season"` introduced in Task 1 and used consistently.
