import { auth } from "@clerk/nextjs/server"
import { headers } from "next/headers"

export const requireUserId = async (): Promise<string> => {
  if (process.env.NODE_ENV === "test") {
    const userId = (await headers()).get("x-test-user-id")
    if (userId) return userId

    throw new Error("Unauthorized")
  }

  const { userId } = await auth()
  if (userId) return userId

  throw new Error("Unauthorized")
}
