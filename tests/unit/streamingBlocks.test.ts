import { describe, expect, it } from "vitest"
import { findStreamingBlocks } from "@/lib/matchup/streamingBlocks"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const projections = {
  FG_PCT: 0.48,
  FT_PCT: 0.78,
  TPM: 80,
  REB: 300,
  AST: 250,
  STL: 60,
  BLK: 30,
  TO: 100,
  PTS: 1400,
}
const shooting = { FGM: 500, FGA: 1040, FTM: 200, FTA: 260 }

const player = (id: string, teamAbbr: string): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  availability: "fa",
  projections,
  shooting,
})

const schedule = (
  days: string[],
  games: ScheduleResponse["games"],
): ScheduleResponse => ({
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: days[0]!,
    endDate: days[days.length - 1]!,
    days,
  },
  games,
})

describe("findStreamingBlocks", () => {
  it("labels 3-in-4 as elite", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const fa = player("fa-a", "BOS")
    const blocks = findStreamingBlocks(
      [fa],
      schedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
      ]),
    )
    const best = blocks.find(
      (b) => b.playerId === "fa-a" && b.startDate === "2025-11-03",
    )
    expect(best?.tier).toBe("elite")
    expect(best?.gamesInWindow).toBe(3)
  })

  it("labels 2-game B2B as strong", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const fa = player("fa-a", "BOS")
    const blocks = findStreamingBlocks(
      [fa],
      schedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
      ]),
    )
    expect(
      blocks.find((b) => b.startDate === "2025-11-03")?.tier,
    ).toBe("strong")
  })

  it("labels single game as thin", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const fa = player("fa-a", "BOS")
    const blocks = findStreamingBlocks(
      [fa],
      schedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      ]),
    )
    expect(
      blocks.find((b) => b.startDate === "2025-11-03")?.tier,
    ).toBe("thin")
  })

  it("keeps one block per player per startDate", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const fa = player("fa-a", "BOS")
    const blocks = findStreamingBlocks(
      [fa],
      schedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
      ]),
    )
    const forPlayer = blocks.filter((b) => b.playerId === "fa-a")
    expect(forPlayer.length).toBeGreaterThan(1)
    const starts = forPlayer.map((b) => b.startDate)
    expect(new Set(starts).size).toBe(starts.length)
  })
})
