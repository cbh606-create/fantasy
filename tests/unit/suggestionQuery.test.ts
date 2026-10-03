import { describe, expect, it } from "vitest"
import { parseSuggestionQuery } from "@/lib/trade/suggestionQuery"

describe("parseSuggestionQuery", () => {
  it("previews when categories is missing or blank", () => {
    expect(parseSuggestionQuery(new URL("http://localhost/api/trade/suggestions?seasonLeagueId=1")))
      .toEqual({ mode: "preview" })
    expect(parseSuggestionQuery(new URL("http://localhost/api/trade/suggestions?seasonLeagueId=1&categories=")))
      .toEqual({ mode: "preview" })
  })

  it("rejects an unknown category and keeps the first copy of a repeat", () => {
    expect(parseSuggestionQuery(new URL("http://localhost/api/trade/suggestions?categories=DD")))
      .toEqual({ mode: "invalid" })
    expect(parseSuggestionQuery(new URL("http://localhost/api/trade/suggestions?categories=PTS,PTS,AST&excludedPlayerIds=a,,b")))
      .toEqual({
        mode: "generate",
        targetCategoryIds: ["PTS", "AST"],
        excludedPlayerIds: ["a", "b"],
      })
  })
})
