import {
  emptyCategoryTotals,
  type DayActuals,
  type DayShootingTotals,
} from "@/lib/matchup/morningCheck"

export type EspnBoxEntry = {
  playerPoolEntry?: {
    player?: {
      id?: number
      stats?: Array<{ stats?: Record<string, number> }>
    }
  }
}

export type EspnDayBoxPayload = {
  schedule?: Array<{
    matchupPeriodId?: number
    home?: { teamId?: number; rosterForCurrentScoringPeriod?: { entries?: EspnBoxEntry[] } }
    away?: { teamId?: number; rosterForCurrentScoringPeriod?: { entries?: EspnBoxEntry[] } }
  }>
}

const STAT = {
  PTS: "0",
  BLK: "1",
  STL: "2",
  AST: "3",
  REB: "6",
  TO: "11",
  FGM: "13",
  FGA: "14",
  FTM: "15",
  FTA: "16",
  TPM: "17",
} as const

const readStat = (row: Record<string, number> | undefined, key: string): number =>
  row?.[key] ?? 0

const playerPlayed = (row: Record<string, number> | undefined): boolean => {
  const pts = readStat(row, STAT.PTS)
  const reb = readStat(row, STAT.REB)
  const ast = readStat(row, STAT.AST)
  const tpm = readStat(row, STAT.TPM)
  const fga = readStat(row, STAT.FGA)
  return pts > 0 || reb > 0 || ast > 0 || tpm > 0 || fga > 0
}

const sumRosterEntries = (
  entries: EspnBoxEntry[] | undefined,
): { totals: ReturnType<typeof emptyCategoryTotals>; shooting: DayShootingTotals; playedIds: string[] } => {
  const totals = emptyCategoryTotals()
  const shooting: DayShootingTotals = { FGM: 0, FGA: 0, FTM: 0, FTA: 0 }
  const playedIds: string[] = []

  for (const entry of entries ?? []) {
    const player = entry.playerPoolEntry?.player
    if (player?.id == null) continue
    const statRow = player.stats?.[0]?.stats
    if (!statRow) continue

    totals.PTS += readStat(statRow, STAT.PTS)
    totals.BLK += readStat(statRow, STAT.BLK)
    totals.STL += readStat(statRow, STAT.STL)
    totals.AST += readStat(statRow, STAT.AST)
    totals.REB += readStat(statRow, STAT.REB)
    totals.TO += readStat(statRow, STAT.TO)
    totals.TPM += readStat(statRow, STAT.TPM)

    shooting.FGM += readStat(statRow, STAT.FGM)
    shooting.FGA += readStat(statRow, STAT.FGA)
    shooting.FTM += readStat(statRow, STAT.FTM)
    shooting.FTA += readStat(statRow, STAT.FTA)

    if (playerPlayed(statRow)) {
      playedIds.push(String(player.id))
    }
  }

  totals.FG_PCT = shooting.FGA > 0 ? shooting.FGM / shooting.FGA : 0
  totals.FT_PCT = shooting.FTA > 0 ? shooting.FTM / shooting.FTA : 0

  return { totals, shooting, playedIds }
}

type ScheduleSide = {
  teamId?: number
  rosterForCurrentScoringPeriod?: { entries?: EspnBoxEntry[] }
}

const findMatchupSides = (
  schedule: EspnDayBoxPayload["schedule"],
  youTeamId: number,
  oppTeamId: number,
): { youSide: ScheduleSide | undefined; oppSide: ScheduleSide | undefined } => {
  for (const matchup of schedule ?? []) {
    const homeId = matchup.home?.teamId
    const awayId = matchup.away?.teamId

    if (homeId === youTeamId) {
      const oppSide = awayId === oppTeamId ? matchup.away : undefined
      return { youSide: matchup.home, oppSide }
    }
    if (awayId === youTeamId) {
      const oppSide = homeId === oppTeamId ? matchup.home : undefined
      return { youSide: matchup.away, oppSide }
    }
  }
  return { youSide: undefined, oppSide: undefined }
}

export const mapEspnDayBoxScore = (input: {
  payload: EspnDayBoxPayload
  date: string
  youTeamId: number
  oppTeamId: number
}): DayActuals | null => {
  const { payload, date, youTeamId, oppTeamId } = input
  const { youSide, oppSide } = findMatchupSides(payload.schedule, youTeamId, oppTeamId)

  if (!youSide) {
    return null
  }

  const youEntries = youSide.rosterForCurrentScoringPeriod?.entries
  const oppEntries = oppSide?.rosterForCurrentScoringPeriod?.entries

  const you = sumRosterEntries(youEntries)
  const opp = sumRosterEntries(oppEntries)

  return {
    date,
    you: you.totals,
    opp: opp.totals,
    youPlayedIds: you.playedIds,
    oppPlayedIds: opp.playedIds,
    youShooting: you.shooting,
    oppShooting: opp.shooting,
  }
}
