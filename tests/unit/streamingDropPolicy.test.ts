import { describe, expect, it } from "vitest"
import {
  chooseIlVersusNewInjuredDrop,
  isAdpProtected,
  isLongTermInjuryException,
  isUnderperformingDropException,
  resolveExpectedOutDays,
} from "@/lib/matchup/streamingDropPolicy"
import { STREAMING_PROTECTED_ADP_MAX } from "@/lib/matchup/constants"

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
})
