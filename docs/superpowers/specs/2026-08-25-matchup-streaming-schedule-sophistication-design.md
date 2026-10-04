# Matchup Streaming Schedule Sophistication — Design Spec

**Date:** 2026-08-25  
**Status:** Approved for implementation planning  
**Product:** Matchup streaming plans — smarter schedule logic + strategy mode  
**Builds on:** `2026-08-24-matchup-streaming-plans-design.md`, clarity UX, hold-through / soft-cap / editable add budget  
**Branch context:** `feat/published-nba-schedule`

---

## 1. Goal

Make streaming **schedule** logic more sophisticated without a full rewrite or category-score simulation.

Priority for this round:

1. **Schedule quality** — dense streaming blocks first  
2. **Budget / swap timing** — when to spend adds and when to early-swap  
3. **Category** — board L/T only as a **timing/strategy gate** (not full cat deltas)

### Success criteria

- Planner prefers **dense blocks** (3-in-4 / B2B) over one-game churn when strategy allows.
- Tie-break order for schedule quality: **block density → games-per-add → fewer empty days**.
- User can choose **Aggressive / Balanced / Conservative**; default is **board-suggested**.
- Same fixture: Balanced `gameStarts` ≥ Conservative; Aggressive may use more thin fills / adds within `addLimit`.
- Existing clarity UI preserved: Add/Drop rows, spot colors, editable weekly add budget (1–14).
- Category **projected score deltas** remain out of scope (next round).

### Non-goals

- Full matchup category simulation per add/swap
- Persisting strategy mode on the server
- Calendar highlight of block spans (visual companion for a later round)
- Replacing the day-by-day output shape (still Hold / Add / Drop→Add cells)

---

## 2. Approach (locked)

**Two-pass hybrid** on top of the current greedy filler:

1. **Pass 1 — Block finder:** extract candidate streaming blocks from FA + schedule.  
2. **Pass 2 — Greedy filler:** keep day-by-day Hold / fill / soft-cap, but gate add and early-swap with block quality + strategy mode.  
3. **Strategy layer:** mode knobs + board-suggested default; client can override and rebuild locally (same pattern as add budget).

Rejected alternatives:

- Policy knobs only on pure greedy — too weak for “block-first” success criteria.  
- Full block assignment rewrite — out of proportion for this round.

---

## 3. Block definition (pass 1)

A **block** is one FA’s games inside a contiguous window of matchup days.

| Field | Meaning |
|---|---|
| `playerId` | Free agent |
| `startDate` | First day of the window (also preferred add day) |
| `endDate` | Last day of the window |
| `gameDates` | Dates in the window where the player plays |
| `densityTier` | See below |
| `densityScore` | Numeric sort key derived from tier + game count |

**Window length:** up to **4** matchup days starting at `startDate` (same length as today’s `nearTermStretch`).

**Density tiers (high → low) and numeric rank:**

| Tier | Rank | Rule |
|---|---|---|
| `elite` | 3 | Games in window ≥ 3 (e.g. 3-in-4) |
| `strong` | 2 | Games = 2 **and** includes a B2B (two game dates on consecutive matchup days) |
| `ok` | 1 | Games = 2, no B2B |
| `thin` | 0 | Games = 1 |

Early-swap “+1 / +2 tiers” means `newRank - heldRank ≥ 1` or `≥ 2`.

**Held tier (for early swap):** recompute the held player’s best remaining window starting **today** (same 4-day window rules). If they have zero remaining games, the spot is free (not an early swap).

**Candidate sort:** tier rank → games in window → remaining games in full matchup week → weak-cat score → `playerId`.

**Dedup:** overlapping windows for the same player keep **only the best-scoring start**.

---

## 4. Strategy mode

```ts
type StreamingStrategyMode = "aggressive" | "balanced" | "conservative"
```

| Mode | Default add gate | One-game (`thin`) fill | Early swap | Soft-cap |
|---|---|---|---|---|
| **Conservative** | Only `elite` / `strong` block start days | Never | Only when held player has **0** remaining games | Strict (`ceil(addLimit / spotCount)`) |
| **Balanced** | `ok` and above | Only on last **2** matchup days, if adds remain | `newRank - heldRank ≥ 2` | Current behavior |
| **Aggressive** | `ok` and `thin` allowed | Anytime adds remain | `newRank - heldRank ≥ 1` | Soft-cap may be **+1** per spot; **never** exceed weekly `addLimit` |

### Board → suggested mode

Among counting categories on the matchup board, let `behindRatio = (L + T) / total`.

| Condition | Suggested mode |
|---|---|
| `behindRatio ≥ 0.5` | `aggressive` |
| `behindRatio ≤ 0.25` | `conservative` |
| otherwise | `balanced` |

Empty board categories → suggest `balanced`. Invalid mode input → fall back to `balanced`.

User override in the panel always wins for rebuilds.

---

## 5. Pass 2 decision rules

Preserve current behaviors unless noted:

1. **Hold through off-nights** if `remainingGameDays > 0`.  
2. Empty spots: prefer FA whose **best unassigned block starts today**; else allow thin/one-game only if mode permits.  
3. **Early swap:** while holding, if today starts a better block that passes the mode’s tier slack, emit `drop_add` (drop previous streamer only — no second roster cut).  
4. **First `add` on a spot:** still pick roster drop / open_slot as today.  
5. **Weak-cat:** tie-break only (and board suggestion). No per-add category delta math.  
6. Soft-cap spot balancing and even add distribution across spots remain, subject to Aggressive +1 rule above.  
7. Weekly `addLimit` is a hard ceiling in all modes.

---

## 6. Data model / API

### Input

`BuildStreamingPlanInput` gains:

- `strategyMode?: StreamingStrategyMode` — if omitted, use board-suggested mode.

`buildAllStreamingPlans` passes the same mode to 1/2/3-spot builds.

### Output (`StreamingPlan`)

Add:

- `strategyMode` — mode actually used  
- `suggestedStrategyMode` — board suggestion (same on all three plans for a given board)  
- `summaryReasons: string[]` — 1–3 short strings (plan-level), e.g.  
  - `"Prioritized 3-in-4 / B2B blocks"`  
  - `"Board behind → aggressive"`  
  - `"Skipped thin one-game streams"`  

Do **not** add per-cell reason strings in this round.

### Server vs client

- `adviseMatchup` / `/api/matchup` build plans with **suggested** mode (no required query param).  
- `StreamingPlansPanel` rebuilds client-side when user changes **add budget** or **strategy mode** via `buildAllStreamingPlans({ state, schedule, board, addLimit, strategyMode })`.

---

## 7. UI

In `StreamingPlansPanel`, beside weekly add budget:

- Toggle group: **Aggressive | Balanced | Conservative**  
- Default selection = `suggestedStrategyMode` from the first plan (or computed locally from `board`)  
- Label when user differs: `Suggested: Balanced` (example)  
- Changing mode rebuilds all three plans with the same mode  
- Show `summaryReasons` near each plan header (compact)  
- Keep: Add/Drop calendar layout, spot tint colors, add budget − / number / +, spot add counts (`S1: n · S2: m`)

---

## 8. Edge cases

| Case | Behavior |
|---|---|
| No FA / no blocks | Fill what mode allows; otherwise `empty`; no throw |
| Thin pool under Conservative | Fewer adds, more empty days — expected |
| Aggressive soft-cap +1 | Still `addsUsed ≤ addLimit` |
| Add budget outside 1–14 | Existing panel clamp |
| Missing `teamAbbr` | Excluded from FA candidates (current) |

---

## 9. Testing

Unit tests in `tests/unit/streamingPlans.test.ts` (and panel tests):

1. Block finder tiers: 3-in-4 → `elite`; 2 + B2B → `strong`; 1 game → `thin`; overlapping windows deduped.  
2. Conservative refuses thin adds; Aggressive allows; Balanced allows thin only on last two days.  
3. Early-swap slack: Balanced needs +2 tiers; Aggressive +1.  
4. Board suggestion thresholds (0.5 / 0.25).  
5. Regression: hold through off-night; soft-cap distribution; roster drop only on first add; 1/2/3 plans.  
6. Panel: mode toggle rebuilds; suggested label; independent of add budget control.

### Verifiable outcomes

- Fixture with a clear 3-in-4 FA: Conservative/Balanced start that block rather than churning 1-game FAs early.  
- Behind board → default Aggressive selected in panel.  
- Clarity UI tests still pass.

---

## 10. Implementation sketch (for planning)

Likely touch points:

- `src/lib/matchup/streamingPlans.ts` — block finder, mode policy, pass-2 gates, summary reasons  
- `src/lib/matchup/types.ts` — mode + plan meta fields  
- `src/lib/matchup/advise.ts` — pass through / use suggested mode  
- `src/components/matchup/StreamingPlansPanel.tsx` — strategy toggle + reasons  
- `tests/unit/streamingPlans.test.ts`, `tests/unit/StreamingPlansPanel.test.tsx`

Optional small extract: `streamingStrategy.ts` for suggest-mode + tier compare helpers if `streamingPlans.ts` grows too large — only if needed for clarity.

---

## 11. Out of scope (explicit next round)

- Category score delta / win-probability driven adds  
- Block span visualization on the calendar  
- Server-persisted strategy preference  
- Full non-greedy global optimizer
