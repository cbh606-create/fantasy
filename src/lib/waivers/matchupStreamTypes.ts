export type MatchupStreamMode = "matchup" | "volume"

export type MatchupStreamPair = {
  addPlayerId: string
  dropPlayerId: string | null
  addGames: number
  dropGames: number
  score: number
  deltaCatWins?: number
  reasons: string[]
}

export type MatchupStreamPlayerSummary = {
  playerId: string
  games: number
  score: number
  reasons: string[]
}

export type MatchupStreamResult = {
  mode: MatchupStreamMode
  windowDays: string[]
  opponentTeamIndex: number | null
  pairs: MatchupStreamPair[]
  topAdds: MatchupStreamPlayerSummary[]
  topDrops: MatchupStreamPlayerSummary[]
}

export type MatchupStreamBoardSnapshot = {
  wins: number
  losses: number
  ties: number
  projectedCatWins: number
  categories: Array<{
    categoryId: string
    you: number
    opp: number
    outcome: "W" | "L" | "T"
  }>
}

export type MatchupStreamPreviewResult = {
  mode: MatchupStreamMode
  windowDays: string[]
  before: MatchupStreamBoardSnapshot | null
  after: MatchupStreamBoardSnapshot | null
  summary: string
}
