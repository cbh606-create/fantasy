export type InjuryStatus = "out" | "gtd"

export type InjuryEvent = {
  playerId: string
  teamAbbr: string
  status: InjuryStatus
  note?: string
}

export type DepthChartSlot = {
  playerIds: string[]
}

export type DepthChartTeam = {
  teamAbbr: string
  slots: DepthChartSlot[]
}

export type DepthChartFixture = {
  teams: DepthChartTeam[]
}

export type InjuryEventsFixture = {
  events: InjuryEvent[]
}

export type InjuryPickupRecommendation = {
  injuredPlayerId: string
  injuredPlayerName: string
  addPlayerId: string
  addPlayerName: string
  teamAbbr: string
  status: InjuryStatus
  depthRank: number
  urgency: "roster" | "league"
  score: number
  reasons: string[]
}

export type InjuryPickupsResult = {
  events: InjuryEvent[]
  recommendations: InjuryPickupRecommendation[]
  source: { depth: "fixture"; injuries: "fixture" }
}
