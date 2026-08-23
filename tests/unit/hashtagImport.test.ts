import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  applyHashtagProjections,
  normalizePlayerName,
  parseHashtagCsv,
  scaleProjections,
} from "@/lib/players/hashtagImport"

describe("normalizePlayerName", () => {
  it("strips punctuation and suffixes", () => {
    expect(normalizePlayerName("Nikola Jokić Jr.")).toBe(
      normalizePlayerName("nikola jokic"),
    )
  })
})

describe("parseHashtagCsv + apply", () => {
  const sample = readFileSync(
    path.join(process.cwd(), "data/fixtures/hashtag-projections-sample.csv"),
    "utf8",
  )

  it("parses sample and overwrites only matched projections", () => {
    const rows = parseHashtagCsv(sample)
    expect(rows.length).toBeGreaterThanOrEqual(2)

    const players = [
      {
        id: "espn-1",
        name: "Nikola Jokic",
        teamAbbr: "DEN",
        projections: {
          FG_PCT: 0.5,
          FT_PCT: 0.8,
          TPM: 1,
          REB: 1,
          AST: 1,
          STL: 1,
          BLK: 1,
          TO: 1,
          PTS: 1,
        },
      },
      {
        id: "espn-2",
        name: "Unmatched Player",
        projections: {
          FG_PCT: 0.4,
          FT_PCT: 0.7,
          TPM: 2,
          REB: 2,
          AST: 2,
          STL: 2,
          BLK: 2,
          TO: 2,
          PTS: 2,
        },
      },
    ]

    const { players: next, report } = applyHashtagProjections(players, rows, {
      perGame: true,
      gpDefault: 70,
    })

    expect(report.matched.length).toBeGreaterThanOrEqual(1)
    expect(next[0].projections.PTS).not.toBe(1)
    expect(next[1].projections.PTS).toBe(2)
  })

  it("scales percent and per-game totals", () => {
    expect(scaleProjections(
      { FG_PCT: 45.2, FT_PCT: 0.8, TPM: 2, REB: 10, AST: 5, STL: 1, BLK: 1, TO: 2, PTS: 20 },
      { perGame: true, gp: 70 },
    )).toMatchObject({
      FG_PCT: 0.452,
      FT_PCT: 0.8,
      PTS: 1400,
      TPM: 140,
    })
  })

  it("marks ambiguous when two pool players share a name and no team", () => {
    const rows = parseHashtagCsv(
      "Player,FG%,FT%,3PM,PTS,REB,AST,STL,BLK,TO\nJohn Smith,50,80,1,20,5,5,1,1,2\n",
    )
    const { report } = applyHashtagProjections(
      [
        { id: "a", name: "John Smith", projections: { FG_PCT: 0, FT_PCT: 0, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0 } },
        { id: "b", name: "John Smith", projections: { FG_PCT: 0, FT_PCT: 0, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0 } },
      ],
      rows,
      { perGame: false, gpDefault: 70 },
    )
    expect(report.ambiguous.length).toBe(1)
    expect(report.matched.length).toBe(0)
  })
})
