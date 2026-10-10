import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import {
  fixtureDepthChartProvider,
  fixtureInjuryEventProvider,
} from "@/lib/injuries/providers"
import { recommendInjuryPickups } from "@/lib/injuries/recommend"
import { DEPTH_BASE, MAX_INJURY_PICKUPS } from "@/lib/injuries/constants"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import depthChart from "../../data/fixtures/nba-depth-chart.json"
import injuryEvents from "../../data/fixtures/injury-events.json"

const weakProjections: Record<CategoryId, number> = {
  FG_PCT: 0.4,
  FT_PCT: 0.6,
  TPM: 0,
  REB: 2,
  AST: 1,
  STL: 1,
  BLK: 0,
  TO: 6,
  PTS: 8,
}

const createPlayer = (id: string, name: string, teamAbbr: string): SeasonPlayer => ({
  id,
  name,
  teamAbbr,
  availability: "fa",
  projections: weakProjections,
  shooting: {
    FGM: 4,
    FGA: 10,
    FTM: 6,
    FTA: 10,
  },
})

const createMiniState = (options: {
  youOwnTrae: boolean
  nawAvailable: boolean
}): SeasonLeagueState => {
  const trae = createPlayer("trae-young", "Trae Young", "ATL")
  const naw = createPlayer(
    "nickeil-alexander-walker",
    "Nickeil Alexander-Walker",
    "ATL",
  )
  const filler = createPlayer("you-filler", "Filler Guard", "BOS")

  return {
    name: "Injury pickups mini",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: [
      {
        teamIndex: 0,
        name: "YOU",
        entries: [
          {
            slot: "PG",
            playerId: options.youOwnTrae ? trae.id : filler.id,
          },
        ],
      },
      {
        teamIndex: 1,
        name: "OPP",
        entries: [{ slot: "PG", playerId: options.youOwnTrae ? filler.id : trae.id }],
      },
    ],
    players: [trae, naw, filler],
    availablePlayerIds: options.nawAvailable ? [naw.id] : [],
    waiverOrder: [0, 1],
    source: "manual",
  }
}

const miniStateFaNaw = createMiniState({ youOwnTrae: false, nawAvailable: true })
const miniStateYouOwnTrae = createMiniState({ youOwnTrae: true, nawAvailable: true })
const miniStateNawRosteredElsewhere = createMiniState({
  youOwnTrae: false,
  nawAvailable: false,
})

describe("injury fixtures", () => {
  it("includes ATL Trae → NAW depth order and Trae OUT event", () => {
    const atl = depthChart.teams.find((team) => team.teamAbbr === "ATL")
    expect(atl?.slots[0]?.playerIds[0]).toBe("trae-young")
    expect(atl?.slots[0]?.playerIds[1]).toBe("nickeil-alexander-walker")
    expect(injuryEvents.events.some((event) => event.playerId === "trae-young" && event.status === "out")).toBe(true)
    expect(DEPTH_BASE).toBe(100)
    expect(MAX_INJURY_PICKUPS).toBe(10)
  })
})

describe("recommendInjuryPickups", () => {
  it("recommends NAW when Trae is OUT and NAW is available", () => {
    const result = recommendInjuryPickups({
      state: miniStateFaNaw,
      depth: fixtureDepthChartProvider,
      injuries: fixtureInjuryEventProvider,
    })
    expect(result.recommendations[0]?.addPlayerId).toBe("nickeil-alexander-walker")
    expect(result.recommendations[0]?.injuredPlayerId).toBe("trae-young")
    expect(result.recommendations[0]?.depthRank).toBe(1)
    expect(result.recommendations[0]?.reasons.join(" ")).toMatch(/depth/i)
  })

  it("marks urgency roster when YOU own Trae", () => {
    const result = recommendInjuryPickups({
      state: miniStateYouOwnTrae,
      depth: fixtureDepthChartProvider,
      injuries: fixtureInjuryEventProvider,
    })
    expect(result.recommendations[0]?.urgency).toBe("roster")
  })

  it("skips NAW when not available", () => {
    const result = recommendInjuryPickups({
      state: miniStateNawRosteredElsewhere,
      depth: fixtureDepthChartProvider,
      injuries: fixtureInjuryEventProvider,
    })
    expect(
      result.recommendations.every((rec) => rec.addPlayerId !== "nickeil-alexander-walker"),
    ).toBe(true)
  })
})
