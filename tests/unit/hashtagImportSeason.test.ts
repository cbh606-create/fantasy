import { describe, expect, it } from "vitest"

import {
  applyHashtagProjections,
  parseHashtagCsv,
} from "@/lib/players/hashtagImport"

describe("applyHashtagProjections for season players", () => {
  it("updates shooting when CSV provides FGM/FGA", () => {
    const rows = parseHashtagCsv(
      "Player,Team,FG%,FT%,3PM,PTS,REB,AST,STL,BLK,TO,FGM,FGA,FTM,FTA\n" +
        "Nikola Jokic,DEN,60,82,1,26,12,9,1,1,3,700,1100,400,500\n",
    )
    const players = [
      {
        id: "season-1",
        name: "Nikola Jokic",
        teamAbbr: "DEN",
        projections: {
          FG_PCT: 0.5,
          FT_PCT: 0.8,
          TPM: 0,
          REB: 0,
          AST: 0,
          STL: 0,
          BLK: 0,
          TO: 0,
          PTS: 0,
        },
        shooting: {
          FGM: 1,
          FGA: 2,
          FTM: 1,
          FTA: 2,
        },
      },
    ]

    const result = applyHashtagProjections(players, rows, {
      perGame: false,
      gpDefault: 70,
    })

    expect(result.players[0].shooting).toEqual({
      FGM: 700,
      FGA: 1100,
      FTM: 400,
      FTA: 500,
    })
  })
})
