import { describe, expect, it } from "vitest"
import {
  buildYahooOverlayMeta,
  resolveSeasonPatchMode,
} from "@/lib/players/projectionOverlayCli"

describe("resolveSeasonPatchMode", () => {
  it("defaults to all leagues", () => {
    expect(resolveSeasonPatchMode({ skipSeasons: false })).toEqual({
      mode: "all",
    })
  })

  it("returns none when skipSeasons", () => {
    expect(resolveSeasonPatchMode({ skipSeasons: true })).toEqual({
      mode: "none",
    })
  })

  it("returns one id when seasonLeagueId set (even if skipSeasons false)", () => {
    expect(
      resolveSeasonPatchMode({
        skipSeasons: false,
        seasonLeagueId: "lg-1",
      }),
    ).toEqual({ mode: "one", id: "lg-1" })
  })

  it("prefers skipSeasons over seasonLeagueId", () => {
    expect(
      resolveSeasonPatchMode({
        skipSeasons: true,
        seasonLeagueId: "lg-1",
      }),
    ).toEqual({ mode: "none" })
  })
})

describe("buildYahooOverlayMeta", () => {
  it("sets yahoo overlay keys and counts", () => {
    const meta = buildYahooOverlayMeta({
      sourceFile: "yahoo.csv",
      parsed: 10,
      importedAt: "2026-08-26T00:00:00.000Z",
      report: {
        matched: [1, 2],
        unmatched: [3],
        ambiguous: [],
      },
    })
    expect(meta).toMatchObject({
      projectionOverlay: "yahoo",
      yahooImportedAt: "2026-08-26T00:00:00.000Z",
      yahooSourceFile: "yahoo.csv",
      yahooParsed: 10,
      yahooMatched: 2,
      yahooUnmatched: 1,
      yahooAmbiguous: 0,
    })
  })
})
