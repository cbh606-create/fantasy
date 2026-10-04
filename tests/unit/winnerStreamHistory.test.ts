import { afterEach, describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-winner-stream-sample.json"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import {
  loadWinnerStreamRecipes,
  mapEspnWinnerStreamPayload,
  resetWinnerStreamHistoryCache,
} from "@/lib/espn/winnerStreamHistory"
import type { SeasonPlayer } from "@/lib/season/types"

const stlGuard: SeasonPlayer = {
  id: "501",
  name: "Steal Guard",
  positions: ["PG"],
  projections: {
    FG_PCT: 0.45,
    FT_PCT: 0.8,
    TPM: 10,
    REB: 10,
    AST: 10,
    STL: 200,
    BLK: 10,
    TO: 10,
    PTS: 80,
  },
  shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
}

const jsonResponse = (body: unknown, ok = true): Response =>
  new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { "content-type": "application/json" },
  })

describe("mapEspnWinnerStreamPayload", () => {
  it("builds STL recipes from winners and ignores losers, trades, and the current week", () => {
    const recipes = mapEspnWinnerStreamPayload(
      fixture,
      [stlGuard],
      ALL_CATEGORY_IDS,
    )

    expect(recipes).toContainEqual(
      expect.objectContaining({
        situationCat: "STL",
        addKind: "STL",
        addGroup: "G",
        count: 2,
      }),
    )
    expect(recipes).toHaveLength(1)
  })

  it("returns no recipes for empty or unusable payloads", () => {
    expect(
      mapEspnWinnerStreamPayload({}, [stlGuard], ALL_CATEGORY_IDS),
    ).toEqual([])
  })
})

describe("loadWinnerStreamRecipes", () => {
  afterEach(() => {
    resetWinnerStreamHistoryCache()
  })

  it("fetches mTransactions2 with scoringPeriodId, not bare mTransactions", async () => {
    const urls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes("view=mSettings") || url.includes("mSettings")) {
        return jsonResponse({
          status: { currentMatchupPeriod: 3, currentScoringPeriod: 21 },
          settings: fixture.settings,
        })
      }
      if (url.includes("mTransactions2")) {
        return jsonResponse({ transactions: fixture.transactions })
      }
      if (url.includes("mScoreboard") || url.includes("mMatchupScore")) {
        return jsonResponse({ schedule: fixture.schedule })
      }
      return jsonResponse({ transactions: [] })
    }

    const recipes = await loadWinnerStreamRecipes({
      leagueId: "120853513",
      season: 2026,
      cookies: { espnS2: "s2", swid: "{abc}" },
      players: [stlGuard],
      enabledCats: ALL_CATEGORY_IDS,
      fetchImpl,
    })

    expect(urls.some((url) => /view=mTransactions(?!2)/.test(url))).toBe(false)
    expect(
      urls.some(
        (url) =>
          url.includes("mTransactions2") && url.includes("scoringPeriodId="),
      ),
    ).toBe(true)
    expect(recipes).toContainEqual(
      expect.objectContaining({
        situationCat: "STL",
        addKind: "STL",
        addGroup: "G",
      }),
    )
  })

  it("skips ESPN when there is no completed matchup period", async () => {
    const urls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input))
      return jsonResponse({
        status: { currentMatchupPeriod: 1, currentScoringPeriod: 1 },
        settings: { scheduleSettings: { matchupPeriods: { "1": [1] } } },
      })
    }

    const recipes = await loadWinnerStreamRecipes({
      leagueId: "120853513",
      season: 2026,
      cookies: { espnS2: "s2", swid: "{abc}" },
      players: [stlGuard],
      enabledCats: ALL_CATEGORY_IDS,
      fetchImpl,
    })

    expect(recipes).toEqual([])
    expect(urls.some((url) => url.includes("mTransactions2"))).toBe(false)
    expect(urls.some((url) => url.includes("mScoreboard"))).toBe(false)
  })
})
