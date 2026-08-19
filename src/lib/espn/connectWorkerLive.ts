import { chromium, type Browser } from "playwright"
import {
  expireConnectSessionIfNeeded,
  getConnectSessionForUser,
  isTerminalConnectStatus,
  updateConnectSessionStatus,
} from "@/lib/espn/connectSession"
import {
  normalizeEspnCookies,
  type EspnCookies,
} from "@/lib/espn/cookies"
import { upsertUserEspnCredentials } from "@/lib/espn/credentials"

type PlaywrightCookie = {
  name: string
  value: string
  domain: string
}

const POLL_INTERVAL_MS = 2_000
const ESPN_LOGIN_URL = "https://www.espn.com/login"

const isEspnDomain = (domain: string): boolean => {
  const normalizedDomain = domain.toLowerCase().replace(/^\./, "")
  return normalizedDomain === "espn.com" || normalizedDomain.endsWith(".espn.com")
}

export const extractEspnCookiesFromPlaywrightCookies = (
  cookies: PlaywrightCookie[],
): EspnCookies | null => {
  const espnCookies = cookies.filter((cookie) => isEspnDomain(cookie.domain))
  const espnS2 =
    espnCookies.find((cookie) => cookie.name === "espn_s2")?.value ?? ""
  const swid =
    espnCookies.find((cookie) => cookie.name.toUpperCase() === "SWID")?.value ??
    ""

  return normalizeEspnCookies({ espnS2, swid })
}

const waitForNextPoll = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
}

export const runLiveConnectWorker = async (
  sessionId: string,
  clerkUserId: string,
): Promise<void> => {
  const initialSession = await getConnectSessionForUser(sessionId, clerkUserId)
  if (!initialSession) return

  const activeSession = await expireConnectSessionIfNeeded(initialSession)
  if (isTerminalConnectStatus(activeSession.status)) return

  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: false })
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(ESPN_LOGIN_URL)

    while (true) {
      const currentSession = await getConnectSessionForUser(
        sessionId,
        clerkUserId,
      )
      if (!currentSession) return

      const refreshedSession =
        await expireConnectSessionIfNeeded(currentSession)
      if (isTerminalConnectStatus(refreshedSession.status)) return

      const cookies = extractEspnCookiesFromPlaywrightCookies(
        await context.cookies(),
      )
      if (cookies) {
        await upsertUserEspnCredentials(clerkUserId, cookies)
        await updateConnectSessionStatus(sessionId, "succeeded")
        return
      }

      await waitForNextPoll()
    }
  } catch {
    const currentSession = await getConnectSessionForUser(
      sessionId,
      clerkUserId,
    )
    if (currentSession && !isTerminalConnectStatus(currentSession.status)) {
      await updateConnectSessionStatus(sessionId, "failed", "CONNECT_WORKER")
    }
  } finally {
    await browser?.close()
  }
}
