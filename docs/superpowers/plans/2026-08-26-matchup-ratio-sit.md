# Matchup Ratio Sit Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recommend empty-slot sits on specific days to improve losing/tied FG%, FT%, or TO without flipping currently won counting categories, with Apply into Daily lineup.

**Architecture:** Pure `suggestRatioSits` engine over `DailyLineups` + `youTotalsFromDaily` + `buildMatchupBoard`. Dedicated `RatioSitsPanel` on Matchup (separate from weekly Sit/Start). Apply calls existing `handleTogglePlayerDay` / sit path. Hide panel while streaming-plan preview is active.

**Tech Stack:** TypeScript, Vitest, React (existing Matchup workspace patterns).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-matchup-ratio-sit-design.md`.
- Empty-slot sit only (no replacement player).
- Ratio targets: `FG_PCT`, `FT_PCT`, `TO` — only when baseline outcome is `L` or `T`, and sit strictly increases that cat’s `winProb`.
- Protect baseline `W` counting cats: `TPM`, `REB`, `AST`, `STL`, `BLK`, `PTS`; also protect `TO` if it was baseline `W` and is **not** the chosen ratio target.
- One suggestion per `(playerId, date)` — best `deltaWinProb` target; top **N = 5**.
- Do not mix into weekly Sit/Start; do not change `suggestSitStart`.
- MVP: hide Ratio sits UI while streaming plan preview is active.
- PowerShell commits: plain `-m` string; no literal `EOF` in messages.

## File map

| File | Role |
| --- | --- |
| `src/lib/matchup/types.ts` | `RatioSitSuggestion` type |
| `src/lib/matchup/constants.ts` | `MAX_RATIO_SITS = 5` |
| `src/lib/matchup/ratioSits.ts` | `suggestRatioSits` engine (create) |
| `tests/unit/matchupRatioSits.test.ts` | Engine unit tests (create) |
| `src/components/matchup/RatioSitsPanel.tsx` | UI panel (create) |
| `tests/unit/RatioSitsPanel.test.tsx` | Panel smoke (create) |
| `src/components/matchup/MatchupWorkspace.tsx` | Wire suggestions + Apply; hide in preview |

---

### Task 1: Ratio sit engine

**Files:**
- Create: `src/lib/matchup/ratioSits.ts`
- Modify: `src/lib/matchup/types.ts`
- Modify: `src/lib/matchup/constants.ts`
- Test: `tests/unit/matchupRatioSits.test.ts`

**Interfaces:**
- Consumes: `DailyLineups`, `youTotalsFromDaily`, `findPlayerSlotIndex` from `dailyLineups.ts`; `buildMatchupBoard` from `board.ts`; `gameWeightForTeamDate` from `games.ts`; `CATEGORY_SHORT_LABELS` from `formatCategoryStat.ts` (for reason text); `SeasonPlayer`, `ScheduleResponse`
- Produces:
  ```ts
  export type RatioSitSuggestion = {
    playerId: string
    date: string
    targetCategoryId: "FG_PCT" | "FT_PCT" | "TO"
    deltaWinProb: number
    reason: string
  }

  export const suggestRatioSits = (input: {
    daily: DailyLineups
    players: SeasonPlayer[]
    schedule: ScheduleResponse
    oppTotals: Record<CategoryId, number>
    categoryIds: CategoryId[]
  }): RatioSitSuggestion[]
  ```

- [ ] **Step 1: Add types and constant**

In `types.ts`, add `RatioSitSuggestion` as above (use `CategoryId` narrowed or document the three ids).

In `constants.ts`:

```ts
export const MAX_RATIO_SITS = 5
```

- [ ] **Step 2: Write failing engine tests**

Create `tests/unit/matchupRatioSits.test.ts` with small fixtures:

- Two matchup days, brick shooter (bad FG%, low counting) and star (good FG%, high PTS).
- Opp totals such that baseline FG% is `L`, PTS is `W`.
- Daily: both start on day1; star alone on day2.

Cases:

1. Sitting the brick on day1 improves FG% winProb and keeps PTS W → suggestion present with `targetCategoryId: "FG_PCT"`.
2. Sitting the star on day1 would flip PTS W → L → **not** suggested.
3. When baseline FG%/FT%/TO are all `W` → empty list.
4. Results length ≤ `MAX_RATIO_SITS`.

Use real `buildMatchupBoard` / `youTotalsFromDaily`; tune projections/shooting until assertions hold (do not mock the board).

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npm test -- tests/unit/matchupRatioSits.test.ts`

Expected: FAIL (module / function missing).

- [ ] **Step 4: Implement `suggestRatioSits`**

```ts
// src/lib/matchup/ratioSits.ts — outline

const RATIO_TARGETS: CategoryId[] = ["FG_PCT", "FT_PCT", "TO"]
const COUNTING_PROTECT: CategoryId[] = [
  "TPM", "REB", "AST", "STL", "BLK", "PTS",
]

const clearPlayerOnDay = (daily: DailyLineups, date: string, playerId: string): DailyLineups => {
  const entries = daily[date]
  if (!entries) return daily
  return {
    ...daily,
    [date]: entries.map((entry) =>
      entry.playerId === playerId ? { ...entry, playerId: null } : entry,
    ),
  }
}

export const suggestRatioSits = ({ daily, players, schedule, oppTotals, categoryIds }) => {
  const enabled = new Set(categoryIds)
  const baselineYou = youTotalsFromDaily(daily, players, schedule)
  const baselineBoard = buildMatchupBoard(baselineYou, oppTotals, categoryIds)
  const baselineByCat = Object.fromEntries(
    baselineBoard.categories.map((row) => [row.categoryId, row]),
  )

  const candidates: RatioSitSuggestion[] = []
  const days = schedule.matchup.days

  for (const date of days) {
    const entries = daily[date] ?? []
    const startedIds = [...new Set(entries.flatMap((e) => (e.playerId ? [e.playerId] : [])))]

    for (const playerId of startedIds) {
      const player = players.find((p) => p.id === playerId)
      if (!player?.teamAbbr) continue
      if (gameWeightForTeamDate(player.teamAbbr, date, schedule) <= 0) continue

      const nextDaily = clearPlayerOnDay(daily, date, playerId)
      const nextYou = youTotalsFromDaily(nextDaily, players, schedule)
      const nextBoard = buildMatchupBoard(nextYou, oppTotals, categoryIds)
      const nextByCat = Object.fromEntries(
        nextBoard.categories.map((row) => [row.categoryId, row]),
      )

      let bestTarget: CategoryId | null = null
      let bestDelta = 0

      for (const target of RATIO_TARGETS) {
        if (!enabled.has(target)) continue
        const base = baselineByCat[target]
        const next = nextByCat[target]
        if (!base || !next) continue
        if (base.outcome === "W") continue
        const delta = next.winProb - base.winProb
        if (delta > bestDelta) {
          bestDelta = delta
          bestTarget = target
        }
      }
      if (!bestTarget || bestDelta <= 0) continue

      let protectedOk = true
      for (const cat of COUNTING_PROTECT) {
        if (!enabled.has(cat)) continue
        const base = baselineByCat[cat]
        if (!base || base.outcome !== "W") continue
        if (nextByCat[cat]?.outcome !== "W") {
          protectedOk = false
          break
        }
      }
      if (protectedOk && enabled.has("TO") && bestTarget !== "TO") {
        const baseTo = baselineByCat.TO
        if (baseTo?.outcome === "W" && nextByCat.TO?.outcome !== "W") {
          protectedOk = false
        }
      }
      if (!protectedOk) continue

      const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
      })
      candidates.push({
        playerId,
        date,
        targetCategoryId: bestTarget as RatioSitSuggestion["targetCategoryId"],
        deltaWinProb: bestDelta,
        reason: `Sit on ${dayLabel} · helps ${CATEGORY_SHORT_LABELS[bestTarget]} (+${bestDelta.toFixed(2)}) · counting W preserved`,
      })
    }
  }

  return candidates
    .sort((a, b) => {
      if (b.deltaWinProb !== a.deltaWinProb) return b.deltaWinProb - a.deltaWinProb
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.playerId.localeCompare(b.playerId)
    })
    .slice(0, MAX_RATIO_SITS)
}
```

Optional tie-break by counting margin can wait; sort above is enough for MVP if tests pass.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test -- tests/unit/matchupRatioSits.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/lib/matchup/ratioSits.ts src/lib/matchup/types.ts src/lib/matchup/constants.ts tests/unit/matchupRatioSits.test.ts
git commit -m "feat(matchup): suggest ratio sits for FG%/FT%/TO with counting W guard"
```

---

### Task 2: Ratio sits panel + Matchup wiring

**Files:**
- Create: `src/components/matchup/RatioSitsPanel.tsx`
- Create: `tests/unit/RatioSitsPanel.test.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx`

**Interfaces:**
- Consumes: `RatioSitSuggestion` from types; `suggestRatioSits` from `ratioSits.ts`; existing `handleTogglePlayerDay(playerId, day)`; `previewPlan` / `displayDaily`; `oppTotalsFromBoard`; `enabledCategoryIds` / board category list; `playersForTotals` / roster players
- Produces: Panel props `{ suggestions, playersById, applyingKey, onApply, applyDisabled? }`

- [ ] **Step 1: Write failing panel smoke test**

```tsx
// @vitest-environment jsdom
// Render RatioSitsPanel with one suggestion; click Apply; expect onApply called with that suggestion.
```

- [ ] **Step 2: Run panel test — expect FAIL**

Run: `npm test -- tests/unit/RatioSitsPanel.test.tsx`

- [ ] **Step 3: Implement `RatioSitsPanel`**

Mirror `SitStartPanel` styling (muted secondary section):

- Title: `Ratio sits`
- Helper: `Empty-slot sits to help FG%/FT%/TO without giving back counting wins`
- Empty: `No ratio sits right now.`
- Row: `Sit {name} · {reason}` + Apply button (`aria-label` includes name + date)
- If `applyDisabled`, hide Apply buttons (or disable all) — workspace passes this when preview active

- [ ] **Step 4: Wire `MatchupWorkspace`**

After live board / daily are available (non-loading path):

```ts
const ratioSits =
  previewPlan != null
    ? []
    : suggestRatioSits({
        daily: displayDaily,
        players: playersForTotals,
        schedule: matchupData.schedule,
        oppTotals: oppTotalsFromBoard(matchupData.board),
        categoryIds: liveBoard.categories.map((row) => row.categoryId),
      })
```

MVP lock from spec: **hide panel entirely while `previewPlan != null`** (simplest).

Place `<RatioSitsPanel />` near `<SitStartPanel />`.

`onApply`:

```ts
const handleApplyRatioSit = (suggestion: RatioSitSuggestion) => {
  // If player already not started that day, no-op
  handleTogglePlayerDay(suggestion.playerId, suggestion.date)
}
```

Ensure toggle sits when currently started (existing daily toggle behavior). If toggle would start instead of sit, only call when `findPlayerSlotIndex(displayDaily, date, playerId) >= 0`.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/RatioSitsPanel.test.tsx tests/unit/matchupRatioSits.test.ts tests/unit/MatchupWorkspace.test.tsx`

Expected: PASS (update MatchupWorkspace test only if it asserts Sit/Start-only layout and needs “Ratio sits” absence/presence tolerance).

- [ ] **Step 6: Commit**

```bash
git add src/components/matchup/RatioSitsPanel.tsx tests/unit/RatioSitsPanel.test.tsx src/components/matchup/MatchupWorkspace.tsx
git commit -m "feat(matchup): show ratio sit recommendations on matchup workspace"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Engine DTO + empty-slot evaluation | Task 1 |
| L/T ratio only + winProb↑ | Task 1 |
| Counting W preserved (+ TO W when not target) | Task 1 |
| Top 5 ranking | Task 1 |
| Separate Ratio sits panel + Apply | Task 2 |
| Hide during streaming preview | Task 2 |
| Unit tests for improve / flip / all-W | Task 1 |
| Panel smoke | Task 2 |
| No weekly Sit/Start changes | Global |
