import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import {
  cancelActiveConnectSessions,
  createConnectSession,
  updateConnectSessionStatus,
} from "@/lib/espn/connectSession"
import { getConnectWorker } from "@/lib/espn/connectWorker"

export const POST = async (): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // Replace any stuck awaiting_login session so Connect can be retried.
  await cancelActiveConnectSessions(userId)

  const session = await createConnectSession(userId)

  await updateConnectSessionStatus(session.id, "awaiting_login")

  try {
    getConnectWorker().start(session.id, userId)
  } catch {
    await updateConnectSessionStatus(
      session.id,
      "failed",
      "CONNECT_WORKER",
    )
  }

  return NextResponse.json({
    sessionId: session.id,
    statusPagePath: `/roster/espn-connect?sessionId=${session.id}`,
    expiresAt: session.expiresAt.toISOString(),
  })
}
