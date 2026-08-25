# Matchup Board → Team Scoreboard Table — Design Spec

**Date:** 2026-08-25  
**Status:** Approved for implementation planning  
**Product:** Replace per-category `you vs opp` cards with an ESPN/Yahoo-style scoreboard table  
**Builds on:** `2026-08-12-matchup-advisor-design.md`, live daily lineup board (`MatchupBoard` + `buildMatchupBoard`)  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

Managers scanning the matchup page should read category projections as a **team scoreboard** (You | Cat | Opp), not as cramped `xx.x vs xx.x` lines inside category cards.

### Success criteria

- Category grid of cards is replaced by a single table: columns **You | Cat | Opp**.
- One row per enabled category; values use existing `formatCategoryStat`.
- Winning side’s number is visually emphasized; loser muted; ties equal/muted (no W/L/% column).
- Category W–L–T summary moves to a **table footer** (plus muted projected cat wins on that row).
- Hero header `YOU X — Opp Y — Tie Z` is removed.
- Live board still updates from daily lineup / streaming preview (no math changes).

### Non-goals

- Real fantasy team names in column headers (keep You / Opp for now)
- Per-row Result / win% columns
- Changes to `buildMatchupBoard`, winProb, or projectedCatWins formulas
- Opponent day-by-day scoreboard
- New component file / rename unless needed for clarity (prefer restyle `MatchupBoard.tsx`)

---

## 2. Approach (locked)

**Restyle `MatchupBoard` only** — same `MatchupBoard` data prop; pure presentation change.

Rejected: extract a separate scoreboard package; wire real team names in this pass.

---

## 3. Layout

### Table

| You | Cat | Opp |
| --- | --- | --- |
| 112.4 | PTS | 108.1 |
| … | … | … |

- Header labels: `You`, category column (short label or blank header with row labels), `Opp`.
- Category column shows `CATEGORY_SHORT_LABELS[categoryId]` (PTS, REB, FG%, …).
- Soft panel container (`rounded-3xl` / soft-cloud) retained to match the page.

### Emphasis

- Outcome still comes from `row.outcome` (`W` | `L` | `T`).
- **W:** your value strong (semibold + existing info/ink accent); opp muted.
- **L:** opp value strong (semibold + sale or ink); you muted.
- **T:** both muted / equal weight.
- No separate Result column; no win% text.

### Footer

Single footer row (or caption under the table):

- Primary: `W–L–T` using `board.wins`, `board.losses`, `board.ties` (e.g. `3–2–1`).
- Secondary (muted): `Projected {projectedCatWins.toFixed(2)} cat wins`.

Remove the large Bebas header line and the standalone projected line above the old grid.

---

## 4. Accessibility

- Section keeps `aria-label="Matchup board"` (or `"Matchup scoreboard"` if renamed in copy only).
- Table uses proper `<table>` / `<th scope>` so screen readers get column headers.
- Color emphasis is not the only cue: winning cell also uses heavier font weight.

---

## 5. Testing

- Prefer a small React/jsdom smoke test on `MatchupBoard` if none exists: renders You/Opp values without `vs`, shows footer W–L–T.
- Existing `tests/unit/matchupBoard.test.ts` (pure `buildMatchupBoard`) unchanged.

---

## 6. Out of scope / follow-ups

- Column headers = actual team nicknames from `OpponentPicker` / league state.
- Highlight delta vs last toggle.
- Mobile sticky first column if the table grows.
