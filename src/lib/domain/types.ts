export type CategoryId =
  | "FG_PCT"
  | "FT_PCT"
  | "TPM"
  | "REB"
  | "AST"
  | "STL"
  | "BLK"
  | "TO"
  | "PTS"

export type CategorySetting = {
  id: CategoryId
  enabled: boolean
  weight: number
}

export type RosterSlot = "PG" | "SG" | "SF" | "PF" | "C" | "G" | "F" | "UTIL" | "BE"

export type LeagueSettings = {
  teams: number
  draftType: "snake"
  rosterSlots: RosterSlot[]
  categories: CategorySetting[]
  userPickSlot: number
  puntCategoryIds: CategoryId[]
  focusCategoryIds: CategoryId[]
  rounds: number
}

export type Player = {
  id: string
  name: string
  positions: Array<"PG" | "SG" | "SF" | "PF" | "C">
  projections: Record<CategoryId, number>
  /** Projected (or source) games played used to scale season totals ↔ per-game. */
  projectedGames?: number
  adp: number
  adpBySource?: Partial<
    Record<
      | "yahoo_draft_analysis_rank"
      | "fantasypros_yahoo"
      | "espn_article_h2h_points",
      number
    >
  >
  espnId?: string
  teamAbbr?: string
  imageUrl?: string
  status?: "active" | "out" | "gtd"
}

export type DraftPick = {
  overall: number
  round: number
  teamIndex: number
  playerId: string | null
}

export type DraftBoard = {
  picks: DraftPick[]
  currentOverall: number
}

export type LeagueState = {
  settings: LeagueSettings
  board: DraftBoard
  players: Player[]
  source: "espn" | "manual" | "mixed"
  perspectiveTeamIndex: number
}

export type SimulationInput = {
  state: LeagueState
  simCount: number
  seed: number
  forcePickPlayerId?: string
  /** Skip per-candidate force sims; rank next picks from free-sim frequencies. */
  fastRecommendations?: boolean
}

export type NextPickRec = {
  playerId: string
  score: number
  frequency: number
}

export type CombinationPath = {
  playerIds: string[]
  score: number
  frequency: number
}

export type SimulationResult = {
  nextPicks: NextPickRec[]
  topCombinations: CombinationPath[]
  categoryOutlook: Record<CategoryId, number>
  meta: {
    simCount: number
    seed: number
    generatedAt: string
    latencyMs: number
    source: LeagueState["source"]
  }
}
