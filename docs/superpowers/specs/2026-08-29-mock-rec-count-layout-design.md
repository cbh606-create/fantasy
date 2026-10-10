# Mock Rec Count and One-Row Layout — Design Spec

**Date:** 2026-08-29  
**Status:** Approved  
**Product:** Mock Next picks show more names on one compact row, from more sims  
**Builds on:** [Mock draft recommendations](./2026-08-18-mock-draft-recommendations-design.md)  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

Mock recommendations list **6** players on **one row**, from **48** sims, without changing Live.

### Success criteria

- Mock `POST /api/draft/simulate` sends `simCount: 48` and `fastRecommendations: true`.
- Fast path and the ADP fallback both return at most **6** next picks.
- Mock RecPanel `layout="row"` shows up to 6 cells in `grid-cols-6` (no wrap).
- Row cells are compact: no avatar, no team abbr, truncated name, rank + frequency stay.
- Live RecPanel (stack) and Live `simCount` stay as they are.

### Non-goals

- Click-to-pick from a recommendation
- Raising the simulate API max (already 100)
- Changing Live next-pick count or layout
- Disabling the slow-sim half-count fallback

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Recs | 6 |
| Mock sims | 48 |
| Layout | One row, `grid-cols-6`, no wrap |
| Row chrome | Hide avatar and team abbr; shrink padding; truncate name |
| Shared constants | `MOCK_SIM_COUNT` and `FAST_NEXT_PICK_COUNT` in `src/lib/sim/constants.ts` |
| Live | Unchanged |

---

## 3. Tests

- `engine.test.ts`: `fastRecommendations` length is `> 0` and `<= 6`.
- `RecPanel.test.tsx`: `maxNextPicks={6}` shows 6 names; row list has `grid-cols-6`; row has no avatar.
- `DraftWorkspace.test.tsx`: mock simulate body `simCount` is `48`.
