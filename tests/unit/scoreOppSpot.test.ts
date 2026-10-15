import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { scoreOppSpotPlans } from "@/lib/matchup/scoreOppSpot"
import type { MatchupBoard } from "@/lib/matchup/types"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
} from "@/lib/season/types"

const projections: SeasonPlayer["projections"] = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 16,
}

const shooting = { FGM: 1, FGA: 2, FTM: 1, FTA: 1 }

const player = (
  id: string,
  teamAbbr: string,
  extras: Partial<SeasonPlayer> = {},
): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  positions: ["UTIL"],
  projectedGames: 82,
  projections,
  shooting,
  ...extras,
})

const board: MatchupBoard = {
  categories: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    you: 10,
    opp: 8,
    outcome: "W" as const,
    winProb: 0.7,
  })),
  wins: 7,
  losses: 2,
  ties: 0,
  projectedCatWins: 7,
}

describe("scoreOppSpotPlans", () => {
  it("scores 0-spot from the base roster and higher spots from streaming", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faA = player("fa-a", "BOS", {
      projections: { ...projections, STL: 40 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...projections, STL: 35 },
    })
    const oppStar = player("opp-star", "CHI")
    const oppBench = player("opp-bench", "ATL")
    const you = player("you-1", "MIA")
    const state: SeasonLeagueState = {
      name: "Test",
      season: 2025,
      categories: ALL_CATEGORY_IDS.map((id) => ({
        id,
        enabled: true,
        weight: 1,
      })),
      perspectiveTeamIndex: 0,
      teams: [
        {
          teamIndex: 0,
          name: "You",
          entries: [{ slot: "UTIL", playerId: "you-1" }],
        },
        {
          teamIndex: 1,
          name: "Opp",
          entries: [
            { slot: "UTIL", playerId: "opp-star" },
            { slot: "BE", playerId: "opp-bench" },
          ],
        },
      ],
      players: [faA, faB, oppStar, oppBench, you],
      availablePlayerIds: ["fa-a", "fa-b"],
      waiverOrder: [0, 1],
      source: "manual",
    }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: days[0]!,
        endDate: days[2]!,
        days,
      },
      games: [
        { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "WAS" },
        { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "ORL" },
        { date: "2025-11-05", homeAbbr: "CHI", awayAbbr: "DET" },
        { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "BKN" },
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "PHI" },
        { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "PHI" },
        { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "CHA" },
      ],
    }

    const scores = scoreOppSpotPlans({
      state,
      schedule,
      board,
      opponentTeamIndex: 1,
      players: state.players,
      today: "2025-11-03",
      addLimit: 3,
    })

    expect(scores.map((entry) => entry.spot)).toEqual([0, 1, 2, 3])
    const none = scores.find((entry) => entry.spot === 0)!
    const one = scores.find((entry) => entry.spot === 1)!
    expect(none.gameStarts).toBeGreaterThan(0)
    expect(one.gameStarts).toBeGreaterThanOrEqual(none.gameStarts)
  })
})
