import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { normalizeSeasonAvailability } from "@/lib/season/availability"
import { diversifyRosterTeamAbbrs } from "@/lib/season/diversifyTeamAbbrs"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

const emptyShooting = {
  FGM: 0,
  FGA: 0,
  FTM: 0,
  FTA: 0,
}

const emptyProjections = Object.fromEntries(
  [
    "PTS",
    "REB",
    "AST",
    "STL",
    "BLK",
    "TO",
    "3PM",
    "FG_PCT",
    "FT_PCT",
  ].map((id) => [id, 0]),
) as SeasonPlayer["projections"]

const player = (
  id: string,
  teamAbbr: string,
  positions: SeasonPlayer["positions"] = ["PG"],
): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  positions,
  projections: emptyProjections,
  shooting: emptyShooting,
})

const baseState = (
  players: SeasonPlayer[],
  source: SeasonLeagueState["source"] = "manual",
): SeasonLeagueState => ({
  name: "Test",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: SEASON_ROSTER_SLOTS.map((slot, index) => ({
        slot,
        playerId: players[index]?.id ?? null,
      })),
    },
  ],
  players,
  availablePlayerIds: [],
  waiverOrder: [0],
  source,
})

describe("diversifyRosterTeamAbbrs", () => {
  it("keeps real teammate teamAbbrs so they share the NBA schedule", () => {
    const players = [
      player("a", "BOS"),
      player("b", "LAL"),
      player("c", "BOS"),
      player("d", "LAL"),
      player("e", "GS"),
      player("f", "NY"),
    ]

    const next = diversifyRosterTeamAbbrs(baseState(players))
    expect(next.players.find((p) => p.id === "a")?.teamAbbr).toBe("BOS")
    expect(next.players.find((p) => p.id === "c")?.teamAbbr).toBe("BOS")
    expect(next.players.find((p) => p.id === "e")?.teamAbbr).toBe("GSW")
    expect(next.players.find((p) => p.id === "f")?.teamAbbr).toBe("NYK")
  })

  it("does not remap espn imports", () => {
    const players = [
      player("a", "BOS"),
      player("b", "BOS"),
      ...Array.from({ length: 12 }, (_, index) =>
        player(`p${index}`, "LAL"),
      ),
    ]
    const next = diversifyRosterTeamAbbrs(baseState(players, "espn"))
    expect(next.players.find((p) => p.id === "b")?.teamAbbr).toBe("BOS")
  })
})

describe("normalizeSeasonAvailability", () => {
  it("keeps duplicate real teamAbbrs for manual leagues on load", () => {
    const state = normalizeSeasonAvailability(
      baseState([
        player("a", "BOS"),
        player("b", "LAL"),
        player("c", "BOS"),
      ]),
    )

    expect(state.players.find((p) => p.id === "a")?.teamAbbr).toBe("BOS")
    expect(state.players.find((p) => p.id === "c")?.teamAbbr).toBe("BOS")
  })
})
