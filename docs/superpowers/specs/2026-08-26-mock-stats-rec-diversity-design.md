# Mock stats peek + Next picks diversity

**Date:** 2026-08-26  
**Status:** Approved for implementation planning  
**Surfaces:** Mock (stats UI); Prep / Live / Mock (recommendation engine + display)

---

## 1. Goal

1. Let managers see a player’s 9-cat projections on Mock **without expanding** Player pool rows.
2. Make Next picks frequencies feel like a real multi-sim distribution (not `100%` / `50%` coin-flip artifacts), without inventing fake shares.

### Success criteria

- Mock Player pool row height stays stable on hover/focus (no inline stats expansion).
- Hovering/focusing a pool player shows that player’s projections in a panel **directly under** Mock Recommendations; empty state has a short placeholder.
- Prep/Live do not gain this stats peek panel.
- User-policy sims sample from a softmax over top-K category scores so first-pick frequencies typically spread across more than one player when scores are close.
- Next picks still report true sim frequencies (no post-hoc equalizing).
- RecPanel shows approximate frequency (`~N%`) and exposes `Based on N sims` from result meta.
- Opponent CPU policy is unchanged in this work.

---

## 2. Mock stats peek

### Behavior

- `PlayerPool` (compact / Mock): remove the inline hover stats block under the name. On hover/focus, notify parent with the active `playerId` (or `null` on leave/blur).
- `MockDraftView`: under `RecPanel`, render `PlayerStatsPeek`:
  - **Active player:** name + 9-cat projections (same formatting as today’s pool tooltip).
  - **None:** muted copy such as `Hover a player to see projections`.
- Stats source remains the cached pool projections already on `Player` (ESPN-backed pool / optional overlays already applied offline). No new data fetch.

### Non-goals

- Click-to-pin, compare-two-players, or Prep/Live stats peek.
- Changing projection sources in this change.

---

## 3. Next picks realism (engine + display)

### Root cause

Fast recommendations count how often `greedyUserPick` is the first user pick across sims. That policy almost always returns the same player, so frequencies collapse to `100%`, or `50%` when two tied outcomes dominate—visually like 1–2 trials even when `simCount` is large (Mock uses fast recommendations).

### Engine (shared)

Replace deterministic greedy selection for **user** picks in draft sims with **softmax over top-K**:

1. Score remaining players with the existing category win-expectancy score used by `greedyUserPick`.
2. Keep the top **K = 8** by score (fewer if the pool is smaller).
3. Sample with  
   `P(i) ∝ exp((score_i - maxScore) / τ)`  
   with a fixed temperature `τ` tuned so the leader remains most common but nearby scores get meaningful mass (unit tests lock expected spread on a fixture board).
4. Use this policy wherever the sim currently calls `greedyUserPick` for the perspective user (including forced-pick evaluation paths that currently go through the same helper, unless a path must stay strictly forced to one id—forced id stays a single-player set).

`frequency` on `NextPickRec` remains `count / simCount` from first user picks. Do **not** rescale or floor percentages for cosmetics.

Opponent `pickOpponentPlayer` (or equivalent) stays as-is.

### Display (`RecPanel`, all draft tabs)

- Format frequency as approximate: prefix `~`, avoid presenting raw `Math.round(100 * f)` as a hard certainty (e.g. prefer a soft percent string helper shared by stack/row layouts).
- Show sample size from `result.meta.simCount`, e.g. `Based on 40 sims`, near Next picks.
- If one player truly wins every sim, `~100%` is allowed; the sims line is what prevents “one roll” reading.
- No extra badge clutter (“Often” / “Sometimes” labels) in v1 unless needed after tuning.

### Non-goals

- Changing Prep combination aggregation.
- Switching Mock off `fastRecommendations` or raising sim caps in this change (optional follow-up if softmax alone is insufficient).
- Faking a flatter distribution in the UI.

---

## 4. Architecture / touch points

| Unit | Responsibility |
|------|----------------|
| `userPolicy` (or successor) | Softmax top-K sampling from category scores + rng |
| `engine` / simulate path | Unchanged frequency accounting; benefits from diversified first picks |
| `RecPanel` | `~%` formatting + sims footnote |
| `PlayerPool` | Hover/focus callback; no row expansion |
| `PlayerStatsPeek` (new, small) | Present one player’s projections or empty state |
| `MockDraftView` | Wire hover id → peek under RecPanel |

---

## 5. Testing

- **Unit:** softmax policy — with near-tied scores and fixed seed sequence, multiple players appear across many draws; with one dominant score, that player still dominates.
- **Unit:** `RecPanel` — renders `~` frequency and `Based on N sims` when `result` is present.
- **Unit:** `PlayerPool` compact — hover no longer mounts inline tooltip; optional callback fires with player id.
- **Unit:** Mock wiring or peek component — shows projections for selected player / empty copy when null.
- Keep existing draft/sim tests green; update any that assumed hard greedy uniqueness or exact `42%` strings.

---

## 6. Out of scope / follow-ups

- Yahoo/Hashtag projection refresh.
- Opponent ADP noise / temperature.
- Raising Mock `MOCK_SIM_COUNT` or disabling `fastRecommendations` by default.
