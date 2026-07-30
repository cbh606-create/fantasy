import { expect, test, type Page } from "@playwright/test"

test.describe.configure({ mode: "serial" })

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 7,
  AST: 5,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 20,
}

const players = [
  {
    id: "p01",
    name: "Avery Cole",
    positions: ["PG"],
    projections,
    adp: 1,
  },
  {
    id: "p02",
    name: "Blake Reed",
    positions: ["SG"],
    projections,
    adp: 2,
  },
]

const leagueState = {
  settings: {
    teams: 12,
    draftType: "snake",
    rosterSlots: ["PG", "SG"],
    categories: Object.keys(projections).map((id) => ({
      id,
      enabled: true,
      weight: 1,
    })),
    userPickSlot: 4,
    puntCategoryIds: ["TO"],
    focusCategoryIds: ["AST"],
    rounds: 13,
  },
  board: {
    picks: [],
    currentOverall: 1,
  },
  players,
  source: "manual",
  perspectiveTeamIndex: 3,
}

const simulationResult = (playerId: string) => ({
  nextPicks: [{ playerId, score: 8.4, frequency: 0.75 }],
  topCombinations: [
    {
      playerIds: ["p01", "p02"],
      score: 15.2,
      frequency: 0.5,
    },
  ],
  categoryOutlook: {
    FG_PCT: 0.1,
    FT_PCT: 0.2,
    TPM: 0.3,
    REB: 0.4,
    AST: 0.5,
    STL: 0.6,
    BLK: 0.7,
    TO: -0.2,
    PTS: 0.8,
  },
  meta: {
    simCount: 40,
    seed: 123,
    generatedAt: "2026-07-30T00:00:00.000Z",
    latencyMs: 20,
    source: "manual",
  },
})

const mockDraftApis = async (page: Page) => {
  await page.route("**/api/leagues/e2e-manual", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ json: { id: "e2e-manual" } })
      return
    }

    await route.fulfill({
      json: {
        id: "e2e-manual",
        name: "Smoke League",
        stateJson: JSON.stringify(leagueState),
      },
    })
  })
}

test("manual setup reaches prep and shows simulated next picks", async ({
  page,
}) => {
  await page.route("**/api/leagues", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue()
      return
    }

    const requestBody = route.request().postDataJSON()

    expect(requestBody.name).toBe("Smoke League")
    expect(requestBody.manualInput.userPickSlot).toBe(4)
    await route.fulfill({ json: { id: "e2e-manual" } })
  })
  await mockDraftApis(page)
  await page.route("**/api/draft/simulate", async (route) => {
    await route.fulfill({ json: simulationResult("p01") })
  })

  await page.goto("/leagues/new")
  const leagueNameField = page.getByLabel("League name")
  await leagueNameField.click()
  await leagueNameField.fill("")
  await leagueNameField.pressSequentially("Smoke League")
  await page.getByRole("button", { name: "Pick slot 4" }).click()
  await page.getByRole("button", { name: "Punt TO" }).click()
  await page.getByRole("button", { name: "Focus AST" }).click()
  await Promise.all([
    page.waitForURL(/\/leagues\/e2e-manual\/draft$/),
    page.getByRole("button", { name: "Enter manually" }).click(),
  ])

  await expect(page).toHaveURL(/\/leagues\/e2e-manual\/draft$/)
  await expect(page.getByRole("heading", { name: "Smoke League" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Prep" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(page.getByText("Focus AST")).toBeVisible()
  await expect(page.getByText("Punt TO")).toBeVisible()

  await page.getByRole("button", { name: "Run simulation" }).click()

  const recommendations = page
    .getByRole("heading", { name: "Next picks" })
    .locator("..")
  await expect(recommendations).toContainText("Avery Cole")
})

test("live pick refreshes recommendations", async ({ page }) => {
  await mockDraftApis(page)
  await page.route("**/api/draft/simulate", async (route) => {
    const requestBody = route.request().postDataJSON()
    const hasAveryPick = requestBody.state.board.picks.some(
      (pick: { playerId: string | null }) => pick.playerId === "p01",
    )

    await route.fulfill({
      json: simulationResult(hasAveryPick ? "p02" : "p01"),
    })
  })

  await page.goto("/leagues/e2e-manual/draft")
  await page.getByRole("button", { name: "Run simulation" }).click()

  const recommendations = page
    .getByRole("heading", { name: "Next picks" })
    .locator("..")
  await expect(recommendations).toContainText("Avery Cole")

  await page.getByRole("tab", { name: "Live" }).click()
  await page.getByRole("button", { name: "Mark Avery Cole picked" }).click()

  await expect(recommendations).toContainText("Blake Reed")
  await expect(recommendations).not.toContainText("Avery Cole")
})
