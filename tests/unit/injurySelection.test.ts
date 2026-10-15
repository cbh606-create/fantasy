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
