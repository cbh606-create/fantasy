import { db } from "@/lib/db"
import {
  normalizeEspnCookies,
  type EspnCookies,
} from "@/lib/espn/cookies"

export const getUserEspnCookies = async (
  clerkUserId: string,
): Promise<EspnCookies | null> => {
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
  const count = await db.espnCredential.count({
    where: { clerkUserId },
  })
  return count > 0
}

export const upsertUserEspnCredentials = async (
  clerkUserId: string,
  cookies: EspnCookies,
): Promise<void> => {
  await db.espnCredential.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      espnS2: cookies.espnS2,
      swid: cookies.swid,
    },
    update: {
      espnS2: cookies.espnS2,
      swid: cookies.swid,
    },
  })
}

export const deleteUserEspnCredentials = async (
  clerkUserId: string,
): Promise<void> => {
  await db.espnCredential.deleteMany({
    where: { clerkUserId },
  })
}
