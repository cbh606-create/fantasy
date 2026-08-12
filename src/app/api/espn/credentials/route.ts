import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { normalizeEspnCookies } from "@/lib/espn/cookies"
import {
  deleteUserEspnCredentials,
  hasUserEspnCredentials,
  upsertUserEspnCredentials,
} from "@/lib/espn/credentials"

const toSafeErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return "Unable to save ESPN credentials"

  const message = error.message
  if (message.includes("EspnCredential") || message.includes("prisma generate")) {
    return message
  }
  if (message.includes("no such table") || message.includes("SqliteError")) {
    return "Database is missing EspnCredential table. Run `npx prisma migrate dev` in the worktree, then restart."
  }

  return `Unable to save ESPN credentials: ${message}`
}

export const GET = async (): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const connected = await hasUserEspnCredentials(userId)
    return NextResponse.json({ connected })
  } catch (error) {
    console.error("ESPN credentials GET failed", error)
    return NextResponse.json(
      { error: "server_error", message: toSafeErrorMessage(error) },
      { status: 500 },
    )
  }
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

  try {
    await upsertUserEspnCredentials(userId, cookies)
    return NextResponse.json({ connected: true })
  } catch (error) {
    console.error("ESPN credentials PUT failed", error)
    return NextResponse.json(
      { error: "server_error", message: toSafeErrorMessage(error) },
      { status: 500 },
    )
  }
}

export const DELETE = async (): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    await deleteUserEspnCredentials(userId)
    return NextResponse.json({ connected: false })
  } catch (error) {
    console.error("ESPN credentials DELETE failed", error)
    return NextResponse.json(
      { error: "server_error", message: toSafeErrorMessage(error) },
      { status: 500 },
    )
  }
}
