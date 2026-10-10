# Yahoo Projections Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `npm run players:import-yahoo` that applies a Yahoo-style projections CSV to the draft pool and, by default, every saved SeasonLeague — reusing Hashtag parse/match/apply helpers.

**Architecture:** Reuse `parseHashtagCsv` + `applyHashtagProjections` from `src/lib/players/hashtagImport.ts`. Add a thin pure module for season-target resolution + overlay meta keys. New CLI `scripts/import-yahoo-projections.ts` owns argv, pool I/O, and DB loop (all leagues / one id / skip).

**Tech Stack:** TypeScript, tsx, Vitest, Prisma `db`, Node `fs`. Spec: `docs/superpowers/specs/2026-08-26-yahoo-projections-overlay-design.md`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-yahoo-projections-overlay-design.md`
- Manual CSV only; no Yahoo scrape for projections
- Reuse Hashtag matching/scale/apply; overwrite matched only
- Default: patch **pool + all** season leagues
- `--skip-seasons` → pool only; `--season-league-id=<id>` → pool + that league only
- Default `--per-game true`, `--gp-default 70`
- Exit `0` ok/dry-run; `1` parse/usage failure; `2` pool OK but season patch failure(s)
- Meta: `projectionOverlay: "yahoo"`, `yahooImportedAt`, `yahooSourceFile`, match counts
- ESPN importer is out of scope (document handoff in README only)
- No semicolons; conventional commits
- Tests: `npx vitest run --maxWorkers=1 <paths>` (PowerShell OK)
- Do not commit unrelated WIP (e.g. leave `espn-season-league.json` Ingram swap out of these commits unless user asks)

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/players/projectionOverlayCli.ts` | Pure helpers: season patch mode + Yahoo/Hashtag-style overlay meta builder |
| `tests/unit/projectionOverlayCli.test.ts` | Unit tests for those helpers |
| `data/fixtures/yahoo-projections-sample.csv` | 2–3 fake rows (same columns as Hashtag sample) |
| `scripts/import-yahoo-projections.ts` | Yahoo CLI: pool write + season loop |
| `package.json` | `players:import-yahoo` script |
| `README.md` | Yahoo overlay section + ESPN handoff note |

---

### Task 1: Season target + overlay meta helpers

**Files:**
- Create: `src/lib/players/projectionOverlayCli.ts`
- Create: `tests/unit/projectionOverlayCli.test.ts`

**Interfaces:**
- Consumes: match report shape `{ matched: unknown[]; unmatched: unknown[]; ambiguous: unknown[] }` (length only)
- Produces:
  - `resolveSeasonPatchMode(input: { skipSeasons: boolean; seasonLeagueId?: string }): { mode: "all" } | { mode: "none" } | { mode: "one"; id: string }`
  - `buildYahooOverlayMeta(input: { sourceFile: string; parsed: number; report: { matched: unknown[]; unmatched: unknown[]; ambiguous: unknown[] }; importedAt?: string }): Record<string, unknown>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/projectionOverlayCli.test.ts
import { describe, expect, it } from "vitest"
import {
  buildYahooOverlayMeta,
  resolveSeasonPatchMode,
} from "@/lib/players/projectionOverlayCli"

describe("resolveSeasonPatchMode", () => {
  it("defaults to all leagues", () => {
    expect(resolveSeasonPatchMode({ skipSeasons: false })).toEqual({
      mode: "all",
    })
  })

  it("returns none when skipSeasons", () => {
    expect(resolveSeasonPatchMode({ skipSeasons: true })).toEqual({
      mode: "none",
    })
  })

  it("returns one id when seasonLeagueId set (even if skipSeasons false)", () => {
    expect(
      resolveSeasonPatchMode({
        skipSeasons: false,
        seasonLeagueId: "lg-1",
      }),
    ).toEqual({ mode: "one", id: "lg-1" })
  })

  it("prefers skipSeasons over seasonLeagueId", () => {
    expect(
      resolveSeasonPatchMode({
        skipSeasons: true,
        seasonLeagueId: "lg-1",
      }),
    ).toEqual({ mode: "none" })
  })
})

describe("buildYahooOverlayMeta", () => {
  it("sets yahoo overlay keys and counts", () => {
    const meta = buildYahooOverlayMeta({
      sourceFile: "yahoo.csv",
      parsed: 10,
      importedAt: "2026-08-26T00:00:00.000Z",
      report: {
        matched: [1, 2],
        unmatched: [3],
        ambiguous: [],
      },
    })
    expect(meta).toMatchObject({
      projectionOverlay: "yahoo",
      yahooImportedAt: "2026-08-26T00:00:00.000Z",
      yahooSourceFile: "yahoo.csv",
      yahooParsed: 10,
      yahooMatched: 2,
      yahooUnmatched: 1,
      yahooAmbiguous: 0,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=1 tests/unit/projectionOverlayCli.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement helpers**

```ts
// src/lib/players/projectionOverlayCli.ts
type MatchReportLike = {
  matched: unknown[]
  unmatched: unknown[]
  ambiguous: unknown[]
}

export type SeasonPatchMode =
  | { mode: "all" }
  | { mode: "none" }
  | { mode: "one"; id: string }

export const resolveSeasonPatchMode = (input: {
  skipSeasons: boolean
  seasonLeagueId?: string
}): SeasonPatchMode => {
  if (input.skipSeasons) return { mode: "none" }
  if (input.seasonLeagueId) return { mode: "one", id: input.seasonLeagueId }
  return { mode: "all" }
}

export const buildYahooOverlayMeta = (input: {
  sourceFile: string
  parsed: number
  report: MatchReportLike
  importedAt?: string
}): Record<string, unknown> => ({
  projectionOverlay: "yahoo",
  yahooImportedAt: input.importedAt ?? new Date().toISOString(),
  yahooSourceFile: input.sourceFile,
  yahooParsed: input.parsed,
  yahooMatched: input.report.matched.length,
  yahooUnmatched: input.report.unmatched.length,
  yahooAmbiguous: input.report.ambiguous.length,
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --maxWorkers=1 tests/unit/projectionOverlayCli.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/players/projectionOverlayCli.ts tests/unit/projectionOverlayCli.test.ts
git commit -m "feat(players): add Yahoo overlay CLI helpers for season target and meta"
```

---

### Task 2: Yahoo import CLI + fixture + package script

**Files:**
- Create: `scripts/import-yahoo-projections.ts`
- Create: `data/fixtures/yahoo-projections-sample.csv`
- Modify: `package.json` (add `players:import-yahoo`)

**Interfaces:**
- Consumes: `parseHashtagCsv`, `applyHashtagProjections` from `src/lib/players/hashtagImport.ts`; `resolveSeasonPatchMode`, `buildYahooOverlayMeta` from Task 1; `db` from `src/lib/db`
- Produces: working CLI with exit codes 0/1/2

- [ ] **Step 1: Add sample CSV**

```csv
Player,Team,GP,FG%,FT%,3PM,PTS,REB,AST,STL,BLK,TO
Nikola Jokic,DEN,70,58.0,82.0,1.5,26.0,12.0,9.0,1.2,0.8,3.0
AJ Dybantsa,WAS,70,46.0,78.0,1.8,16.5,5.0,3.2,1.0,0.6,2.0
```

- [ ] **Step 2: Implement CLI** (mirror `scripts/import-hashtag-projections.ts`, differences below)

Key differences from Hashtag script:

1. Usage string: `npm run players:import-yahoo -- <csv-path> ...`
2. After apply, pool `meta` merge uses `buildYahooOverlayMeta({ sourceFile: csvArg, parsed: rows.length, report: result.report })` instead of hashtag* keys
3. Season targeting:

```ts
const skipSeasons = parseBoolean(args["skip-seasons"], "--skip-seasons")
const seasonMode = resolveSeasonPatchMode({
  skipSeasons,
  seasonLeagueId: args["season-league-id"],
})

if (dryRun) {
  console.log(`Dry run: no changes written to ${poolArg}`)
  if (seasonMode.mode === "all") {
    console.log("Dry run: would patch all season leagues")
  } else if (seasonMode.mode === "one") {
    console.log(`Dry run: would patch season league ${seasonMode.id}`)
  }
  return
}

// write pool...

const patchOne = async (id: string) => {
  const seasonLeague = await db.seasonLeague.findUnique({ where: { id } })
  if (!seasonLeague) {
    console.warn(`Season league not found: ${id}`)
    return false
  }
  const seasonState = JSON.parse(seasonLeague.stateJson) as SeasonLeagueState
  if (!Array.isArray(seasonState.players)) {
    throw new Error(`Season league has no players array: ${id}`)
  }
  const seasonResult = applyHashtagProjections(seasonState.players, rows, {
    perGame,
    gpDefault,
  })
  await db.seasonLeague.update({
    where: { id },
    data: {
      stateJson: JSON.stringify({
        ...seasonState,
        players: seasonResult.players,
      }),
    },
  })
  console.log(
    `Wrote projection overlay to season league ${id} (matched ${seasonResult.report.matched.length})`,
  )
  return true
}

if (seasonMode.mode === "none") return

try {
  let failed = false
  if (seasonMode.mode === "one") {
    const ok = await patchOne(seasonMode.id)
    if (!ok) failed = true
  } else {
    const leagues = await db.seasonLeague.findMany({ select: { id: true } })
    console.log(`Patching ${leagues.length} season league(s)`)
    for (const league of leagues) {
      try {
        const ok = await patchOne(league.id)
        if (!ok) failed = true
      } catch (error) {
        failed = true
        console.error(
          `Season league ${league.id} failed: ${error instanceof Error ? error.message : error}`,
        )
      }
    }
  }
  if (failed) process.exitCode = 2
} catch (error) {
  console.error(
    `Season league update failed: ${error instanceof Error ? error.message : error}`,
  )
  process.exitCode = 2
}
```

Reuse Hashtag’s argv/boolean/gp parsing and `readPool` patterns (copy into this file; do not refactor Hashtag in this task).

- [ ] **Step 3: Register npm script**

In `package.json` scripts:

```json
"players:import-yahoo": "tsx scripts/import-yahoo-projections.ts"
```

(place next to `players:import-hashtag`)

- [ ] **Step 4: Dry-run smoke**

Run: `npm run players:import-yahoo -- data/fixtures/yahoo-projections-sample.csv --dry-run --skip-seasons`  
Expected: Parsed/Matched/Unmatched/Ambiguous printed; `Dry run: no changes written`; exit 0

- [ ] **Step 5: Commit**

```bash
git add scripts/import-yahoo-projections.ts data/fixtures/yahoo-projections-sample.csv package.json
git commit -m "feat(players): add Yahoo projections CSV import for pool and seasons"
```

---

### Task 3: README docs

**Files:**
- Modify: `README.md` (after Hashtag section)

- [ ] **Step 1: Add Yahoo section**

```markdown
### Yahoo projections overlay (primary until ESPN proj)

Use when ESPN season averages are missing (e.g. rookies) or you want one consistent Yahoo sheet for Draft + Season.

1. Export Yahoo mock draft / analysis projections to a CSV with Player, Team, GP, FG%, FT%, 3PM, PTS, REB, AST, STL, BLK, TO.
2. Preview: `npm run players:import-yahoo -- path/to/yahoo.csv --dry-run`
3. Apply to draft pool **and all season leagues**: `npm run players:import-yahoo -- path/to/yahoo.csv`
4. Pool only: add `--skip-seasons`. Single league: `--season-league-id=<id>`.
5. Re-run after `players:refresh` or ESPN season Refresh (overlay is overwritten until re-applied).

When ESPN projections are available, import an ESPN CSV with the same column shape (or a future `players:import-espn`) so `projectionOverlay` becomes `"espn"`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(players): document Yahoo projections overlay import"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| CSV parse + match + scale (reuse Hashtag) | 2 |
| Pool write + yahoo meta | 1 + 2 |
| All season leagues by default | 2 |
| `--skip-seasons` / `--season-league-id` | 1 + 2 |
| `--dry-run` | 2 |
| Exit 0/1/2 | 2 |
| Sample fixture | 2 |
| README + ESPN handoff note | 3 |
| No scrape / no ESPN importer impl | — explicit non-goals |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-26-yahoo-projections-overlay.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?
