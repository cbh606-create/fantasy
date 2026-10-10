# Yahoo Draft Analysis Rank Overlay — Design Spec

**Date:** 2026-08-20  
**Status:** Approved (amended)  
**Product:** Replace player-pool ADP with Yahoo Draft Analysis overall rank  
**Source:** https://basketball.fantasysports.yahoo.com/nba/draftanalysis?type=standard

---

## 1. Goal

Overwrite `adp` on the active draft player pool with Yahoo Draft Analysis **Overall Rank** (`o-rank` / `player_ranks`), Standard type.

### Why Rank (not Current ADP)

Yahoo **Current ADP** (`average_pick`) is Plus-gated: the public Fantasy API returns `"-"`, and the page hides ADP behind Plus upsell. Free data still exposes overall Rank in the same sort order.

### Success criteria

- `npm run players:yahoo-adp` refreshes ADP on `data/players/proj_2026_27.json` by default
- Matched players get Yahoo overall rank as `adp`; unmatched keep prior ADP
- Pool sorted by ascending ADP after overlay
- `meta` records `adpSource`, URL, timestamp, match counts
- Live Yahoo public API preferred; checked-in fixture fallback if blocked

### Non-goals

- True fractional Current ADP (requires Yahoo Plus)
- Salary Cap / Preseason / Last-7 columns
- Yahoo OAuth app registration
- Changing projection stats (only ADP overlay)

---

## 2. Data

| Field | Value |
|---|---|
| Value used as ADP | Overall Rank (`player_ranks` rank_type `OR`) |
| League type | Standard (`478.l.public`) |
| API | `pub-api-ro.fantasysports.yahoo.com/fantasy/v2/.../players;sort=average_pick;out=ranks;ranks=o-rank` |
| Target pool | `data/players/proj_2026_27.json` (override via `--in` / `--out`) |
| Match key | Normalized player name (same helper as ESPN rankings / prior Yahoo script) |

---

## 3. Implementation shape

- Update `scripts/refresh-yahoo-adp.mjs` to paginate Yahoo public API ranks
- Optional fixture: `data/players/yahoo_draft_analysis_rank_2026_27.json`
- Package script stays `players:yahoo-adp`
- `meta.adpSource`: `yahoo_draft_analysis_rank`

---

## 4. Testing

- Parse sample Yahoo payload → expected rank map
- Dry run / fixture: matched count ≥ reasonable floor when fixture present
- No live Yahoo required in CI when fixture exists
