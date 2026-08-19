// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SeasonToolIndexPage } from "@/components/season/SeasonToolIndexPage"
import { useActiveSeasonLeague } from "@/components/season/ActiveSeasonLeagueProvider"
import { useRouter } from "next/navigation"
import RosterListPage from "@/app/roster/page"

vi.mock("@/components/season/ActiveSeasonLeagueProvider", () => ({
  useActiveSeasonLeague: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}))

const replace = vi.fn()

const renderPage = () =>
  render(
    <SeasonToolIndexPage
      description="Choose a season roster to find packages that improve both teams."
      title="Find trades"
      tool="trade"
    />,
  )

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("SeasonToolIndexPage", () => {
  it("replaces the index route with the active season league route", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace } as never)
    vi.mocked(useActiveSeasonLeague).mockReturnValue({
      activeId: "league-1",
      leagues: [
        {
          id: "league-1",
          name: "Downtown Hoops",
          season: 2026,
          source: "espn",
        },
      ],
      isLoading: false,
      error: "",
      setActiveId: vi.fn(),
    })

    renderPage()

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/trade/league-1")
    })
  })

  it("renders the league picker while no valid active league is selected", () => {
    vi.mocked(useRouter).mockReturnValue({ replace } as never)
    vi.mocked(useActiveSeasonLeague).mockReturnValue({
      activeId: "missing-league",
      leagues: [
        {
          id: "league-1",
          name: "Downtown Hoops",
          season: 2026,
          source: "espn",
        },
      ],
      isLoading: false,
      error: "",
      setActiveId: vi.fn(),
    })

    renderPage()

    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "Find trades" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Downtown Hoops/ })).toHaveAttribute(
      "href",
      "/trade/league-1",
    )
  })
})

describe("RosterListPage", () => {
  it("offers a shortcut to the active roster without redirecting", () => {
    vi.mocked(useActiveSeasonLeague).mockReturnValue({
      activeId: "league-1",
      leagues: [
        {
          id: "league-1",
          name: "Downtown Hoops",
          season: 2026,
          source: "espn",
        },
      ],
      isLoading: false,
      error: "",
      setActiveId: vi.fn(),
    })
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input)

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () =>
            url.includes("/api/season-leagues")
              ? []
              : { connected: false, status: "none" },
        })
      }),
    )

    render(<RosterListPage />)

    expect(
      screen.getByRole("link", { name: "Open Downtown Hoops" }),
    ).toHaveAttribute("href", "/roster/league-1")
    expect(replace).not.toHaveBeenCalled()
  })
})
