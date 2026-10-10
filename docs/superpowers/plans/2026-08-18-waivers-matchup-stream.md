# Waivers Matchup Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Waivers, recommend short-horizon add→drop pairs (full matchup week or next 2/3/4 days), show top-add/top-drop summaries, and live matchup before→after as add/drop selection changes — then prefill existing preview/claim.

**Architecture:** Pure helpers in `src/lib/waivers/matchupStream.ts` reuse matchup board/weekly/games helpers over a sliced day window. `GET /api/waivers/matchup-stream` returns ranked pairs; `POST /api/waivers/matchup-stream/preview` returns live deltas. `MatchupStreamPanel` sits in `WaiversWorkspace` above season Recommended Pickups.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind, Vitest, existing SeasonLeague + fixture schedule. Worktree: `.worktrees/feat-season-roster` on current feature branch.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-waivers-matchup-stream-design.md`
- Horizon: full `schedule.matchup.days` default; `dayCount` 2|3|4 = prefix of those days
- Opponent optional: matchup mode vs volume mode
- Pairs primary + topAdds/topDrops; drop may be `null` (empty slot)
- Live delta required when add/drop changes
- Reuse `applyAddDrop`, `buildMatchupBoard`, `activeTeamWeeklyTotals`, `weeklyPlayerStats`
- Candidate caps: adds ~40, drops ~12, pairs ~8, summaries ~5
- No ESPN writeback; no new nav tab
- No semicolons; `handle*` handlers; Tailwind; conventional commits
- Tests: `npx.cmd vitest run --maxWorkers=1 <path>`

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/waivers/matchupStreamTypes.ts` | DTOs for pairs, summaries, list + preview responses |
| `src/lib/waivers/matchupStreamConstants.ts` | Caps + allowed dayCounts |
| `src/lib/matchup/games.ts` | Add `gamesInDaysByPlayerId(players, schedule, days)` |
| `src/lib/waivers/matchupStream.ts` | `resolveWindowDays`, `recommendMatchupStream`, `previewMatchupStream` |
| `src/app/api/waivers/matchup-stream/route.ts` | `GET` list |
| `src/app/api/waivers/matchup-stream/preview/route.ts` | `POST` live delta |
| `src/components/waivers/MatchupStreamPanel.tsx` | Controls + pairs + summaries |
| `src/components/waivers/MatchupStreamDelta.tsx` | Before/after strip |
| `src/components/waivers/WaiversWorkspace.tsx` | Wire panel, opponent/dayCount state, debounce preview |
| `tests/unit/matchupStream.test.ts` | Domain unit tests |
| `tests/api/waiversMatchupStream.test.ts` | API tests |
| `tests/unit/WaiversWorkspace.test.tsx` | Prefill + delta smoke (extend) |

---

### Task 1: Window helpers + DTOs + games-in-days

**Files:**
- Create: `src/lib/waivers/matchupStreamConstants.ts`
- Create: `src/lib/waivers/matchupStreamTypes.ts`
- Modify: `src/lib/matchup/games.ts`
- Test: `tests/unit/matchupStream.test.ts`

**Interfaces:**
- Consumes: `ScheduleResponse`, `SeasonPlayer` from `@/lib/season/types`
- Produces:
  - `MATCHUP_STREAM_DAY_COUNTS = [2, 3, 4] as const`
  - `MAX_STREAM_ADD_CANDIDATES = 40`, `MAX_STREAM_DROP_CANDIDATES = 12`, `MAX_STREAM_PAIRS = 8`, `MAX_STREAM_SUMMARY = 5`
  - `resolveWindowDays(schedule, dayCount?: number): string[]`
  - `gamesInDaysByPlayerId(players, schedule, days: string[]): Map<string, number>`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/matchupStream.test.ts
import { describe, expect, it } from "vitest"
import { gamesInDaysByPlayerId } from "@/lib/matchup/games"
import { resolveWindowDays } from "@/lib/waivers/matchupStream"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-03-09",
    endDate: "2026-03-15",
    days: [
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-15",
    ],
  },
  games: [
    { date: "2026-03-09", homeAbbr: "LAL", awayAbbr: "BOS" },
    { date: "2026-03-11", homeAbbr: "LAL", awayAbbr: "NYK" },
    { date: "2026-03-14", homeAbbr: "MIA", awayAbbr: "LAL" },
  ],
}

describe("resolveWindowDays", () => {
  it("returns full matchup days when dayCount omitted", () => {
    expect(resolveWindowDays(schedule)).toEqual(schedule.matchup.days)
  })

  it("returns prefix when dayCount is 3", () => {
    expect(resolveWindowDays(schedule, 3)).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
    ])
  })

  it("clamps dayCount to available days", () => {
    expect(resolveWindowDays(schedule, 99)).toEqual(schedule.matchup.days)
  })
})

describe("gamesInDaysByPlayerId", () => {
  it("counts distinct game dates in the window only", () => {
    const players = [
      { id: "a", teamAbbr: "LAL" },
      { id: "b", teamAbbr: "MIA" },
    ] as SeasonPlayer[]

    const full = gamesInDaysByPlayerId(players, schedule, schedule.matchup.days)
    expect(full.get("a")).toBe(3)
    expect(full.get("b")).toBe(1)

    const twoDays = gamesInDaysByPlayerId(players, schedule, [
      "2026-03-09",
      "2026-03-10",
    ])
    expect(twoDays.get("a")).toBe(1)
    expect(twoDays.get("b")).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupStream.test.ts`  
Expected: FAIL (modules/exports missing)

- [ ] **Step 3: Implement constants, types stub export, resolveWindowDays, gamesInDaysByPlayerId**

```ts
// src/lib/waivers/matchupStreamConstants.ts
export const MATCHUP_STREAM_DAY_COUNTS = [2, 3, 4] as const
export type MatchupStreamDayCount = (typeof MATCHUP_STREAM_DAY_COUNTS)[number]
export const MAX_STREAM_ADD_CANDIDATES = 40
export const MAX_STREAM_DROP_CANDIDATES = 12
export const MAX_STREAM_PAIRS = 8
export const MAX_STREAM_SUMMARY = 5
```

```ts
// src/lib/waivers/matchupStreamTypes.ts
export type MatchupStreamMode = "matchup" | "volume"

export type MatchupStreamPair = {
  addPlayerId: string
  dropPlayerId: string | null
  addGames: number
  dropGames: number
  score: number
  deltaCatWins?: number
  reasons: string[]
}

export type MatchupStreamPlayerSummary = {
  playerId: string
  games: number
  score: number
  reasons: string[]
}

export type MatchupStreamResult = {
  mode: MatchupStreamMode
  windowDays: string[]
  opponentTeamIndex: number | null
  pairs: MatchupStreamPair[]
  topAdds: MatchupStreamPlayerSummary[]
  topDrops: MatchupStreamPlayerSummary[]
}

export type MatchupStreamBoardSnapshot = {
  wins: number
  losses: number
  ties: number
  projectedCatWins: number
  categories: Array<{
    categoryId: string
    you: number
    opp: number
    outcome: "W" | "L" | "T"
  }>
}

export type MatchupStreamPreviewResult = {
  mode: MatchupStreamMode
  windowDays: string[]
  before: MatchupStreamBoardSnapshot | null
  after: MatchupStreamBoardSnapshot | null
  summary: string
}
```

```ts
// src/lib/waivers/matchupStream.ts (partial)
import type { ScheduleResponse } from "@/lib/season/types"
import { MATCHUP_STREAM_DAY_COUNTS } from "./matchupStreamConstants"

export const resolveWindowDays = (
  schedule: ScheduleResponse,
  dayCount?: number,
): string[] => {
  const days = schedule.matchup.days
  if (dayCount == null || !Number.isInteger(dayCount) || dayCount < 1) {
    return [...days]
  }
  return days.slice(0, Math.min(dayCount, days.length))
}

export const isAllowedDayCount = (value: number): boolean =>
  (MATCHUP_STREAM_DAY_COUNTS as readonly number[]).includes(value)
```

```ts
// append to src/lib/matchup/games.ts
export const gamesInDaysByPlayerId = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  days: string[],
): Map<string, number> => {
  const daySet = new Set(days)
  const map = new Map<string, number>()

  for (const player of players) {
    const teamAbbr = player.teamAbbr?.toUpperCase()
    if (!teamAbbr) {
      map.set(player.id, 0)
      continue
    }

    const gameDays = new Set<string>()
    for (const game of schedule.games) {
      if (!daySet.has(game.date)) continue
      const home = game.homeAbbr.toUpperCase()
      const away = game.awayAbbr.toUpperCase()
      if (home === teamAbbr || away === teamAbbr) gameDays.add(game.date)
    }
    map.set(player.id, gameDays.size)
  }

  return map
}
```

Optionally refactor `gamesThisWeekByPlayerId` to call `gamesInDaysByPlayerId(..., schedule.matchup.days)`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupStream.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/waivers/matchupStreamConstants.ts src/lib/waivers/matchupStreamTypes.ts src/lib/waivers/matchupStream.ts src/lib/matchup/games.ts tests/unit/matchupStream.test.ts
git commit -m "feat(waivers): add matchup stream window helpers"
```

---

### Task 2: recommendMatchupStream + previewMatchupStream domain

**Files:**
- Modify: `src/lib/waivers/matchupStream.ts`
- Test: `tests/unit/matchupStream.test.ts`

**Interfaces:**
- Consumes: `applyAddDrop`, `buildMatchupBoard`, `activeTeamWeeklyTotals`, `gamesInDaysByPlayerId`, `teamNeedsAndSurplus` / `analyzeSeasonLeague`, `ALL_CATEGORY_IDS`
- Produces:
  - `recommendMatchupStream({ state, schedule, opponentTeamIndex?, dayCount? }): MatchupStreamResult`
  - `previewMatchupStream({ state, schedule, addPlayerId, dropPlayerId, opponentTeamIndex?, dayCount? }): MatchupStreamPreviewResult | { error: string }`

- [ ] **Step 1: Write failing tests for ranking + preview**

Use a tiny constructed `SeasonLeagueState` (2–3 teams, few players, known projections) and the schedule from Task 1.

```ts
describe("recommendMatchupStream", () => {
  it("returns matchup mode pairs with positive deltaCatWins first when opponent set", () => {
    const result = recommendMatchupStream({
      state: miniState, // YOU weak AST; FA with games + AST; drop with 0 games
      schedule,
      opponentTeamIndex: 1,
    })
    expect(result.mode).toBe("matchup")
    expect(result.pairs.length).toBeGreaterThan(0)
    expect(result.pairs[0].addPlayerId).toBe("fa-strong")
    expect(result.pairs[0].deltaCatWins).toBeGreaterThan(0)
  })

  it("uses volume mode when opponent omitted", () => {
    const result = recommendMatchupStream({ state: miniState, schedule })
    expect(result.mode).toBe("volume")
    expect(result.opponentTeamIndex).toBeNull()
  })

  it("allows add-only when YOU has an empty slot", () => {
    const result = recommendMatchupStream({
      state: miniStateWithEmptySlot,
      schedule,
      opponentTeamIndex: 1,
    })
    expect(result.pairs.some((pair) => pair.dropPlayerId === null)).toBe(true)
  })
})

describe("previewMatchupStream", () => {
  it("summarizes cat win improvement after add/drop", () => {
    const preview = previewMatchupStream({
      state: miniState,
      schedule,
      addPlayerId: "fa-strong",
      dropPlayerId: "you-weak",
      opponentTeamIndex: 1,
    })
    expect("error" in preview).toBe(false)
    if ("error" in preview) return
    expect(preview.mode).toBe("matchup")
    expect(preview.after!.projectedCatWins).toBeGreaterThan(
      preview.before!.projectedCatWins,
    )
    expect(preview.summary).toMatch(/Cats/i)
  })
})
```

Build `miniState` inline in the test file (mirror patterns in `tests/unit/waiversRecommendPreview.test.ts`).

- [ ] **Step 2: Run — expect FAIL** (`recommendMatchupStream` not exported)

- [ ] **Step 3: Implement scoring**

Algorithm sketch (implement fully in `matchupStream.ts`):

1. `windowDays = resolveWindowDays(schedule, dayCount)`
2. `gamesMap = gamesInDaysByPlayerId(state.players, schedule, windowDays)`
3. Resolve mode: if `opponentTeamIndex` is integer, exists, and ≠ YOU → `matchup`, else `volume`
4. Collect drop candidates: YOU entries with `playerId != null` (cap after scoring)
5. Collect add candidates: `availablePlayerIds` with `gamesMap.get >= 1`
6. For each add × drop (and add × null if empty slot exists):
   - `afterState = applyAddDrop(state, { addPlayerId, dropPlayerId })` — skip on error
   - **Matchup:** build boards before/after via `activeTeamWeeklyTotals` + `buildMatchupBoard`; `score = after.projectedCatWins - before.projectedCatWins`; keep if `score > 0`
   - **Volume:** score = need-cat contribution(add, addGames) − need-cat contribution(drop, dropGames) (TO inverted); keep if `score > 0`
7. Sort pairs desc; slice `MAX_STREAM_PAIRS`; build reasons (`Helps AST · 3 games`, `Drop 0-game player`)
8. `topAdds` / `topDrops`: best marginal scores, `MAX_STREAM_SUMMARY`

`previewMatchupStream`: same window/mode; validate via `applyAddDrop`; return snapshots + summary string:

```ts
const summaryFor = (before: MatchupBoard, after: MatchupBoard): string => {
  const flipped = after.categories.filter((row, index) => {
    const prev = before.categories[index]
    return prev && prev.outcome !== row.outcome && row.outcome === "W"
  })
  const delta = after.projectedCatWins - before.projectedCatWins
  if (flipped.length) {
    return `Cats +${flipped.length} (${flipped.map((r) => r.categoryId).join(", ")})`
  }
  return delta >= 0
    ? `Projected cat wins +${delta.toFixed(2)}`
    : `Projected cat wins ${delta.toFixed(2)}`
}
```

Volume preview: `before`/`after` null; `summary` like `+2 games vs drop · helps AST`.

- [ ] **Step 4: Run — expect PASS**

Run: `npx.cmd vitest run --maxWorkers=1 tests/unit/matchupStream.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/waivers/matchupStream.ts tests/unit/matchupStream.test.ts
git commit -m "feat(waivers): score matchup stream add/drop pairs"
```

---

### Task 3: GET `/api/waivers/matchup-stream`

**Files:**
- Create: `src/app/api/waivers/matchup-stream/route.ts`
- Test: `tests/api/waiversMatchupStream.test.ts`
- Reuse schedule import path like matchup route: `data/fixtures/nba-matchup-schedule.json`

**Interfaces:**
- Consumes: `requireUserId`, `loadOwnedSeasonLeague`, `recommendMatchupStream`
- Produces: JSON `MatchupStreamResult` (+ optional `playersById` for named UI if useful)

- [ ] **Step 1: Write API tests**

```ts
// Mirror auth patterns from tests/api/waivers.test.ts
it("returns 401 when unauthorized", ...)
it("returns 400 without seasonLeagueId", ...)
it("returns pairs payload for owned league", async () => {
  // seed season league in db like other waivers API tests
  const res = await GET(new Request(`http://localhost/api/waivers/matchup-stream?seasonLeagueId=${id}&opponentTeamIndex=1&dayCount=3`))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toMatchObject({
    mode: expect.stringMatching(/matchup|volume/),
    windowDays: expect.any(Array),
    pairs: expect.any(Array),
    topAdds: expect.any(Array),
    topDrops: expect.any(Array),
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (route missing)

- [ ] **Step 3: Implement GET**

```ts
export const GET = async (request: Request): Promise<Response> => {
  // requireUserId → 401
  // parse seasonLeagueId (required), opponentTeamIndex (optional int), dayCount (optional 2|3|4)
  // loadOwnedSeasonLeague
  // recommendMatchupStream({ state, schedule: scheduleFixture as ScheduleResponse, opponentTeamIndex, dayCount })
  // return NextResponse.json(result)
}
```

Invalid `dayCount` (not 2/3/4): ignore and use full week (or 400 — prefer **ignore → full week**).

- [ ] **Step 4: Run — expect PASS**

Run: `npx.cmd vitest run --maxWorkers=1 tests/api/waiversMatchupStream.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/waivers/matchup-stream/route.ts tests/api/waiversMatchupStream.test.ts
git commit -m "feat(waivers): add matchup-stream list API"
```

---

### Task 4: POST `/api/waivers/matchup-stream/preview`

**Files:**
- Create: `src/app/api/waivers/matchup-stream/preview/route.ts`
- Modify: `tests/api/waiversMatchupStream.test.ts`

**Interfaces:**
- Consumes: `previewMatchupStream`
- Body: `{ seasonLeagueId, addPlayerId, dropPlayerId: string | null, opponentTeamIndex?: number, dayCount?: number }`

- [ ] **Step 1: Failing tests**

```ts
it("returns live before/after for a valid add/drop", async () => {
  const res = await POST(new Request("http://localhost/api/waivers/matchup-stream/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      seasonLeagueId: id,
      addPlayerId: "...",
      dropPlayerId: "...",
      opponentTeamIndex: 1,
    }),
  }))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.summary).toEqual(expect.any(String))
})

it("returns 400 for add_not_available", ...)
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement POST** — validate body; load league; call `previewMatchupStream`; map `{ error }` → 400

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/waivers/matchup-stream/preview/route.ts tests/api/waiversMatchupStream.test.ts
git commit -m "feat(waivers): add matchup-stream live preview API"
```

---

### Task 5: MatchupStreamPanel + delta UI + WaiversWorkspace wiring

**Files:**
- Create: `src/components/waivers/MatchupStreamPanel.tsx`
- Create: `src/components/waivers/MatchupStreamDelta.tsx`
- Modify: `src/components/waivers/WaiversWorkspace.tsx`
- Modify: `tests/unit/WaiversWorkspace.test.tsx`

**Interfaces:**
- Panel props: `leagueId`, `state`, `opponentTeamIndex: number | null`, `dayCount: number | null`, `onOpponentChange`, `onDayCountChange`, `onSelectPair(addId, dropId)`, `playersById`
- Delta props: `preview: MatchupStreamPreviewResult | null`, `isLoading`, `error`

- [ ] **Step 1: Extend workspace test**

Mock `fetch` for `/api/waivers/matchup-stream` and `/api/waivers/matchup-stream/preview` in addition to pool.

```ts
it("prefills builder from a matchup stream pair and shows delta summary", async () => {
  // render WaiversWorkspace
  // await findByText(/matchup stream/i)
  // click pair button "Add Fa Strong / drop You Weak"
  // expect selected add/drop reflected (builder labels)
  // await findByText(/Cats \+/i) or mocked summary
})
```

- [ ] **Step 2: Run — FAIL** (panel missing)

- [ ] **Step 3: Implement panel**

UI (Tailwind, no cards-as-decoration beyond existing soft-cloud asides):

- Header: `Matchup stream` · `This week / next N days`
- Opponent `<select>`: “No opponent (volume)” + other teams by name
- Day chips: `Full week` | `2` | `3` | `4` (`aria-pressed`)
- Pairs: button rows with add/drop names, games, score, reasons
- Top adds / top drops compact lists
- Empty: “No positive stream pairs for this window.”

- [ ] **Step 4: Implement delta strip + workspace wiring**

In `WaiversWorkspace`:

```ts
const [streamOpponent, setStreamOpponent] = useState<number | null>(null)
const [streamDayCount, setStreamDayCount] = useState<number | null>(null)
const [streamDelta, setStreamDelta] = useState<MatchupStreamPreviewResult | null>(null)

// Debounced effect when selectedAddId / selectedDropId / streamOpponent / streamDayCount change:
// if (!selectedAddId) { setStreamDelta(null); return }
// POST /api/waivers/matchup-stream/preview with AbortController; ignore stale

// Render MatchupStreamPanel above RecommendedPickups
// Render MatchupStreamDelta above or inside AddDropBuilder area
```

Prefill:

```ts
const handleSelectPair = (addPlayerId: string, dropPlayerId: string | null) => {
  setSelectedAddId(addPlayerId)
  setSelectedDropId(dropPlayerId)
  setPreview(null)
  ...
}
```

Default opponent: first team index ≠ YOU (optional UX); start `null` if you want volume-first — **prefer default first other team** so matchup mode is immediate.

- [ ] **Step 5: Run unit UI + related API tests — PASS**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/WaiversWorkspace.test.tsx tests/unit/matchupStream.test.ts tests/api/waiversMatchupStream.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/components/waivers/MatchupStreamPanel.tsx src/components/waivers/MatchupStreamDelta.tsx src/components/waivers/WaiversWorkspace.tsx tests/unit/WaiversWorkspace.test.tsx
git commit -m "feat(waivers): show matchup stream pairs and live deltas"
```

---

### Task 6: Spec cross-check polish

**Files:** any gaps from self-review (empty states, playersById for names, label distinguishing season vs stream)

- [ ] **Step 1: Manual checklist against spec §1 success criteria** — each item has UI or API coverage
- [ ] **Step 2: Ensure season RecommendedPickups still visible and labeled “Season needs”**
- [ ] **Step 3: Run full waivers + matchup related tests**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/matchupStream.test.ts tests/api/waiversMatchupStream.test.ts tests/unit/WaiversWorkspace.test.tsx tests/unit/waiversRecommendPreview.test.ts tests/api/waivers.test.ts
```

- [ ] **Step 4: Commit chore if only copy/label tweaks**

```bash
git commit -m "chore(waivers): polish matchup stream empty states and labels"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| Full week + 2/3/4 day window | 1, 3, 5 |
| Opponent optional matchup/volume | 2, 5 |
| Pairs + topAdds/topDrops | 2, 5 |
| Empty-slot add-only | 2 |
| Live before/after on add/drop change | 4, 5 |
| Prefill + existing claim | 5 |
| Season recs kept | 5, 6 |
| Caps / positive scores | 2 |
| Tests | 1–5 |

No TBD placeholders remain. Dedicated preview route chosen (not extending season needs preview).

---

## Execution

Plan saved to `docs/superpowers/plans/2026-08-18-waivers-matchup-stream.md`.
