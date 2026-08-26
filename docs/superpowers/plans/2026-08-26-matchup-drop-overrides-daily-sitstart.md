# Matchup Drop Overrides + Daily Sit/Start Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers override roster drops on each streaming-plan `add` (cascading later candidates), show Sit/Start hint badges on Daily lineup, and recompute Sit/Start client-side when Daily effective games change.

**Architecture:** Extend `buildStreamingPlan` with optional `forcedRosterDrops` keyed by `${date}:${spotIndex}`. Panel owns override state and rebuilds plans on change. MatchupWorkspace derives `liveSitStart` via `suggestSitStart` + `effectiveGamesByPlayerId(daily, …)` and passes suggestions into Daily badges + SitStartPanel (hide badges during streaming preview).

**Tech Stack:** TypeScript, Vitest, React, existing matchup libs.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-matchup-drop-overrides-daily-sitstart-design.md`
- Drop key: `${date}:${spotIndex}` (not addIndex)
- Changing force at key K clears forced keys after K, then rebuilds
- Dropdown candidates respect existing ADP/protection eligibility; exclude earlier committed drops; include Open slot when applicable
- Empty `forcedRosterDrops` ⇒ identical to current engine behavior
- Daily badges: hint only (no Apply); hide during streaming plan preview
- Sit/Start recompute: client-only; do not refetch `/api/matchup` on Daily toggle for this
- PowerShell commits: plain `-m`; no literal `EOF`

## File map

| File | Role |
| --- | --- |
| `src/lib/matchup/streamingPlans.ts` | Accept `forcedRosterDrops`; honor on `add` |
| `src/lib/matchup/types.ts` | Optional type alias for force map if useful |
| `tests/unit/streamingPlans.test.ts` | Force / cascade / empty-map regression |
| `src/components/matchup/StreamingPlansPanel.tsx` | Drop `<select>` + rebuild |
| `tests/unit/StreamingPlansPanel.test.tsx` | Select smoke (extend if file exists) |
| `src/components/matchup/DailyLineupPanel.tsx` | Sit/Start badges |
| `tests/unit/DailyLineupPanel.test.tsx` | Badge smoke |
| `src/components/matchup/MatchupWorkspace.tsx` | `liveSitStart` + wire badges/panel |

---

### Task 1: Engine — `forcedRosterDrops`

**Files:**
- Modify: `src/lib/matchup/streamingPlans.ts` (`BuildStreamingPlanInput`, `buildStreamingPlan`, `pickRosterDrop` call site)
- Test: `tests/unit/streamingPlans.test.ts`

**Interfaces:**
- Consumes: existing `pickRosterDrop`, plan day loop
- Produces:
  ```ts
  // on BuildStreamingPlanInput / buildAllStreamingPlans input:
  forcedRosterDrops?: Record<string, string | "open_slot">
  // key = `${date}:${spotIndex}`
  ```
  Helper (same file or tiny export):
  ```ts
  export const streamingAddDropKey = (date: string, spotIndex: number) =>
    `${date}:${spotIndex}`
  ```

- [ ] **Step 1: Write failing tests**

In `tests/unit/streamingPlans.test.ts` add cases (reuse existing fixtures/helpers where possible):

1. With empty / omitted `forcedRosterDrops`, plan matches prior behavior for a known fixture (snapshot cell drops or assert same `rosterDropPlayerId` on first add as baseline call).
2. Force first add’s drop to player `X` → that add cell has `rosterDropKind: "player"` and `rosterDropPlayerId: X` (when add occurs).
3. After forcing early drop of `X`, a later add’s engine default / forced candidates path must not drop `X` again (assert no later cell has `rosterDropPlayerId: X`, or force later key to `X` is ignored / falls back).

- [ ] **Step 2: Run — expect FAIL**

`npm test -- tests/unit/streamingPlans.test.ts`

- [ ] **Step 3: Implement**

When building an `add` that needs a roster drop, before `pickRosterDrop`:

```ts
const forceKey = streamingAddDropKey(date, spotIndex)
const forced = forcedRosterDrops?.[forceKey]
if (forced === "open_slot" && hasOpenNonIlSlot(entries)) {
  rosterDropKind = "open_slot"
  rosterDropPlayerId = null
} else if (typeof forced === "string" && forced !== "open_slot") {
  // validate: still on roster, not already dropped today/earlier, not protected
  // if valid → kind player + id; else fall through to pickRosterDrop
}
```

Track committed drop ids across the week the same way `rosterDroppedToday` / cumulative set does so later picks exclude them. Prefer a week-scoped `forcedOrPickedDrops: Set<string>` updated whenever a player roster drop sticks.

Pass `forcedRosterDrops` through `buildAllStreamingPlans`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchup/streamingPlans.ts tests/unit/streamingPlans.test.ts
git commit -m "feat(matchup): honor forced roster drops in streaming plans"
```

---

### Task 2: StreamingPlansPanel drop dropdowns

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Test: `tests/unit/StreamingPlansPanel.test.tsx` (create or extend)

**Interfaces:**
- Consumes: `buildAllStreamingPlans({ …, forcedRosterDrops })`, `streamingAddDropKey`
- Produces: UI state `forcedRosterDrops`; rebuild memo deps include it

- [ ] **Step 1: Failing UI/unit test**

Smoke: render panel with fixture plan path (mock `buildAllStreamingPlans` or use light state) — if heavy, prefer unit-testing a small pure helper extracted for **candidate list**:

```ts
export const rosterDropSelectOptions = (input: {
  eligiblePlayerIds: string[]
  earlierDroppedIds: string[]
  allowOpenSlot: boolean
  playersById: Record<string, SeasonPlayer>
}): { value: string; label: string }[]
```

Test: earlierDroppedId excluded; open slot option present when allowed.

If extracting helper is cleaner, put it in `streamingPlans.ts` or `streamingDropOptions.ts`.

- [ ] **Step 2: Implement panel**

```ts
const [forcedRosterDrops, setForcedRosterDrops] = useState<
  Record<string, string | "open_slot">
>({})

const plans = useMemo(
  () => buildAllStreamingPlans({ …, forcedRosterDrops }),
  […, forcedRosterDrops],
)
```

On each `add` cell Drop column, render `<select>`:

- Options from eligible roster at that point (compute by replaying committed drops from plan days before this cell, or from `forcedRosterDrops` keys sorted + engine eligibility helper).
- Value = cell’s current `rosterDropPlayerId` or `open_slot` or engine none.
- `onChange`: 
  ```ts
  setForcedRosterDrops((prev) => {
    const next = { ...prev, [key]: value }
    // delete keys that sort after key (date then spotIndex)
    for (const k of Object.keys(next)) {
      if (isAfterAddKey(k, key)) delete next[k]
    }
    return next
  })
  ```

Ensure preview effect still fires with rebuilt plan.

- [ ] **Step 3: Run tests PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(matchup): dropdown overrides for streaming plan roster drops"
```

---

### Task 3: Daily Sit/Start badges + live recompute

**Files:**
- Modify: `src/components/matchup/DailyLineupPanel.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Test: `tests/unit/DailyLineupPanel.test.tsx`
- Optional: extend `tests/unit/matchupSitStart.test.ts` for gamesMap sensitivity

**Interfaces:**
- Consumes: `suggestSitStart`, `effectiveGamesByPlayerId`, `SitStartSuggestion`
- Produces: Daily props e.g. `sitStartHints?: { playerId: string; label: string }[]` or map `Record<playerId, string>`

- [ ] **Step 1: Failing tests**

1. `DailyLineupPanel`: pass hint for a roster player → badge text visible near name.
2. `matchupSitStart` (or workspace-level pure helper test): reducing a star’s games in `gamesMap` changes whether a swap stays positive — proves Daily-driven map matters. If existing tests already cover gamesMap, add one focused case.

- [ ] **Step 2: Implement Daily badges**

```tsx
// props
sitStartBadgesByPlayerId?: Record<string, string>
```

Render muted small span next to name when present. No click.

- [ ] **Step 3: Wire MatchupWorkspace**

```ts
const liveSitStart = useMemo(() => {
  if (!state || !matchupData || !daily || previewPlan) {
    return matchupData?.sitStart ?? []
  }
  const youTeam = …
  const oppTeam = …
  return suggestSitStart({
    youEntries: youTeam.entries,
    oppEntries: oppTeam.entries,
    players: state.players,
    gamesMap: effectiveGamesByPlayerId(daily, state.players, matchupData.schedule),
    categoryIds: liveBoard.categories.map((c) => c.categoryId),
  })
}, [state, matchupData, daily, previewPlan, liveBoard.categories, …])
```

MVP from spec:
- **Preview:** do not pass badges to Daily (`sitStartBadgesByPlayerId` undefined / {}); SitStartPanel may keep `matchupData.sitStart` **or** show `liveSitStart` from saved daily — lock: **panel uses `liveSitStart` when not previewing; when previewing use API `matchupData.sitStart` and hide badges.**

Build badge map from top suggestions:

```ts
const badges: Record<string, string> = {}
for (const s of liveSitStart) {
  if (!badges[s.benchPlayerId])
    badges[s.benchPlayerId] = `Start over ${shortName(s.activePlayerId)}`
  if (!badges[s.activePlayerId])
    badges[s.activePlayerId] = `Sit for ${shortName(s.benchPlayerId)}`
}
```

Pass badges only when `previewPlan == null`.

SitStartPanel `suggestions={previewPlan ? matchupData.sitStart : liveSitStart}` and Apply still works on roster swaps.

- [ ] **Step 4: Run**

`npm test -- tests/unit/DailyLineupPanel.test.tsx tests/unit/matchupSitStart.test.ts tests/unit/StreamingPlansPanel.test.tsx tests/unit/streamingPlans.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(matchup): daily sit/start badges and live recompute from daily games"
```

---

## Spec coverage (self-review)

| Spec | Task |
| --- | --- |
| forced drops key + rebuild + clear later | 1–2 |
| Cascading candidates | 1–2 |
| Empty map = old behavior | 1 |
| Daily badges hint-only | 3 |
| Hide badges in preview | 3 |
| Client Sit/Start recompute from effective games | 3 |
| No matchup refetch on Daily toggle | 3 |
| Tests listed in spec | 1–3 |
