import { describe, expect, it } from "vitest"
import { extractEspnCookiesFromPlaywrightCookies } from "@/lib/espn/connectWorkerLive"

describe("extractEspnCookiesFromPlaywrightCookies", () => {
  it("reads espn_s2 and SWID from ESPN domains", () => {
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

  it("returns null when ESPN cookies are incomplete", () => {
    expect(
      extractEspnCookiesFromPlaywrightCookies([
        { name: "espn_s2", value: "only", domain: ".espn.com" },
      ]),
    ).toBeNull()
  })
})
