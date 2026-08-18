import { describe, expect, it } from "vitest"
import depthChart from "../../data/fixtures/nba-depth-chart.json"
import injuryEvents from "../../data/fixtures/injury-events.json"
import { DEPTH_BASE, MAX_INJURY_PICKUPS } from "@/lib/injuries/constants"

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
