import { describe, expect, it } from "vitest"
import {
  layoutCategoryZ,
  yForLane,
  zFraction,
} from "@/lib/season/zScaleLayout"

const compactInput = {
  plotWidth: 64,
  youRadius: 3,
  laneGapPx: 1,
  maxLanes: 3,
}

describe("layoutCategoryZ", () => {
  it("keeps extent at 3 and maps z inside that window", () => {
    const layout = layoutCategoryZ({
      ...compactInput,
      points: [
        { teamIndex: 0, z: 0 },
        { teamIndex: 1, z: 1 },
        { teamIndex: 2, z: -1 },
        { teamIndex: 3, z: 2.9 },
      ],
    })

    expect(layout.extent).toBe(3)
    const at = (teamIndex: number) =>
      layout.points.find((point) => point.teamIndex === teamIndex)

    expect(at(0)?.xFraction).toBe(0.5)
    expect(at(1)?.xFraction).toBeCloseTo(2 / 3)
    expect(at(2)?.xFraction).toBeCloseTo(1 / 3)
    expect(zFraction(0, 3)).toBe(0.5)
  })

  it("expands extent to the farthest finite z", () => {
    const layout = layoutCategoryZ({
      ...compactInput,
      points: [
        { teamIndex: 0, z: 3.4 },
        { teamIndex: 1, z: -3.4 },
        { teamIndex: 2, z: Number.NaN },
      ],
    })

    expect(layout.extent).toBe(3.4)
    const at = (teamIndex: number) =>
      layout.points.find((point) => point.teamIndex === teamIndex)

    expect(at(0)?.xFraction).toBe(1)
    expect(at(1)?.xFraction).toBe(0)
    expect(at(2)).toBeUndefined()
  })

  it("places a positive z to the right of zero without a category id", () => {
    const layout = layoutCategoryZ({
      ...compactInput,
      points: [
        { teamIndex: 0, z: 0 },
        { teamIndex: 1, z: 1.2 },
      ],
    })
    const at = (teamIndex: number) =>
      layout.points.find((point) => point.teamIndex === teamIndex)

    expect(at(1)?.xFraction).toBeGreaterThan(at(0)?.xFraction ?? 0)
  })

  it("gives identical z values different lanes and keeps the lower team index in the center", () => {
    const layout = layoutCategoryZ({
      ...compactInput,
      points: [
        { teamIndex: 4, z: 0.5 },
        { teamIndex: 1, z: 0.5 },
      ],
    })
    const at = (teamIndex: number) =>
      layout.points.find((point) => point.teamIndex === teamIndex)

    expect(layout.extent).toBe(3)
    expect(at(1)?.lane).toBe(0)
    expect(at(4)?.lane).toBe(1)
  })

  it("uses extent 3 for an empty list", () => {
    expect(layoutCategoryZ({ ...compactInput, points: [] }).extent).toBe(3)
  })
})

describe("yForLane", () => {
  it("matches the compact and dialog lane table", () => {
    expect(yForLane(0, 11, 3, 1)).toBe(11)
    expect(yForLane(1, 11, 3, 1)).toBe(4)
    expect(yForLane(2, 11, 3, 1)).toBe(18)
    expect(yForLane(0, 64, 8, 2)).toBe(64)
    expect(yForLane(1, 64, 8, 2)).toBe(46)
    expect(yForLane(2, 64, 8, 2)).toBe(82)
    expect(yForLane(3, 64, 8, 2)).toBe(28)
    expect(yForLane(4, 64, 8, 2)).toBe(100)
  })
})
