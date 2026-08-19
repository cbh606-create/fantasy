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

const authenticateAs = (id?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(id ? { "x-test-user-id": id } : {}) as never,
  )
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

  it("returns 409 when an active session already exists", async () => {
    setConnectWorkerForTests({ start: () => {} })
    const first = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    expect(first.status).toBe(200)
    const second = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    expect(second.status).toBe(409)
  })
})
