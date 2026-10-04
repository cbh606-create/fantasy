# Matchup Scoreboard Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MatchupBoard category cards (`xx.x vs xx.x`) with a You | Cat | Opp scoreboard table and move W–L–T into a footer.

**Architecture:** Pure presentation change in `MatchupBoard.tsx`. Keep the same `board: MatchupBoard` prop and `buildMatchupBoard` math. Add a jsdom smoke test for the new table shape.

**Tech Stack:** React, Tailwind utility classes, Vitest + Testing Library (jsdom), existing `formatCategoryStat` / `CATEGORY_SHORT_LABELS`.

## Global Constraints

- Restyle `MatchupBoard.tsx` only — no new scoreboard package, no board math changes.
- Columns: **You | Cat | Opp** (labels `You` / `Opp`; no real team names).
- No per-row Result or win% columns.
- Winner = semibold + color; loser muted; tie = both muted (weight, not color alone).
- Footer: `W–L–T` plus muted projected cat wins; remove Bebas hero header.
- Soft panel (`rounded-3xl` / soft-cloud) retained.
- Spec: `docs/superpowers/specs/2026-08-25-matchup-scoreboard-table-design.md`.

## File map

| File | Role |
| --- | --- |
| `src/components/matchup/MatchupBoard.tsx` | Scoreboard table UI |
| `tests/unit/MatchupBoard.test.tsx` | jsdom smoke (create) |
| `tests/unit/matchupBoard.test.ts` | Pure `buildMatchupBoard` — **do not change** |

---

### Task 1: Scoreboard table UI + smoke test

**Files:**
- Create: `tests/unit/MatchupBoard.test.tsx`
- Modify: `src/components/matchup/MatchupBoard.tsx`
- Test: `tests/unit/MatchupBoard.test.tsx`

**Interfaces:**
- Consumes: `MatchupBoard` from `@/lib/matchup/types` (`categories`, `wins`, `losses`, `ties`, `projectedCatWins`); `formatCategoryStat`, `CATEGORY_SHORT_LABELS` from `@/lib/season/formatCategoryStat`
- Produces: Updated `MatchupBoard` component with table markup; no prop API change (`{ board: MatchupBoardData }`)

- [ ] **Step 1: Write the failing smoke test**

Create `tests/unit/MatchupBoard.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MatchupBoard } from "@/components/matchup/MatchupBoard"
import type { MatchupBoard as MatchupBoardData } from "@/lib/matchup/types"

const board: MatchupBoardData = {
  wins: 2,
  losses: 1,
  ties: 0,
  projectedCatWins: 5.25,
  categories: [
    {
      categoryId: "PTS",
      you: 112.4,
      opp: 108.1,
      outcome: "W",
      winProb: 0.62,
    },
    {
      categoryId: "REB",
      you: 40,
      opp: 44,
      outcome: "L",
      winProb: 0.35,
    },
    {
      categoryId: "AST",
      you: 25,
      opp: 25,
      outcome: "T",
      winProb: 0.5,
    },
  ],
}

describe("MatchupBoard scoreboard table", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders You | Cat | Opp table without vs lines and footers W-L-T", () => {
    render(<MatchupBoard board={board} />)

    expect(screen.getByRole("columnheader", { name: /^You$/i })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: /^Opp$/i })).toBeInTheDocument()

    expect(screen.getByText("112.4")).toBeInTheDocument()
    expect(screen.getByText("108.1")).toBeInTheDocument()
    expect(screen.getByText("PTS")).toBeInTheDocument()

    expect(screen.queryByText(/vs/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/YOU 2/i)).not.toBeInTheDocument()

    expect(screen.getByText("2–1–0")).toBeInTheDocument()
    expect(screen.getByText(/Projected 5\.25 cat wins/i)).toBeInTheDocument()

    // win% column removed
    expect(screen.queryByText("62%")).not.toBeInTheDocument()
  })
})
```

Note: `formatCategoryStat` may format PTS as an integer or with decimals — if the assertion on `"112.4"` fails after implementation, assert via the formatted output of `formatCategoryStat("PTS", 112.4)` imported in the test instead of hard-coding the string.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/MatchupBoard.test.tsx`

Expected: FAIL (missing column headers / still shows `vs` or hero `YOU 2`).

- [ ] **Step 3: Implement the scoreboard table**

Replace `src/components/matchup/MatchupBoard.tsx` with:

```tsx
import type { MatchupBoard as MatchupBoardData } from "@/lib/matchup/types"
import type { CategoryOutcome } from "@/lib/matchup/types"
import {
  CATEGORY_SHORT_LABELS,
  formatCategoryStat,
} from "@/lib/season/formatCategoryStat"

type MatchupBoardProps = {
  board: MatchupBoardData
}

const valueClass = (
  side: "you" | "opp",
  outcome: CategoryOutcome,
): string => {
  const won =
    (side === "you" && outcome === "W") ||
    (side === "opp" && outcome === "L")
  const lost =
    (side === "you" && outcome === "L") ||
    (side === "opp" && outcome === "W")

  if (won) {
    return side === "you"
      ? "font-semibold tabular-nums text-[var(--color-info)]"
      : "font-semibold tabular-nums text-[var(--color-sale)]"
  }
  if (lost || outcome === "T") {
    return "tabular-nums text-[var(--color-mute)]"
  }
  return "tabular-nums text-[var(--color-ink)]"
}

export const MatchupBoard = ({ board }: MatchupBoardProps) => (
  <section
    aria-label="Matchup board"
    className="rounded-3xl bg-[var(--color-soft-cloud)] p-5"
  >
    <div className="overflow-x-auto">
      <table className="w-full min-w-[16rem] border-collapse text-[0.875rem]">
        <thead>
          <tr className="text-[0.7rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
            <th className="px-2 py-1.5 text-right font-medium" scope="col">
              You
            </th>
            <th className="px-2 py-1.5 text-center font-medium" scope="col">
              <span className="sr-only">Category</span>
            </th>
            <th className="px-2 py-1.5 text-left font-medium" scope="col">
              Opp
            </th>
          </tr>
        </thead>
        <tbody>
          {board.categories.map((row) => (
            <tr
              className="border-t border-[var(--color-hairline)]"
              key={row.categoryId}
            >
              <td className={`px-2 py-1.5 text-right ${valueClass("you", row.outcome)}`}>
                {formatCategoryStat(row.categoryId, row.you)}
              </td>
              <th
                className="px-2 py-1.5 text-center text-[0.75rem] font-medium tracking-wide text-[var(--color-mute)]"
                scope="row"
              >
                {CATEGORY_SHORT_LABELS[row.categoryId]}
              </th>
              <td className={`px-2 py-1.5 text-left ${valueClass("opp", row.outcome)}`}>
                {formatCategoryStat(row.categoryId, row.opp)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[var(--color-hairline)]">
            <td
              className="px-2 pt-3 text-center text-[0.8125rem]"
              colSpan={3}
            >
              <span className="font-semibold tabular-nums text-[var(--color-ink)]">
                {board.wins}–{board.losses}–{board.ties}
              </span>
              <span className="ml-2 text-[var(--color-mute)]">
                Projected {board.projectedCatWins.toFixed(2)} cat wins
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/MatchupBoard.test.tsx tests/unit/matchupBoard.test.ts`

Expected: PASS (both files).

If the smoke test fails on numeric text because `formatCategoryStat` rounds differently, update assertions to use `formatCategoryStat(...)` return values — do not change formatting helpers.

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/MatchupBoard.tsx tests/unit/MatchupBoard.test.tsx
git commit -m "feat(matchup): render category board as You/Opp scoreboard table"
```

(PowerShell: use a here-string for the message body if needed; do not leave literal `EOF` in the message.)

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| You \| Cat \| Opp table | Task 1 |
| formatCategoryStat values | Task 1 |
| Winner emphasis / loser muted / tie muted | Task 1 `valueClass` |
| Footer W–L–T + projected | Task 1 |
| Remove hero YOU X — Opp Y | Task 1 |
| No win% / Result column | Task 1 test asserts |
| No math / team-name changes | Global constraints |
| Soft panel retained | Task 1 markup |
| a11y table + weight cue | Task 1 `<table>` / `font-semibold` |
| Smoke test; leave `matchupBoard.test.ts` alone | Task 1 |
