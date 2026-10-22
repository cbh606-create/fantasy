# Fixed activity swaps and labeled week scoreboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an executed add/drop as static text, and replace the week scoreboard's stacked numbers with labeled 합계 / 실제 / 차이 / +/- rows.

**Architecture:** `weekAdvantage` turns the two teams' existing actual-minus-projection totals into one advantage-oriented total. `DayComparison` keeps the compact daily stack and renders a separate week table from those totals. `StreamingPlansPanel` treats a spot with a stored swap as already locked, including on today, and leaves the other spots editable.

**Tech Stack:** TypeScript, React, Tailwind, Vitest, Testing Library.

## Global Constraints

- Favorable 차이 and +/- use `text-[var(--color-success)]` (`#007d48`). Unfavorable values use `text-[var(--color-sale)]`. Zero uses `text-[var(--color-mute)]`.
- Row titles are exactly `합계`, `실제`, `차이`, and `+/-`. Group labels stay `You` and `Opp`.
- GP appears only on each team's 합계 row.
- Daily scoreboards stay the compact projection / actual / delta stack.
- 차이 is actual minus that day's projection for box-score days. It is not 합계 minus 실제.
- +/- is a dash unless both teams have a finite 차이 for that category. Turnovers are flipped so fewer turnovers are favorable. Positive means we are ahead.
- A recorded swap locks only that date and spot. Do not lock the rest of the day.
- Files that already omit semicolons stay that way. Test files keep semicolons.
- Do not commit while `git diff --diff-filter=U` lists files. Do not stage unrelated files, secrets, or `tmp-*`.

---

### Task 1: Week rows and green advantage

**Files:**
- Modify: `src/lib/matchup/projectionDelta.ts`
- Modify: `src/components/matchup/DayComparison.tsx`
- Test: `tests/unit/projectionDelta.test.ts`
- Test: `tests/unit/DayComparison.test.tsx`

**Interfaces:**
- Consumes: `actualMinusProjection`, `DayComparisonRow.youDelta`, `DayComparisonRow.oppDelta`, `categoryStatLead` from `src/lib/season/formatCategoryStat.ts`
- Produces: `weekAdvantage(youDelta: CategoryTotals | null | undefined, oppDelta: CategoryTotals | null | undefined): CategoryTotals | null`

- [ ] **Step 1: Write the failing advantage test**

Add this test to `tests/unit/projectionDelta.test.ts`:

```ts
import { weekAdvantage } from "@/lib/matchup/projectionDelta"

it("flips turnovers so a positive advantage means we are ahead", () => {
  const advantage = weekAdvantage(
    totals({ PTS: 4, TO: -2, FG_PCT: 0.02 }),
    totals({ PTS: 1, TO: 3, FG_PCT: -0.01 }),
  )

  expect(advantage?.PTS).toBe(3)
  expect(advantage?.TO).toBe(5)
  expect(advantage?.FG_PCT).toBeCloseTo(0.03)
})

it("returns null when either team has no delta", () => {
  expect(weekAdvantage(totals({ PTS: 4 }), null)).toBeNull()
  expect(weekAdvantage(null, totals({ PTS: 1 }))).toBeNull()
})

it("leaves a category blank when either delta is not finite", () => {
  const advantage = weekAdvantage(
    totals({ PTS: 4, FG_PCT: Number.NaN }),
    totals({ PTS: 1, FG_PCT: 0.01 }),
  )

  expect(advantage?.PTS).toBe(3)
  expect(advantage?.FG_PCT).toBeNaN()
})
```

- [ ] **Step 2: Run the advantage test and confirm it fails**

Run: `npx vitest run tests/unit/projectionDelta.test.ts -t "positive advantage"`

Expected: FAIL because `weekAdvantage` is not exported.

- [ ] **Step 3: Implement `weekAdvantage`**

In `src/lib/matchup/projectionDelta.ts`, import `categoryStatLead` from `@/lib/season/formatCategoryStat` and add:

```ts
export const weekAdvantage = (
  youDelta: CategoryTotals | null | undefined,
  oppDelta: CategoryTotals | null | undefined,
): CategoryTotals | null => {
  if (!youDelta || !oppDelta) return null
  const advantage = emptyCategoryTotals()
  for (const categoryId of ALL_CATEGORY_IDS) {
    const you = youDelta[categoryId]
    const opp = oppDelta[categoryId]
    if (!Number.isFinite(you) || !Number.isFinite(opp)) {
      advantage[categoryId] = Number.NaN
      continue
    }
    advantage[categoryId] = categoryStatLead(categoryId, you, opp)
  }
  return advantage
}
```

`categoryStatLead` already returns `opp - you` for `TO` and `you - opp` for every other category. Do not flip turnovers a second time at render time.

- [ ] **Step 4: Run the advantage test and confirm it passes**

Run: `npx vitest run tests/unit/projectionDelta.test.ts`

Expected: PASS

- [ ] **Step 5: Write the failing week-table test**

Replace the week assertions in `tests/unit/DayComparison.test.tsx` so the week row has both deltas:

```ts
const week = row({
  date: "week",
  youGames: 7,
  youProjection: totals({ PTS: 80, FG_PCT: 0.47, TO: 10 }),
  youActual: totals({ PTS: 18, FG_PCT: 0.4, TO: 8 }),
  youDelta: totals({ PTS: 4, FG_PCT: 0.02, TO: -2 }),
  oppGames: 6,
  oppProjection: totals({ PTS: 70, TO: 9 }),
  oppActual: totals({ PTS: 12, TO: 12 }),
  oppDelta: totals({ PTS: 1, FG_PCT: -0.01, TO: 3 }),
})
```

Assert inside `Day comparison Week`:

```ts
const weekTable = screen.getByRole("region", { name: "Day comparison Week" })
expect(within(weekTable).getAllByRole("rowheader", { name: "합계" })).toHaveLength(2)
expect(within(weekTable).getAllByRole("rowheader", { name: "실제" })).toHaveLength(2)
expect(within(weekTable).getAllByRole("rowheader", { name: "차이" })).toHaveLength(2)
expect(within(weekTable).getByRole("rowheader", { name: "+/-" })).toBeInTheDocument()
expect(within(weekTable).getByRole("rowheader", { name: "You" })).toBeInTheDocument()
expect(within(weekTable).getByRole("rowheader", { name: "Opp" })).toBeInTheDocument()
expect(within(weekTable).getByText("80.0")).toBeInTheDocument()
expect(within(weekTable).getByText("18.0")).toBeInTheDocument()
expect(within(weekTable).getByText("+4.0")).toHaveClass("text-[var(--color-success)]")
expect(within(weekTable).getByText("-2.0")).toHaveClass("text-[var(--color-success)]")
expect(within(weekTable).getByLabelText("Category advantage PTS")).toHaveTextContent("+3.0")
expect(within(weekTable).getByLabelText("Category advantage PTS")).toHaveClass("text-[var(--color-success)]")
expect(within(weekTable).getByLabelText("Category advantage TO")).toHaveTextContent("+5.0")
expect(within(weekTable).getByLabelText("Category advantage TO")).toHaveClass("text-[var(--color-success)]")
expect(within(weekTable).getByLabelText("Category advantage REB")).toHaveTextContent("0.0")
expect(within(weekTable).getByLabelText("Category advantage REB")).toHaveClass("text-[var(--color-mute)]")
const headlineRows = within(weekTable).getAllByRole("rowheader", { name: "합계" })
expect(headlineRows[0]?.closest("tr")).toHaveTextContent("7")
expect(headlineRows[1]?.closest("tr")).toHaveTextContent("6")
expect(within(weekTable).getAllByRole("rowheader", { name: "실제" })[0]?.closest("tr")).not.toHaveTextContent("7")
```

Keep the daily assertions. The open day still has no delta. The played day still shows `-2.0`, and that daily delta uses `text-[var(--color-sale)]` because points went down.

Add one week fixture whose `oppDelta` is null and expect `within(weekTable).queryByLabelText("Category advantage PTS")` to be null. Use a second `render` after `cleanup()`, or a second test.

- [ ] **Step 6: Run the week-table test and confirm it fails**

Run: `npx vitest run tests/unit/DayComparison.test.tsx`

Expected: FAIL because the week region has no `합계` row header.

- [ ] **Step 7: Render the week table and turn favorable deltas green**

In `DayComparison.tsx`:

- Change the favorable branch of `deltaToneClass` from `text-[var(--color-info)]` to `text-[var(--color-success)]`. This colors both the daily delta and the week 차이 row. For those rows the value is still raw actual-minus-projection, so a negative turnover stays green.
- Add `advantageTone(value: number)` that returns mute at 0, success when `value > 0`, and sale when `value < 0`. Use this only for the +/- row.
- When `emphasized` is true, render `WeekTable` instead of the stacked `ComparisonTable` body. Daily cards keep `ComparisonTable`.

`WeekTable` rows, in order:

1. You / 합계 — `youProjection`, GP `youGames`
2. You / 실제 — `youActual`, GP cell empty
3. You / 차이 — `youDelta`, colored with `deltaToneClass`, GP cell empty
4. Opp / 합계 — `oppProjection`, GP `oppGames`
5. Opp / 실제 — `oppActual`, GP cell empty
6. Opp / 차이 — `oppDelta`, colored with `deltaToneClass`, GP cell empty
7. blank team cell / +/- — `weekAdvantage(row.youDelta, row.oppDelta)`

Each category cell calls `formatCategoryStat` or `formatCategoryStatDelta`. A missing total, a null delta, or a non-finite number renders `—` with no advantage label. A finite +/- cell has `aria-label={`Category advantage ${CATEGORY_SHORT_LABELS[categoryId]}`}`.

Row shades: You rows `bg-white`, Opp rows `bg-[var(--color-soft-cloud)]`, +/- row `bg-[color-mix(in_srgb,var(--color-success)_14%,white)]`. The team label uses `rowSpan={3}` on the first row of each group. Row titles are `<th scope="row">`.

Do not change `MatchupWorkspace`. It already puts the headline on `youProjection` / `oppProjection`, the box-score sum on `youActual` / `oppActual`, and `actualMinusProjection` on `youDelta` / `oppDelta`.

- [ ] **Step 8: Run the week and delta tests**

Run: `npx vitest run tests/unit/DayComparison.test.tsx tests/unit/projectionDelta.test.ts`

Expected: PASS

- [ ] **Step 9: Commit**

If `git diff --diff-filter=U` prints any path, skip this step.

```bash
git add src/lib/matchup/projectionDelta.ts src/components/matchup/DayComparison.tsx tests/unit/projectionDelta.test.ts tests/unit/DayComparison.test.tsx
git commit -m "feat(matchup): label week scoreboard advantage rows"
```

---

### Task 2: Lock a recorded swap spot

**Files:**
- Modify: `src/components/matchup/StreamingPlansPanel.tsx`
- Create: `tests/unit/streamingSpotLock.test.tsx`
- Do not modify: `tests/unit/StreamingPlansPanel.test.tsx` while it still has merge conflict markers.

**Interfaces:**
- Consumes: `pastActualSwaps` already held in `StreamingPlansPanel`, `PastActualSwap`, `storedPastSwap(date, spotIndex)`
- Produces: a spot whose stored swap exists renders static add and drop text. The picker `aria-label` `Stream add … spot N` is absent for that spot and present for an unlocked spot on the same date.

- [ ] **Step 1: Write the failing panel test**

Create `tests/unit/streamingSpotLock.test.tsx` with `@vitest-environment jsdom`. Use `streamerA` (`id: "fa-a"`, `name: "Streamer A"`, `teamAbbr: "BOS"`), `rostered` (`id: "you-1"`, `name: "Roster Cut"`, `teamAbbr: "CHI"`), and a second free agent `fa-b`. Give every player `projectedGames: 82`, positions, and the usual nine-category projections plus shooting `{ FGM: 1, FGA: 2, FTM: 1, FTA: 1 }`. `board` is one `MatchupBoard` row per `ALL_CATEGORY_IDS`. `schedule.source` is `"fixture"` and `schedule.matchup.days` is `["2025-11-03", "2025-11-04", "2025-11-05"]`, with a BOS game on `2025-11-03`. `state` is manual, `perspectiveTeamIndex: 0`, categories all enabled, team 0 entries `[{ slot: "UTIL", playerId: "you-1" }, { slot: "BE", playerId: null }]`, team 1 one empty UTIL, `availablePlayerIds: ["fa-a", "fa-b"]`. Render:

```tsx
render(
  <StreamingPlansPanel
    activityOpponentPastSwaps={[]}
    activityPastSwaps={[
      {
        date: "2025-11-03",
        spotIndex: 0,
        addedPlayerId: "fa-a",
        drop: "you-1",
      },
    ]}
    board={board}
    leagueId="lock-lg"
    playersById={{ "fa-a": streamerA, "you-1": rostered }}
    schedule={schedule}
    state={state}
    today="2025-11-03"
  />,
)
```

The schedule in that fixture includes `2025-11-03`. Wait until the locked name appears, then assert:

```tsx
await waitFor(() => {
  expect(screen.getAllByText("Streamer A").length).toBeGreaterThan(0)
})
expect(screen.queryByRole("combobox", { name: /Stream add .* spot 1$/ })).not.toBeInTheDocument()
expect(screen.getAllByRole("combobox", { name: /Stream add .* spot 2$/ }).length).toBeGreaterThan(0)
expect(screen.getAllByText("Roster Cut").length).toBeGreaterThan(0)
```

Spot 1 is the first spot (`spotIndex` 0) because the aria label uses `spotIndex + 1`. Spot 2 is the unlocked second spot on the 2-spot and 3-spot plans. `Roster Cut` is the static drop label from `dropPlanLabel`.

- [ ] **Step 2: Run the lock test and confirm it fails**

Run: `npx vitest run tests/unit/streamingSpotLock.test.tsx`

Expected: FAIL because the today cell is still a combobox named `Stream add … spot 1`.

- [ ] **Step 3: Render a stored swap as static text**

In `StreamingPlansPanel.tsx`, a spot is locked when `storedPastSwap(date, spotIndex)` is defined. Recording mode does not unlock it.

For the add cell, treat a locked spot like a past day that is not being recorded: show `playerName` for `cell.playerId`, or `—` when it is null. Do not render `AddTeamPlayerPicker` or the `비우기` button.

For the drop cell, a locked spot returns the same static `dropPlanLabel(cell, playersById)` branch already used for a past day. Do not render the drop `<select>`.

Unlocked spots keep the current picker. That includes other spots on the locked spot's date, and past days that are in 실제 교체 mode and have no stored swap.

The 실제 교체 button stays behind `date < today`. Do not add it to today.

`activityPastSwaps` already replaces `pastActualSwaps` for both the user list and, through `opponentPastActualSwaps`, the opponent plan. The opponent has no add/drop picker. No second lock UI.

- [ ] **Step 4: Run the lock test and confirm it passes**

Run: `npx vitest run tests/unit/streamingSpotLock.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

If `git diff --diff-filter=U` prints any path, skip this step.

```bash
git add src/components/matchup/StreamingPlansPanel.tsx tests/unit/streamingSpotLock.test.tsx
git commit -m "fix(matchup): keep a recorded swap spot fixed"
```
