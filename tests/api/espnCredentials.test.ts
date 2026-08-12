import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  DELETE,
  GET,
  PUT,
} from "@/app/api/espn/credentials/route"
import { db } from "@/lib/db"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const testUserPrefix = `espn-credentials-api-${crypto.randomUUID()}`
let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

beforeEach(() => {
  currentUserId = `${testUserPrefix}-${crypto.randomUUID()}`
  authenticateAs(currentUserId)
})

afterEach(async () => {
  await db.espnCredential.deleteMany({
    where: { clerkUserId: { startsWith: testUserPrefix } },
  })
})

describe("ESPN credentials API", () => {
  it("saves connected status without returning cookie values", async () => {
    expect((await (await GET()).json()).connected).toBe(false)

    const putResponse = await PUT(
      new Request("http://localhost/api/espn/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          espnS2: "test-s2-value",
          swid: "11111111-2222-3333-4444-555555555555",
        }),
      }),
    )
    const putPayload = await putResponse.json()

    expect(putResponse.status).toBe(200)
    expect(putPayload).toEqual({ connected: true })
    expect(JSON.stringify(putPayload)).not.toContain("test-s2-value")

    const getPayload = await (await GET()).json()
    expect(getPayload).toEqual({ connected: true })

    const deleteResponse = await DELETE()
    expect(await deleteResponse.json()).toEqual({ connected: false })
  })
})
