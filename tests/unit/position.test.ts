import { describe, expect, it } from "vitest"
import { positionBucket, primaryBucket } from "@/lib/projections/position"

describe("positionBucket", () => {
  it("maps guards wings and bigs", () => {
    expect(positionBucket("PG")).toBe("G")
    expect(positionBucket("SG")).toBe("G")
    expect(positionBucket("SF")).toBe("wing")
    expect(positionBucket("PF")).toBe("big")
    expect(positionBucket("C")).toBe("big")
  })

  it("uses the primary listed position", () => {
    expect(primaryBucket(["SF", "PF"])).toBe("wing")
    expect(primaryBucket([])).toBe("wing")
  })
})
