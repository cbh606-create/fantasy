# Mock Draft Pool Realism + Player Identity — Design Spec

**Date:** 2026-08-24  
**Status:** Approved / implemented  
**Product:** Keep mock/CPU player pools realistic; show team abbr + headshot in pool, recommendations, and latest pick

---

## 1. Goals

### 1a. Realistic pool / CPU

Unrealistic players (retired or not in current ADP sources) must not appear in the mock player pool or be drafted by CPU.

**Root cause today:** Players like Chris Paul remain in `proj_2026_27.json` with stale ESPN ADP and `status: "active"`, but **no** Primary `adpBySource` match (e.g. Yahoo rank). CPU sorts by `adp`, so they look mid-round viable.

**Success criteria**

- Eligible pool requires a finite Primary `adpBySource[primary]` value
- Additional depth cut: `adp ≤ teams × rounds × 1.5`
- Filter applied after Primary projection on mock start, ADP source change, and teams change
- Prep/Live use the same helper for consistency
- Already-drafted players stay on the board even if they would fail the filter

### 1b. Team + photo

Show **team abbreviation** and **headshot** in:

- Player pool
- Recommendation panel (next picks)
- Latest mock pick strip  

**Not** on board grid cells.

**Success criteria**

- `Player` has optional `teamAbbr` and `imageUrl`
- Pool JSON enriched offline (no live image API in the draft UI)
- Broken images fall back to initials placeholder
- Missing team shows `—` or omit quietly

---

## 2. Filtering

```ts
type DraftEligibleOptions = {
  primary: AdpSourceId
  teams: number
  rounds: number
  depthMult?: number // default 1.5
}

filterDraftEligible(players, options): Player[]
```

Rules (all must pass):

1. `adpBySource[primary]` is a finite number `> 0`
2. Projected `adp` (or Primary value) `≤ teams * rounds * (depthMult ?? 1.5)`

Apply order in mock load path:

1. Load / refresh players  
2. `withProjectedAdp(players, primary)`  
3. `filterDraftEligible(...)`  
4. Feed CPU / pool / sims  

---

## 3. Identity fields

```ts
type Player = {
  // existing fields...
  teamAbbr?: string
  imageUrl?: string
}
```

Enrichment (script, e.g. `players:enrich-identity` or fold into refresh pipeline):

- `imageUrl` from `espnId` via ESPN CDN headshot pattern used elsewhere in the ecosystem  
- `teamAbbr` from ESPN pro team map when available during player refresh / enrich  

Zod schemas accept optional `teamAbbr` / `imageUrl`.

---

## 4. UI

| Surface | Show |
|---|---|
| `PlayerPool` | Avatar + name + team abbr + existing ADP line |
| `RecPanel` | Avatar + name + team for each next-pick row |
| Latest mock pick | Avatar + name + team |
| `BoardGrid` | Unchanged (name only) |

Accessibility: images `alt=""` decorative if name is adjacent text; otherwise `alt={player.name}`.

---

## 5. Non-goals

- Board cell photos/teams  
- Runtime fetch of headshots during draft  
- Hand-maintained retired blacklist  
- User-facing control for depth multiplier (fixed 1.5 in v1)  
- Changing sim engine scoring beyond eligible input list  

---

## 6. Testing

- Unit: `filterDraftEligible` drops no-Primary-ADP players; drops ADP above depth; keeps borderline  
- Unit: headshot URL builder from `espnId`  
- Component: pool/rec render team + img (or placeholder) when fields present  

---

## 7. Open follow-ups

- Tunable depth multiplier in Mock UI  
- Disable ADP sources with low coverage (from multi-source ADP follow-ups)  
- Purge stale players from `proj_2026_27.json` at refresh time (not only runtime filter)
