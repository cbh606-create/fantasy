import { afterEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import {
  CONNECT_SESSION_TTL_MS,
  ConnectSessionConflictError,
  createConnectSession,
  expireConnectSessionIfNeeded,
  getConnectSessionForUser,
  isTerminalConnectStatus,
  updateConnectSessionStatus,
} from "@/lib/espn/connectSession"

const prefix = `espn-connect-unit-${crypto.randomUUID()}`

afterEach(async () => {
  await db.espnConnectSession.deleteMany({
    where: { clerkUserId: { startsWith: prefix } },
  })
})

describe("espn connect sessions", () => {
  it("creates a pending session with ~10m TTL", async () => {
    const userId = `${prefix}-a`
    const before = Date.now()
    const session = await createConnectSession(userId)
    expect(session.status).toBe("pending")
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + CONNECT_SESSION_TTL_MS - 1000,
    )
    expect(isTerminalConnectStatus("pending")).toBe(false)
    expect(isTerminalConnectStatus("succeeded")).toBe(true)
  })

  it("rejects a second active session for the same user", async () => {
    const userId = `${prefix}-b`
    await createConnectSession(userId)
    await expect(createConnectSession(userId)).rejects.toBeInstanceOf(
      ConnectSessionConflictError,
    )
  })

  it("allows a new session after the previous succeeded", async () => {
    const userId = `${prefix}-c`
    const first = await createConnectSession(userId)
    await updateConnectSessionStatus(first.id, "succeeded")
    const second = await createConnectSession(userId)
    expect(second.id).not.toBe(first.id)
  })

  it("marks awaiting_login as timed_out when past expiresAt", async () => {
    const userId = `${prefix}-d`
    const session = await createConnectSession(userId)
    await db.espnConnectSession.update({
      where: { id: session.id },
      data: {
        status: "awaiting_login",
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    const loaded = await getConnectSessionForUser(session.id, userId)
    expect(loaded).not.toBeNull()
    const expired = await expireConnectSessionIfNeeded(loaded!)
    expect(expired.status).toBe("timed_out")
  })

  it("does not expose other users sessions", async () => {
    const owner = `${prefix}-owner`
    const other = `${prefix}-other`
    const session = await createConnectSession(owner)
    expect(await getConnectSessionForUser(session.id, other)).toBeNull()
  })
})
