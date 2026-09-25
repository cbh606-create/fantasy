# Matchup Streaming Plans (1–3 spots, 7 adds) — Design Spec

**Date:** 2026-08-24  
**Status:** Approved for implementation planning  
**Product:** Matchup module — replace “Streamers list” with weekly streaming plans  
**Branch context:** `feat/published-nba-schedule` / season matchup

---

## 1. Goal

For **daily** fantasy leagues, help managers use **weekly acquisitions (adds)** well.

Show **three alternative streaming plans** (1-spot, 2-spot, 3-spot) that explain how to spend up to **7 adds** across the matchup week: who to hold/drop/add each day in the dedicated streamer spot(s).

### Success criteria (MVP)

- Matchup UI shows **Streaming plans** (1 / 2 / 3 spots), not a bare streamer name list.
- Each plan uses at most **7 adds** (drops do **not** count).
- Each plan shows a **day-by-day** schedule for its spot(s): player + action (`Hold` / `Add` / `Drop→Add`).
- Summary per plan: adds used (`k/7`) and approximate **game-starts** covered.
- Candidates come from `availablePlayerIds` + matchup schedule game days.
- Sit/Start stays secondary (below, compact) as already shipped.

### Non-goals (MVP)

- Editing real roster slots to permanently designate “streamer spots”
- Claiming/applying adds from this panel (link out to waivers is enough)
- Global DP optimality across the whole FA pool
- Configurable add limit UI (hardcode **7**; constant easy to change later)
- Opponent-aware cat-win simulation inside the plan builder (reuse weak-cat / volume scoring like today’s streamers)

---

## 2. Rules (locked)

| Rule | Choice |
|---|---|
| Weekly move budget | **7 adds** only (ESPN-style acquisitions) |
| Drops | Unlimited for counting; never consume the 7 |
| Plans shown | Always **1-spot, 2-spot, 3-spot** (compare alternatives) |
| Spot meaning | **Virtual streamer seats** for the plan (not bound to a specific BE/UTIL index in MVP) |
| Same FA in multiple plans | Allowed (plans are alternatives) |
| B2B display | Integer game-days + `· N B2B` (no `2.75 games`) |

---

## 3. Algorithm (greedy, per plan)

For `spotCount ∈ {1, 2, 3}`:

1. **Inputs:** matchup `days[]`, `schedule.games`, FA pool (`availablePlayerIds` → players with `teamAbbr`), add budget `ADD_LIMIT = 7`.
2. **State:** for each spot, current `playerId | null`; `addsUsed = 0`.
3. **Each day (in order):**
   - For each spot, if occupied and player has **no game** that day → mark **Drop** (free the spot; no add cost).
   - For each empty spot (or spot whose occupant has no game and was dropped): if `addsUsed < 7`, pick best FA who:
     - has a game that day,
     - is not already seated in another spot that day,
     - not “reserved” by a earlier choice that same day,
     - score = existing streamer score vs weak cats **or** game volume fallback,
     then **Add** them (`addsUsed++`).
   - If occupant has a game → **Hold**.
   - If empty and no adds left → leave empty.
4. **Score plan:** `gameStarts` = count of (spot, day) with a started player who has a game that day; prefer higher `gameStarts`, then fewer adds, then stable tie-break.
5. **Output** day rows + summary `{ addsUsed, addLimit: 7, gameStarts, spots[] }`.

### Scoring for FA pick (MVP)

Reuse Matchup streamer logic:

- Prefer players who help board **L/T** counting categories when possible.
- Else prefer more remaining game-days in the week / same-day game weight.
- Do **not** use fractional B2B weights in the displayed games label; B2B is annotation only.

### Edge cases

- FA pool too thin: plan may use fewer than 7 adds and leave spots empty some days.
- Player already on YOUR roster: not in FA pool → not a streamer add candidate.
- Doubleheader: still **1 game-day** for presence; B2B flag independent.

---

## 4. Data shape

```ts
type StreamingPlanSpotCount = 1 | 2 | 3

type StreamingPlanAction = "hold" | "add" | "drop_add" | "empty"

type StreamingPlanDayCell = {
  spotIndex: number // 0..spotCount-1
  playerId: string | null
  action: StreamingPlanAction
}

type StreamingPlanDay = {
  date: string
  cells: StreamingPlanDayCell[]
}

type StreamingPlan = {
  spotCount: StreamingPlanSpotCount
  addLimit: 7
  addsUsed: number
  gameStarts: number
  days: StreamingPlanDay[]
}
```

Wire into Matchup advice payload (or parallel field):

- `streamingPlans: StreamingPlan[]` (length 3)
- Deprecate or stop surfacing top-level `streamers[]` in the Matchup UI (API may keep `streamers` briefly for back-compat tests; UI switches to plans).

---

## 5. UI

Replace Matchup **Streamers** section with **Streaming plans**:

1. Three compact cards/sections: **1-spot**, **2-spot**, **3-spot**.
2. Each card header: `Adds 5/7 · 11 starts` (example).
3. Body: table or stacked rows by day (`Mon 10/20`) × spot columns showing:
   - Player name · Pos · Team
   - Action chip: Hold / Add / Drop→Add / —
   - Optional games/B2B note on add days
4. Optional deep-link: Add action → `/waivers/{id}?addPlayerId=…` (drop id later if easy).

Sit/Start remains below, muted.

---

## 6. Testing

- Unit: greedy planner
  - 1-spot never exceeds 7 adds
  - Drop then add same day costs **1** add
  - Hold across two game days costs **0** adds
  - 2-spot can seat two different FAs same day (2 adds if both new)
  - B2B label integer + `1 B2B`
- Unit/component: Matchup workspace renders three plans; Streamers list gone
- Advise API: payload includes `streamingPlans`

---

## 7. Files (expected)

| Area | Likely touch |
|---|---|
| Planner | `src/lib/matchup/streamingPlans.ts` (new) |
| Advise | `src/lib/matchup/advise.ts` |
| Types | `src/lib/matchup/types.ts` |
| UI | `StreamersPanel.tsx` → `StreamingPlansPanel.tsx` (or rewrite in place) |
| Workspace | `MatchupWorkspace.tsx` |
| Tests | `tests/unit/streamingPlans.test.ts`, advise/Matchup tests |

---

## 8. Open points (resolved for MVP)

- Add limit **fixed at 7** (constant `WEEKLY_ADD_LIMIT = 7`).
- Spots are **virtual** (not tied to roster indices).
- Greedy day-by-day (not full search).
