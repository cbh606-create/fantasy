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
