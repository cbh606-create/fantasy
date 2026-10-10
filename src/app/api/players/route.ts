import { NextResponse } from "next/server"
import { getPlayerPool } from "@/lib/players/provider"

export const GET = async (): Promise<Response> => {
  const pool = await getPlayerPool()

  return NextResponse.json({
    players: pool.players,
    source: pool.source,
    meta: pool.meta,
  })
}
