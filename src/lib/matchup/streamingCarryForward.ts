import type { StreamingPlanDay } from "@/lib/matchup/types"

const cellAtSpot = (day: StreamingPlanDay, spotIndex: number) =>
  day.cells.find((cell) => cell.spotIndex === spotIndex)

/**
 * Player id to show in an Add cell: the day's streamer, or the prior
 * streamer still on the spot when the planner left the day empty without
 * an actual drop/replacement.
 */
export const carryForwardStreamerId = (
  days: readonly StreamingPlanDay[],
  date: string,
  spotIndex: number,
): string | null => {
  const sorted = [...days].sort((left, right) =>
    left.date.localeCompare(right.date),
  )
  const dateIndex = sorted.findIndex((day) => day.date === date)
  if (dateIndex < 0) return null

  const today = cellAtSpot(sorted[dateIndex]!, spotIndex)
  if (today?.playerId) return today.playerId

  let candidate: string | null = null
  let candidateFrom = -1
  for (let index = 0; index < dateIndex; index += 1) {
    const cell = cellAtSpot(sorted[index]!, spotIndex)
    if (!cell?.playerId) continue
    candidate = cell.playerId
    candidateFrom = index
  }
  if (!candidate) return null

  for (let index = candidateFrom + 1; index <= dateIndex; index += 1) {
    const cell = cellAtSpot(sorted[index]!, spotIndex)
    if (!cell) continue
    if (cell.droppedPlayerId === candidate) return null
    if (
      cell.playerId &&
      cell.playerId !== candidate &&
      (cell.action === "add" || cell.action === "drop_add")
    ) {
      return null
    }
  }
  return candidate
}
