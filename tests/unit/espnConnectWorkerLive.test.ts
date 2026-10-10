import { describe, expect, it, vi } from "vitest"

vi.mock("playwright", () => {
  throw new Error("Playwright should only load when the live worker runs")
})

describe("extractEspnCookiesFromPlaywrightCookies", () => {
  it("does not load Playwright when the worker module is imported", async () => {
    await expect(import("@/lib/espn/connectWorkerLive")).resolves.toHaveProperty(
      "extractEspnCookiesFromPlaywrightCookies",
    )
  })

  it("reads espn_s2 and SWID from ESPN domains", async () => {
    const { extractEspnCookiesFromPlaywrightCookies } =
      await import("@/lib/espn/connectWorkerLive")
    const cookies = extractEspnCookiesFromPlaywrightCookies([
      { name: "espn_s2", value: "AEB%2Fabc", domain: ".espn.com" },
      {
        name: "SWID",
        value: "{AAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}",
        domain: ".espn.com",
      },
      { name: "other", value: "x", domain: ".espn.com" },
    ])

    expect(cookies?.espnS2).toBeTruthy()
    expect(cookies?.swid.startsWith("{")).toBe(true)
  })

  it("returns null when ESPN cookies are incomplete", async () => {
    const { extractEspnCookiesFromPlaywrightCookies } =
      await import("@/lib/espn/connectWorkerLive")
    expect(
      extractEspnCookiesFromPlaywrightCookies([
        { name: "espn_s2", value: "only", domain: ".espn.com" },
      ]),
    ).toBeNull()
  })
})
