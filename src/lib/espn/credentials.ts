import { db } from "@/lib/db"
import {
  normalizeEspnCookies,
  type EspnCookies,
} from "@/lib/espn/cookies"

const assertEspnCredentialModel = () => {
  if (!("espnCredential" in db) || typeof db.espnCredential?.upsert !== "function") {
    throw new Error(
      "Prisma client is missing EspnCredential. Run `npx prisma generate` and restart the server.",
    )
  }
}

export const getUserEspnCookies = async (
  clerkUserId: string,
): Promise<EspnCookies | null> => {
  assertEspnCredentialModel()
  const row = await db.espnCredential.findUnique({
    where: { clerkUserId },
  })
  if (!row) return null

  return normalizeEspnCookies({
    espnS2: row.espnS2,
    swid: row.swid,
  })
}

export const hasUserEspnCredentials = async (
  clerkUserId: string,
): Promise<boolean> => {
  assertEspnCredentialModel()
  const count = await db.espnCredential.count({
    where: { clerkUserId },
  })
  return count > 0
}

export const upsertUserEspnCredentials = async (
  clerkUserId: string,
  cookies: EspnCookies,
): Promise<void> => {
  assertEspnCredentialModel()

  const existing = await db.espnCredential.findUnique({
    where: { clerkUserId },
    select: { id: true },
  })

  if (existing) {
    await db.espnCredential.update({
      where: { clerkUserId },
      data: {
        espnS2: cookies.espnS2,
        swid: cookies.swid,
      },
    })
    return
  }

  await db.espnCredential.create({
    data: {
      clerkUserId,
      espnS2: cookies.espnS2,
      swid: cookies.swid,
    },
  })
}

export const deleteUserEspnCredentials = async (
  clerkUserId: string,
): Promise<void> => {
  assertEspnCredentialModel()
  await db.espnCredential.deleteMany({
    where: { clerkUserId },
  })
}
