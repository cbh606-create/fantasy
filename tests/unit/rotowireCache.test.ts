import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearInjurySelectionCache,
  loadInjurySelectionInputs,
} from "@/lib/injuries/rotowireCache"

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })

const payloads = () => ({
  injuries: {
    Updates: [
      {
        DateTime: "2026-01-14T12:00:00.000Z",
        Injury: { Status: "OUT" },
        Player: { Id: "rw-trae" },
        Team: { Code: "ATL" },
      },
    ],
  },
  depth: {
    Teams: [
      {
        Code: "ATL",
        Players: [
          { Id: "rw-trae", Position: "PG", Rank: "1" },
          { Id: "rw-naw", Position: "PG", Rank: "2" },
        ],
      },
    ],
  },
  lineups: { Games: [] },
  players: {
    FreeAgents: [],
    Teams: [
      {
        Code: "ATL",
        Players: [
          { Id: "rw-trae", FirstName: "Trae", LastName: "Young" },
          { Id: "rw-naw", FirstName: "Nickeil", LastName: "Alexander-Walker" },
        ],
      },
    ],
  },
})

const fetchOk = () => {
  const bodies = payloads()
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("get-nba-injuries")) return jsonResponse(bodies.injuries)
    if (url.includes("get-nba-depth-charts")) return jsonResponse(bodies.depth)
    if (url.includes("get-nba-lineups")) return jsonResponse(bodies.lineups)
    if (url.includes("get-nba-players")) return jsonResponse(bodies.players)
    return new Response("missing", { status: 404 })
  })
}

describe("loadInjurySelectionInputs", () => {
  afterEach(() => {
    clearInjurySelectionCache()
    vi.unstubAllEnvs()
  })

  it("returns an empty cache when the key is missing", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "")
    const fetchImpl = fetchOk()

    const inputs = await loadInjurySelectionInputs({
      now: new Date("2026-01-15T00:00:00.000Z"),
      espnPlayers: [],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(inputs.updates).toEqual([])
    expect(inputs.news).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("maps players and does not refetch injuries inside the off-day TTL", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
    const fetchImpl = fetchOk()
    const now = new Date("2026-01-15T00:00:00.000Z")
    const espnPlayers = [
      { id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" },
      { id: "espn-naw", name: "Nickeil Alexander-Walker", teamAbbr: "ATL" },
    ]

    const first = await loadInjurySelectionInputs({
      now,
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const second = await loadInjurySelectionInputs({
      now: new Date(now.getTime() + 10 * 60 * 1000),
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(first.crosswalk.get("rw-trae")).toBe("espn-trae")
    expect(first.updates[0]?.status).toBe("out")
    expect(second.depth.teams[0]?.positions[0]?.playerIds).toEqual(["rw-trae", "rw-naw"])
    const injuryCalls = fetchImpl.mock.calls.filter((call) =>
      String(call[0]).includes("get-nba-injuries"),
    )
    expect(injuryCalls).toHaveLength(1)
  })

  it("keeps the previous cache when a later refresh fails", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
    const fetchImpl = fetchOk()
    const now = new Date("2026-01-15T00:00:00.000Z")
    await loadInjurySelectionInputs({
      now,
      espnPlayers: [{ id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    fetchImpl.mockImplementation(async () => new Response("down", { status: 500 }))

    const inputs = await loadInjurySelectionInputs({
      now: new Date(now.getTime() + 31 * 60 * 1000),
      espnPlayers: [{ id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(inputs.updates[0]?.rotowirePlayerId).toBe("rw-trae")
  })

  it("uses projected game tips for refresh TTL before lineups confirm", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
    const now = new Date("2026-01-15T00:00:00.000Z")
    const tipAt = new Date(now.getTime() + 90 * 60 * 1000).toISOString()
    const bodies = payloads()
    bodies.lineups = {
      Games: [
        {
          DateTime: tipAt,
          Status: "Projected",
          Team: { Code: "ATL" },
          Starters: [],
        },
      ],
    }
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("get-nba-injuries")) return jsonResponse(bodies.injuries)
      if (url.includes("get-nba-depth-charts")) return jsonResponse(bodies.depth)
      if (url.includes("get-nba-lineups")) return jsonResponse(bodies.lineups)
      if (url.includes("get-nba-players")) return jsonResponse(bodies.players)
      return new Response("missing", { status: 404 })
    })
    const espnPlayers = [{ id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" }]

    const first = await loadInjurySelectionInputs({
      now,
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(first.lineups).toEqual([])

    await loadInjurySelectionInputs({
      now: new Date(now.getTime() + 6 * 60 * 1000),
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const lineupCalls = fetchImpl.mock.calls.filter((call) =>
      String(call[0]).includes("get-nba-lineups"),
    )
    const injuryCalls = fetchImpl.mock.calls.filter((call) =>
      String(call[0]).includes("get-nba-injuries"),
    )
    const depthCalls = fetchImpl.mock.calls.filter((call) =>
      String(call[0]).includes("get-nba-depth-charts"),
    )
    expect(lineupCalls).toHaveLength(2)
    expect(injuryCalls).toHaveLength(2)
    expect(depthCalls).toHaveLength(1)
  })

  it("treats Eastern calendar dates as game day for TTL", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
    const now = new Date("2026-01-15T19:00:00.000Z")
    const tipAt = "2026-01-16T00:00:00.000Z"
    const bodies = payloads()
    bodies.lineups = {
      Games: [
        {
          DateTime: tipAt,
          Status: "Projected",
          Team: { Code: "ATL" },
          Starters: [],
        },
      ],
    }
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("get-nba-injuries")) return jsonResponse(bodies.injuries)
      if (url.includes("get-nba-depth-charts")) return jsonResponse(bodies.depth)
      if (url.includes("get-nba-lineups")) return jsonResponse(bodies.lineups)
      if (url.includes("get-nba-players")) return jsonResponse(bodies.players)
      return new Response("missing", { status: 404 })
    })
    const espnPlayers = [{ id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" }]

    const first = await loadInjurySelectionInputs({
      now,
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(first.lineups).toEqual([])

    await loadInjurySelectionInputs({
      now: new Date(now.getTime() + 6 * 60 * 1000),
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const lineupCalls = fetchImpl.mock.calls.filter((call) =>
      String(call[0]).includes("get-nba-lineups"),
    )
    const injuryCalls = fetchImpl.mock.calls.filter((call) =>
      String(call[0]).includes("get-nba-injuries"),
    )
    const depthCalls = fetchImpl.mock.calls.filter((call) =>
      String(call[0]).includes("get-nba-depth-charts"),
    )
    expect(lineupCalls).toHaveLength(2)
    expect(injuryCalls).toHaveLength(2)
    expect(depthCalls).toHaveLength(1)
  })

  it("ignores malformed lineup DateTime values", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
    const bodies = payloads()
    bodies.lineups = {
      Games: [
        {
          DateTime: "not-a-date",
          Status: "Projected",
          Team: { Code: "ATL" },
          Starters: [],
        },
      ],
    }
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("get-nba-injuries")) return jsonResponse(bodies.injuries)
      if (url.includes("get-nba-depth-charts")) return jsonResponse(bodies.depth)
      if (url.includes("get-nba-lineups")) return jsonResponse(bodies.lineups)
      if (url.includes("get-nba-players")) return jsonResponse(bodies.players)
      return new Response("missing", { status: 404 })
    })

    const inputs = await loadInjurySelectionInputs({
      now: new Date("2026-01-15T00:00:00.000Z"),
      espnPlayers: [{ id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(inputs.updates[0]?.rotowirePlayerId).toBe("rw-trae")

    await expect(
      loadInjurySelectionInputs({
        now: new Date("2026-01-15T00:10:00.000Z"),
        espnPlayers: [{ id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" }],
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBeDefined()
  })

  it("keeps depth when only the depth refresh fails", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
    const now = new Date("2026-01-15T19:00:00.000Z")
    const tipAt = "2026-01-16T00:00:00.000Z"
    const bodies = payloads()
    bodies.lineups = {
      Games: [
        {
          DateTime: tipAt,
          Status: "Projected",
          Team: { Code: "ATL" },
          Starters: [],
        },
      ],
    }
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("get-nba-injuries")) return jsonResponse(bodies.injuries)
      if (url.includes("get-nba-depth-charts")) return jsonResponse(bodies.depth)
      if (url.includes("get-nba-lineups")) return jsonResponse(bodies.lineups)
      if (url.includes("get-nba-players")) return jsonResponse(bodies.players)
      return new Response("missing", { status: 404 })
    })
    const espnPlayers = [{ id: "espn-trae", name: "Trae Young", teamAbbr: "ATL" }]

    const first = await loadInjurySelectionInputs({
      now,
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(first.depth.teams[0]?.positions[0]?.playerIds).toEqual(["rw-trae", "rw-naw"])

    bodies.injuries = {
      Updates: [
        {
          DateTime: "2026-01-14T12:00:00.000Z",
          Injury: { Status: "GTD" },
          Player: { Id: "rw-trae" },
          Team: { Code: "ATL" },
        },
      ],
    }
    fetchImpl.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("get-nba-injuries")) return jsonResponse(bodies.injuries)
      if (url.includes("get-nba-depth-charts")) return new Response("down", { status: 500 })
      if (url.includes("get-nba-lineups")) return jsonResponse(bodies.lineups)
      if (url.includes("get-nba-players")) return jsonResponse(bodies.players)
      return new Response("missing", { status: 404 })
    })

    const second = await loadInjurySelectionInputs({
      now: new Date(now.getTime() + 61 * 60 * 1000),
      espnPlayers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(second.updates[0]?.status).toBe("gtd")
    expect(second.depth.teams[0]?.positions[0]?.playerIds).toEqual(["rw-trae", "rw-naw"])
  })

  it("parses trade news from the last 24 hours", async () => {
    vi.stubEnv("ROTOWIRE_API_KEY", "test-key")
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("get-nba-news")) {
        expect(url).toContain("hours=24")
        expect(url).toContain("with_analysis=0")
        return jsonResponse({
          Updates: [
            {
              DateTime: "2026-01-14T12:00:00.000Z",
              Headline: "Traded to the Lakers",
              Notes: "",
              Player: { Id: "rw-jrue", Position: "PG" },
              Team: { Code: "BOS" },
            },
          ],
        })
      }
      if (url.includes("get-nba-injuries")) return jsonResponse(payloads().injuries)
      if (url.includes("get-nba-depth-charts")) return jsonResponse(payloads().depth)
      if (url.includes("get-nba-lineups")) return jsonResponse(payloads().lineups)
      if (url.includes("get-nba-players")) return jsonResponse(payloads().players)
      return new Response("missing", { status: 404 })
    })

    const inputs = await loadInjurySelectionInputs({
      now: new Date("2026-01-15T00:00:00.000Z"),
      espnPlayers: [],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(inputs.news).toEqual([
      {
        rotowirePlayerId: "rw-jrue",
        teamAbbr: "BOS",
        headline: "Traded to the Lakers",
        notes: "",
        position: "PG",
        at: "2026-01-14T12:00:00.000Z",
      },
    ])
  })
})
