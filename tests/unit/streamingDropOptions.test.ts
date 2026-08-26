import { describe, expect, it } from "vitest"
import {
  compareStreamingAddDropKeys,
  isAfterStreamingAddDropKey,
  rosterDropSelectOptions,
} from "@/lib/matchup/streamingDropOptions"
import type { SeasonPlayer } from "@/lib/season/types"

const player = (id: string, name: string): SeasonPlayer => ({
  id,
  name,
  teamAbbr: "BOS",
  positions: ["SG"],
  projections: {
    FG_PCT: 0.5,
    FT_PCT: 0.8,
    TPM: 2,
    REB: 5,
    AST: 4,
    STL: 1,
    BLK: 1,
    TO: 2,
    PTS: 16,
  },
  shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
})

describe("streamingAddDropKey ordering", () => {
  it("orders by date then spotIndex", () => {
    expect(
      compareStreamingAddDropKeys("2025-11-03:0", "2025-11-04:0"),
    ).toBeLessThan(0)
    expect(
      compareStreamingAddDropKeys("2025-11-03:0", "2025-11-03:1"),
    ).toBeLessThan(0)
    expect(isAfterStreamingAddDropKey("2025-11-04:0", "2025-11-03:1")).toBe(
      true,
    )
  })
})

describe("rosterDropSelectOptions", () => {
  const playersById = {
    a: player("a", "Alpha"),
    b: player("b", "Beta"),
    c: player("c", "Gamma"),
  }

  it("excludes earlier dropped players from options", () => {
    const options = rosterDropSelectOptions({
      eligiblePlayerIds: ["a", "b", "c"],
      earlierDroppedIds: ["b"],
      allowOpenSlot: false,
      playersById,
    })

    expect(options.map((option) => option.value)).toEqual(["a", "c"])
  })

  it("includes open slot when allowed", () => {
    const options = rosterDropSelectOptions({
      eligiblePlayerIds: ["a"],
      earlierDroppedIds: [],
      allowOpenSlot: true,
      playersById,
    })

    expect(options).toEqual([
      { value: "open_slot", label: "Open slot" },
      { value: "a", label: "Alpha" },
    ])
  })
})
