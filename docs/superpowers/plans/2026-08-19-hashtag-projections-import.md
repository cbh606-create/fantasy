# Hashtag Projections CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an npm script that reads a Hashtag-style projections CSV, matches players by normalized name (and team), overwrites matched 9-cat projections on the Draft pool JSON, optionally patches a SeasonLeague, and prints a match report — with dry-run support.

**Architecture:** Pure helpers in `src/lib/players/hashtagImport.ts` (parse rows, normalize/match, scale per-game→totals, apply to player lists). CLI `scripts/import-hashtag-projections.mjs` owns file I/O + argv + optional Prisma season write. No UI, no scraping.

**Tech Stack:** TypeScript, Vitest, Node `fs`, existing Prisma `db` for optional season patch. Worktree: `.worktrees/feat-season-roster` on `feat/matchup-advisor`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-hashtag-projections-import-design.md`
- Manual CSV only; overwrite matched; unmatched keep prior; ambiguous skip
- Default `--per-game true`, `--gp-default 70`
- Counting cats → season totals; FG%/FT% as 0–1 (`>1` ⇒ ÷100)
- Exit `0` ok, `1` parse/validation, `2` draft ok / season fail
- No scrape, no upload UI, no blend/toggle
- No semicolons; conventional commits
- Tests: `npx.cmd vitest run --maxWorkers=1 <paths>`
- Do not commit unrelated WIP

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/players/hashtagImport.ts` | Normalize, match, parse CSV text→rows, scale, `applyHashtagProjections` |
| `data/fixtures/hashtag-projections-sample.csv` | 2–3 fake rows for tests/docs |
| `tests/unit/hashtagImport.test.ts` | Unit tests for helpers |
| `scripts/import-hashtag-projections.mjs` | CLI: argv, read/write pool, dry-run, optional season |
| `package.json` | `players:import-hashtag` script |
| `README.md` | Short usage section |

---

### Task 1: Pure import helpers + fixture + unit tests

**Files:**
- Create: `src/lib/players/hashtagImport.ts`
- Create: `data/fixtures/hashtag-projections-sample.csv`
- Create: `tests/unit/hashtagImport.test.ts`

**Interfaces:**
- Consumes: `CategoryId` projection shape `{ FG_PCT, FT_PCT, TPM, REB, AST, STL, BLK, TO, PTS }` (same keys as pool / `SeasonPlayer.projections`)
- Produces:
  - `normalizePlayerName(name: string): string`
  - `parseHashtagCsv(text: string): HashtagProjectionRow[]` — throws on missing required columns
  - `HashtagProjectionRow`: `{ name: string; teamAbbr?: string; gp?: number; projections: Record<...> ; shooting?: { FGM,FGA,FTM,FTA } }`
  - `matchHashtagRows(rows, players: { id: string; name: string; teamAbbr?: string }[]): MatchReport` with `matches: { rowIndex, playerId }[]`, `unmatched`, `ambiguous`
  - `scaleProjections(raw, opts: { perGame: boolean; gp: number }): projections`
  - `applyHashtagProjections(players, rows, options): { players; report }` — immutable; only updates matched `projections` (+ `shooting` when present on row and player has shooting field)

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/hashtagImport.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  applyHashtagProjections,
  normalizePlayerName,
  parseHashtagCsv,
  scaleProjections,
} from "@/lib/players/hashtagImport"

describe("normalizePlayerName", () => {
  it("strips punctuation and suffixes", () => {
    expect(normalizePlayerName("Nikola Jokić Jr.")).toBe(
      normalizePlayerName("nikola jokic"),
    )
  })
})

describe("parseHashtagCsv + apply", () => {
  const sample = readFileSync(
    path.join(process.cwd(), "data/fixtures/hashtag-projections-sample.csv"),
    "utf8",
  )

  it("parses sample and overwrites only matched projections", () => {
    const rows = parseHashtagCsv(sample)
    expect(rows.length).toBeGreaterThanOrEqual(2)

    const players = [
      {
        id: "espn-1",
        name: "Nikola Jokic",
        teamAbbr: "DEN",
        projections: {
          FG_PCT: 0.5,
          FT_PCT: 0.8,
          TPM: 1,
          REB: 1,
          AST: 1,
          STL: 1,
          BLK: 1,
          TO: 1,
          PTS: 1,
        },
      },
      {
        id: "espn-2",
        name: "Unmatched Player",
        projections: {
          FG_PCT: 0.4,
          FT_PCT: 0.7,
          TPM: 2,
          REB: 2,
          AST: 2,
          STL: 2,
          BLK: 2,
          TO: 2,
          PTS: 2,
        },
      },
    ]

    const { players: next, report } = applyHashtagProjections(players, rows, {
      perGame: true,
      gpDefault: 70,
    })

    expect(report.matched.length).toBeGreaterThanOrEqual(1)
    expect(next[0].projections.PTS).not.toBe(1)
    expect(next[1].projections.PTS).toBe(2)
  })

  it("scales percent and per-game totals", () => {
    expect(scaleProjections(
      { FG_PCT: 45.2, FT_PCT: 0.8, TPM: 2, REB: 10, AST: 5, STL: 1, BLK: 1, TO: 2, PTS: 20 },
      { perGame: true, gp: 70 },
    )).toMatchObject({
      FG_PCT: 0.452,
      FT_PCT: 0.8,
      PTS: 1400,
      TPM: 140,
    })
  })

  it("marks ambiguous when two pool players share a name and no team", () => {
    const rows = parseHashtagCsv(
      "Player,FG%,FT%,3PM,PTS,REB,AST,STL,BLK,TO\nJohn Smith,50,80,1,20,5,5,1,1,2\n",
    )
    const { report } = applyHashtagProjections(
      [
        { id: "a", name: "John Smith", projections: { FG_PCT: 0, FT_PCT: 0, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0 } },
        { id: "b", name: "John Smith", projections: { FG_PCT: 0, FT_PCT: 0, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0 } },
      ],
      rows,
      { perGame: false, gpDefault: 70 },
    )
    expect(report.ambiguous.length).toBe(1)
    expect(report.matched.length).toBe(0)
  })
})
```

Sample CSV (ASCII names in fixture to avoid encoding issues in tests if needed; Jokic without diacritic is fine):

```csv
Player,Team,GP,FG%,FT%,3PM,PTS,REB,AST,STL,BLK,TO
Nikola Jokic,DEN,70,58.0,82.0,1.5,26.0,12.0,9.0,1.2,0.8,3.0
Sample FA,ATL,70,45.0,75.0,2.0,15.0,4.0,3.0,1.0,0.5,1.5
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/hashtagImport.test.ts
```

- [ ] **Step 3: Implement `hashtagImport.ts`**

Implement:

- Simple CSV parse (no new dependency): split lines, handle quoted fields minimally or assume no commas in names for MVP
- Header map: `Player|Name`, `Team|Team Abbr`, `GP|G`, `FG%|FG_PCT`, `FT%|FT_PCT`, `3PM|TPM`, `PTS`,`REB`,`AST`,`STL`,`BLK`,`TO`, optional `FGM|FGA|FTM|FTA`
- `normalizePlayerName`: NFD remove diacritics, lower, strip `[^a-z0-9 ]`, collapse spaces, remove trailing `jr|sr|ii|iii|iv`
- Match logic per spec
- `applyHashtagProjections` returns new player array

- [ ] **Step 4: Run — expect PASS**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/hashtagImport.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add src/lib/players/hashtagImport.ts data/fixtures/hashtag-projections-sample.csv tests/unit/hashtagImport.test.ts
git commit -m @"
feat(players): add Hashtag CSV projection match and apply helpers

Normalize names, scale per-game stats, and overwrite matched player projections.
"@
```

---

### Task 2: CLI script + package.json + dry-run pool write

**Files:**
- Create: `scripts/import-hashtag-projections.mjs`
- Modify: `package.json` (add script)
- Modify: `README.md` (usage blurb)

**Interfaces:**
- Consumes: helpers from Task 1 — **call via dynamic import of compiled path OR duplicate thin bridge**

**Bridge choice (locked for this plan):** Keep helpers in TypeScript; CLI is `.mjs` that shells logic by spawning:

```powershell
npx.cmd vitest run
```

is wrong for CLI. Instead: add **`tsx`** as a devDependency and:

```json
"players:import-hashtag": "tsx scripts/import-hashtag-projections.ts"
```

Create `scripts/import-hashtag-projections.ts` (not `.mjs`) that imports from `../src/lib/players/hashtagImport.ts`.

If adding `tsx` is undesirable in-repo, fallback: implement CLI as `.mjs` that `import()` from a `scripts/lib/hashtag-import.mjs` **re-export copy** — prefer **tsx** one-liner in package.json.

**CLI behavior:**

```text
npm run players:import-hashtag -- data/fixtures/hashtag-projections-sample.csv --dry-run
npm run players:import-hashtag -- path/to/file.csv
npm run players:import-hashtag -- path/to/file.csv --gp-default=70 --per-game=true
```

Arg parse: support `--key=value` and `--dry-run` like `refresh-players.mjs`.

Steps in script:
1. Read CSV utf8
2. `parseHashtagCsv`
3. Read pool JSON (`--pool` or `data/players/proj_2026_27.json`)
4. `applyHashtagProjections(pool.players, rows, opts)`
5. Print report counts + unmatched/ambiguous names
6. Unless `--dry-run`: write pool with updated `meta.hashtagImportedAt`, `hashtagSourceFile`, counts, `projectionOverlay: "hashtag"`
7. Exit 0

- [ ] **Step 1: Add tsx + script file + package.json entry**

```powershell
npm.cmd install -D tsx
```

```ts
// scripts/import-hashtag-projections.ts — read argv, fs read/write, call applyHashtagProjections
```

- [ ] **Step 2: Manual smoke**

```powershell
npm.cmd run players:import-hashtag -- data/fixtures/hashtag-projections-sample.csv --dry-run
```

Expected: report printed, pool file unchanged (check mtime or git status).

- [ ] **Step 3: README section** under Player pool:

```markdown
### Hashtag projections overlay

1. Copy Hashtag projections table into a CSV with Player, Team, GP, FG%, FT%, 3PM, PTS, REB, AST, STL, BLK, TO.
2. `npm run players:import-hashtag -- path/to/hashtag.csv --dry-run`
3. `npm run players:import-hashtag -- path/to/hashtag.csv`
4. Re-run after `players:refresh` or ESPN season Refresh if you want Hashtag numbers again.
```

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json scripts/import-hashtag-projections.ts README.md
git commit -m @"
feat(players): add Hashtag projections CSV import CLI

Overlay matched projections onto the draft player pool with dry-run support.
"@
```

---

### Task 3: Optional `--season-league-id` season patch

**Files:**
- Modify: `scripts/import-hashtag-projections.ts`
- Create: `tests/unit/hashtagImportSeason.test.ts` (helper-level only; mock players array — DB optional)

**Interfaces:**
- After draft write (or dry-run skip writes entirely including season):
  - If `--season-league-id=...` and not dry-run: load `db.seasonLeague.findUnique`, parse `stateJson`, `applyHashtagProjections` on `state.players` (map `teamAbbr` if present), write back `stateJson`
  - On missing league: stderr warning, exit `2` if draft was written; exit `1` if dry-run validation-only failure modes don’t apply
- Load env/dotenv like app (`dotenv/config` at top of script) so local DB works

- [ ] **Step 1: Unit test apply on SeasonPlayer-shaped objects** (already partly in Task 1; add shooting optional update test)

```ts
it("updates shooting when CSV provides FGM/FGA", () => {
  // row with FGM/FGA/FTM/FTA → player.shooting updated
})
```

- [ ] **Step 2: Wire season branch in CLI**

Use:

```ts
import { db } from "../src/lib/db"
```

If `db` import path fails under tsx, use relative prisma client pattern already in repo — inspect `src/lib/db.ts` and match.

- [ ] **Step 3: Run unit tests + dry-run smoke**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/hashtagImport.test.ts tests/unit/hashtagImportSeason.test.ts
npm.cmd run players:import-hashtag -- data/fixtures/hashtag-projections-sample.csv --dry-run
```

- [ ] **Step 4: Commit**

```powershell
git add scripts/import-hashtag-projections.ts tests/unit/hashtagImportSeason.test.ts src/lib/players/hashtagImport.ts
git commit -m @"
feat(players): optionally patch SeasonLeague projections from Hashtag CSV

Apply the same match overlay to stateJson.players when --season-league-id is set.
"@
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| CSV parse + columns | 1 |
| Normalize / match / ambiguous | 1 |
| Per-game × GP, % normalize | 1 |
| Draft pool overwrite + meta | 2 |
| dry-run | 2 |
| README | 2 |
| Season optional id | 3 |
| Exit codes 1/2 | 2–3 |
| Sample fixture | 1 |
| No scrape/UI | all |

## Placeholder scan

None. `tsx` addition is explicit. CSV parser is minimal in-repo.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-19-hashtag-projections-import.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task + review  
2. **Inline Execution** — this session with executing-plans  

Which approach?
