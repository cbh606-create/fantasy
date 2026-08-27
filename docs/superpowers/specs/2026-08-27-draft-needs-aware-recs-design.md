# Draft Needs-Aware Recommendations + Mock Strategy Chips — Design Spec

**Date:** 2026-08-27  
**Status:** Approved for implementation planning  
**Product:** User pick / Mock recommendations that respect roster category needs, position gaps, and editable punt/focus on Mock; remove Prep tab  

**Related**
- [ESPN Fantasy Draft Tool](./2026-07-29-espn-fantasy-draft-tool-design.md)
- [Draft CPU / sim pick policies](./2026-08-12-draft-cpu-sim-pick-policies-design.md)
- [Mock draft tab](./2026-08-12-draft-mock-tab-design.md)

---

## 1. Goal

Make Mock (and shared sim user-policy) recommendations **account for the user’s already-drafted roster**:

1. **Category needs** — prefer players who improve weak H2H categories  
2. **Position needs** — prefer players who fill uncovered starter-position gaps  
3. **Punt / Focus** — punt categories contribute **0** weight; focus categories keep the existing ×1.5 boost  
4. **UX** — remove the **Prep** tab; edit **Punt + Focus** chips on **Mock**; persist on league `settings`

### Success criteria

- With an empty board, top recommendations still favor strong projection talent (pool z-score), not random mid-round stars  
- With a roster strong in REB/AST but weak in STL/BLK, candidates who lift STL/BLK rank higher (given similar talent), all else equal  
- Missing primary position on the roster yields a measurable position bonus (reuse opponent `positionNeedBonus` semantics)  
- Toggling a punt category to on zeros that category in `effectiveWeights` and changes rankings away from that category’s specialists  
- Draft workspace tabs are **Mock | Live** only (no Prep)  
- Mock shows editable Punt and Focus chips; changes update `state.settings` and re-run Mock recommendations  
- Unit tests cover scoring + a UI/smoke assertion that Prep is gone / Mock hosts chips  

---

## 2. Non-goals

- Restoring category-need scoring for **opponent** CPU (stays ADP + position)  
- Porting Prep’s “Run N sims”, top combinations list, or sim-count control into Mock  
- Redesigning Live board UX beyond inheriting the same `settings.puntCategoryIds` / `focusCategoryIds`  
- Multi-ply look-ahead or new sim engine architecture  

---

## 3. Decisions (locked)

| Topic | Choice |
| --- | --- |
| Need dimensions | **Both** category needs and position needs |
| Punt in scoring | Via existing `effectiveWeights` (punt → weight 0) |
| Strategy UI | **Mock** editable **Punt + Focus** chips |
| Prep tab | **Remove**; absorb only strategy chips into Mock |
| Scoring approach | **Incremental league EV + pool z-score + positionNeedBonus** |

---

## 4. Scoring (user policy)

For each candidate `player` on the user’s turn:

```
score =
  categoryWinExpectancies(
    rosterTotals(userRoster ∪ {player}),
    leagueMeanTotals(allRosters),
    effectiveWeights(categories, puntCategoryIds, focusCategoryIds)
  )
  + weightedPlayerZScore(player, remainingPoolStats, effectiveWeights)
  + positionNeedBonus(player, userRoster)
```

### Components

| Term | Role |
| --- | --- |
| Category EV | H2H win expectancy of the **updated** roster vs current league means — encodes category need as the roster fills |
| Pool z-score | Absolute talent vs remaining pool — prevents empty-board EV saturation / random star picks |
| Position bonus | Same helper family as sim opponents: uncovered primary position → strong bonus; else secondary fit / 0 as today |

### Notes

- Softmax over top-K (`USER_PICK_TOP_K`, `USER_PICK_SOFTMAX_TAU`) remains for diversity among near-tied scores  
- Do **not** add an ADP prior; talent comes from projections/z-score  
- Export or share `positionNeedBonus` from opponent module (or a tiny shared `rosterNeeds` helper) so user + CPU stay consistent  
- Scale: position bonus is currently on a ~0–50 scale while EV+z are smaller; **normalize or scale** the bonus in implementation so it influences mid-draft without dominating 1.01 (e.g. map 50 → ~1–2 score units, tuned by tests)

---

## 5. Product / UI

### Tabs

- Before: Prep | Mock | Live  
- After: **Mock | Live**  
- Remove `PrepView` usage from `DraftWorkspace`; delete or leave file unused only if a follow-up cleanup commit removes it in the same change set (prefer delete if unreferenced)

### Mock strategy chips

- Section near Mock controls (ADP / teams / slot): **Punt** and **Focus** chip rows for the 9 cats  
- Toggle adds/removes id in `puntCategoryIds` / `focusCategoryIds`  
- Mutual exclusion: a category cannot be both punt and focus (toggling one removes it from the other) — match LeagueSetupForm behavior if already present  
- On change: persist through existing league update path (same as other settings mutations) **or** local state that writes settings then `scheduleMockSimulation` — prefer **persisting to league state** so Live sees the same strategy  
- Changing chips aborts in-flight mock sim and reschedules recommendations  

### League setup

- Keep creation-time punt/focus as initial values; Mock chips edit the live settings thereafter  

---

## 6. Data flow

```
Mock chip toggle
  → update LeagueState.settings.puntCategoryIds | focusCategoryIds
  → persist (API / existing draft state writer)
  → scheduleMockSimulation(mockState with new settings)
  → greedyUserPick / runDraftSimulation uses effectiveWeights(...)
```

---

## 7. Testing

| Area | Cases |
| --- | --- |
| `userPolicy` / score | Empty board: stronger projection talent ranks above weaker (no ADP crutch) |
| | Roster with gap in one enabled cat: filler who boosts that cat beats peer who stacks a surplus cat |
| | Punt cat → specialist in that cat drops vs balanced peer |
| | Missing primary position → bonus increases score vs covered-position peer with similar projections |
| Workspace | Prep tab not rendered; Mock renders punt/focus controls |
| Regression | Existing softmax / engine fast-path tests updated as needed |

---

## 8. File map (expected)

| File | Change |
| --- | --- |
| `src/lib/sim/userPolicy.ts` | Add position need term; keep EV + z-score |
| `src/lib/sim/opponent.ts` or new `rosterNeeds.ts` | Share `positionNeedBonus` |
| `src/components/draft/MockDraftView.tsx` | Punt/Focus chips + callbacks |
| `src/components/draft/DraftWorkspace.tsx` | Drop Prep tab; wire settings updates + resim |
| `src/components/draft/PrepView.tsx` | Remove if unused |
| `tests/unit/userPolicy.test.ts` (+ engine/UI as needed) | New need/punt cases |

---

## 9. Open implementation details (non-blocking)

- Exact scale factor for `positionNeedBonus` when added to EV+z (settle in plan with a failing test first)  
- Whether Focus chips use the same visual language as LeagueSetupForm (should match)
