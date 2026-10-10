import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import type { MatchupBoard } from "@/lib/matchup/types"
import {
  addOverrideCandidates,
  categoryTotalDeltas,
  playersLockedOnDate,
} from "@/lib/matchup/streamingAddOverride"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const player = (id: string, teamAbbr: string): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  availability: "fa",
  positions: ["PG"],
  projections: {
    FG_PCT: 0.48,
    FT_PCT: 0.78,
    TPM: 1,
    REB: 1,
    AST: 1,
    STL: 1,
    BLK: 1,
    TO: 1,
    PTS: 1,
  },
  shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 2 },
})

const schedule = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-10-19",
    endDate: "2026-10-21",
    days: ["2026-10-19", "2026-10-20", "2026-10-21"],
  },
  games: [
    { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2026-10-20", homeAbbr: "DET", awayAbbr: "PHI" },
  ],
} satisfies ScheduleResponse

const board = (
  youPts: number,
  youReb: number,
): MatchupBoard => ({
  wins: 1,
  losses: 0,
  ties: 0,
  projectedCatWins: 1,
  categories: [
    {
      categoryId: "PTS" as CategoryId,
      you: youPts,
      opp: 10,
      outcome: "W",
      winProb: 0.6,
    },
    {
      categoryId: "REB" as CategoryId,
      you: youReb,
      opp: 10,
      outcome: "T",
      winProb: 0.5,
    },
  ],
})

describe("streaming add override helpers", () => {
  it("keeps a locked player on every date inside the hold", () => {
    const locks = [
      {
        date: "2026-10-19",
        spotIndex: 0,
        playerId: "wire-a",
        holdUntil: "2026-10-21",
      },
    ]
    expect(playersLockedOnDate(locks, "2026-10-20").has("wire-a")).toBe(true)
    expect(playersLockedOnDate(locks, "2026-10-22").has("wire-a")).toBe(false)
  })

  it("searches free agents with a game that day, skipping players already locked", () => {
    const bos = player("wire-bos", "BOS")
    const det = player("wire-det", "DET")
    const idle = player("wire-idle", "SAC")
    const found = addOverrideCandidates({
      players: [bos, det, idle],
      availableIds: new Set(["wire-bos", "wire-det", "wire-idle"]),
      date: "2026-10-20",
      schedule,
      locks: [
        {
          date: "2026-10-19",
          spotIndex: 1,
          playerId: "wire-bos",
          holdUntil: "2026-10-20",
        },
      ],
      query: "det",
    })
    expect(found.map((item) => item.id)).toEqual(["wire-det"])
  })

  it("returns only categories whose you total changed", () => {
    expect(categoryTotalDeltas(board(12, 10), board(10, 10))).toEqual({
      PTS: 2,
    })
  })
})
