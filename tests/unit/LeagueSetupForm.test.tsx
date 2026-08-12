// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LeagueSetupForm } from "@/components/league/LeagueSetupForm"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

describe("LeagueSetupForm", () => {
  beforeEach(() => {
    push.mockReset()
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("lets users configure their pick slot and category strategy", () => {
    render(<LeagueSetupForm />)

    fireEvent.click(screen.getByRole("button", { name: "Pick slot 7" }))
    fireEvent.click(screen.getByRole("button", { name: "Disable PTS" }))
    fireEvent.click(screen.getByRole("button", { name: "Increase AST weight" }))
    fireEvent.click(screen.getByRole("button", { name: "Punt TO" }))
    fireEvent.click(screen.getByRole("button", { name: "Focus REB" }))

    expect(screen.getByRole("button", { name: "Pick slot 7" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByText("AST weight 1.5")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Punt TO" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("creates a manual league with player pool source and redirects", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: "league-manual" }),
    } as Response)
    render(<LeagueSetupForm />)

    fireEvent.change(screen.getByLabelText("League name"), {
      target: { value: "My League" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Pick slot 4" }))
    fireEvent.click(screen.getByRole("button", { name: "Enter manually" }))

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(options?.body))

    expect(url).toBe("/api/leagues")
    expect(body.name).toBe("My League")
    expect(body.manualInput.userPickSlot).toBe(4)
    expect(body.manualInput.playerPoolSource).toBe("proj_2026_27")
    expect(body.manualInput.players).toBeUndefined()
    expect(push).toHaveBeenCalledWith("/leagues/league-manual/draft")
  })

  it("imports an ESPN league and redirects", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: "league-espn" }),
    } as Response)
    render(<LeagueSetupForm />)

    fireEvent.change(screen.getByLabelText("League name"), {
      target: { value: "ESPN League" },
    })
    fireEvent.change(screen.getByLabelText("ESPN league ID"), {
      target: { value: "12345" },
    })
    fireEvent.change(screen.getByLabelText("Season"), {
      target: { value: "2026" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Import from ESPN" }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/espn/import",
        expect.objectContaining({
          body: JSON.stringify({
            name: "ESPN League",
            leagueId: "12345",
            season: 2026,
          }),
        }),
      ),
    )
    expect(push).toHaveBeenCalledWith("/leagues/league-espn/draft")
  })

  it("shows an error when a request fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      text: async () =>
        JSON.stringify({ message: "Could not import league" }),
    } as Response)
    render(<LeagueSetupForm />)

    fireEvent.change(screen.getByLabelText("ESPN league ID"), {
      target: { value: "12345" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Import from ESPN" }))

    expect(
      await screen.findByRole("alert", { name: "Setup error" }),
    ).toHaveTextContent("Could not import league")
  })

  it("shows a helpful error when the server returns an empty body", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "",
    } as Response)
    render(<LeagueSetupForm />)

    fireEvent.change(screen.getByLabelText("ESPN league ID"), {
      target: { value: "12345" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Import from ESPN" }))

    expect(
      await screen.findByRole("alert", { name: "Setup error" }),
    ).toHaveTextContent("HTTP 500")
  })
})
