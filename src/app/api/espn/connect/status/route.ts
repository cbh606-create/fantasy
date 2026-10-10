import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import {
  expireConnectSessionIfNeeded,
  getConnectSessionForUser,
} from "@/lib/espn/connectSession"

export const GET = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId")
  if (!sessionId) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const session = await getConnectSessionForUser(sessionId, userId)
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const updated = await expireConnectSessionIfNeeded(session)

  return NextResponse.json({
    status: updated.status,
    errorCode: updated.errorCode,
  })
}
