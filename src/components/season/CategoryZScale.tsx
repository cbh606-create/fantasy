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
