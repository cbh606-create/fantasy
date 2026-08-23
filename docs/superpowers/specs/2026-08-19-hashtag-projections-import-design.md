# Hashtag Basketball Projections Import — Design Spec

**Date:** 2026-08-19  
**Status:** Approved for implementation planning  
**Product:** Manual CSV import of Hashtag Basketball projected stats into the shared Draft/Season player projection pool  
**Related:** Draft player pool (`data/players/proj_*.json`), Season `SeasonPlayer.projections`

---

## 1. Goal

Let a league manager paste/save Hashtag Basketball projected stats as a **local CSV**, run an **npm script**, and overwrite matched players’ projections so **Draft and Season** use the same numbers. Unmatched players keep ESPN (or prior) projections.

### Success criteria

- `npm run players:import-hashtag -- <file.csv> [flags]` updates the active draft pool file (default `proj_2026_27.json`)
- Stdout reports **matched / unmatched / ambiguous**
- Matched players’ 9-cat `projections` reflect Hashtag; unmatched unchanged
- Shared pure helper can patch `SeasonPlayer[]` the same way; optional `--season-league-id` updates that league’s `stateJson`
- `--dry-run` prints the report without writing files
- Sample fixture CSV exists for tests/docs

### Decisions (locked)

- Manual file import only (no Hashtag scrape / official API)
- Draft **and** Season (shared matching + projection apply)
- Overwrite matched only; keep prior for unmatched
- MVP: npm script + local path (no UI upload)
- Architecture: patch common player pool + shared pure apply helper (Approach 1)

---

## 2. Non-goals

- Scraping hashtagbasketball.com or Patreon login automation
- In-app CSV upload UI
- ESPN ↔ Hashtag blend ratios or runtime source toggle
- Auto-creating players missing from the pool
- Auto-reapply after ESPN Refresh (operator re-runs the script; documented)

---

## 3. Input format

### File type

- Primary: **CSV**
- Header aliases allowed (case-insensitive)

### Columns

| Role | Names (examples) | Required |
|------|------------------|----------|
| Player | `Player`, `Name` | Yes |
| Team | `Team`, `Team Abbr` | Recommended |
| Games | `GP`, `G` | Recommended (for per-game → totals) |
| Cats | `FG%`/`FG_PCT`, `FT%`/`FT_PCT`, `3PM`/`TPM`, `PTS`, `REB`, `AST`, `STL`, `BLK`, `TO` | Yes (9-cat) |
| Shooting volume | `FGM`, `FGA`, `FTM`, `FTA` | Optional |

### Scale rules

- Draft/Season counting cats in-app are **season totals** (`TPM`, `REB`, `AST`, `STL`, `BLK`, `TO`, `PTS`).
- If CSV values are **per-game**: multiply by `GP` (row GP, else `--gp-default`, default **70**).
- Detect per-game vs totals: CLI flag `--per-game` (default **true** for Hashtag-style sheets). If `--per-game false`, use values as totals.
- `FG%` / `FT%`: store as 0–1. If value `> 1`, treat as percent (`45.2` → `0.452`).
- Optional makes/attempts: when present, update Season `shooting`; when absent, leave existing shooting and only overwrite %/counting projections.

---

## 4. Matching

1. Normalize names: lowercase, strip punctuation, collapse whitespace, strip suffixes (`jr`, `sr`, `ii`, `iii`, `iv`).
2. Primary: exact normalized name against pool / season players.
3. Secondary: if multiple candidates and CSV has team, prefer matching `teamAbbr` (normalize case).
4. Still multiple → **ambiguous**: do not overwrite; list in report.
5. No candidate → **unmatched**: leave prior projections.

Report fields: `matched`, `unmatched`, `ambiguous` (with names / candidate ids).

---

## 5. Draft application

- Target file: `data/players/proj_2026_27.json` (or path implied by `PLAYER_POOL_SOURCE` / explicit `--pool` flag).
- For each matched player: replace `projections` (9-cat keys used by the app).
- Update `meta`:
  - `hashtagImportedAt` (ISO timestamp)
  - `hashtagSourceFile` (basename)
  - `hashtagMatched` / `hashtagUnmatched` / `hashtagAmbiguous` counts
  - Keep existing ESPN meta fields; note overlay in `source` or add `projectionOverlay: "hashtag"` without deleting ESPN provenance fields.

---

## 6. Season application

- Shared pure function, e.g. `applyHashtagProjections(players, rows, options) → { players, report }` in something like `src/lib/players/hashtagImport.ts` (or `scripts/` + thin shared module under `src/lib` for testability).
- Optional CLI: `--season-league-id <id>` loads that `SeasonLeague`, patches `stateJson.players` (and shooting when provided), saves.
- After ESPN Refresh, Hashtag overlays are lost until the script is re-run (documented).

---

## 7. CLI

```text
npm run players:import-hashtag -- <file.csv> [options]
```

Options:

| Flag | Meaning |
|------|---------|
| `--dry-run` | Report only; no writes |
| `--per-game` / `--per-game false` | Scale counting cats by GP (default true) |
| `--gp-default <n>` | GP when row missing (default 70) |
| `--pool <path>` | Override pool JSON path |
| `--season-league-id <id>` | Also patch that season league |

Exit codes:

- `0` — success (including dry-run)
- `1` — file/parse/validation failure (no writes, or aborted before write)
- `2` — Draft wrote OK but Season patch failed (warning on stderr)

Recommended operator order: `--dry-run` → import draft → optional season id.

---

## 8. Errors / guards

- Missing file or unreadable CSV → exit 1, no writes
- Missing required columns → exit 1, print expected headers
- Ambiguous rows → skip those rows; still apply clear matches (not a hard failure)
- Season id not found → exit 2 if draft already written; message explains re-run season-only if added later (MVP: document re-run full command after fixing id)

---

## 9. Tests

- Name normalize + match: exact, team disambiguation, ambiguous, unmatched
- Percent normalization (`45.2` → `0.452`)
- Per-game × GP → totals
- Dry-run leaves pool bytes unchanged
- Apply changes only matched projections
- Season helper unit: patches `SeasonPlayer[]` without mutating input (or returns new array)

Fixture: `data/fixtures/hashtag-projections-sample.csv` (2–3 fake rows).

---

## 10. Docs

- README short section: how to export/copy Hashtag table to CSV, column expectations, GP/`--per-game`, re-run after ESPN Refresh.

---

## 11. Implementation planning note

- Single implementation plan for the script + shared helper + tests + README blurb
- Do not mix with unrelated WIP (league-size, etc.)
- No UI in this cycle
