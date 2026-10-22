import { describe, expect, it } from "vitest"
import { groupPlayersByTeam } from "@/lib/waivers/groupByTeam"

describe("groupPlayersByTeam", () => {
  it("sorts teams alphabetically and leaves players without a team last", () => {
    const groups = groupPlayersByTeam([
      { name: "Zion", teamAbbr: "NOP" },
      { name: "Austin", teamAbbr: "LAL" },
      { name: "Bronny", teamAbbr: "LAL" },
      { name: "Free Agent" },
      { name: "Blank Team", teamAbbr: "  " },
    ])

    expect(groups.map((group) => group.team)).toEqual(["LAL", "NOP", "FA"])
    expect(groups[0]?.players.map((player) => player.name)).toEqual(["Austin", "Bronny"])
    expect(groups[2]?.players.map((player) => player.name)).toEqual(["Blank Team", "Free Agent"])
  })
})