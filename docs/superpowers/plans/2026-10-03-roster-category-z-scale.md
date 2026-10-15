# Roster Category Z Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Z row under the roster league rank matrix so each category opens a dialog of every team's fantasy z on a number line.

**Architecture:** `layoutCategoryZ` is a pure function that turns existing `analysis.byCategory` z values into an extent, an x fraction, and a collision lane. `CategoryZScale` draws the compact row and the dialog plot from that layout. `CategoryZDialog` owns the overlay, focus trap, and scroll lock. `LeagueRankMatrix` adds the footer row and the open-category state. No analysis, API, or workspace change.

**Tech Stack:** TypeScript, React 19, Next.js, Tailwind, Vitest, Testing Library, jsdom.

## Global Constraints

- Footer row header is `Z`. It is not a team row, so sorting team rows does not move it.
- Columns stay Overall, then `ALL_CATEGORY_IDS` order. Overall is `—` and is not a button.
- Each category cell is one button labelled `Show {label} league z`, using `CATEGORY_SHORT_LABELS`.
- `SeasonRosterWorkspace` does not change.
- Dialog kicker is `League z`. Title is the category short label. `role="dialog"` and `aria-modal="true"`.
- Close by the Close button, Escape, or a press on the scrim outside the panel. Focus returns to the button that opened it.
- On open, focus Close. Tab cycles inside the dialog.
- While open, `document.body` overflow is `hidden`. Restore the previous overflow on close.
- A category with no `byCategory` rows renders `—` and is not a button.
- Horizontal position uses the stored fantasy z. Do not recompute z. Do not invert again. Right is better, including `TO`.
- Pale band is z −1 through +1. Dashed tick at z 0.
- Perspective dot is larger and `fill-sky-800` / `bg-sky-800`. Other dots use `--color-mute`.
- Compact dots are `aria-hidden`. The cell button is the only compact control.
- Dialog labels: `worse`, `better`, `0`, `−1σ`, `+1σ`.
- Perspective caption is `YOU · {raw} · {z}`. Other dots are buttons. Hover and focus show `{name}, {raw}, z {z}`.
- Raw uses `formatCategoryStat`. z uses a signed two-decimal value (`+1.15`, `-0.40`, `0.00`).
- Perspective name is `YOU`. Other names are `team.name`, or `Team {teamIndex + 1}` when missing.
- Vertical position only separates overlaps.
- Punt, focus, and weights do not move dots.
- `extent = max(3, max |z|)` over finite z. Empty points or all zeros still use extent 3.
- `xFraction = (z + extent) / (2 * extent)`.
- `x = inset + xFraction * (plotWidth - 2 * inset)` with inset equal to the YOU radius.
- Lane order is center, above, below, further above, further below.
- Assign lanes after sorting by `xFraction`, then `teamIndex`. Collision distance is `2 * youRadius + laneGapPx`. If every lane collides, use the lane whose last dot is farthest.
- Compact viewBox `0 0 64 22`, other radius 2, YOU radius 3, lane gap 1, max lanes 3, axis y 11. Lanes y 11, 4, 18.
- Dialog viewBox `0 0 640 120`, other radius 6, YOU radius 8, lane gap 2, max lanes 5, axis y 64. Lanes y 64, 46, 82, 28, 100.
- YOU caption is svg text at y=14. Anchor middle, start when the dot x is in the left 20% of the plot width, end when it is in the right 20%.
- No bell curve, box plot, separate section, Overall z, team table, or weighted dots.
- New TS and TSX omit semicolons, matching `src/lib/season/analysis.ts` and `LeagueRankMatrix.tsx`.

---

### Task 1: Z scale layout

**Files:**
- Create: `src/lib/season/zScaleLayout.ts`
- Test: `tests/unit/zScaleLayout.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `export const zFraction = (z: number, extent: number): number`
  - `export const yForLane = (lane: number, axisY: number, youRadius: number, laneGapPx: number): number`
  - `export const Z_SCALE_COMPACT: { plotWidth: 64; plotHeight: 22; youRadius: 3; otherRadius: 2; laneGapPx: 1; maxLanes: 3; axisY: 11 }`
  - `export const Z_SCALE_EXPANDED: { plotWidth: 640; plotHeight: 120; youRadius: 8; otherRadius: 6; laneGapPx: 2; maxLanes: 5; axisY: 64; captionY: 14 }`
  - `export const layoutCategoryZ = (input: { points: readonly { teamIndex: number; z: number }[]; plotWidth: number; youRadius: number; laneGapPx: number; maxLanes: number }): { extent: number; points: { teamIndex: number; z: number; xFraction: number; lane: number }[] }`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/zScaleLayout.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  layoutCategoryZ,
  yForLane,
  zFraction,
} from "@/lib/season/zScaleLayout"

const compactInput = {
  plotWidth: 64,
  youRadius: 3,
  laneGapPx: 1,
  maxLanes: 3,
}

describe("layoutCategoryZ", () => {
  it("keeps extent at 3 and maps z inside that window", () => {
    const layout = layoutCategoryZ({
      ...compactInput,
      points: [
        { teamIndex: 0, z: 0 },
        { teamIndex: 1, z: 1 },
        { teamIndex: 2, z: -1 },
        { teamIndex: 3, z: 2.9 },
      ],
    })

    expect(layout.extent).toBe(3)
    const at = (teamIndex: number) =>
      layout.points.find((point) => point.teamIndex === teamIndex)

    expect(at(0)?.xFraction).toBe(0.5)
    expect(at(1)?.xFraction).toBeCloseTo(2 / 3)
    expect(at(2)?.xFraction).toBeCloseTo(1 / 3)
    expect(zFraction(0, 3)).toBe(0.5)
  })

  it("expands extent to the farthest finite z", () => {
    const layout = layoutCategoryZ({
      ...compactInput,
      points: [
        { teamIndex: 0, z: 3.4 },
        { teamIndex: 1, z: -3.4 },
        { teamIndex: 2, z: Number.NaN },
      ],
    })

    expect(layout.extent).toBe(3.4)
    const at = (teamIndex: number) =>
      layout.points.find((point) => point.teamIndex === teamIndex)

    expect(at(0)?.xFraction).toBe(1)
    expect(at(1)?.xFraction).toBe(0)
    expect(at(2)).toBeUndefined()
  })

  it("places a positive z to the right of zero without a category id", () => {
    const layout = layoutCategoryZ({
      ...compactInput,
      points: [
        { teamIndex: 0, z: 0 },
        { teamIndex: 1, z: 1.2 },
      ],
    })
    const at = (teamIndex: number) =>
      layout.points.find((point) => point.teamIndex === teamIndex)

    expect(at(1)?.xFraction).toBeGreaterThan(at(0)?.xFraction ?? 0)
  })

  it("gives identical z values different lanes and keeps the lower team index in the center", () => {
    const layout = layoutCategoryZ({
      ...compactInput,
      points: [
        { teamIndex: 4, z: 0.5 },
        { teamIndex: 1, z: 0.5 },
      ],
    })
    const at = (teamIndex: number) =>
      layout.points.find((point) => point.teamIndex === teamIndex)

    expect(layout.extent).toBe(3)
    expect(at(1)?.lane).toBe(0)
    expect(at(4)?.lane).toBe(1)
  })

  it("uses extent 3 for an empty list", () => {
    expect(layoutCategoryZ({ ...compactInput, points: [] }).extent).toBe(3)
  })
})

describe("yForLane", () => {
  it("matches the compact and dialog lane table", () => {
    expect(yForLane(0, 11, 3, 1)).toBe(11)
    expect(yForLane(1, 11, 3, 1)).toBe(4)
    expect(yForLane(2, 11, 3, 1)).toBe(18)
    expect(yForLane(0, 64, 8, 2)).toBe(64)
    expect(yForLane(1, 64, 8, 2)).toBe(46)
    expect(yForLane(2, 64, 8, 2)).toBe(82)
    expect(yForLane(3, 64, 8, 2)).toBe(28)
    expect(yForLane(4, 64, 8, 2)).toBe(100)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/zScaleLayout.test.ts`

Expected: FAIL because `@/lib/season/zScaleLayout` cannot be resolved.

- [ ] **Step 3: Write the layout helper**

Create `src/lib/season/zScaleLayout.ts`:

```ts
export const zFraction = (z: number, extent: number) => (z + extent) / (2 * extent)

export const yForLane = (
  lane: number,
  axisY: number,
  youRadius: number,
  laneGapPx: number,
) => {
  const delta =
    lane === 0 ? 0 : Math.ceil(lane / 2) * (lane % 2 === 1 ? -1 : 1)

  return axisY + delta * (2 * youRadius + laneGapPx)
}

export const Z_SCALE_COMPACT = {
  plotWidth: 64,
  plotHeight: 22,
  youRadius: 3,
  otherRadius: 2,
  laneGapPx: 1,
  maxLanes: 3,
  axisY: 11,
} as const

export const Z_SCALE_EXPANDED = {
  plotWidth: 640,
  plotHeight: 120,
  youRadius: 8,
  otherRadius: 6,
  laneGapPx: 2,
  maxLanes: 5,
  axisY: 64,
  captionY: 14,
} as const

type ZScaleInputPoint = {
  teamIndex: number
  z: number
}

type LayoutCategoryZInput = {
  points: readonly ZScaleInputPoint[]
  plotWidth: number
  youRadius: number
  laneGapPx: number
  maxLanes: number
}

export const layoutCategoryZ = ({
  points,
  plotWidth,
  youRadius,
  laneGapPx,
  maxLanes,
}: LayoutCategoryZInput) => {
  const finite = points.filter((point) => Number.isFinite(point.z))
  const peak = finite.reduce((max, point) => Math.max(max, Math.abs(point.z)), 0)
  const extent = Math.max(3, peak)
  const collision = 2 * youRadius + laneGapPx
  const sorted = finite
    .map((point) => ({
      ...point,
      xFraction: zFraction(point.z, extent),
    }))
    .sort(
      (left, right) =>
        left.xFraction - right.xFraction || left.teamIndex - right.teamIndex,
    )
  const lastX: number[] = []

  return {
    extent,
    points: sorted.map((point) => {
      const x = youRadius + point.xFraction * (plotWidth - 2 * youRadius)
      let lane = 0
      let placed = false

      for (let slot = 0; slot < maxLanes; slot += 1) {
        const previous = lastX[slot]
        if (previous === undefined || x - previous >= collision) {
          lane = slot
          lastX[slot] = x
          placed = true
          break
        }
      }

      if (!placed) {
        let farthest = 0
        let bestDistance = -1
        for (let slot = 0; slot < maxLanes; slot += 1) {
          const distance = x - (lastX[slot] ?? x)
          if (distance > bestDistance) {
            bestDistance = distance
            farthest = slot
          }
        }
        lane = farthest
        lastX[farthest] = x
      }

      return {
        teamIndex: point.teamIndex,
        z: point.z,
        xFraction: point.xFraction,
        lane,
      }
    }),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/zScaleLayout.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/season/zScaleLayout.ts tests/unit/zScaleLayout.test.ts
git commit -m "feat(roster): map category z onto a shared scale"
```

---

### Task 2: Matrix Z row and category dialog

**Files:**
- Create: `src/components/season/CategoryZScale.tsx`
- Create: `src/components/season/CategoryZDialog.tsx`
- Modify: `src/components/season/LeagueRankMatrix.tsx`
- Test: `tests/unit/LeagueRankMatrix.test.tsx`

**Interfaces:**
- Consumes: `layoutCategoryZ`, `yForLane`, `zFraction`, `Z_SCALE_COMPACT`, `Z_SCALE_EXPANDED` from Task 1. `formatCategoryStat` and `CATEGORY_SHORT_LABELS` from `src/lib/season/formatCategoryStat.ts`. `SeasonAnalysis` rows `{ teamIndex, rank, z, raw }`.
- Produces:
  - `export type CategoryZDot = { teamIndex: number; name: string; raw: number; z: number; isYou: boolean }`
  - `export const formatSignedZ = (z: number): string`
  - `export const CategoryZScale = (props: { categoryId: CategoryId; dots: CategoryZDot[]; mode: "compact" | "expanded" }) => JSX`
  - `export const CategoryZDialog = (props: { categoryId: CategoryId; label: string; dots: CategoryZDot[]; onClose: () => void }) => JSX`
  - `LeagueRankMatrix` footer and dialog. Props stay `{ analysis, perspectiveTeamIndex, teams }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/LeagueRankMatrix.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LeagueRankMatrix } from "@/components/season/LeagueRankMatrix"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonAnalysis } from "@/lib/season/analysis"
import type { SeasonTeamRoster } from "@/lib/season/types"

const teams: SeasonTeamRoster[] = [
  { teamIndex: 0, name: "Mine", entries: [] },
  { teamIndex: 1, name: "Alpha", entries: [] },
  { teamIndex: 2, name: "Beta", entries: [] },
]

const rowsFor = (categoryId: CategoryId, rebTied: boolean) => {
  if (categoryId === "REB" && rebTied) {
    return [
      { teamIndex: 0, rank: 1, z: 1.15, raw: 42.1 },
      { teamIndex: 1, rank: 2, z: 1.15, raw: 40 },
      { teamIndex: 2, rank: 3, z: -0.2, raw: 30 },
    ]
  }

  if (categoryId === "REB") return []

  return [
    { teamIndex: 0, rank: 1, z: 0.2, raw: 1 },
    { teamIndex: 1, rank: 2, z: -1.4, raw: 1 },
    { teamIndex: 2, rank: 3, z: 0.4, raw: 1 },
  ]
}

const analysisWith = (rebTied: boolean): SeasonAnalysis => ({
  byTeam: [],
  byCategory: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    rows: rowsFor(categoryId, rebTied),
  })),
  overall: {
    rows: [
      { teamIndex: 0, rank: 1, rankSum: 20 },
      { teamIndex: 1, rank: 2, rankSum: 30 },
      { teamIndex: 2, rank: 3, rankSum: 40 },
    ],
  },
})

const renderMatrix = (rebTied: boolean) =>
  render(
    <LeagueRankMatrix
      analysis={analysisWith(rebTied)}
      perspectiveTeamIndex={0}
      teams={teams}
    />,
  )

describe("LeagueRankMatrix z row", () => {
  afterEach(() => {
    document.body.style.overflow = ""
    cleanup()
  })

  it("renders a z button for each category and a dash for overall", () => {
    renderMatrix(true)
    const zRow = screen.getByRole("rowheader", { name: "Z" }).closest("tr")
    if (!zRow) throw new Error("missing z row")
    const cells = within(zRow).getAllByRole("cell")

    expect(cells[0]).toHaveTextContent("—")
    expect(within(zRow).getAllByRole("button", { name: /league z$/ })).toHaveLength(9)
    expect(screen.getByRole("button", { name: "Show REB league z" })).toBeInTheDocument()
  })

  it("keeps the z row last after a sort", () => {
    renderMatrix(true)
    fireEvent.click(screen.getByRole("button", { name: "Sort by PTS, best first" }))
    const rows = screen.getAllByRole("row")

    expect(rows[rows.length - 1]?.querySelector("th")?.textContent).toBe("Z")
  })

  it("renders a dash instead of a button when a category has no rows", () => {
    renderMatrix(false)

    expect(screen.queryByRole("button", { name: "Show REB league z" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /league z$/ })).toHaveLength(8)
  })

  it("opens the category dialog and restores focus and overflow on escape", () => {
    document.body.style.overflow = "auto"
    renderMatrix(true)
    const reb = screen.getByRole("button", { name: "Show REB league z" })
    fireEvent.click(reb)

    expect(screen.getByRole("heading", { name: "REB" })).toBeInTheDocument()
    expect(
      Array.from(document.querySelectorAll("text")).some(
        (node) => node.textContent === "YOU · 42.1 · +1.15",
      ),
    ).toBe(true)
    expect(document.body.style.overflow).toBe("hidden")
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus()
    expect(screen.getByTestId("z-dot-0").getAttribute("data-y")).not.toBe(
      screen.getByTestId("z-dot-1").getAttribute("data-y"),
    )

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    const dotButtons = screen.getAllByRole("button", { name: /, z / })
    expect(dotButtons[dotButtons.length - 1]).toHaveFocus()
    fireEvent.keyDown(document, { key: "Tab" })
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(reb).toHaveFocus()
    expect(document.body.style.overflow).toBe("auto")
  })

  it("closes when the scrim is pressed", () => {
    renderMatrix(true)
    fireEvent.click(screen.getByRole("button", { name: "Show FG% league z" }))
    fireEvent.mouseDown(screen.getByRole("dialog"))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/LeagueRankMatrix.test.tsx`

Expected: FAIL because the Z row and dialog are absent. `getByRole("row", { name: /^Z/ })` does not find a row.

- [ ] **Step 3: Write the scale, dialog, and footer**

Create `src/components/season/CategoryZScale.tsx`:

```tsx
import type { CategoryId } from "@/lib/domain/types"
import { formatCategoryStat } from "@/lib/season/formatCategoryStat"
import {
  layoutCategoryZ,
  yForLane,
  Z_SCALE_COMPACT,
  Z_SCALE_EXPANDED,
  zFraction,
} from "@/lib/season/zScaleLayout"

export type CategoryZDot = {
  teamIndex: number
  name: string
  raw: number
  z: number
  isYou: boolean
}

type CategoryZScaleProps = {
  categoryId: CategoryId
  dots: CategoryZDot[]
  mode: "compact" | "expanded"
}

export const formatSignedZ = (z: number) => {
  const rounded = Math.round(z * 100) / 100
  if (Object.is(rounded, -0) || rounded === 0) return "0.00"
  const text = Math.abs(rounded).toFixed(2)
  return rounded > 0 ? `+${text}` : `-${text}`
}

const dotFact = (categoryId: CategoryId, dot: CategoryZDot) =>
  `${dot.name}, ${formatCategoryStat(categoryId, dot.raw)}, z ${formatSignedZ(dot.z)}`

export const CategoryZScale = ({
  categoryId,
  dots,
  mode,
}: CategoryZScaleProps) => {
  const metrics = mode === "compact" ? Z_SCALE_COMPACT : Z_SCALE_EXPANDED
  const layout = layoutCategoryZ({
    points: dots.map((dot) => ({ teamIndex: dot.teamIndex, z: dot.z })),
    plotWidth: metrics.plotWidth,
    youRadius: metrics.youRadius,
    laneGapPx: metrics.laneGapPx,
    maxLanes: metrics.maxLanes,
  })
  const placed = new Map(layout.points.map((point) => [point.teamIndex, point]))
  const xOf = (fraction: number) =>
    metrics.youRadius + fraction * (metrics.plotWidth - 2 * metrics.youRadius)
  const yOf = (lane: number) =>
    yForLane(lane, metrics.axisY, metrics.youRadius, metrics.laneGapPx)
  const bandStart = xOf(zFraction(-1, layout.extent))
  const bandEnd = xOf(zFraction(1, layout.extent))
  const zeroX = xOf(0.5)

  const marks = dots.flatMap((dot) => {
    const point = placed.get(dot.teamIndex)
    if (!point) return []
    return [{ dot, x: xOf(point.xFraction), y: yOf(point.lane), point }]
  })

  if (mode === "compact") {
    return (
      <svg
        aria-hidden="true"
        className="mx-auto block h-[22px] w-16"
        viewBox={`0 0 ${Z_SCALE_COMPACT.plotWidth} ${Z_SCALE_COMPACT.plotHeight}`}
      >
        <rect
          className="fill-sky-100"
          height="8"
          width={Math.max(bandEnd - bandStart, 0)}
          x={bandStart}
          y={metrics.axisY - 4}
        />
        <line
          className="stroke-[var(--color-mute)]"
          strokeWidth="1.5"
          x1={metrics.youRadius}
          x2={metrics.plotWidth - metrics.youRadius}
          y1={metrics.axisY}
          y2={metrics.axisY}
        />
        <line
          className="stroke-[var(--color-mute)]"
          strokeDasharray="2 2"
          x1={zeroX}
          x2={zeroX}
          y1={metrics.axisY - 6}
          y2={metrics.axisY + 6}
        />
        {marks.map(({ dot, x, y }) => (
          <circle
            className={dot.isYou ? "fill-sky-800" : "fill-[var(--color-mute)]"}
            cx={x}
            cy={y}
            key={dot.teamIndex}
            r={dot.isYou ? metrics.youRadius : Z_SCALE_COMPACT.otherRadius}
          />
        ))}
      </svg>
    )
  }

  const you = marks.find((mark) => mark.dot.isYou)
  const captionAnchor =
    !you ? "middle" : you.x / metrics.plotWidth < 0.2
      ? "start"
      : you.x / metrics.plotWidth > 0.8
        ? "end"
        : "middle"

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${Z_SCALE_EXPANDED.plotWidth} / ${Z_SCALE_EXPANDED.plotHeight}` }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${Z_SCALE_EXPANDED.plotWidth} ${Z_SCALE_EXPANDED.plotHeight}`}
      >
        <rect
          className="fill-sky-100"
          height="18"
          width={Math.max(bandEnd - bandStart, 0)}
          x={bandStart}
          y={metrics.axisY - 9}
        />
        <line
          className="stroke-[var(--color-mute)]"
          strokeWidth="2"
          x1={metrics.youRadius}
          x2={metrics.plotWidth - metrics.youRadius}
          y1={metrics.axisY}
          y2={metrics.axisY}
        />
        <line
          className="stroke-[var(--color-mute)]"
          strokeDasharray="3 3"
          x1={zeroX}
          x2={zeroX}
          y1={metrics.axisY - 14}
          y2={metrics.axisY + 14}
        />
        <text className="fill-[var(--color-mute)] text-[11px]" textAnchor="start" x={metrics.youRadius} y="112">
          worse
        </text>
        <text className="fill-[var(--color-mute)] text-[11px]" textAnchor="end" x={metrics.plotWidth - metrics.youRadius} y="112">
          better
        </text>
        <text className="fill-[var(--color-mute)] text-[11px]" textAnchor="middle" x={zeroX} y="36">
          0
        </text>
        <text className="fill-[var(--color-mute)] text-[11px]" textAnchor="middle" x={bandStart} y="112">
          −1σ
        </text>
        <text className="fill-[var(--color-mute)] text-[11px]" textAnchor="middle" x={bandEnd} y="112">
          +1σ
        </text>
        {you ? (
          <>
            <circle
              className="fill-sky-800"
              cx={you.x}
              cy={you.y}
              data-testid={`z-dot-${you.dot.teamIndex}`}
              data-y={you.y}
              r={Z_SCALE_EXPANDED.youRadius}
            />
            <text
              className="fill-sky-800 text-[12px] font-semibold"
              textAnchor={captionAnchor}
              x={you.x}
              y={Z_SCALE_EXPANDED.captionY}
            >
              {`YOU · ${formatCategoryStat(categoryId, you.dot.raw)} · ${formatSignedZ(you.dot.z)}`}
            </text>
          </>
        ) : null}
      </svg>
      {marks
        .filter((mark) => !mark.dot.isYou)
        .map(({ dot, x, y }) => {
          const fact = dotFact(categoryId, dot)
          return (
            <button
              aria-label={fact}
              className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-mute)]"
              data-testid={`z-dot-${dot.teamIndex}`}
              data-y={y}
              key={dot.teamIndex}
              style={{
                left: `${(x / metrics.plotWidth) * 100}%`,
                top: `${(y / metrics.plotHeight) * 100}%`,
                width: `${(2 * Z_SCALE_EXPANDED.otherRadius / metrics.plotWidth) * 100}%`,
                height: `${(2 * Z_SCALE_EXPANDED.otherRadius / metrics.plotHeight) * 100}%`,
              }}
              type="button"
            >
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--color-ink)] px-2 py-1 text-[10px] text-white group-hover:block group-focus:block">
                {fact}
              </span>
            </button>
          )
        })}
    </div>
  )
}
```

Create `src/components/season/CategoryZDialog.tsx`:

```tsx
"use client"

import { useEffect, useRef } from "react"
import type { CategoryId } from "@/lib/domain/types"
import {
  CategoryZScale,
  type CategoryZDot,
} from "@/components/season/CategoryZScale"

type CategoryZDialogProps = {
  categoryId: CategoryId
  label: string
  dots: CategoryZDot[]
  onClose: () => void
}

export const CategoryZDialog = ({
  categoryId,
  label,
  dots,
  onClose,
}: CategoryZDialogProps) => {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== "Tab" || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLButtonElement>("button"),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
    // Mount-only: onClose is read through onCloseRef so a parent render cannot refocus Close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      aria-labelledby="category-z-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
      role="dialog"
    >
      <div
        className="w-full max-w-3xl rounded-[2rem] bg-[var(--color-canvas)] p-7 shadow-2xl"
        ref={panelRef}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
              League z
            </p>
            <h2 className="mt-1 text-3xl font-semibold" id="category-z-title">
              {label}
            </h2>
          </div>
          <button
            className="rounded-full border border-[var(--color-hairline)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
            onClick={() => onCloseRef.current()}
            ref={closeRef}
            type="button"
          >
            Close
          </button>
        </div>
        <CategoryZScale categoryId={categoryId} dots={dots} mode="expanded" />
      </div>
    </div>
  )
}
```

In `src/components/season/LeagueRankMatrix.tsx`, add these imports beside the existing ones:

```tsx
import { useRef, useState } from "react"
import { CategoryZDialog } from "@/components/season/CategoryZDialog"
import {
  CategoryZScale,
  type CategoryZDot,
} from "@/components/season/CategoryZScale"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
```

Remove the old `import { useState } from "react"` line when adding that import. Keep `categoryLabels` for the existing sort buttons.

Inside `LeagueRankMatrix`, after the `sortDirection` state, add:

```tsx
  const [openCategoryId, setOpenCategoryId] = useState<CategoryId | null>(null)
  const triggerRefs = useRef<Partial<Record<CategoryId, HTMLButtonElement | null>>>({})
```

After `teamsByIndex`, add:

```tsx
  const dotsFor = (categoryId: CategoryId): CategoryZDot[] | null => {
    const category = analysis.byCategory.find(
      (entry) => entry.categoryId === categoryId,
    )
    if (!category || category.rows.length === 0) return null

    return category.rows.map((row) => {
      const isYou = row.teamIndex === perspectiveTeamIndex
      const team = teamsByIndex.get(row.teamIndex)

      return {
        teamIndex: row.teamIndex,
        name: isYou ? "YOU" : team?.name ?? `Team ${row.teamIndex + 1}`,
        raw: row.raw,
        z: row.z,
        isYou,
      }
    })
  }

  const handleCloseScale = () => {
    const categoryId = openCategoryId
    setOpenCategoryId(null)
    if (categoryId) triggerRefs.current[categoryId]?.focus()
  }
```

Inside `<table>`, after `</tbody>` and before `</table>`, add:

```tsx
          <tfoot>
            <tr className="border-t border-[var(--color-hairline)] bg-[var(--color-soft-cloud)]">
              <th
                className="px-4 py-3 text-left text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase"
                scope="row"
              >
                Z
              </th>
              <td className="border-r border-[var(--color-hairline)] px-1 py-2 text-center text-[var(--color-mute)]">
                —
              </td>
              {ALL_CATEGORY_IDS.map((categoryId) => {
                const dots = dotsFor(categoryId)
                if (!dots) {
                  return (
                    <td
                      className="px-1 py-2 text-center text-[var(--color-mute)]"
                      key={categoryId}
                    >
                      —
                    </td>
                  )
                }

                return (
                  <td className="px-1 py-2 text-center" key={categoryId}>
                    <button
                      aria-label={`Show ${CATEGORY_SHORT_LABELS[categoryId]} league z`}
                      className="rounded-lg px-1 py-1 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                      onClick={() => setOpenCategoryId(categoryId)}
                      ref={(node) => {
                        triggerRefs.current[categoryId] = node
                      }}
                      type="button"
                    >
                      <CategoryZScale
                        categoryId={categoryId}
                        dots={dots}
                        mode="compact"
                      />
                    </button>
                  </td>
                )
              })}
            </tr>
          </tfoot>
```

After the closing `</div>` of the `overflow-x-auto` wrapper, and still inside the `<section>`, add:

```tsx
      {openCategoryId
        ? (() => {
            const dots = dotsFor(openCategoryId)
            if (!dots) return null

            return (
              <CategoryZDialog
                categoryId={openCategoryId}
                dots={dots}
                label={CATEGORY_SHORT_LABELS[openCategoryId]}
                onClose={handleCloseScale}
              />
            )
          })()
        : null}
```

Do not change the team rows, sort buttons, heat colors, or `SeasonRosterWorkspace`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/unit/LeagueRankMatrix.test.tsx tests/unit/zScaleLayout.test.ts`

Expected: PASS. The matrix file has 5 tests and the layout file has 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/season/CategoryZScale.tsx src/components/season/CategoryZDialog.tsx src/components/season/LeagueRankMatrix.tsx tests/unit/LeagueRankMatrix.test.tsx
git commit -m "feat(roster): show category z under the rank matrix"
```
