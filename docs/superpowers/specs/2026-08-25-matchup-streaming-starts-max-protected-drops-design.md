# Matchup Streaming Plans — Starts-Max Adds & Protected Drops — Design Spec

**Date:** 2026-08-25  
**Status:** Approved for implementation planning  
**Product:** Matchup streaming plans — spend add budget for game-starts; protect high-ADP roster cuts  
**Builds on:** `2026-08-25-matchup-streaming-schedule-sophistication-design.md`  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

Streaming plans currently often look like **~1 add/week** because Conservative gates + hold-through + thin refusal starve the weekly add budget. Separately, first-add **roster drop** suggestions can name high-value players (e.g. Bridges / Brown) just because they are on BE that day in a daily league.

### Success criteria

- Within `addLimit`, plans **maximize expected game-starts** (not “use every add no matter what,” and not “one dense block then idle”).
- Avoid meaningless one-game churn when a better multi-start use of the same add exists.
- **ADP ≤ 60** players are not suggested as roster drops unless a **long-term injury** exception applies.
- When choosing between an existing **IL** occupant and a **newly long-term injured** roster player, decide with **expected absence length first**, then **ADP** (drop the lower-value player on ties).
- Strategy toggle remains; defaults skew toward Balanced; Conservative is relaxed so it still spends adds for starts.
- **Underperformance-based** un-protect is **out of scope** (stub only).

### Non-goals

- Full weekly DP / global optimizer
- Live ESPN injury API (MVP uses fixture events + defaults)
- Form/minutes “cold streak” drop logic
- Changing Add/Drop calendar layout beyond short summary reasons

---

## 2. Approach (locked)

**Starts-aware filler + drop policy**, on top of the existing two-pass block finder + greedy day loop:

1. Score add/swap candidates by **expected starts** covered if added today under Hold-through rules.
2. Soften strategy thresholds; tighten when the board suggests Conservative.
3. Centralize roster-drop eligibility: ADP protection, injury exception, IL vs new injured comparison.

Rejected: policy-only thin unlock without starts scoring; full-week search.

---

## 3. Starts-max add policy

For each empty spot (and when evaluating early-swap):

- `expectedStarts(player, fromDate)` = count of remaining matchup days ≥ `fromDate` where the player has a game (same idea as `remainingGameDays`).
- Prefer candidates with **higher `expectedStarts`**, then density tier, then weak-cat, then `playerId`.
- Do **not** add if `expectedStarts === 0`.
- Late week: if adds remain and strategy allows the tier, fill days with `expectedStarts > 0` rather than leaving spots empty.

**Hard ceiling:** `addsUsed ≤ addLimit` always.

**Soft-cap:** prefer even distribution across spots, but **never block a starts-positive add** solely due to per-spot soft-cap while `addsUsed < addLimit`. Total weekly limit still binds. Aggressive may keep `ceil(addLimit/spotCount)+1` as a soft preference only.

---

## 4. Strategy relaxation

| Mode | Add tier gate | Thin fill | Early swap |
|------|---------------|-----------|------------|
| **Conservative** | `ok` and above (not elite/strong only) | Last **3** matchup days | `newRank - heldRank ≥ 2` |
| **Balanced** | `ok` + `thin` | Last **3** matchup days | `≥ 2` |
| **Aggressive** | all tiers | Any day with `expectedStarts > 0` | `≥ 1` |

### Board → suggested mode

`behindRatio = (L + T) / total` on board categories:

| Condition | Suggested |
|-----------|-----------|
| `≥ 0.5` | `aggressive` |
| `≤ 0.15` | `conservative` (was 0.25) |
| else | `balanced` |

Empty board → `balanced`. Invalid mode → `balanced`.

UI toggle behavior unchanged (client rebuild with chosen mode).

---

## 5. Roster drop protection (ADP)

### Lookup

- Resolve ADP from season player id / name+team against the projections pool (e.g. `proj_2026_27`), or optional `adp` on `SeasonPlayer` if present later.
- **Missing ADP → not protected** (eligible for drop).

### Constant

`STREAMING_PROTECTED_ADP_MAX = 60` — protect when `adp ≤ 60`.

### `pickRosterDrop` rules

1. If any non-IL open slot → `open_slot` (unchanged).
2. Else consider non-IL rostered players:
   - Exclude if `adp ≤ 60` **and** not `isLongTermInjuryException(player)`.
   - Rank remaining: no game today → fewer remaining week games → lower weak-cat → `id`.
3. If none eligible → `rosterDropKind: "none"` (still allow FA add; no roster cut line / “no safe drop”).

**Daily BE is irrelevant** for protection: slot that day must not un-protect a star.

### Underperformance (deferred)

```ts
const isUnderperformingDropException = (_player: SeasonPlayer): boolean => false
```

Spec placeholder for a later round; must not affect MVP behavior.

---

## 6. Long-term injury & IL comparison

### Injury inputs (MVP)

Extend injury events with optional `expectedOutDays?: number`.

Defaults when missing:

| Status | Default `expectedOutDays` |
|--------|---------------------------|
| `out` | **21** (treat as long-term candidate) |
| `gtd` | **3** (not long-term) |

`isLongTermInjuryException` = resolved `expectedOutDays >= 14` (or explicit long-term flag if added later).

Wire streaming drop policy to the same injury list the app already uses for pickups when available; tests may inject a small map `playerId → expectedOutDays`.

### IL vs newly long-term injured

When a roster drop is needed and the natural cut candidate is long-term injured **or** an IL occupant exists:

Let `newInjured` = perspective player who is long-term out (if any relevant to this add).  
Let `ilPlayer` = current IL slot occupant (if any).

Compare when both are long-term (or both have out-days):

1. Larger `expectedOutDays` → prefer that player as the **drop** (keep the shorter absence).
2. Tie → drop the player with **worse ADP** (higher ADP number = lower draft value).
3. IL empty → prefer parking the new long-term player on IL (open_slot / IL move messaging) over cutting a healthy protected player.
4. Only one long-term player → that player may be the drop exception to ADP protection.

Copy may stay one Drop line; optional short reason in plan `summaryReasons` or cell-adjacent text is enough for MVP (no new calendar chrome required).

---

## 7. Summary reasons (panel)

Keep existing reasons; add when applicable (max ~3 total):

- `"Maximizing starts within add budget"`
- `"Protected ADP ≤ 60"`
- IL compare blurb only if that rule fired (optional)

---

## 8. Testing

1. Relaxed Conservative/Balanced produce **higher or equal `gameStarts`** and **more adds used** than pre-change Conservative on a fixture that previously starved adds — still `addsUsed ≤ addLimit`.
2. Healthy ADP 25–50 player never appears as `rosterDropPlayerId`.
3. Same player with long-term out **can** appear as drop.
4. IL vs new: longer absence dropped; equal absence → higher ADP dropped.
5. Underperformance stub never un-protects.
6. Regression: hold through off-nights; strategy toggle rebuild; soft-cap does not exceed weekly limit.

---

## 9. Implementation sketch

| Area | Files |
|------|--------|
| Strategy thresholds / suggest | `src/lib/matchup/streamingStrategy.ts` |
| Starts-max + soft-cap priority | `src/lib/matchup/streamingPlans.ts` |
| Drop policy | `src/lib/matchup/streamingDropPolicy.ts` (new) |
| ADP resolve | small helper reading proj pool or injected table |
| Injury optional field | `src/lib/injuries/types.ts` + fixture samples in tests |
| Panel reasons | `StreamingPlansPanel.tsx` (light) |
| Tests | `streamingStrategy`, `streamingPlans`, new `streamingDropPolicy` unit tests |

---

## 10. Out of scope (next)

- Cold-streak / minutes collapse un-protect
- Real-time injury duration from ESPN
- Changing default `WEEKLY_ADD_LIMIT`
- Global non-greedy optimizer
