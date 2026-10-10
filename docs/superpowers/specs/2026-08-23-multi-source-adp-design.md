# Multi-Source ADP (Primary + Reference) — Design Spec

**Date:** 2026-08-23  
**Status:** Approved / implemented  
**Product:** Mock draft uses one selectable Primary ADP; all accessible sources stored and shown as reference

---

## 1. Goal

Let mock draft consume **all accessible ADP sources** without blending:

- **Primary** drives `player.adp`, pool sort, and CPU/sim behavior
- **Reference** values from other sources stay on the player for display
- Switch Primary on the **Mock** screen without recreating the league

### Success criteria

- Pool JSON holds Yahoo overall rank, FantasyPros Yahoo ADP, and ESPN article rank per player (when matched)
- Mock header source select defaults to Yahoo overall rank
- Changing Primary reprojects `adp`, resorts the pool, and resets the mock board so CPU uses the new ADP
- Player pool UI shows Primary ADP plus compact reference values for the other sources
- Offline refresh: per-source scripts + merge; live fetch preferred with fixture fallback
- Sim/opponent engines keep using a single `player.adp` (no engine API change)

---

## 2. Sources (v1)

| Id | Label | Value | Refresh |
|---|---|---|---|
| `yahoo_draft_analysis_rank` | Yahoo rank | Overall rank (`o-rank`) | `players:yahoo-adp` |
| `fantasypros_yahoo` | FantasyPros Yahoo | Yahoo column ADP | `players:fantasypros-adp` |
| `espn_article_h2h_points` | ESPN article | Published H2H points rank | `players:espn-rankings` |

Default Primary: `yahoo_draft_analysis_rank`.

Name matching: existing normalize helper (accents, punctuation, Jr/Sr/II/III/IV). Unmatched source keys omitted; Primary projection falls back to existing `adp` then other available sources in a stable order if needed.

---

## 3. Data model

```ts
type AdpSourceId =
  | "yahoo_draft_analysis_rank"
  | "fantasypros_yahoo"
  | "espn_article_h2h_points"

type Player = {
  id: string
  name: string
  positions: Array<"PG" | "SG" | "SF" | "PF" | "C">
  projections: Record<CategoryId, number>
  adp: number // projected from Primary
  adpBySource?: Partial<Record<AdpSourceId, number>>
  espnId?: string
  status?: "active" | "out" | "gtd"
}
```

Pool `meta`:

- `adpPrimaryDefault`: `AdpSourceId`
- `adpSources`: map/list of `{ id, label, url, updatedAt, matched, rowCount? }`
- Keep `adpSource` / `adpSourceUrl` / `adpUpdatedAt` aligned with the default Primary for older readers

---

## 4. Architecture

**Approach A:** Store all sources on the pool file; Mock projects Primary into `adp`.

```
[refresh yahoo]──┐
[refresh FP]─────┼─► fixtures / adpBySource keys on pool ─► players:adp-merge
[refresh ESPN]───┘         │
                           ▼
                    proj_2026_27.json
                           │
                    GET /api/players
                           │
              Mock select Primary ─► adp = adpBySource[primary]
                           │
                    sort + reset mock ─► sim uses adp
```

### Scripts

| Command | Responsibility |
|---|---|
| `npm run players:yahoo-adp` | Update Yahoo rank fixture + write `adpBySource.yahoo_draft_analysis_rank` (do not wipe other keys) |
| `npm run players:fantasypros-adp` | Fetch/parse FantasyPros Yahoo column; fixture fallback; write `fantasypros_yahoo` |
| `npm run players:espn-rankings` | Existing ESPN overlay adapted to write `espn_article_h2h_points` without wiping others |
| `npm run players:adp-merge` | Ensure meta, project default Primary into `adp`, sort by `adp` |

Each source refresh may call shared merge helpers so a single-source run still leaves a consistent Primary `adp`.

---

## 5. Mock UI

- Control: **ADP source** `<select>` in Mock header (accessible: label, keyboard)
- Options: the three v1 sources (disable or hide a source if zero players have that key — optional polish)
- On change:
  1. Map players → set `adp` from `adpBySource[primary]` with fallback
  2. Sort ascending by `adp`
  3. Reset mock board and continue CPU with new ADP
- Display: Primary ADP prominently; references as compact secondary text, e.g. `ADP 12 · FP 14.2 · ESPN 11` (missing → `—`)
- Selection: **session-only** (no localStorage / league persistence in v1)

---

## 6. Non-goals

- Yahoo Plus Current ADP / ESPN live login ADP
- Blended average/median ADP
- Persisting Primary on league or in localStorage
- FantasyPros ESPN/CBS columns as separate Primaries
- Changing projection stats

---

## 7. Testing

- Unit: merge three small fixtures → expected `adpBySource` + Primary `adp`
- Unit: Primary switch helper reprojects and sorts without dropping players
- Unit/component: Mock source change triggers reset path (light)
- No live Yahoo/FantasyPros required in CI when fixtures exist

---

## 8. Open follow-ups (out of v1)

- Persist last Primary in `localStorage`
- Add more FantasyPros columns as sources
- League-level default Primary at create time
