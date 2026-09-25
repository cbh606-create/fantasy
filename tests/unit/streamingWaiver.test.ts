import { describe, expect, it } from "vitest"
import {
  DEFAULT_WAIVER_PERIOD_DAYS,
  isOnWaiverCooldown,
  resolveWaiverPeriodDays,
} from "@/lib/matchup/streamingWaiver"

const days = [
  "2025-11-03",
  "2025-11-04",
  "2025-11-05",
  "2025-11-06",
  "2025-11-07",
]

describe("resolveWaiverPeriodDays", () => {
  it("defaults to 2, prefers input over league, then league", () => {
    expect(DEFAULT_WAIVER_PERIOD_DAYS).toBe(2)
    expect(resolveWaiverPeriodDays()).toBe(2)
    expect(resolveWaiverPeriodDays({ leagueDays: 1 })).toBe(1)
    expect(resolveWaiverPeriodDays({ inputDays: 3, leagueDays: 1 })).toBe(3)
    expect(resolveWaiverPeriodDays({ inputDays: 0 })).toBe(0)
  })
})

describe("isOnWaiverCooldown", () => {
  it("locks the drop day and the next two matchup days by default", () => {
    expect(isOnWaiverCooldown("2025-11-04", "2025-11-04", days, 2)).toBe(true)
    expect(isOnWaiverCooldown("2025-11-04", "2025-11-05", days, 2)).toBe(true)
    expect(isOnWaiverCooldown("2025-11-04", "2025-11-06", days, 2)).toBe(true)
    expect(isOnWaiverCooldown("2025-11-04", "2025-11-07", days, 2)).toBe(false)
  })

  it("still locks the drop day when period is 0", () => {
    expect(isOnWaiverCooldown("2025-11-04", "2025-11-04", days, 0)).toBe(true)
    expect(isOnWaiverCooldown("2025-11-04", "2025-11-05", days, 0)).toBe(false)
  })
})
