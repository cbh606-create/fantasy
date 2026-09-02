import { describe, expect, it } from "vitest"
import {
  buildAdpByPlayerIdFromProjPool,
  chooseIlVersusNewInjuredDrop,
  isAdpProtected,
  isLongTermInjuryException,
  isUnderperformingDropException,
  resolveExpectedOutDays,
} from "@/lib/matchup/streamingDropPolicy"
import { STREAMING_PROTECTED_ADP_MAX } from "@/lib/matchup/constants"
import type { SeasonPlayer } from "@/lib/season/types"

const dummyPlayer = (
  id: string,
  name: string,
  teamAbbr?: string,
): SeasonPlayer => ({
  id,
  name,
  teamAbbr,
  projections: {} as never,
  shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
})

const projPool = [
  { id: "espn-5104157", name: "Victor Wembanyama", teamAbbr: "SAS", adp: 1 },
  { id: "espn-3112335", name: "Nikola Jokic", teamAbbr: "DEN", adp: 2 },
  { id: "espn-no-adp", name: "No Adp", teamAbbr: "CHI" },
]

describe("streamingDropPolicy", () => {
  it("protects ADP at or below 60", () => {
    expect(STREAMING_PROTECTED_ADP_MAX).toBe(60)
    expect(isAdpProtected(60)).toBe(true)
    expect(isAdpProtected(61)).toBe(false)
    expect(isAdpProtected(null)).toBe(false)
  })

  it("defaults out/gtd out-days and long-term at >= 14", () => {
    expect(resolveExpectedOutDays({ status: "out" })).toBe(21)
    expect(resolveExpectedOutDays({ status: "gtd" })).toBe(3)
    expect(resolveExpectedOutDays({ status: "out", expectedOutDays: 10 })).toBe(
      10,
    )
    expect(isLongTermInjuryException(14)).toBe(true)
    expect(isLongTermInjuryException(13)).toBe(false)
  })

  it("underperformance stub is always false", () => {
    expect(
      isUnderperformingDropException({
        id: "x",
        name: "x",
        projections: {} as never,
        shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
      }),
    ).toBe(false)
  })

  it("IL vs new: longer absence dropped; tie breaks to worse ADP", () => {
    expect(
      chooseIlVersusNewInjuredDrop({
        il: { playerId: "il-guy", adp: 80, outDays: 10 },
        newlyInjured: { playerId: "star", adp: 20, outDays: 30 },
      }),
    ).toBe("star")

    expect(
      chooseIlVersusNewInjuredDrop({
        il: { playerId: "il-guy", adp: 80, outDays: 21 },
        newlyInjured: { playerId: "star", adp: 20, outDays: 21 },
      }),
    ).toBe("il-guy")
  })

  it("maps ADP by player id first, else name|teamAbbr", () => {
    const byId = buildAdpByPlayerIdFromProjPool(
      [dummyPlayer("espn-5104157", "Wrong Name", "XXX")],
      projPool,
    )
    expect(byId["espn-5104157"]).toBe(1)

    const byName = buildAdpByPlayerIdFromProjPool(
      [dummyPlayer("custom-jokic", "Nikola Jokic", "DEN")],
      projPool,
    )
    expect(byName["custom-jokic"]).toBe(2)

    const idWins = buildAdpByPlayerIdFromProjPool(
      [dummyPlayer("espn-5104157", "Nikola Jokic", "DEN")],
      projPool,
    )
    expect(idWins["espn-5104157"]).toBe(1)

    const unmatched = buildAdpByPlayerIdFromProjPool(
      [dummyPlayer("nobody", "Nobody", "ZZZ")],
      projPool,
    )
    expect(unmatched["nobody"]).toBeUndefined()
    expect(
      buildAdpByPlayerIdFromProjPool(
        [dummyPlayer("espn-no-adp", "No Adp", "CHI")],
        projPool,
      )["espn-no-adp"],
    ).toBeUndefined()
  })

  it("bridges digits-only and espn- prefixed ids before name|team", () => {
    const digitsToEspn = buildAdpByPlayerIdFromProjPool(
      [dummyPlayer("5104157", "Wrong Name", "XXX")],
      projPool,
    )
    expect(digitsToEspn["5104157"]).toBe(1)

    const barePool = [
      { id: "3112335", name: "Nikola Jokic", teamAbbr: "DEN", adp: 2 },
    ]
    const espnToBare = buildAdpByPlayerIdFromProjPool(
      [dummyPlayer("espn-3112335", "Wrong Name", "XXX")],
      barePool,
    )
    expect(espnToBare["espn-3112335"]).toBe(2)

    const nameFallback = buildAdpByPlayerIdFromProjPool(
      [dummyPlayer("custom-jokic", "Nikola Jokic", "DEN")],
      projPool,
    )
    expect(nameFallback["custom-jokic"]).toBe(2)
  })
})
