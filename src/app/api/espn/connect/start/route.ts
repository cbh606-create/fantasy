import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import {
  ConnectSessionConflictError,
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

  let session
  try {
    session = await createConnectSession(userId)
  } catch (error) {
    if (error instanceof ConnectSessionConflictError) {
      return NextResponse.json({ error: "conflict" }, { status: 409 })
    }
    throw error
  }

  await updateConnectSessionStatus(session.id, "awaiting_login")

  try {
    getConnectWorker().start(session.id, userId)
  } catch {
    await updateConnectSessionStatus(session.id, "failed")
  }

  return NextResponse.json({
    sessionId: session.id,
    statusPagePath: `/roster/espn-connect?sessionId=${session.id}`,
    expiresAt: session.expiresAt.toISOString(),
  })
}
