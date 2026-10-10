# Multi-Source ADP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store Yahoo rank, FantasyPros Yahoo ADP, and ESPN article rank on the player pool; let Mock pick a Primary that drives `player.adp` while showing the others as reference.

**Architecture:** Shared `adpBySource` on each player + `projectAdpFromSource` helper. Offline scripts refresh each source without wiping others, then merge projects default Primary into `adp`. Mock UI select reprojects, resorts, and resets the board. Sim engines keep using a single `adp`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Node ESM scripts (`.mjs`), Tailwind

## Global Constraints

- Default Primary: `yahoo_draft_analysis_rank`
- Sources v1 only: `yahoo_draft_analysis_rank`, `fantasypros_yahoo`, `espn_article_h2h_points`
- No Yahoo Plus Current ADP; no ADP blend; no localStorage Primary persistence
- No semicolons in JS/TS; event handlers use `handle*` prefix; Tailwind for styling
- Worktree: `C:\Users\cbh60\fantasy-dev` (junction to feat-season-roster); use `npm.cmd` on Windows
- Spec: `docs/superpowers/specs/2026-08-23-multi-source-adp-design.md`

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/players/adpSources.ts` | Source ids, labels, project/sort helpers |
| `src/lib/domain/types.ts` | `Player.adpBySource` |
| `src/lib/adapters/types.ts` / `src/lib/validation/simulate.ts` | Zod `adpBySource` optional |
| `scripts/lib/adp-pool.mjs` | Shared normalize + write source ADP + project Primary for scripts |
| `scripts/refresh-yahoo-adp.mjs` | Write Yahoo key only + project Primary |
| `scripts/refresh-fantasypros-adp.mjs` | FantasyPros Yahoo column + fixture |
| `scripts/refresh-espn-rankings.mjs` | Write ESPN key into `adpBySource` (keep add-stub behavior) |
| `scripts/merge-adp-sources.mjs` | Meta sync + Primary projection + sort |
| `data/players/fantasypros_yahoo_adp_2026_27.json` | Fixture |
| `src/components/draft/DraftWorkspace.tsx` | Primary state, reproject on change, reset mock |
| `src/components/draft/MockDraftView.tsx` | ADP source select + wire handler |
| `src/components/draft/PlayerPool.tsx` | Reference ADP display |
| `tests/unit/adpSources.test.ts` | Project/sort/merge unit tests |
| `package.json` | `players:fantasypros-adp`, `players:adp-merge` |

---

### Task 1: ADP source helpers + domain type

**Files:**
- Create: `src/lib/players/adpSources.ts`
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/adapters/types.ts` (player zod if present)
- Modify: `src/lib/validation/simulate.ts`
- Test: `tests/unit/adpSources.test.ts`

**Interfaces:**
- Produces: `AdpSourceId`, `ADP_SOURCES`, `DEFAULT_ADP_SOURCE`, `projectAdpFromSource(player, source)`, `withProjectedAdp(players, source)`, `formatAdpReferenceLine(player, primary)`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  DEFAULT_ADP_SOURCE,
  projectAdpFromSource,
  withProjectedAdp,
} from "@/lib/players/adpSources"
import type { Player } from "@/lib/domain/types"

const base = (over: Partial<Player> & Pick<Player, "id" | "name">): Player => ({
  positions: ["PG"],
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
  adp: 99,
  ...over,
})

describe("adpSources", () => {
  it("projects primary from adpBySource with fallback to adp", () => {
    const player = base({
      id: "1",
      name: "A",
      adp: 50,
      adpBySource: {
        yahoo_draft_analysis_rank: 3,
        fantasypros_yahoo: 4.2,
      },
    })
    expect(projectAdpFromSource(player, "yahoo_draft_analysis_rank")).toBe(3)
    expect(projectAdpFromSource(player, "espn_article_h2h_points")).toBe(50)
  })

  it("withProjectedAdp sorts by projected adp ascending", () => {
    const players = [
      base({
        id: "b",
        name: "B",
        adp: 1,
        adpBySource: { fantasypros_yahoo: 20 },
      }),
      base({
        id: "a",
        name: "A",
        adp: 2,
        adpBySource: { fantasypros_yahoo: 5 },
      }),
    ]
    const next = withProjectedAdp(players, "fantasypros_yahoo")
    expect(next.map((p) => p.id)).toEqual(["a", "b"])
    expect(next[0].adp).toBe(5)
    expect(DEFAULT_ADP_SOURCE).toBe("yahoo_draft_analysis_rank")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd run test -- tests/unit/adpSources.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement helpers + types**

`src/lib/players/adpSources.ts`:

```ts
import type { Player } from "@/lib/domain/types"

export const ADP_SOURCE_IDS = [
  "yahoo_draft_analysis_rank",
  "fantasypros_yahoo",
  "espn_article_h2h_points",
] as const

export type AdpSourceId = (typeof ADP_SOURCE_IDS)[number]

export const DEFAULT_ADP_SOURCE: AdpSourceId = "yahoo_draft_analysis_rank"

export const ADP_SOURCES: Record<
  AdpSourceId,
  { id: AdpSourceId; label: string; shortLabel: string }
> = {
  yahoo_draft_analysis_rank: {
    id: "yahoo_draft_analysis_rank",
    label: "Yahoo rank",
    shortLabel: "Yahoo",
  },
  fantasypros_yahoo: {
    id: "fantasypros_yahoo",
    label: "FantasyPros Yahoo",
    shortLabel: "FP",
  },
  espn_article_h2h_points: {
    id: "espn_article_h2h_points",
    label: "ESPN article",
    shortLabel: "ESPN",
  },
}

export const projectAdpFromSource = (
  player: Player,
  source: AdpSourceId,
): number => {
  const fromSource = player.adpBySource?.[source]
  if (typeof fromSource === "number" && Number.isFinite(fromSource) && fromSource > 0) {
    return fromSource
  }
  return player.adp
}

export const withProjectedAdp = (
  players: Player[],
  source: AdpSourceId,
): Player[] =>
  [...players]
    .map((player) => ({
      ...player,
      adp: projectAdpFromSource(player, source),
    }))
    .sort((left, right) => left.adp - right.adp || left.id.localeCompare(right.id))

export const formatAdpValue = (adp: number) =>
  Number.isInteger(adp) ? String(adp) : adp.toFixed(1)

export const formatAdpReferenceLine = (
  player: Player,
  primary: AdpSourceId,
): string => {
  const parts = ADP_SOURCE_IDS.filter((id) => id !== primary).map((id) => {
    const value = player.adpBySource?.[id]
    const label = ADP_SOURCES[id].shortLabel
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${label} —`
    }
    return `${label} ${formatAdpValue(value)}`
  })
  return `ADP ${formatAdpValue(player.adp)}${parts.length ? ` · ${parts.join(" · ")}` : ""}`
}
```

Add to `Player` in `src/lib/domain/types.ts`:

```ts
adpBySource?: Partial<
  Record<
    | "yahoo_draft_analysis_rank"
    | "fantasypros_yahoo"
    | "espn_article_h2h_points",
    number
  >
>
```

Extend zod player schemas in `src/lib/adapters/types.ts` and `src/lib/validation/simulate.ts` with optional:

```ts
adpBySource: z
  .record(z.string(), z.number())
  .optional()
```

- [ ] **Step 4: Run tests**

Run: `npm.cmd run test -- tests/unit/adpSources.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/players/adpSources.ts src/lib/domain/types.ts src/lib/adapters/types.ts src/lib/validation/simulate.ts tests/unit/adpSources.test.ts
git commit -m "feat(players): add multi-source ADP helpers and types"
```

---

### Task 2: Shared script pool helpers

**Files:**
- Create: `scripts/lib/adp-pool.mjs`
- Test: `tests/unit/adpPoolScript.test.ts` (import via relative path to `.mjs` or duplicate pure functions tested by invoking node - prefer exporting and testing with vitest if project allows importing `.mjs`; otherwise a small `node --test` file). Prefer: put pure functions in `scripts/lib/adp-pool.mjs` and verify with:

Run: `node --input-type=module -e "import { normalizeName, projectPrimary } from './scripts/lib/adp-pool.mjs'; ..."`

**Interfaces:**
- Produces: `normalizeName`, `ADP_SOURCE_IDS`, `DEFAULT_ADP_SOURCE`, `SOURCE_META`, `applySourceRanks(pool, sourceId, rows, metaPatch)`, `projectPrimary(pool, sourceId?)`

- [ ] **Step 1: Implement `scripts/lib/adp-pool.mjs`**

```js
export const DEFAULT_ADP_SOURCE = "yahoo_draft_analysis_rank"

export const ADP_SOURCE_IDS = [
  "yahoo_draft_analysis_rank",
  "fantasypros_yahoo",
  "espn_article_h2h_points",
]

export const SOURCE_META = {
  yahoo_draft_analysis_rank: {
    label: "Yahoo rank",
    url: "https://basketball.fantasysports.yahoo.com/nba/draftanalysis?type=standard",
  },
  fantasypros_yahoo: {
    label: "FantasyPros Yahoo",
    url: "https://www.fantasypros.com/nba/adp/overall.php",
  },
  espn_article_h2h_points: {
    label: "ESPN article",
    url: null,
  },
}

export const normalizeName = (name) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/['’]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

export const applySourceRanks = (pool, sourceId, rows, extraMeta = {}) => {
  const byKey = new Map()
  for (const row of rows) {
    const key = normalizeName(row.name)
    if (!byKey.has(key)) byKey.set(key, row.adp)
  }

  let matched = 0
  let unmatched = 0
  const players = pool.players.map((player) => {
    const value = byKey.get(normalizeName(player.name))
    if (value === undefined) {
      unmatched += 1
      return player
    }
    matched += 1
    return {
      ...player,
      adpBySource: {
        ...(player.adpBySource ?? {}),
        [sourceId]: value,
      },
    }
  })

  const adpSources = {
    ...(pool.meta?.adpSources ?? {}),
    [sourceId]: {
      id: sourceId,
      label: SOURCE_META[sourceId]?.label ?? sourceId,
      url: extraMeta.url ?? SOURCE_META[sourceId]?.url ?? null,
      updatedAt: new Date().toISOString(),
      matched,
      unmatched,
      rowCount: rows.length,
    },
  }

  return {
    pool: {
      ...pool,
      meta: {
        ...pool.meta,
        adpSources,
      },
      players,
    },
    matched,
    unmatched,
  }
}

export const projectPrimary = (pool, sourceId = DEFAULT_ADP_SOURCE) => {
  const players = pool.players
    .map((player) => {
      const fromSource = player.adpBySource?.[sourceId]
      const adp =
        typeof fromSource === "number" && Number.isFinite(fromSource) && fromSource > 0
          ? fromSource
          : player.adp
      return { ...player, adp }
    })
    .sort((a, b) => a.adp - b.adp || String(a.id).localeCompare(String(b.id)))

  const sourceMeta = pool.meta?.adpSources?.[sourceId]
  return {
    ...pool,
    meta: {
      ...pool.meta,
      adpPrimaryDefault: sourceId,
      adpSource: sourceId,
      adpSourceUrl: sourceMeta?.url ?? SOURCE_META[sourceId]?.url ?? null,
      adpUpdatedAt: new Date().toISOString(),
      count: players.length,
    },
    players,
  }
}
```

- [ ] **Step 2: Smoke-check helpers**

Run:

```bash
node --input-type=module -e "import { normalizeName, applySourceRanks, projectPrimary } from './scripts/lib/adp-pool.mjs'; const pool={meta:{},players:[{id:'1',name:'Nikola Jokic',adp:10}]}; const {pool:p2,matched}=applySourceRanks(pool,'fantasypros_yahoo',[{name:'Nikola Jokic',adp:2.5}]); const p3=projectPrimary(p2,'fantasypros_yahoo'); if(matched!==1||p3.players[0].adp!==2.5) throw new Error('fail'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/adp-pool.mjs
git commit -m "feat(players): add shared ADP pool helpers for refresh scripts"
```

---

### Task 3: Wire Yahoo + ESPN refresh to `adpBySource`

**Files:**
- Modify: `scripts/refresh-yahoo-adp.mjs`
- Modify: `scripts/refresh-espn-rankings.mjs`

**Interfaces:**
- Consumes: `applySourceRanks`, `projectPrimary` from `scripts/lib/adp-pool.mjs`
- Produces: pool players with `adpBySource.yahoo_draft_analysis_rank` / `espn_article_h2h_points` without clearing other keys

- [ ] **Step 1: Update Yahoo script**

After building `rows` as `{ name, rank }[]`, replace the per-player overwrite loop with:

```js
import { applySourceRanks, projectPrimary } from "./lib/adp-pool.mjs"

// ...
const { pool: withSource, matched, unmatched } = applySourceRanks(
  pool,
  "yahoo_draft_analysis_rank",
  rows.map((row) => ({ name: row.name, adp: row.rank })),
  { url: YAHOO_PAGE_URL },
)
const next = projectPrimary(withSource, "yahoo_draft_analysis_rank")
await writeFile(outPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
```

Keep fixture write/load behavior. Remove duplicate `normalizeName` if unused.

- [ ] **Step 2: Update ESPN script**

For existing players, set `adpBySource.espn_article_h2h_points = row.rank` instead of only `adp = row.rank`. Keep stub-add behavior for missing ranked players. At end call `projectPrimary(pool, "espn_article_h2h_points")` **only if** CLI `--primary=espn` is set; otherwise call `projectPrimary(pool, pool.meta?.adpPrimaryDefault ?? "yahoo_draft_analysis_rank")` so default Yahoo stays Primary when refreshing ESPN ranks.

Also set `meta.adpSources.espn_article_h2h_points` via `applySourceRanks` where practical, or mirror its shape manually after the match loop.

Simplest path: build `rows` from article ranks, `applySourceRanks` for matches on existing players, then separately keep the “add missing stubs” loop that also sets `adpBySource`.

- [ ] **Step 3: Dry-run Yahoo fixture path**

Run: `npm.cmd run players:yahoo-adp -- --fixture`

Expected: logs matched count; `proj_2026_27.json` players have `adpBySource.yahoo_draft_analysis_rank`; other keys preserved if present.

- [ ] **Step 4: Commit**

```bash
git add scripts/refresh-yahoo-adp.mjs scripts/refresh-espn-rankings.mjs
git commit -m "feat(players): write Yahoo and ESPN ranks into adpBySource"
```

---

### Task 4: FantasyPros Yahoo ADP script + fixture + merge

**Files:**
- Create: `scripts/refresh-fantasypros-adp.mjs`
- Create: `scripts/merge-adp-sources.mjs`
- Create: `data/players/fantasypros_yahoo_adp_2026_27.json` (from live or minimal hand fixture if blocked)
- Modify: `package.json`

**Interfaces:**
- Produces: `players:fantasypros-adp`, `players:adp-merge`

- [ ] **Step 1: Implement FantasyPros refresh**

Restore HTML parse from the old FantasyPros Yahoo column logic (see git history / superseded spec). Structure:

```js
// fetch https://www.fantasypros.com/nba/adp/overall.php
// parse fp-player-name + Yahoo column float
// on failure or --fixture: load data/players/fantasypros_yahoo_adp_2026_27.json
// applySourceRanks(..., "fantasypros_yahoo", rows)
// projectPrimary(..., DEFAULT or --primary)
// optional --write-fixture
```

Fixture shape:

```json
{
  "meta": {
    "source": "fantasypros_yahoo",
    "url": "https://www.fantasypros.com/nba/adp/overall.php",
    "fetchedAt": "...",
    "count": 0
  },
  "rankings": [{ "name": "Victor Wembanyama", "adp": 1.5 }]
}
```

- [ ] **Step 2: Implement merge script**

```js
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { DEFAULT_ADP_SOURCE, projectPrimary } from "./lib/adp-pool.mjs"

const inRel = /* --in */ "data/players/proj_2026_27.json"
const pool = JSON.parse(await readFile(...))
const primary = /* --primary */ pool.meta?.adpPrimaryDefault ?? DEFAULT_ADP_SOURCE
const next = projectPrimary(pool, primary)
await writeFile(..., JSON.stringify(next, null, 2) + "\n")
console.log(`Projected primary=${primary}; players=${next.players.length}`)
```

- [ ] **Step 3: package.json scripts**

```json
"players:fantasypros-adp": "node scripts/refresh-fantasypros-adp.mjs",
"players:adp-merge": "node scripts/merge-adp-sources.mjs"
```

- [ ] **Step 4: Populate data**

Run in order (network ok):

```bash
npm.cmd run players:yahoo-adp -- --write-fixture
npm.cmd run players:fantasypros-adp -- --write-fixture
npm.cmd run players:espn-rankings
npm.cmd run players:adp-merge
```

Verify one player has all three keys when possible:

```bash
node -e "const p=require('./data/players/proj_2026_27.json'); const x=p.players.find(p=>p.name.includes('Wembanyama')); console.log(x.adp, x.adpBySource)"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-fantasypros-adp.mjs scripts/merge-adp-sources.mjs data/players/fantasypros_yahoo_adp_2026_27.json data/players/proj_2026_27.json data/players/yahoo_draft_analysis_rank_2026_27.json package.json
git commit -m "feat(players): add FantasyPros ADP refresh and multi-source merge"
```

---

### Task 5: Mock Primary select + reference display

**Files:**
- Modify: `src/components/draft/DraftWorkspace.tsx`
- Modify: `src/components/draft/MockDraftView.tsx`
- Modify: `src/components/draft/PlayerPool.tsx`
- Test: extend `tests/unit/adpSources.test.ts` for `formatAdpReferenceLine` if not covered

**Interfaces:**
- Consumes: `DEFAULT_ADP_SOURCE`, `ADP_SOURCES`, `ADP_SOURCE_IDS`, `withProjectedAdp`, `formatAdpReferenceLine`
- Produces: Mock select that resets draft with projected players

- [ ] **Step 1: DraftWorkspace state**

Add:

```ts
const [adpSource, setAdpSource] = useState<AdpSourceId>(DEFAULT_ADP_SOURCE)
```

When loading fresh mock players (after `loadFreshMockPlayers`), project:

```ts
const projected = withProjectedAdp(players, adpSource)
```

`handleAdpSourceChange = (next: AdpSourceId) => { setAdpSource(next); if (!state) return; void startMockDraft(state, mockPerspectiveTeamIndex, { refreshPlayers: true, teams: mockTeams, adpSource: next }) }`

Extend `startMockDraft` options with optional `adpSource` override; inside, use `options.adpSource ?? adpSource` for `withProjectedAdp`.

Pass to `MockDraftView`: `adpSource`, `onAdpSourceChange={handleAdpSourceChange}`.

- [ ] **Step 2: MockDraftView select**

In mock header controls, add:

```tsx
<label className="...">
  <span className="sr-only">ADP source</span>
  <select
    aria-label="ADP source"
    value={adpSource}
    onChange={(event) => onAdpSourceChange(event.target.value as AdpSourceId)}
  >
    {ADP_SOURCE_IDS.map((id) => (
      <option key={id} value={id}>{ADP_SOURCES[id].label}</option>
    ))}
  </select>
</label>
```

Latest pick line: use `formatAdpReferenceLine(latestPick.player, adpSource)` or keep short Primary + references.

- [ ] **Step 3: PlayerPool reference line**

Accept optional `adpSource: AdpSourceId` prop (default `DEFAULT_ADP_SOURCE`). Replace lone ADP cell / mobile subtitle with `formatAdpReferenceLine(player, adpSource)` (or Primary in main column + muted references).

- [ ] **Step 4: Manual verify**

Restart or rely on HMR. Open Mock → confirm Yahoo order → switch FantasyPros → board resets and ADP text updates → switch ESPN.

- [ ] **Step 5: Commit**

```bash
git add src/components/draft/DraftWorkspace.tsx src/components/draft/MockDraftView.tsx src/components/draft/PlayerPool.tsx tests/unit/adpSources.test.ts
git commit -m "feat(draft): add mock ADP source select and reference display"
```

---

### Task 6: Spec status + smoke tests

**Files:**
- Modify: `docs/superpowers/specs/2026-08-23-multi-source-adp-design.md` status → `Approved / implemented`
- Run: `npm.cmd run test -- tests/unit/adpSources.test.ts tests/unit/playerProvider.test.ts`

- [ ] **Step 1: Run unit tests**

Expected: PASS

- [ ] **Step 2: Update spec status line**

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-23-multi-source-adp-design.md
git commit -m "docs(players): mark multi-source ADP spec implemented"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| `adpBySource` + Primary `adp` | 1, 2 |
| Three sources | 3, 4 |
| Scripts + merge + fixtures | 3, 4 |
| Mock select, reset, session-only | 5 |
| Reference display | 5 |
| Engines unchanged (use `adp`) | 5 (projection before sim) |
| Non-goals respected | all |
| Tests | 1, 6 |

## Placeholder scan

No TBD/TODO steps; commands and code inlined.

## Type consistency

- `AdpSourceId` / default id strings match between `adpSources.ts` and `adp-pool.mjs`
- `withProjectedAdp(players, source)` used in DraftWorkspace
- `formatAdpReferenceLine(player, primary)` used in MockDraftView / PlayerPool
