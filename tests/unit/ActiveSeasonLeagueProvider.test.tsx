// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SiteNav } from "@/components/SiteNav"
import {
  ActiveSeasonLeagueProvider,
  useActiveSeasonLeague,
} from "@/components/season/ActiveSeasonLeagueProvider"
import { useSyncActiveSeasonLeague } from "@/components/season/useSyncActiveSeasonLeague"
import { ACTIVE_SEASON_LEAGUE_STORAGE_KEY } from "@/lib/season/activeSeasonLeague"

const navigationState = {
  pathname: "/",
  push: vi.fn(),
}

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ push: navigationState.push }),
}))

const leagues = [
  {
    id: "league-1",
    name: "Downtown Hoops",
    season: 2026,
    source: "espn" as const,
  },
  {
    id: "league-2",
    name: "Office League",
    season: 2025,
    source: "manual" as const,
  },
]

const renderNavigation = () =>
  render(
    <ActiveSeasonLeagueProvider>
      <SiteNav />
    </ActiveSeasonLeagueProvider>,
  )

const SyncActiveLeague = ({ leagueId }: { leagueId: string }) => {
  useSyncActiveSeasonLeague(leagueId)
  return null
}

beforeEach(() => {
  navigationState.pathname = "/"
  navigationState.push.mockReset()
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => leagues,
    }),
  )
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe("ActiveSeasonLeagueProvider with SiteNav", () => {
  it("persists a selection and deep-links all season tools", async () => {
    renderNavigation()

    const select = await screen.findByRole("combobox", {
      name: "Active season roster",
    })
    fireEvent.change(select, { target: { value: "league-1" } })

    expect(window.localStorage.getItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY)).toBe(
      "league-1",
    )
    expect(screen.getByRole("link", { name: "Matchup" })).toHaveAttribute(
      "href",
      "/matchup/league-1",
    )
    expect(screen.getByRole("link", { name: "Trade" })).toHaveAttribute(
      "href",
      "/trade/league-1",
    )
    expect(screen.getByRole("link", { name: "Waivers" })).toHaveAttribute(
      "href",
      "/waivers/league-1",
    )
    expect(screen.getByRole("link", { name: "Roster" })).toHaveAttribute(
      "href",
      "/roster/league-1",
    )
    expect(navigationState.push).not.toHaveBeenCalled()
  })

  it("navigates to the selected league when already on a season tool", async () => {
    navigationState.pathname = "/roster/league-1"
    renderNavigation()

    const select = await screen.findByRole("combobox", {
      name: "Active season roster",
    })
    fireEvent.change(select, { target: { value: "league-2" } })

    expect(window.localStorage.getItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY)).toBe(
      "league-2",
    )
    expect(navigationState.push).toHaveBeenCalledWith("/roster/league-2")
  })

  it("hydrates a valid stored selection after mount", async () => {
    window.localStorage.setItem(
      ACTIVE_SEASON_LEAGUE_STORAGE_KEY,
      "league-2",
    )

    renderNavigation()

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Active season roster" }),
      ).toHaveValue("league-2")
    })
  })

  it("clears a stored selection that is missing from fetched leagues", async () => {
    window.localStorage.setItem(
      ACTIVE_SEASON_LEAGUE_STORAGE_KEY,
      "deleted-league",
    )

    renderNavigation()

    await waitFor(() => {
      expect(
        window.localStorage.getItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY),
      ).toBeNull()
    })
    expect(screen.getByRole("link", { name: "Matchup" })).toHaveAttribute(
      "href",
      "/matchup",
    )
  })

  it("keeps the stored selection when leagues fail to load", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network unavailable"))
    window.localStorage.setItem(
      ACTIVE_SEASON_LEAGUE_STORAGE_KEY,
      "league-1",
    )

    renderNavigation()

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Matchup" }),
      ).toHaveAttribute("href", "/matchup/league-1")
    })
    expect(window.localStorage.getItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY)).toBe(
      "league-1",
    )
  })

  it("keeps setActiveId stable across provider renders", async () => {
    const observedSetters: Array<(id: string | null) => void> = []

    const Observer = () => {
      observedSetters.push(useActiveSeasonLeague().setActiveId)
      return null
    }

    render(
      <ActiveSeasonLeagueProvider>
        <Observer />
      </ActiveSeasonLeagueProvider>,
    )

    await waitFor(() => expect(observedSetters.length).toBeGreaterThan(1))
    expect(new Set(observedSetters).size).toBe(1)
  })

  it("syncs the active league from a detail route", async () => {
    render(
      <ActiveSeasonLeagueProvider>
        <SyncActiveLeague leagueId="league-2" />
      </ActiveSeasonLeagueProvider>,
    )

    await waitFor(() => {
      expect(
        window.localStorage.getItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY),
      ).toBe("league-2")
    })
  })
})
