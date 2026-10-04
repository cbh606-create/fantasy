import { describe, expect, it } from "vitest"
import { applyPoolProjections } from "@/lib/players/applyPoolProjections"
import {
  gameWeightForTeamDate,
  gamesInDaysByPlayerId,
} from "@/lib/matchup/games"
import { nextWeekWithGames } from "@/lib/matchup/scheduleSeason"
import { normalizeSeasonAvailability } from "@/lib/season/availability"
import { dayOpponentLabel } from "@/lib/matchup/dailyLineups"
import { buildPlayerMatchupSchedule } from "@/lib/season/schedule"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
} from "@/lib/season/types"
import season from "../../data/fixtures/nba-schedule-2026-27.json"

const projections = (): SeasonPlayer["projections"] => ({
  FG_PCT: 0.48,
  FT_PCT: 0.78,
  TPM: 80,
  REB: 300,
  AST: 250,
  STL: 60,
  BLK: 30,
  TO: 100,
  PTS: 1400,
})

const shooting = (): SeasonPlayer["shooting"] => ({
  FGM: 500,
  FGA: 1040,
  FTM: 200,
  FTA: 260,
})

const player = (
  id: string,
  teamAbbr?: string,
  name = id,
): SeasonPlayer => ({
  id,
  name,
  teamAbbr,
  positions: ["SG"],
  projections: projections(),
  shooting: shooting(),
})

const openingWeek = (): ScheduleResponse => {
  const week = nextWeekWithGames(season.games, "2026-09-24")
  if (!week) throw new Error("expected published opening week")
  return week
}

describe("same NBA team always shares the published schedule", () => {
  it("gives teammates identical opening-week game dates", () => {
    const schedule = openingWeek()
    expect(schedule.matchup.startDate).toBe("2026-10-19")
    const left = player("bos-1", "BOS")
    const right = player("bos-2", "BOS")
    const games = gamesInDaysByPlayerId(
      [left, right],
      schedule,
      schedule.matchup.days,
    )
    expect(games.get("bos-1")).toBe(games.get("bos-2"))
    expect(games.get("bos-1")).toBeGreaterThan(0)

    for (const day of schedule.matchup.days) {
      expect(gameWeightForTeamDate("BOS", day, schedule)).toBe(
        gameWeightForTeamDate("bos", day, schedule),
      )
      expect(dayOpponentLabel(left, day, schedule)).toBe(
        dayOpponentLabel(right, day, schedule),
      )
    }
  })

  it("treats ESPN short team codes as the same club as the published schedule", () => {
    const schedule: ScheduleResponse = {
      source: "season",
      matchup: {
        scoringPeriodId: 1,
        startDate: "2026-10-21",
        endDate: "2026-10-21",
        days: ["2026-10-21"],
      },
      games: [{ date: "2026-10-21", homeAbbr: "GSW", awayAbbr: "NYK" }],
    }
    const alias = player("gs-alias", "GS")
    const canonical = player("gsw-canonical", "GSW")
    const games = gamesInDaysByPlayerId(
      [alias, canonical],
      schedule,
      schedule.matchup.days,
    )
    expect(games.get("gs-alias")).toBe(1)
    expect(games.get("gsw-canonical")).toBe(1)
    expect(dayOpponentLabel(alias, "2026-10-21", schedule)).toBe("vs NYK")
    expect(dayOpponentLabel(canonical, "2026-10-21", schedule)).toBe(
      "vs NYK",
    )

    const rows = buildPlayerMatchupSchedule({
      entries: [
        { slot: "SG", playerId: "gs-alias" },
        { slot: "PG", playerId: "gsw-canonical" },
      ],
      players: [alias, canonical],
      schedule,
    })
    expect(rows[0]?.cells["2026-10-21"]).toEqual(["vs NYK"])
    expect(rows[1]?.cells["2026-10-21"]).toEqual(["vs NYK"])
  })

  it("does not rewrite a manual roster teammate onto another NBA team", () => {
    const state: SeasonLeagueState = {
      name: "Manual",
      season: 2026,
      categories: defaultCategorySettings(),
      perspectiveTeamIndex: 0,
      source: "manual",
      availablePlayerIds: [],
      waiverOrder: [0],
      teams: [
        {
          teamIndex: 0,
          name: "You",
          entries: SEASON_ROSTER_SLOTS.map((slot, index) => ({
            slot,
            playerId: index < 2 ? `bos-${index}` : null,
          })),
        },
      ],
      players: [player("bos-0", "BOS"), player("bos-1", "BOS")],
    }
    const next = normalizeSeasonAvailability(state)
    expect(next.players.find((entry) => entry.id === "bos-0")?.teamAbbr).toBe(
      "BOS",
    )
    expect(next.players.find((entry) => entry.id === "bos-1")?.teamAbbr).toBe(
      "BOS",
    )
  })

  it("fills a missing team from the projection pool so schedule can attach", () => {
    const { players } = applyPoolProjections(
      [player("3112335", undefined, "Nikola Jokic")],
      [
        {
          id: "espn-3112335",
          espnId: "3112335",
          name: "Nikola Jokic",
          teamAbbr: "DEN",
          projections: projections(),
        },
      ],
    )
    expect(players[0]?.teamAbbr).toBe("DEN")
  })
})
