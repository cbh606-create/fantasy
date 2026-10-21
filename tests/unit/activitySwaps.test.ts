import { describe, expect, it } from "vitest"
import {
  activityIsoDate,
  swapsFromTransactions,
} from "@/lib/matchup/activitySwaps"
import { resolveCurrentScoringPeriod } from "@/lib/espn/dayBoxScore"

const periodDates = new Map<number, string>([
  [1, "2026-10-20"],
  [2, "2026-10-21"],
])

const waglerProposedDate = 1792535990866

describe("activityIsoDate", () => {
  it("uses the local clock ESPN prints on recent activity", () => {
    expect(activityIsoDate(waglerProposedDate, "Asia/Seoul")).toBe("2026-10-21")
  })
})

describe("swapsFromTransactions", () => {
  it("dates an executed add and drop by the activity clock, not the scoring period", () => {
    const swaps = swapsFromTransactions(
      [
        {
          id: "wagler",
          type: "FREEAGENT",
          status: "EXECUTED",
          scoringPeriodId: 1,
          proposedDate: waglerProposedDate,
          items: [
            { type: "ADD", playerId: 5254165, fromTeamId: 0, toTeamId: 9 },
            { type: "DROP", playerId: 4592479, fromTeamId: 9, toTeamId: 0 },
          ],
        },
        {
          id: "wagler",
          type: "FREEAGENT",
          status: "EXECUTED",
          scoringPeriodId: 1,
          proposedDate: waglerProposedDate,
          items: [
            { type: "ADD", playerId: 5254165, fromTeamId: 0, toTeamId: 9 },
            { type: "DROP", playerId: 4592479, fromTeamId: 9, toTeamId: 0 },
          ],
        },
      ],
      9,
      periodDates,
      "2026-10-21",
    )

    expect(swaps).toEqual([
      {
        date: "2026-10-21",
        spotIndex: 0,
        addedPlayerId: "5254165",
        drop: "4592479",
      },
    ])
  })

  it("ignores other teams, canceled moves, and a later calendar day", () => {
    const swaps = swapsFromTransactions(
      [
        {
          type: "FREEAGENT",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [
            { type: "ADD", playerId: 1, fromTeamId: 0, toTeamId: 4 },
            { type: "DROP", playerId: 2, fromTeamId: 4, toTeamId: 0 },
          ],
        },
        {
          type: "WAIVER",
          status: "CANCELED",
          scoringPeriodId: 1,
          items: [
            { type: "ADD", playerId: 3, fromTeamId: 0, toTeamId: 9 },
            { type: "DROP", playerId: 4, fromTeamId: 9, toTeamId: 0 },
          ],
        },
        {
          type: "FREEAGENT",
          status: "EXECUTED",
          scoringPeriodId: 2,
          proposedDate: Date.parse("2026-10-22T00:00:00+09:00"),
          items: [
            { type: "ADD", playerId: 5, fromTeamId: 0, toTeamId: 9 },
          ],
        },
      ],
      9,
      periodDates,
      "2026-10-21",
    )

    expect(swaps).toEqual([])
  })

  it("keeps an executed move that already happened today", () => {
    const swaps = swapsFromTransactions(
      [
        {
          type: "FREEAGENT",
          status: "EXECUTED",
          scoringPeriodId: 1,
          proposedDate: waglerProposedDate,
          items: [
            { type: "ADD", playerId: 5, fromTeamId: 0, toTeamId: 9 },
            { type: "DROP", playerId: 6, fromTeamId: 9, toTeamId: 0 },
          ],
        },
      ],
      9,
      periodDates,
      "2026-10-21",
    )

    expect(swaps).toEqual([
      {
        date: "2026-10-21",
        spotIndex: 0,
        addedPlayerId: "5",
        drop: "6",
      },
    ])
  })

  it("keeps a later move on the same day as the next spot", () => {
    const swaps = swapsFromTransactions(
      [
        {
          type: "FREEAGENT",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [{ type: "ADD", playerId: 11, fromTeamId: 0, toTeamId: 9 }],
        },
        {
          type: "FREEAGENT",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [{ type: "DROP", playerId: 12, fromTeamId: 9, toTeamId: 0 }],
        },
      ],
      9,
      periodDates,
      "2026-10-21",
    )

    expect(swaps.map((swap) => [swap.spotIndex, swap.addedPlayerId, swap.drop])).toEqual([
      [0, "11", "open_slot"],
      [1, null, "12"],
    ])
  })
})

describe("resolveCurrentScoringPeriod", () => {
  it("uses the transaction day when ESPN omits currentScoringPeriod", () => {
    expect(
      resolveCurrentScoringPeriod({
        latestScoringPeriod: 1,
        transactionScoringPeriod: 2,
        currentMatchupPeriod: 1,
      }),
    ).toBe(2)
  })
})
