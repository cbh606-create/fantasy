import { describe, expect, it } from "vitest"
import {
  selectInjuryReplacements,
  type InjurySelectionInputs,
} from "@/lib/injuries/selection"

const now = new Date("2026-01-15T00:00:00.000Z")

const baseInputs = (): InjurySelectionInputs => ({
  now,
  availablePlayerIds: ["espn-naw"],
  crosswalk: new Map([
    ["rw-trae", "espn-trae"],
    ["rw-naw", "espn-naw"],
    ["rw-bufkin", "espn-bufkin"],
  ]),
  updates: [
    {
      rotowirePlayerId: "rw-trae",
      teamAbbr: "ATL",
      status: "out",
      at: "2026-01-14T12:00:00.000Z",
    },
  ],
  depth: {
    teams: [
      {
        teamAbbr: "ATL",
        positions: [
          { position: "PG", playerIds: ["rw-trae", "rw-naw", "rw-bufkin"] },
        ],
      },
    ],
  },
  lineups: [],
  news: [],
})

describe("selectInjuryReplacements", () => {
  it("picks the confirmed new starter when exactly one matches the position", () => {
    const inputs = baseInputs()
    inputs.lineups = [
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [{ playerId: "rw-naw", position: "PG" }],
      },
    ]

    expect(selectInjuryReplacements(inputs)).toEqual([
      {
        injuredPlayerId: "espn-trae",
        status: "out",
        addPlayerId: "espn-naw",
        source: "lineup",
      },
    ])
  })

  it("walks the depth chart when that starter is not available", () => {
    const inputs = baseInputs()
    inputs.availablePlayerIds = ["espn-bufkin"]
    inputs.lineups = [
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [{ playerId: "rw-naw", position: "PG" }],
      },
    ]

    expect(selectInjuryReplacements(inputs)).toEqual([
      {
        injuredPlayerId: "espn-trae",
        status: "out",
        addPlayerId: "espn-bufkin",
        source: "depth",
      },
    ])
  })

  it("uses the depth chart when no confirmed lineup is passed in", () => {
    expect(selectInjuryReplacements(baseInputs())).toEqual([
      {
        injuredPlayerId: "espn-trae",
        status: "out",
        addPlayerId: "espn-naw",
        source: "depth",
      },
    ])
  })

  it("uses the depth chart when the injured player is still starting", () => {
    const inputs = baseInputs()
    inputs.lineups = [
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [
          { playerId: "rw-trae", position: "PG" },
          { playerId: "rw-naw", position: "PG" },
        ],
      },
    ]

    expect(selectInjuryReplacements(inputs)[0]?.source).toBe("depth")
  })

  it("uses the depth chart when two confirmed starters match the position", () => {
    const inputs = baseInputs()
    inputs.availablePlayerIds = ["espn-naw", "espn-bufkin"]
    inputs.lineups = [
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [
          { playerId: "rw-naw", position: "PG" },
          { playerId: "rw-bufkin", position: "PG" },
        ],
      },
    ]

    expect(selectInjuryReplacements(inputs)[0]).toMatchObject({
      addPlayerId: "espn-naw",
      source: "depth",
    })
  })

  it("keeps OUT when a later OUT follows GTD inside 24 hours", () => {
    const inputs = baseInputs()
    inputs.updates = [
      {
        rotowirePlayerId: "rw-trae",
        teamAbbr: "ATL",
        status: "gtd",
        at: "2026-01-14T10:00:00.000Z",
      },
      {
        rotowirePlayerId: "rw-trae",
        teamAbbr: "ATL",
        status: "out",
        at: "2026-01-14T18:00:00.000Z",
      },
    ]

    expect(selectInjuryReplacements(inputs)[0]?.status).toBe("out")
  })

  it("drops an update older than 24 hours", () => {
    const inputs = baseInputs()
    inputs.updates[0]!.at = "2026-01-13T00:00:00.000Z"

    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("drops a player whose latest status is neither OUT nor GTD", () => {
    const inputs = baseInputs()
    inputs.updates.push({
      rotowirePlayerId: "rw-trae",
      teamAbbr: "ATL",
      status: "other",
      at: "2026-01-14T20:00:00.000Z",
    })

    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("skips an injured player who is not on a depth-chart position list", () => {
    const inputs = baseInputs()
    inputs.depth = { teams: [] }

    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("skips an unmapped injured player", () => {
    const inputs = baseInputs()
    inputs.crosswalk = new Map([["rw-naw", "espn-naw"]])

    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("emits two rows when two injuries select the same available player", () => {
    const inputs = baseInputs()
    inputs.crosswalk = new Map([
      ["rw-trae", "espn-trae"],
      ["rw-dyson", "espn-dyson"],
      ["rw-naw", "espn-naw"],
    ])
    inputs.depth = {
      teams: [
        {
          teamAbbr: "ATL",
          positions: [
            { position: "PG", playerIds: ["rw-trae", "rw-naw"] },
            { position: "SG", playerIds: ["rw-dyson", "rw-naw"] },
          ],
        },
      ],
    }
    inputs.updates.push({
      rotowirePlayerId: "rw-dyson",
      teamAbbr: "ATL",
      status: "gtd",
      at: "2026-01-14T16:00:00.000Z",
    })

    const rows = selectInjuryReplacements(inputs)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.addPlayerId)).toEqual(["espn-naw", "espn-naw"])
  })
})

describe("selectInjuryReplacements trades", () => {
  const traded = (): InjurySelectionInputs => {
    const inputs = baseInputs()
    inputs.updates = []
    inputs.depth = {
      teams: [
        {
          teamAbbr: "BOS",
          positions: [{ position: "PG", playerIds: ["rw-jrue", "rw-white", "rw-pritchard"] }],
        },
      ],
    }
    inputs.crosswalk = new Map([
      ["rw-jrue", "espn-jrue"],
      ["rw-white", "espn-white"],
      ["rw-pritchard", "espn-pritchard"],
    ])
    inputs.availablePlayerIds = ["espn-white"]
    inputs.news = [
      {
        rotowirePlayerId: "rw-jrue",
        teamAbbr: "BOS",
        headline: "Traded to the Lakers",
        notes: "",
        position: "PG",
        at: "2026-01-14T12:00:00.000Z",
      },
    ]
    return inputs
  }

  it("picks the next available player on the team he left", () => {
    expect(selectInjuryReplacements(traded())).toEqual([
      {
        injuredPlayerId: "espn-jrue",
        status: "traded",
        addPlayerId: "espn-white",
        source: "depth",
      },
    ])
  })

  it("picks rank 1 when he is already off the chart", () => {
    const inputs = traded()
    inputs.depth.teams[0]!.positions[0]!.playerIds = ["rw-white", "rw-pritchard"]
    expect(selectInjuryReplacements(inputs)[0]).toMatchObject({
      addPlayerId: "espn-white",
      source: "depth",
      status: "traded",
    })
  })

  it("skips a combined position once he is off the chart", () => {
    const inputs = traded()
    inputs.depth.teams[0]!.positions[0]!.playerIds = ["rw-white"]
    inputs.news[0]!.position = "G/F"
    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("skips a rumor and an item older than 24 hours", () => {
    const rumor = traded()
    rumor.news[0]!.headline = "Could be traded to the Lakers"
    expect(selectInjuryReplacements(rumor)).toEqual([])

    const stale = traded()
    stale.news[0]!.at = "2026-01-13T00:00:00.000Z"
    expect(selectInjuryReplacements(stale)).toEqual([])
  })

  it("lets the latest rumor erase an earlier completed trade", () => {
    const inputs = traded()
    inputs.news.push({
      ...inputs.news[0]!,
      headline: "Trade talks continue",
      at: "2026-01-14T18:00:00.000Z",
    })
    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("keeps an OUT row that has no return date beside a trade row", () => {
    const inputs = traded()
    inputs.updates = [
      {
        rotowirePlayerId: "rw-white",
        teamAbbr: "BOS",
        status: "out",
        at: "2026-01-14T12:00:00.000Z",
      },
    ]
    inputs.crosswalk.set("rw-pritchard", "espn-pritchard")
    inputs.availablePlayerIds = ["espn-pritchard"]
    inputs.depth.teams[0]!.positions[0]!.playerIds = ["rw-jrue", "rw-white", "rw-pritchard"]

    const rows = selectInjuryReplacements(inputs)
    expect(rows.map((row) => row.status)).toEqual(["out", "traded"])
    expect(rows.map((row) => row.addPlayerId)).toEqual(["espn-pritchard", "espn-pritchard"])
  })

  it("skips an unmapped traded player", () => {
    const inputs = traded()
    inputs.crosswalk.delete("rw-jrue")
    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("keeps two rows when two trades select the same add", () => {
    const inputs = traded()
    inputs.depth.teams.push({
      teamAbbr: "MIA",
      positions: [{ position: "PG", playerIds: ["rw-herro", "rw-white"] }],
    })
    inputs.crosswalk.set("rw-herro", "espn-herro")
    inputs.news.push({
      rotowirePlayerId: "rw-herro",
      teamAbbr: "MIA",
      headline: "Traded to the Spurs",
      notes: "",
      position: "PG",
      at: "2026-01-14T13:00:00.000Z",
    })

    expect(selectInjuryReplacements(inputs)).toEqual([
      {
        injuredPlayerId: "espn-jrue",
        status: "traded",
        addPlayerId: "espn-white",
        source: "depth",
      },
      {
        injuredPlayerId: "espn-herro",
        status: "traded",
        addPlayerId: "espn-white",
        source: "depth",
      },
    ])
  })

  it("replaces a player still on the Celtics chart from Boston", () => {
    const inputs = traded()
    const note = "Holiday was traded to the Lakers. Holiday was averaging 12 points"
    inputs.news[0]!.headline = "Holiday was traded to the Lakers"
    inputs.news[0]!.notes = note
    inputs.depth.teams.push({
      teamAbbr: "LAL",
      positions: [{ position: "PG", playerIds: ["rw-reaves"] }],
    })
    inputs.crosswalk.set("rw-reaves", "espn-reaves")
    inputs.availablePlayerIds = ["espn-white", "espn-reaves"]

    expect(selectInjuryReplacements(inputs)).toEqual([
      {
        injuredPlayerId: "espn-jrue",
        status: "traded",
        addPlayerId: "espn-white",
        source: "depth",
      },
    ])
  })

  it("emits no row when he is already only on the destination chart", () => {
    const inputs = traded()
    const note = "Holiday was traded to the Lakers. Holiday was averaging 12 points"
    inputs.depth = {
      teams: [
        {
          teamAbbr: "LAL",
          positions: [{ position: "PG", playerIds: ["rw-jrue", "rw-reaves"] }],
        },
      ],
    }
    inputs.crosswalk.set("rw-reaves", "espn-reaves")
    inputs.availablePlayerIds = ["espn-reaves"]
    inputs.news[0]!.teamAbbr = "LAL"
    inputs.news[0]!.headline = "Holiday was traded to the Lakers"
    inputs.news[0]!.notes = note

    expect(selectInjuryReplacements(inputs)).toEqual([])
  })

  it("ignores a bigger-role note and still replaces Holiday from Boston", () => {
    const inputs = traded()
    inputs.depth = {
      teams: [
        {
          teamAbbr: "BOS",
          positions: [
            { position: "PG", playerIds: ["rw-holiday", "rw-white"] },
            { position: "SG", playerIds: ["rw-pritchard", "rw-hauss"] },
          ],
        },
        {
          teamAbbr: "LAL",
          positions: [{ position: "PG", playerIds: ["rw-reaves"] }],
        },
      ],
    }
    inputs.crosswalk = new Map([
      ["rw-holiday", "espn-holiday"],
      ["rw-white", "espn-white"],
      ["rw-pritchard", "espn-pritchard"],
      ["rw-hauss", "espn-hauss"],
      ["rw-reaves", "espn-reaves"],
    ])
    inputs.availablePlayerIds = ["espn-white", "espn-hauss", "espn-reaves"]
    inputs.news = [
      {
        rotowirePlayerId: "rw-pritchard",
        teamAbbr: "BOS",
        headline: "Could see a bigger role",
        notes: "Holiday was traded to the Lakers",
        position: "SG",
        at: "2026-01-14T12:00:00.000Z",
      },
      {
        rotowirePlayerId: "rw-holiday",
        teamAbbr: "BOS",
        headline: "Traded to the Lakers",
        notes: "Holiday was traded to the Lakers. Holiday was averaging 12 points",
        position: "PG",
        at: "2026-01-14T12:00:00.000Z",
      },
    ]

    expect(selectInjuryReplacements(inputs)).toEqual([
      {
        injuredPlayerId: "espn-holiday",
        status: "traded",
        addPlayerId: "espn-white",
        source: "depth",
      },
    ])
  })
})
