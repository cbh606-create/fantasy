import type { PastActualSwap } from "@/lib/matchup/pastActualSwaps"

export type ActivityTransactionItem = {
  type?: string
  playerId?: number
  fromTeamId?: number
  toTeamId?: number
}

/** ESPN recent activity prints `proposedDate` in the viewer's local clock. */
export const ACTIVITY_TIME_ZONE = "Asia/Seoul"

export type ActivityTransaction = {
  id?: string
  status?: string
  type?: string
  scoringPeriodId?: number
  proposedDate?: number
  items?: ActivityTransactionItem[]
}

export const activityIsoDate = (
  proposedDateMs: number,
  timeZone = ACTIVITY_TIME_ZONE,
): string | null => {
  if (!Number.isFinite(proposedDateMs)) return null
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(proposedDateMs))
  const values = Object.fromEntries(
    parts.flatMap((part) =>
      part.type === "year" || part.type === "month" || part.type === "day"
        ? [[part.type, part.value] as const]
        : [],
    ),
  )
  if (!values.year || !values.month || !values.day) return null
  return `${values.year}-${values.month}-${values.day}`
}

const transactionDate = (
  transaction: ActivityTransaction,
  periodDates: ReadonlyMap<number, string>,
  timeZone: string,
): string | null => {
  if (typeof transaction.proposedDate === "number") {
    return activityIsoDate(transaction.proposedDate, timeZone)
  }
  if (typeof transaction.scoringPeriodId !== "number") return null
  return periodDates.get(transaction.scoringPeriodId) ?? null
}

const isExecutedAddDrop = (transaction: ActivityTransaction): boolean => {
  if ((transaction.status ?? "").toUpperCase() !== "EXECUTED") return false
  const kind = (transaction.type ?? "").toUpperCase()
  return kind === "FREEAGENT" || kind === "WAIVER"
}

/**
 * One ESPN recent-activity transaction is one move: an ADD onto the team,
 * a DROP off the team, or both. Later transactions on the same day take
 * the next spot.
 */
export const swapsFromTransactions = (
  transactions: readonly ActivityTransaction[],
  teamId: number,
  periodDates: ReadonlyMap<number, string>,
  today: string,
  timeZone = ACTIVITY_TIME_ZONE,
): PastActualSwap[] => {
  const swaps: PastActualSwap[] = []
  const spotByDate = new Map<string, number>()
  const seenIds = new Set<string>()

  for (const transaction of transactions) {
    if (transaction.id) {
      if (seenIds.has(transaction.id)) continue
      seenIds.add(transaction.id)
    }
    if (!isExecutedAddDrop(transaction)) continue
    const date = transactionDate(transaction, periodDates, timeZone)
    if (!date || date > today) continue

    const items = transaction.items ?? []
    const adds = items.filter(
      (item) =>
        (item.type ?? "").toUpperCase() === "ADD" &&
        item.toTeamId === teamId &&
        typeof item.playerId === "number",
    )
    const drops = items.filter(
      (item) =>
        (item.type ?? "").toUpperCase() === "DROP" &&
        item.fromTeamId === teamId &&
        typeof item.playerId === "number",
    )
    const count = Math.max(adds.length, drops.length)
    if (count === 0) continue

    for (let index = 0; index < count; index += 1) {
      const spotIndex = spotByDate.get(date) ?? 0
      spotByDate.set(date, spotIndex + 1)
      const added = adds[index]
      const dropped = drops[index]
      swaps.push({
        date,
        spotIndex,
        addedPlayerId: added ? String(added.playerId) : null,
        drop: dropped ? String(dropped.playerId) : "open_slot",
      })
    }
  }

  return swaps
}
