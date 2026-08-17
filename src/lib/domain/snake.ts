import type { DraftBoard, DraftPick } from "./types"

/** Standard 12-team H2H category snake draft length. */
export const DEFAULT_DRAFT_ROUNDS = 13

export const teamIndexForOverall = (overall: number, teams: number): number => {
  const zeroBased = overall - 1
  const roundIndex = Math.floor(zeroBased / teams)
  const posInRound = zeroBased % teams
  if (roundIndex % 2 === 0) return posInRound
  return teams - 1 - posInRound
}

/** Overall pick number for a fixed team column in a snake board row. */
export const overallForTeamRound = (
  round: number,
  teamIndex: number,
  teams: number,
): number => {
  const roundIndex = round - 1
  if (roundIndex % 2 === 0) {
    return roundIndex * teams + teamIndex + 1
  }

  return roundIndex * teams + (teams - teamIndex)
}

export const buildEmptyBoard = (teams: number, rounds: number): DraftBoard => {
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

export const isUserTurn = (
  board: DraftBoard,
  perspectiveTeamIndex: number,
  teams: number,
): boolean =>
  teamIndexForOverall(board.currentOverall, teams) === perspectiveTeamIndex
