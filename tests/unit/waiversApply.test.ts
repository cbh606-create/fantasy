import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { buildEmptyTeamEntries } from "@/lib/season/slots"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { applyAddDrop } from "@/lib/waivers/apply"

const projections = {
  FG_PCT: 0.45,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 0.5,
  TO: 2,
  PTS: 12,
}

const createPlayer = (
  id: string,
  availability?: SeasonPlayer["availability"],
): SeasonPlayer => ({
  id,
  name: id,
  availability,
  projections,
  shooting: { FGM: 4, FGA: 10, FTM: 2, FTA: 3 },
})

const createState = (): SeasonLeagueState => ({
  name: "Waivers apply test",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: buildEmptyTeamEntries().map((entry, index) =>
        index === 0 ? { ...entry, playerId: "drop-me" } : entry,
      ),
    },
    {
      teamIndex: 1,
      name: "Opponent",
      entries: buildEmptyTeamEntries().map((entry, index) =>
        index === 0 ? { ...entry, playerId: "their-player" } : entry,
      ),
    },
  ],
  players: [
    createPlayer("drop-me"),
    createPlayer("their-player"),
    createPlayer("fa-add", "fa"),
    createPlayer("waiver-add", "waiver"),
  ],
  availablePlayerIds: ["fa-add", "waiver-add"],
  waiverOrder: [1, 0],
  source: "manual",
})

describe("applyAddDrop", () => {
  it("swaps add and drop between roster and available pool", () => {
    const result = applyAddDrop(createState(), {
      addPlayerId: "fa-add",
      dropPlayerId: "drop-me",
    })

    expect(result).not.toHaveProperty("error")

    const next = result as SeasonLeagueState
    const you = next.teams.find((team) => team.teamIndex === 0)!

    expect(you.entries.some((entry) => entry.playerId === "fa-add")).toBe(true)
    expect(you.entries.some((entry) => entry.playerId === "drop-me")).toBe(
      false,
    )
    expect(next.availablePlayerIds).toContain("drop-me")
    expect(next.availablePlayerIds).not.toContain("fa-add")
    expect(next.players.find((player) => player.id === "drop-me")?.availability).toBe(
      "fa",
    )
  })

  it("fills an empty slot when dropPlayerId is null", () => {
    const result = applyAddDrop(createState(), {
      addPlayerId: "fa-add",
      dropPlayerId: null,
    })

    expect(result).not.toHaveProperty("error")

    const next = result as SeasonLeagueState
    const you = next.teams.find((team) => team.teamIndex === 0)!

    expect(you.entries.filter((entry) => entry.playerId === "fa-add")).toHaveLength(
      1,
    )
    expect(next.availablePlayerIds).not.toContain("fa-add")
    expect(next.availablePlayerIds).toContain("waiver-add")
  })

  it("rejects add when the player is not available", () => {
    const result = applyAddDrop(createState(), {
      addPlayerId: "drop-me",
      dropPlayerId: "drop-me",
    })

    expect(result).toEqual({ error: "add_not_available" })
  })

  it("rejects drop when the player is not on YOU", () => {
    const result = applyAddDrop(createState(), {
      addPlayerId: "fa-add",
      dropPlayerId: "their-player",
    })

    expect(result).toEqual({ error: "drop_not_on_roster" })
  })

  it("rejects add with no drop when YOU has no empty slot", () => {
    const fullState: SeasonLeagueState = {
      ...createState(),
      teams: [
        {
          teamIndex: 0,
          name: "You",
          entries: buildEmptyTeamEntries().map((entry) => ({
            ...entry,
            playerId: "drop-me",
          })),
        },
        createState().teams[1]!,
      ],
    }

    const result = applyAddDrop(fullState, {
      addPlayerId: "fa-add",
      dropPlayerId: null,
    })

    expect(result).toEqual({ error: "no_empty_slot" })
  })
})
