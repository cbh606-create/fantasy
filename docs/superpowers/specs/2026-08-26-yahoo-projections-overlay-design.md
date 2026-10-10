# Yahoo Mock Draft Projections Overlay — Design Spec

**Date:** 2026-08-26  
**Status:** Approved for implementation planning  
**Product:** Manual CSV import of Yahoo fantasy projection stats as the **primary** projection overlay for Draft pool + all Season leagues  
**Related:** Hashtag overlay (`docs/superpowers/specs/2026-08-19-hashtag-projections-import-design.md`), Draft pool (`data/players/proj_*.json`), Season `SeasonPlayer.projections`

---

## 1. Goal

Until ESPN publishes usable season projections (especially for rookies), use **Yahoo mock-draft / analysis projection tables** as the single consistent projection source across Draft and Season tools.

Operator exports Yahoo stats to a local CSV, runs an npm script, and overwrites matched players’ 9-cat projections on:

1. The shared draft pool JSON  
2. **Every** saved `SeasonLeague` in the DB (`stateJson.players`)

When ESPN projections become available later, the same overlay pipeline is reused with an ESPN CSV (or a dedicated import) to replace `projectionOverlay: "yahoo"` with `"espn"`.

### Success criteria

- `npm run players:import-yahoo -- <file.csv> [flags]` updates the active draft pool (default `proj_2026_27.json`)
- The same run patches **all** season leagues’ `state.players` (unless `--dry-run` or `--skip-seasons`)
- Stdout reports pool match counts and per-league (or aggregate) season match counts
- Matched players’ projections reflect Yahoo; unmatched / ambiguous keep prior values and are listed
- `--dry-run` prints reports without writing pool or DB
- Sample fixture CSV exists for tests/docs
- README documents export → import → re-run after ESPN refresh, and the eventual ESPN switch

### Decisions (locked)

- Manual CSV only (no Yahoo scrape for projections in this work)
- Reuse Hashtag matching / scale / apply helpers (Approach: Hashtag reuse + Yahoo CLI)
- Apply to **draft pool + all season leagues** by default
- Overwrite matched only; do not auto-create missing players
- ESPN full replacement is a **documented follow-up**, not this implementation’s deliverable
- After ESPN live season refresh, Yahoo overlay is lost until the operator re-runs the script (same as Hashtag)

---

## 2. Non-goals

- Scraping Yahoo mock draft pages or automating login
- In-app CSV upload UI
- Blending ESPN + Yahoo ratios at runtime
- Runtime source toggle in the matchup UI (meta `projectionOverlay` is enough for operators)
- Implementing the ESPN CSV importer in this change set (spec only notes the handoff)
- Changing ADP pipelines (`players:yahoo-adp` stays rank-only)

---

## 3. Input format

Same contract as Hashtag import so one mental model / optional shared parser:

| Role | Names (examples) | Required |
|------|------------------|----------|
| Player | `Player`, `Name` | Yes |
| Team | `Team`, `Team Abbr` | Recommended |
| Games | `GP`, `G` | Recommended (per-game → totals) |
| Cats | `FG%`/`FG_PCT`, `FT%`/`FT_PCT`, `3PM`/`TPM`, `PTS`, `REB`, `AST`, `STL`, `BLK`, `TO` | Yes (9-cat) |
| Shooting volume | `FGM`, `FGA`, `FTM`, `FTA` | Optional |

### Scale rules

- In-app counting cats are **season totals**.
- Default: CSV is **per-game** → multiply counting cats by row `GP`, else `--gp-default` (default **70**).
- `--per-game false` → treat counting cats as season totals.
- `FG%` / `FT%`: store 0–1; if value `> 1`, treat as percent (`45.2` → `0.452`).
- Optional makes/attempts: when present, update `shooting`; when absent, leave existing shooting.

---

## 4. Matching

Identical to Hashtag:

1. Normalize names (lowercase, strip punctuation/suffixes, collapse whitespace)
2. Exact normalized name match
3. If multiple candidates and CSV has team → prefer `teamAbbr`
4. Still multiple → **ambiguous** (skip overwrite)
5. None → **unmatched** (keep prior)

Report: `matched`, `unmatched`, `ambiguous`.

---

## 5. Draft pool application

- Target: `data/players/proj_2026_27.json` (or `--pool`)
- Matched players: replace `projections` (and `shooting` when provided)
- Update `meta` without deleting ESPN provenance fields:
  - `projectionOverlay: "yahoo"`
  - `yahooImportedAt` (ISO)
  - `yahooSourceFile` (basename)
  - `yahooMatched` / `yahooUnmatched` / `yahooAmbiguous`
- Implementation may call existing `applyHashtagProjections` (or a thin rename/alias) with Yahoo meta keys written by the CLI

---

## 6. Season application (all leagues)

- Load all `SeasonLeague` rows (no clerk filter for the local operator script; this is a trusted machine script, same trust model as `--season-league-id` today)
- For each league: parse `stateJson`, run the same apply helper on `state.players`, write back `stateJson`
- Per-league failures: log warning with id; continue others; exit **2** if any season write failed after a successful pool write
- Flags:
  - `--skip-seasons` — pool only
  - `--season-league-id <id>` — **only** that league (in addition to pool), for debugging; default remains all leagues when neither skip nor single-id is set  
    Clarification: if `--season-league-id` is set, patch that id only (not all). If neither flag, patch all.

---

## 7. CLI

```text
npm run players:import-yahoo -- <file.csv> [options]
```

| Flag | Meaning |
|------|---------|
| `--dry-run` | Report only; no pool/DB writes |
| `--per-game` / `--per-game false` | Scale by GP (default true) |
| `--gp-default <n>` | Default GP (default 70) |
| `--pool <path>` | Override pool JSON |
| `--skip-seasons` | Do not touch season leagues |
| `--season-league-id <id>` | Patch only this season league (plus pool) |

Exit codes: `0` success / dry-run; `1` CSV/parse failure before writes; `2` pool OK but one or more season patches failed.

Operator order: `--dry-run` → full import → spot-check matchup for a former 0-proj rookie.

---

## 8. ESPN handoff (future, documented only)

When ESPN projections are usable:

1. Export ESPN proj table to the same CSV shape (or add `players:import-espn` reusing the apply helper)
2. Run import → set `projectionOverlay: "espn"`
3. Re-apply after ESPN season refresh the same way

No blend period required; full replace matched players for consistency.

---

## 9. Tests

- Reuse / extend Hashtag unit coverage if shared helper; Yahoo CLI-specific:
  - Meta writes `projectionOverlay: "yahoo"` and yahoo* counters
  - Fixture CSV sample under `data/fixtures/yahoo-projections-sample.csv`
  - Season “all leagues” logic: unit-test a pure `patchSeasonPlayers` path; DB loop can be lightly tested or integration-skipped if DB unavailable
- Dry-run does not write

---

## 10. Docs

README section parallel to Hashtag:

1. Export Yahoo mock/analysis projections to CSV (column list)
2. `npm run players:import-yahoo -- path.csv --dry-run`
3. `npm run players:import-yahoo -- path.csv` (pool + all seasons)
4. Re-run after `players:refresh` / ESPN season refresh
5. Later: switch to ESPN overlay when available

---

## 11. Implementation planning note

- Prefer thin `scripts/import-yahoo-projections.ts` wrapping shared apply + new “all seasons” loop
- Avoid large Hashtag refactor unless needed for meta key naming; duplicating meta write in CLI is OK
- Do not mix with unrelated WIP (fixture Ingram swap can ship separately)
