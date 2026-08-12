import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { normalizeEspnCookies } from "@/lib/espn/cookies"
import {
  deleteUserEspnCredentials,
  hasUserEspnCredentials,
  upsertUserEspnCredentials,
} from "@/lib/espn/credentials"

export const GET = async (): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const connected = await hasUserEspnCredentials(userId)
  return NextResponse.json({ connected })
}

export const PUT = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: { espnS2?: unknown; swid?: unknown }

  try {
    body = (await request.json()) as { espnS2?: unknown; swid?: unknown }
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (typeof body.espnS2 !== "string" || typeof body.swid !== "string") {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const cookies = normalizeEspnCookies({
    espnS2: body.espnS2,
    swid: body.swid,
  })

  if (!cookies) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  await upsertUserEspnCredentials(userId, cookies)
  return NextResponse.json({ connected: true })
}

export const DELETE = async (): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  await deleteUserEspnCredentials(userId)
  return NextResponse.json({ connected: false })
}
