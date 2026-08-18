import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { gamesInDaysByPlayerId } from "@/lib/matchup/games"
import { buildEmptyTeamEntries } from "@/lib/season/slots"
import type { ScheduleResponse, SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import {
  previewMatchupStream,
  recommendMatchupStream,
  resolveWindowDays,
} from "@/lib/waivers/matchupStream"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-03-09",
    endDate: "2026-03-15",
    days: [
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-15",
    ],
  },
  games: [
    { date: "2026-03-09", homeAbbr: "LAL", awayAbbr: "BOS" },
    { date: "2026-03-11", homeAbbr: "LAL", awayAbbr: "NYK" },
    { date: "2026-03-14", homeAbbr: "MIA", awayAbbr: "LAL" },
  ],
}

describe("resolveWindowDays", () => {
  it("returns full matchup days when dayCount omitted", () => {
    expect(resolveWindowDays(schedule)).toEqual(schedule.matchup.days)
  })

  it("returns prefix when dayCount is 3", () => {
    expect(resolveWindowDays(schedule, 3)).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
    ])
  })

  it("clamps dayCount to available days", () => {
    expect(resolveWindowDays(schedule, 99)).toEqual(schedule.matchup.days)
  })
})

describe("gamesInDaysByPlayerId", () => {
  it("counts distinct game dates in the window only", () => {
    const players = [
      { id: "a", teamAbbr: "LAL" },
      { id: "b", teamAbbr: "MIA" },
    ] as SeasonPlayer[]

    const full = gamesInDaysByPlayerId(players, schedule, schedule.matchup.days)
    expect(full.get("a")).toBe(3)
    expect(full.get("b")).toBe(1)

    const twoDays = gamesInDaysByPlayerId(players, schedule, [
      "2026-03-09",
      "2026-03-10",
    ])
    expect(twoDays.get("a")).toBe(1)
    expect(twoDays.get("b")).toBe(0)
  })
})

const createPlayer = (
  id: string,
  projections: Record<CategoryId, number>,
  extra?: Pick<SeasonPlayer, "availability" | "teamAbbr">,
): SeasonPlayer => ({
  id,
  name: id,
  availability: extra?.availability,
  teamAbbr: extra?.teamAbbr,
  projections,
  shooting: {
    FGM: projections.FG_PCT * 10,
    FGA: 10,
    FTM: projections.FT_PCT * 10,
    FTA: 10,
  },
})

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

const strongAstProjections: Record<CategoryId, number> = {
  FG_PCT: 0.48,
  FT_PCT: 0.7,
  TPM: 1,
  REB: 5,
  AST: 14,
  STL: 1,
  BLK: 0.5,
  TO: 3,
  PTS: 16,
}

const oppProjections: Record<CategoryId, number> = {
  FG_PCT: 0.5,
  FT_PCT: 0.75,
  TPM: 2,
  REB: 8,
  AST: 8,
  STL: 2,
  BLK: 1,
  TO: 4,
  PTS: 18,
}

const createMiniState = (emptyActiveSlot: boolean): SeasonLeagueState => {
  const youWeak = createPlayer("you-weak", weakProjections)
  const faStrong = createPlayer("fa-strong", strongAstProjections, {
    availability: "fa",
    teamAbbr: "LAL",
  })
  const oppStarter = createPlayer("opp-starter", oppProjections, {
    teamAbbr: "LAL",
  })
  const fillers = emptyActiveSlot
    ? []
    : Array.from({ length: 9 }, (_, index) =>
        createPlayer(`you-filler-${index + 1}`, weakProjections),
      )

  return {
    name: "Matchup stream mini",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: [
      {
        teamIndex: 0,
        name: "YOU",
        entries: buildEmptyTeamEntries().map((entry, index) => {
          if (index === 0) {
            return { ...entry, playerId: youWeak.id }
          }
          if (!emptyActiveSlot && index < 10) {
            return { ...entry, playerId: fillers[index - 1].id }
          }
          return entry
        }),
      },
      {
        teamIndex: 1,
        name: "OPP",
        entries: buildEmptyTeamEntries().map((entry, index) =>
          index === 0 ? { ...entry, playerId: oppStarter.id } : entry,
        ),
      },
    ],
    players: [youWeak, ...fillers, faStrong, oppStarter],
    availablePlayerIds: ["fa-strong"],
    waiverOrder: [0, 1],
    source: "manual",
  }
}

const miniState = createMiniState(false)
const miniStateWithEmptySlot = createMiniState(true)

describe("recommendMatchupStream", () => {
  it("returns matchup mode pairs with positive deltaCatWins first when opponent set", () => {
    const result = recommendMatchupStream({
      state: miniState,
      schedule,
      opponentTeamIndex: 1,
    })
    expect(result.mode).toBe("matchup")
    expect(result.pairs.length).toBeGreaterThan(0)
    expect(result.pairs[0].addPlayerId).toBe("fa-strong")
    expect(result.pairs[0].deltaCatWins).toBeGreaterThan(0)
  })

  it("uses volume mode when opponent omitted", () => {
    const result = recommendMatchupStream({ state: miniState, schedule })
    expect(result.mode).toBe("volume")
    expect(result.opponentTeamIndex).toBeNull()
  })

  it("allows add-only when YOU has an empty slot", () => {
    const result = recommendMatchupStream({
      state: miniStateWithEmptySlot,
      schedule,
      opponentTeamIndex: 1,
    })
    expect(result.pairs.some((pair) => pair.dropPlayerId === null)).toBe(true)
  })
})

describe("previewMatchupStream", () => {
  it("summarizes cat win improvement after add/drop", () => {
    const preview = previewMatchupStream({
      state: miniState,
      schedule,
      addPlayerId: "fa-strong",
      dropPlayerId: "you-weak",
      opponentTeamIndex: 1,
    })
    expect("error" in preview).toBe(false)
    if ("error" in preview) return
    expect(preview.mode).toBe("matchup")
    expect(preview.after!.projectedCatWins).toBeGreaterThan(
      preview.before!.projectedCatWins,
    )
    expect(preview.summary).toMatch(/Cats/i)
  })

  it("returns volume summary without board snapshots when opponent omitted", () => {
    const preview = previewMatchupStream({
      state: miniState,
      schedule,
      addPlayerId: "fa-strong",
      dropPlayerId: "you-weak",
    })
    expect("error" in preview).toBe(false)
    if ("error" in preview) return
    expect(preview.mode).toBe("volume")
    expect(preview.before).toBeNull()
    expect(preview.after).toBeNull()
    expect(preview.summary).toMatch(/games/i)
  })
})
