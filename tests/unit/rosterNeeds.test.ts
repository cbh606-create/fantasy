import { describe, expect, it } from "vitest"
import type { Player } from "@/lib/domain/types"
import { positionNeedBonus } from "@/lib/sim/rosterNeeds"

const player = (id: string, positions: Player["positions"]): Player => ({
  id,
  name: id,
  positions,
  projections: {
    FG_PCT: 0.5, FT_PCT: 0.8, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0,
  },
  adp: 50,
})

describe("positionNeedBonus", () => {
  it("returns 50 when primary position is missing from roster", () => {
    expect(positionNeedBonus(player("pg", ["PG"]), [])).toBe(50)
  })

  it("returns 0 when primary position already covered", () => {
    const roster = [
      player("pg1", ["PG"]),
      player("pg2", ["PG"]),
      player("pg3", ["PG"]),
      player("pg4", ["PG"]),
    ]
    expect(positionNeedBonus(player("pg5", ["PG"]), roster)).toBe(0)
  })
})
