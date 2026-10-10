import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import { buildEmptyTeamEntries } from "@/lib/season/slots"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { MAX_RECOMMENDATIONS } from "@/lib/waivers/constants"
import { previewAddDrop } from "@/lib/waivers/preview"
import { youWaiverRank } from "@/lib/waivers/rank"
import { recommendPickups } from "@/lib/waivers/recommend"
import { teamNeedsAndSurplus } from "@/lib/trade/needs"

const createPlayer = (
  id: string,
  projections: Record<CategoryId, number>,
  availability?: SeasonPlayer["availability"],
): SeasonPlayer => ({
  id,
  name: id,
  availability,
  projections,
  shooting: {
    FGM: projections.FG_PCT * 10,
    FGA: 10,
    FTM: projections.FT_PCT * 10,
    FTA: 10,
  },
})

const fillerProjections: Record<CategoryId, number> = {
  FG_PCT: 0.5,
  FT_PCT: 0.75,
  TPM: 2,
  REB: 7,
  AST: 8,
  STL: 2,
  BLK: 1,
  TO: 4,
  PTS: 18,
}

const scrubProjections: Record<CategoryId, number> = {
  FG_PCT: 0.4,
  FT_PCT: 0.6,
  TPM: 0,
  REB: 2,
  AST: 1,
  STL: 4,
  BLK: 0,
  TO: 6,
  PTS: 8,
}

const specialistProjections: Record<CategoryId, number> = {
  FG_PCT: 0.48,
  FT_PCT: 0.7,
  TPM: 1,
  REB: 12,
  AST: 14,
  STL: 1,
  BLK: 0.5,
  TO: 3,
  PTS: 16,
}

const createLeagueState = (): SeasonLeagueState => {
  const scrub = createPlayer("you-scrub", scrubProjections)
  const fillerPlayers = Array.from({ length: 10 }, (_, index) =>
    createPlayer(`filler-${index + 1}`, { ...fillerProjections }),
  )
  const rosteredPlayers = [scrub, ...fillerPlayers]
  const astSpecialist = createPlayer(
    "fa-specialist",
    specialistProjections,
    "fa",
  )
  const faScrub = createPlayer("fa-scrub", scrubProjections, "fa")
  const waiverSpecialist = createPlayer(
    "waiver-specialist",
    specialistProjections,
    "waiver",
  )

  return {
    name: "Waivers recommend preview test",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: rosteredPlayers.map((player, teamIndex) => ({
      teamIndex,
      name: `Team ${teamIndex + 1}`,
      entries: buildEmptyTeamEntries().map((entry, index) =>
        index === 0 ? { ...entry, playerId: player.id } : entry,
      ),
    })),
    players: [...rosteredPlayers, astSpecialist, faScrub, waiverSpecialist],
    availablePlayerIds: ["fa-specialist", "fa-scrub", "waiver-specialist"],
    waiverOrder: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    source: "manual",
  }
}

describe("youWaiverRank", () => {
  it("returns a 1-based index in waiverOrder for YOU", () => {
    expect(youWaiverRank(createLeagueState())).toBe(2)
  })

  it("treats a missing perspective team as last priority", () => {
    const state = {
      ...createLeagueState(),
      waiverOrder: [1, 2, 3],
    }

    expect(youWaiverRank(state)).toBe(state.teams.length)
  })
})

describe("recommendPickups", () => {
  it("ranks a need-category specialist above a scrub", () => {
    const state = createLeagueState()
    const analysis = analyzeSeasonLeague(state)
    const youNeeds = teamNeedsAndSurplus(analysis, state.perspectiveTeamIndex)

    expect(youNeeds.need).toContain("AST")
    expect(youNeeds.need).toContain("REB")

    const recommendations = recommendPickups(state)
    const specialist = recommendations.find(
      (entry) => entry.playerId === "fa-specialist",
    )
    const scrub = recommendations.find((entry) => entry.playerId === "fa-scrub")

    expect(specialist).toBeDefined()
    expect(scrub).toBeDefined()
    expect(specialist!.score).toBeGreaterThan(scrub!.score)
    expect(specialist!.reasons[0]).toContain("AST")
    expect(recommendations.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS)
  })
})

describe("previewAddDrop", () => {
  it("shows improved need-category ranks after a helpful add/drop", () => {
    const preview = previewAddDrop(createLeagueState(), {
      addPlayerId: "fa-specialist",
      dropPlayerId: "you-scrub",
    })

    expect(preview).not.toHaveProperty("error")

    const result = preview as Exclude<typeof preview, { error: string }>
    const astDelta = result.categoryDeltas.find(
      (delta) => delta.categoryId === "AST",
    )
    const rebDelta = result.categoryDeltas.find(
      (delta) => delta.categoryId === "REB",
    )

    expect(result.before.needsScore).toBeLessThan(result.after.needsScore)
    expect(astDelta!.rankAfter).toBeLessThan(astDelta!.rankBefore)
    expect(rebDelta!.rankAfter).toBeLessThan(rebDelta!.rankBefore)
    expect(result.requiresAssumeSuccess).toBe(false)
  })

  it("requires assume success for waiver adds when YOU is not rank 1", () => {
    const preview = previewAddDrop(createLeagueState(), {
      addPlayerId: "waiver-specialist",
      dropPlayerId: "you-scrub",
    })

    expect(preview).not.toHaveProperty("error")
    expect(preview).toMatchObject({
      youWaiverRank: 2,
      requiresAssumeSuccess: true,
    })
  })

  it("surfaces apply errors without mutating input", () => {
    const state = createLeagueState()
    const preview = previewAddDrop(state, {
      addPlayerId: "you-scrub",
      dropPlayerId: "you-scrub",
    })

    expect(preview).toEqual({ error: "add_not_available" })
    expect(state.availablePlayerIds).toEqual(createLeagueState().availablePlayerIds)
  })
})
