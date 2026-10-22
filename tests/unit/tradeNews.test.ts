import { describe, expect, it } from "vitest"
import {
  isCompletedTrade,
  parseTradeNews,
  teamsMentionedAfter,
} from "@/lib/injuries/tradeNews"

describe("isCompletedTrade", () => {
  it("accepts a completed deal and rejects a rumor", () => {
    expect(isCompletedTrade("Traded to the Lakers", "")).toBe(true)
    expect(isCompletedTrade("Could be traded to the Lakers", "")).toBe(false)
    expect(isCompletedTrade("Trade talks continue", "He was traded last year")).toBe(false)
    expect(
      isCompletedTrade("Could see a bigger role", "Holiday was traded to the Lakers"),
    ).toBe(false)
  })
})

describe("teamsMentionedAfter", () => {
  it("reads one destination and ignores a phrase that matches two teams", () => {
    expect(teamsMentionedAfter("Traded to the Lakers", "traded to")).toEqual(["LAL"])
    expect(teamsMentionedAfter("Traded to the Los Angeles Lakers", "traded to")).toEqual(["LAL"])
    expect(teamsMentionedAfter("Traded to Los Angeles", "traded to")).toEqual([])
  })

  it("stops at the clause end so a later sentence cannot add a team", () => {
    const note = "Holiday was traded to the Lakers. Holiday was averaging 12 points"
    expect(teamsMentionedAfter(note, "traded to")).toEqual(["LAL"])
    expect(
      teamsMentionedAfter(
        "Holiday was traded to the Lakers. Sent to the Celtics",
        "traded to",
      ),
    ).toEqual(["LAL"])
  })
})

describe("parseTradeNews", () => {
  it("keeps headline, notes, position, and team code", () => {
    expect(
      parseTradeNews({
        Updates: [
          {
            DateTime: "2026-01-14T12:00:00.000Z",
            Headline: "Traded to the Lakers",
            Notes: "Boston traded him.",
            Analysis: "Ignore this.",
            Player: { Id: "rw-jrue", Position: " PG " },
            Team: { Code: "BOS" },
          },
        ],
      }),
    ).toEqual([
      {
        rotowirePlayerId: "rw-jrue",
        teamAbbr: "BOS",
        headline: "Traded to the Lakers",
        notes: "Boston traded him.",
        position: "PG",
        at: "2026-01-14T12:00:00.000Z",
      },
    ])
  })
})
