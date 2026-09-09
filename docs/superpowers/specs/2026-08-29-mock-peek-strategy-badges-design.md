# Mock Peek Strategy Badges — Design Spec

**Date:** 2026-08-29  
**Status:** Draft for user review  
**Product:** Mock hover projections (`PlayerStatsPeek`) mark punted and focused categories  
**Builds on:** [Mock stats peek](./2026-08-26-mock-stats-rec-diversity-design.md)  
**Branch context:** `feat/published-nba-schedule`

Hover still shows all 9-cat numbers. Headers for strategy cats get a small badge so ADP-sorted pool numbers are not mistaken for “this counts in recs.”

Punt / Focus chips stay on **Mock only**. League setup (first page) no longer duplicates them; new leagues start with empty `puntCategoryIds` / `focusCategoryIds`.

---

## 1. Goal

On the Mock peek grid, a category in `puntCategoryIds` shows a `Punt` badge on its column header; a category in `focusCategoryIds` shows `Focus`. Season / per-game values stay as they are.

### Success criteria

- Punt TO → header reads like `TO` + `Punt` (visible and in accessible name).
- Focus STL → `STL` + `Focus`.
- A category is never both (chips already exclusive). No badge if in neither list.
- Empty peek (no hovered player) still shows headers with the same badges.
- Numbers and GP column unchanged.
- Unit tests cover punt, focus, and neither.
- League setup form has no Punt/Focus chip rows. Create payload still sends empty arrays (API unchanged).

### Non-goals

- Changing rec scoring (already uses `effectiveWeights`)
- Hiding or striking numbers
- Prep / Live peek
- Editing strategy from the peek

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Where | `PlayerStatsPeek` category header cells only |
| Copy | `Punt` / `Focus` |
| Chrome | Small muted badge next to the existing uppercase label |
| Wire | `MockDraftView` passes `puntCategoryIds` and `focusCategoryIds` it already has |
| Empty hover | Headers still badged |
| League setup | Remove punt/focus UI; Mock chips are the only editor |

---

## 3. Approach

```ts
type PlayerStatsPeekProps = {
  player: Player | null
  puntCategoryIds?: CategoryId[]
  focusCategoryIds?: CategoryId[]
}
```

Default both arrays to `[]`. Header: label, then badge if listed. `aria-label` e.g. `TO Punt` / `STL Focus` / `PTS`.

---

## 4. Tests

`tests/unit/PlayerStatsPeek.test.tsx`:

1. `puntCategoryIds: ["TO"]` → accessible name / text includes `Punt` on TO, not on PTS.
2. `focusCategoryIds: ["STL"]` → `Focus` on STL.
3. Omit both → no `Punt` / `Focus` text.

---

## 5. Out of scope

Pool ADP sort, sim weights, and strategy chip UI stay as they are.
