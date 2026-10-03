export type RankNonagonProps = {
  teamCount: number
  categories: {
    label: string
    rankBefore: number
    rankAfter: number
  }[]
}

const CENTER = 120
const OUTER_RADIUS = 78
const VERTEX_COUNT = 9
const LABEL_OFFSET = 14

export const rankRadius = (
  rank: number,
  teamCount: number,
  outerRadius: number,
) => {
  const innerRadius = outerRadius * 0.15
  if (teamCount <= 1) return outerRadius
  const step = (rank - 1) / (teamCount - 1)

  return outerRadius - step * (outerRadius - innerRadius)
}

const vertexAngle = (index: number) =>
  -Math.PI / 2 + (index * 2 * Math.PI) / VERTEX_COUNT

const vertexPoint = (radius: number, index: number) => {
  const angle = vertexAngle(index)
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  }
}

const formatRankText = (rankBefore: number, rankAfter: number) => {
  if (rankBefore !== rankAfter) {
    return `#${rankBefore} → #${rankAfter}`
  }
  return `#${rankBefore}`
}

const buildPolygonPoints = (
  categories: RankNonagonProps["categories"],
  teamCount: number,
  rankKey: "rankBefore" | "rankAfter",
) =>
  categories
    .map((category, index) => {
      const radius = rankRadius(category[rankKey], teamCount, OUTER_RADIUS)
      const { x, y } = vertexPoint(radius, index)
      return `${x},${y}`
    })
    .join(" ")

export const RankNonagon = ({ teamCount, categories }: RankNonagonProps) => {
  const beforePoints = buildPolygonPoints(categories, teamCount, "rankBefore")
  const afterPoints = buildPolygonPoints(categories, teamCount, "rankAfter")
  const labelRadius = OUTER_RADIUS + LABEL_OFFSET

  return (
    <svg viewBox="0 0 240 240">
      <polygon
        fill="none"
        points={beforePoints}
        stroke="var(--color-ink)"
      />
      <polygon
        fill="var(--color-ink)"
        fillOpacity="0.2"
        points={afterPoints}
      />
      {categories.map((category, index) => {
        const { x, y } = vertexPoint(labelRadius, index)
        const rankText = formatRankText(category.rankBefore, category.rankAfter)

        return (
          <text
            dominantBaseline="middle"
            key={category.label}
            textAnchor="middle"
            x={x}
            y={y}
          >
            <tspan dy="-0.55em" x={x}>
              {category.label}
            </tspan>
            <tspan dy="1.1em" x={x}>
              {rankText}
            </tspan>
          </text>
        )
      })}
    </svg>
  )
}
