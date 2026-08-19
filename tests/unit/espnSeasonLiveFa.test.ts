import { afterEach, describe, expect, it, vi } from "vitest"
import rosterSample from "../../data/fixtures/espn-api-season-league-sample.json"
import freeAgentsSample from "../../data/fixtures/espn-api-free-agents-sample.json"
import { mapEspnLeagueToSeasonState } from "@/lib/adapters/espnSeasonMap"
import { fetchEspnSeasonLeague } from "@/lib/adapters/espnSeasonLive"

const jsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  })

const params = {
  leagueId: "120853513",
  season: 2026,
  teamId: 9,
  cookies: { espnS2: "test-s2", swid: "{TEST-SWID}" },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("fetchEspnSeasonLeague free agents", () => {
  it("fetches kona player info and merges available players", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(rosterSample))
      .mockResolvedValueOnce(jsonResponse(freeAgentsSample))
    vi.stubGlobal("fetch", fetchMock)

    const state = await fetchEspnSeasonLeague(params)

    expect(state.availablePlayerIds).toEqual(["9001", "9002"])
    expect(state.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "9001", availability: "fa" }),
        expect.objectContaining({ id: "9002", availability: "waiver" }),
      ]),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [faUrl, faInit] = fetchMock.mock.calls[1] as [URL, RequestInit]
    expect(faUrl.searchParams.getAll("view")).toEqual(["kona_player_info"])
    expect(faInit.headers).toMatchObject({
      Cookie: "espn_s2=test-s2; SWID={TEST-SWID}",
      "X-Fantasy-Filter": JSON.stringify({
        players: {
          filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
          limit: 200,
          sortPercOwned: { sortPriority: 1, sortAsc: false },
        },
      }),
    })
  })

  it("derives available players from ownership when FA fetch fails", async () => {
    const rosterState = mapEspnLeagueToSeasonState(rosterSample, params)
    rosterState.players.push({
      id: "9003",
      name: "Ownership Free Agent",
      projections: {
        FG_PCT: 0,
        FT_PCT: 0,
        TPM: 0,
        REB: 0,
        AST: 0,
        STL: 0,
        BLK: 0,
        TO: 0,
        PTS: 0,
      },
    })
    vi.spyOn(
      await import("@/lib/adapters/espnSeasonMap"),
      "mapEspnLeagueToSeasonState",
    )
      .mockReturnValueOnce(rosterState)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(rosterSample))
      .mockRejectedValueOnce(new Error("FA unavailable"))
    vi.stubGlobal("fetch", fetchMock)

    const state = await fetchEspnSeasonLeague(params)

    expect(state.players.map((player) => player.id)).toEqual([
      "101",
      "201",
      "202",
      "203",
      "9003",
    ])
    expect(state.availablePlayerIds).toEqual(["9003"])
    expect(state.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "9003", availability: "fa" }),
      ]),
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("FA unavailable"),
    )
  })
})
