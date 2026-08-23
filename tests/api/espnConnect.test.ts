import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as startPost } from "@/app/api/espn/connect/start/route"
import { GET as statusGet } from "@/app/api/espn/connect/status/route"
import { db } from "@/lib/db"
import { setConnectWorkerForTests } from "@/lib/espn/connectWorker"
import { upsertUserEspnCredentials } from "@/lib/espn/credentials"
import { updateConnectSessionStatus } from "@/lib/espn/connectSession"

vi.mock("next/headers", () => ({ headers: vi.fn() }))

const prefix = `espn-connect-api-${crypto.randomUUID()}`
let userId: string
const originalLiveConnectSetting = process.env.ESPN_CONNECT_LIVE

const authenticateAs = (id?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(id ? { "x-test-user-id": id } : {}) as never,
  )
}

const waitForStatus = async (
  sessionId: string,
  expectedStatus: string,
): Promise<{ status?: string; errorCode?: string | null }> => {
  let body: { status?: string; errorCode?: string | null } = {}

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await statusGet(
      new Request(
        `http://localhost/api/espn/connect/status?sessionId=${sessionId}`,
      ),
    )
    body = await response.json()
    if (body.status === expectedStatus) return body
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  return body
}

beforeEach(() => {
  userId = `${prefix}-${crypto.randomUUID()}`
  authenticateAs(userId)
  setConnectWorkerForTests({
    start: (sessionId, clerkUserId) => {
      void (async () => {
        await upsertUserEspnCredentials(clerkUserId, {
          espnS2: "mock-s2",
          swid: "{11111111-2222-3333-4444-555555555555}",
        })
        await updateConnectSessionStatus(sessionId, "succeeded")
      })()
    },
  })
})

afterEach(async () => {
  setConnectWorkerForTests(null)
  if (originalLiveConnectSetting === undefined) {
    delete process.env.ESPN_CONNECT_LIVE
  } else {
    process.env.ESPN_CONNECT_LIVE = originalLiveConnectSetting
  }
  await db.espnConnectSession.deleteMany({
    where: { clerkUserId: { startsWith: prefix } },
  })
  await db.espnCredential.deleteMany({
    where: { clerkUserId: { startsWith: prefix } },
  })
})

describe("ESPN connect API", () => {
  it("returns 401 when unauthenticated", async () => {
    authenticateAs(undefined)
    const response = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    expect(response.status).toBe(401)
  })

  it("returns 401 for unauthenticated status requests", async () => {
    authenticateAs(undefined)
    const response = await statusGet(
      new Request(
        "http://localhost/api/espn/connect/status?sessionId=session-id",
      ),
    )
    expect(response.status).toBe(401)
  })

  it("returns 400 when status sessionId is missing", async () => {
    const response = await statusGet(
      new Request("http://localhost/api/espn/connect/status"),
    )
    expect(response.status).toBe(400)
  })

  it("returns 404 for another user's session", async () => {
    setConnectWorkerForTests({ start: () => {} })
    const startResponse = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    const startBody = await startResponse.json()

    authenticateAs(`${prefix}-other-user`)
    const response = await statusGet(
      new Request(
        `http://localhost/api/espn/connect/status?sessionId=${startBody.sessionId}`,
      ),
    )
    expect(response.status).toBe(404)
  })

  it("starts a session and reaches succeeded without returning cookies", async () => {
    const startResponse = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    const startBody = await startResponse.json()
    expect(startResponse.status).toBe(200)
    expect(startBody.sessionId).toBeTruthy()
    expect(startBody.statusPagePath).toBe(
      `/roster/espn-connect?sessionId=${startBody.sessionId}`,
    )
    expect(JSON.stringify(startBody)).not.toContain("mock-s2")

    let status = "pending"
    for (let i = 0; i < 20 && status !== "succeeded"; i += 1) {
      await new Promise((r) => setTimeout(r, 25))
      const statusResponse = await statusGet(
        new Request(
          `http://localhost/api/espn/connect/status?sessionId=${startBody.sessionId}`,
        ),
      )
      const body = await statusResponse.json()
      expect(JSON.stringify(body)).not.toContain("mock-s2")
      status = body.status
    }
    expect(status).toBe("succeeded")

    const cred = await db.espnCredential.findUnique({ where: { clerkUserId: userId } })
    expect(cred?.espnS2).toBe("mock-s2")
  })

  it("cancels an active session when starting again", async () => {
    setConnectWorkerForTests({ start: () => {} })
    const first = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    const firstBody = await first.json()
    expect(first.status).toBe(200)

    const second = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    const secondBody = await second.json()
    expect(second.status).toBe(200)
    expect(secondBody.sessionId).not.toBe(firstBody.sessionId)

    const previous = await db.espnConnectSession.findUnique({
      where: { id: firstBody.sessionId },
    })
    expect(previous?.status).toBe("cancelled")
  })

  it.each(["failed", "timed_out"] as const)(
    "keeps existing credentials unchanged when the worker ends %s",
    async (terminalStatus) => {
      await upsertUserEspnCredentials(userId, {
        espnS2: "existing-s2",
        swid: "{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}",
      })
      setConnectWorkerForTests({
        start: (sessionId) => {
          void updateConnectSessionStatus(sessionId, terminalStatus)
        },
      })

      const startResponse = await startPost(
        new Request("http://localhost/api/espn/connect/start", {
          method: "POST",
        }),
      )
      const startBody = await startResponse.json()
      expect((await waitForStatus(startBody.sessionId, terminalStatus)).status).toBe(
        terminalStatus,
      )

      const credential = await db.espnCredential.findUnique({
        where: { clerkUserId: userId },
      })
      expect(credential).toMatchObject({
        espnS2: "existing-s2",
        swid: "{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}",
      })
    },
  )

  it("fails with CONNECT_LIVE_DISABLED when no worker override is enabled", async () => {
    setConnectWorkerForTests(null)
    delete process.env.ESPN_CONNECT_LIVE

    const startResponse = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    const startBody = await startResponse.json()
    const statusBody = await waitForStatus(startBody.sessionId, "failed")

    expect(statusBody).toEqual({
      status: "failed",
      errorCode: "CONNECT_LIVE_DISABLED",
    })
  })
})
