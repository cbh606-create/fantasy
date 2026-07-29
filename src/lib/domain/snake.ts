import type { DraftBoard, DraftPick } from "./types"

export const teamIndexForOverall = (overall: number, teams: number): number => {
  const zeroBased = overall - 1
  const roundIndex = Math.floor(zeroBased / teams)
  const posInRound = zeroBased % teams
  if (roundIndex % 2 === 0) return posInRound
  return teams - 1 - posInRound
}

export const buildEmptyBoard = (teams: 12, rounds: number): DraftBoard => {
  const picks: DraftPick[] = []
  const total = teams * rounds
  for (let overall = 1; overall <= total; overall++) {
    const round = Math.ceil(overall / teams)
    picks.push({
      overall,
      round,
      teamIndex: teamIndexForOverall(overall, teams),
      playerId: null,
    })
  }
  return { picks, currentOverall: 1 }
}

export const isUserTurn = (board: DraftBoard, userPickSlot: number): boolean => {
  const teamIndex = userPickSlot - 1
  return teamIndexForOverall(board.currentOverall, 12) === teamIndex
}
