// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import {
  ACTIVE_SEASON_LEAGUE_STORAGE_KEY,
  clearActiveSeasonLeagueId,
  readActiveSeasonLeagueId,
  writeActiveSeasonLeagueId,
} from "@/lib/season/activeSeasonLeague"

afterEach(() => {
  window.localStorage.clear()
})

describe("activeSeasonLeague storage", () => {
  it("reads null when empty", () => {
    expect(readActiveSeasonLeagueId()).toBeNull()
  })

  it("writes and reads an id", () => {
    writeActiveSeasonLeagueId("league-1")
    expect(window.localStorage.getItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY)).toBe(
      "league-1",
    )
    expect(readActiveSeasonLeagueId()).toBe("league-1")
  })

  it("clears the id", () => {
    writeActiveSeasonLeagueId("league-1")
    clearActiveSeasonLeagueId()
    expect(readActiveSeasonLeagueId()).toBeNull()
  })
})
