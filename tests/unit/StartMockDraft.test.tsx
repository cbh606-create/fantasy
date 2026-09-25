// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StartMockDraft } from "@/components/league/StartMockDraft"

const replace = vi.fn()
const authState = {
  isLoaded: true,
  isSignedIn: false,
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}))

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => authState,
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response

describe("StartMockDraft", () => {
  beforeEach(() => {
    replace.mockReset()
    authState.isLoaded = true
    authState.isSignedIn = false
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("asks unsigned users to sign in instead of creating a league", () => {
    render(<StartMockDraft />)

    expect(
      screen.getByRole("button", { name: "Sign in to start mock draft" }),
    ).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it("reopens the latest mock draft without creating another league", async () => {
    authState.isSignedIn = true
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        { id: "espn-live", espnLeagueId: "12345" },
        { id: "existing-mock", espnLeagueId: null },
      ]),
    )

    render(<StartMockDraft />)

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/leagues/existing-mock/draft"),
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.method).toBeUndefined()
  })

  it("creates a mock draft and opens the Mock workspace", async () => {
    authState.isSignedIn = true
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if ((init?.method ?? "GET") === "POST") {
        return jsonResponse({ id: "new-mock" }, 201)
      }

      return jsonResponse([])
    })

    render(<StartMockDraft />)

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/leagues/new-mock/draft"),
    )

    const postCall = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "POST")
    expect(postCall?.[0]).toBe("/api/leagues")
    const body = JSON.parse(String(postCall?.[1]?.body))
    expect(body.name).toBe("Mock Draft")
    expect(body.manualInput.userPickSlot).toBe(1)
    expect(body.manualInput.playerPoolSource).toBe("proj_2026_27")
  })

  it("shows sign-in when the league API rejects the session", async () => {
    authState.isSignedIn = true
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: "unauthorized" }, 401),
    )

    render(<StartMockDraft />)

    expect(
      await screen.findByRole("button", {
        name: "Sign in to start mock draft",
      }),
    ).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })
})
