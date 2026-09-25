import type {
  ClosedDayRecord,
  DayActuals,
  DayComparisonRow,
  MorningPlanSnapshot,
  MorningSummary,
} from "./morningCheck"

export type MorningCheckRecord = {
  matchupStartDate: string
  opponentTeamIndex: number
  checkedOn: string
  closedDays: ClosedDayRecord[]
  plan: MorningPlanSnapshot | null
  actualsPending: boolean
  summary?: MorningSummary
  dayComparison?: DayComparisonRow[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export const parseMorningCheck = (
  raw: string | null,
): MorningCheckRecord | null => {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (typeof parsed.matchupStartDate !== "string") return null
  if (typeof parsed.opponentTeamIndex !== "number") return null
  if (typeof parsed.checkedOn !== "string") return null
  if (!Array.isArray(parsed.closedDays)) return null
  return parsed as MorningCheckRecord
}

export const morningCheckForOpponent = (
  record: MorningCheckRecord | null,
  matchupStartDate: string,
  opponentTeamIndex: number,
): MorningCheckRecord | null => {
  if (!record) return null
  if (record.matchupStartDate !== matchupStartDate) return null
  if (record.opponentTeamIndex !== opponentTeamIndex) return null
  return record
}

export const actualsFromClosedDays = (
  closedDays: ClosedDayRecord[],
): Map<string, DayActuals> =>
  new Map(
    closedDays.map((day) => [
      day.date,
      {
        date: day.date,
        you: day.youActual,
        opp: day.oppActual,
        youPlayedIds: day.youPlayedIds,
        oppPlayedIds: day.oppPlayedIds,
        youShooting: day.youShooting,
        oppShooting: day.oppShooting,
      },
    ]),
  )
