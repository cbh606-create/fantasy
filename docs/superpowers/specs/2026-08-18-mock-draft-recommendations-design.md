# Mock Draft Recommendations — Design Spec

**Date:** 2026-08-18  
**Status:** Approved for implementation planning  
**Scope:** Show Monte Carlo next-pick recommendations on the Mock draft right rail

---

## 1. Goal

During Mock draft practice, show the user’s **top 3 recommended next picks** on the right side of the board, using the same simulation engine as Prep/Live, so practice recommendations match live advice.

### Success criteria

- Mock layout includes a right rail with up to **3** next-pick recommendations.
- Recommendations come from `POST /api/draft/simulate` against the **current mock board**.
- Recommendations are **display-only** (no click-to-pick).
- Recommendations refresh when it becomes the user’s turn (not while CPU is advancing).
- Reset / pick-slot change clears stale recommendations and re-runs when appropriate.

### Non-goals

- Clicking a recommendation to draft that player.
- Showing Category outlook on Mock (Prep/Live RecPanel may still show it).
- Changing Prep or Live recommendation behavior beyond shared RecPanel options.
- Client-side need/ADP ranking as the primary Mock recommendation source.

---

## 2. UX / Layout

### Grid

Mock draft main area becomes a three-column layout (desktop):

`PlayerPool | BoardGrid | RecPanel`

Suggested columns (match existing Mock pool width + Live-ish rec width):

`xl:grid-cols-[18rem_minmax(0,1fr)_20rem]`

On smaller breakpoints, stack vertically (pool → board → rec), same as Live’s responsive behavior.

### Rec panel content (Mock)

- Heading: Recommendations / Next picks (reuse RecPanel copy).
- List: at most **3** `nextPicks` entries with name + frequency %.
- No pick buttons / no click handlers on rows.
- Category outlook **hidden** on Mock via prop.
- Empty / loading states:
  - No result yet: short message (e.g. wait for simulation / your turn).
  - Simulating: “Simulating…” (or existing loading pattern).
  - CPU advancing: do not show stale “your turn” copy; keep last result or clear (see §3).

---

## 3. Simulation timing

| Situation | Behavior |
|-----------|----------|
| CPU advancing (`isMockAdvancing`) | Do **not** call simulate |
| User turn, draft not complete | Debounced simulate on mock `LeagueState` |
| Draft complete | No new simulate; may keep last result or empty |
| Reset mock / change pick slot | Clear `mockResult`, then restart flow (advance CPU → user turn → simulate) |
| User marks a pick | After CPU advances to next user turn, simulate again |

Use the existing DraftWorkspace `simCount` (same default as Prep/Live). Debounce similarly to Live’s `scheduleSimulation` to avoid hammering the API.

Abort in-flight mock simulate when a newer board supersedes it (AbortController), same pattern as Prep/Live.

---

## 4. State & wiring

### DraftWorkspace

- Add `mockResult: SimulationResult | null` (separate from Prep/Live `result` so modes do not overwrite each other).
- Build mock league state with current `mockBoard`, `mockPlayers`, `mockPerspectiveTeamIndex`, and `DEFAULT_DRAFT_ROUNDS` (existing `toMockLeagueState`).
- On user turn (and not advancing): `scheduleMockSimulation(mockState)`.
- Pass `mockResult` into `MockDraftView`.

### MockDraftView

- Extend layout to three columns.
- Render `RecPanel` with:
  - `players={players}`
  - `result={mockResult}`
  - `maxNextPicks={3}`
  - `showCategoryOutlook={false}`

### RecPanel

Add optional props (defaults preserve Live/Prep):

- `maxNextPicks?: number` — slice `result.nextPicks` (default: show all returned).
- `showCategoryOutlook?: boolean` — default `true`.

---

## 5. Engine / API

No API contract changes required. Existing simulate response already includes `nextPicks[]` with `playerId`, `score`, `frequency`. UI truncates to 3.

If the engine returns fewer than 3, show whatever is available.

---

## 6. Testing

- Unit: RecPanel respects `maxNextPicks={3}` and hides outlook when `showCategoryOutlook={false}`.
- Unit/integration (DraftWorkspace): entering Mock and reaching user turn triggers a simulate fetch with mock board state; RecPanel shows up to 3 names from the mocked response.
- Ensure Live still shows full RecPanel (outlook visible) when `showCategoryOutlook` omitted.

---

## 7. Decisions log

| Decision | Choice |
|----------|--------|
| Scoring source | Monte Carlo via `/api/draft/simulate` (same as Prep/Live) |
| Count | Top 3 |
| Interaction | Display only |
| Panel reuse | Extend RecPanel; hide outlook on Mock |
| Layout | 3-column like Live |
