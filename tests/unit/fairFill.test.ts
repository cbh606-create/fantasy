import { describe, expect, it } from "vitest"
import { fairFills, formatFairFill } from "@/lib/trade/fairFill"

const players = (names: string[]) =>
  names.map((name) => ({ id: name, name }))

describe("fairFills", () => {
  it("recommends the sender who brings an even package inside 10 percent", () => {
    const values = new Map([
      ["Alpha", 10],
      ["Beta", 10],
      ["Close", 10],
      ["Far", 1],
    ])

    expect(fairFills(
      "2:2",
      ["Alpha"],
      ["Beta", "Close"],
      players(["Alpha", "Close", "Far"]),
      players(["Beta"]),
      values,
    ).map((player) => player.name)).toEqual(["Close"])
  })

  it("recommends the receiver who clears the 1.2 overpay", () => {
    const values = new Map([
      ["Solo", 0.5],
      ["Half", 0.3],
      ["Match", 0.31],
      ["Tiny", 0.05],
    ])

    expect(fairFills(
      "1:2",
      ["Solo"],
      ["Half"],
      players(["Solo"]),
      players(["Half", "Match", "Tiny"]),
      values,
    ).map((player) => player.name)).toEqual(["Match"])
  })

  it("stays quiet unless exactly one player is missing", () => {
    const values = new Map([["Alpha", 10], ["Beta", 10]])

    expect(fairFills(
      "2:2",
      ["Alpha"],
      ["Beta"],
      players(["Alpha"]),
      players(["Beta"]),
      values,
    )).toEqual([])
  })

  it("lists a few fair names", () => {
    expect(formatFairFill(["Your Big"])).toBe("Add Your Big to make this fair.")
    expect(formatFairFill(["Your Big", "Your Stay"])).toBe(
      "Add Your Big or Your Stay to make this fair.",
    )
    expect(formatFairFill([])).toBeNull()
  })
})
