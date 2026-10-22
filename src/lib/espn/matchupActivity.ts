import { espnCookieHeader, type EspnCookies } from "@/lib/espn/cookies"
import {
  swapsFromTransactions,
  type ActivityTransaction,
} from "@/lib/matchup/activitySwaps"
import type { PastActualSwap } from "@/lib/matchup/pastActualSwaps"

const FILTER = JSON.stringify({
  transactions: { filterType: { value: ["FREEAGENT", "WAIVER"] } },
})

const leagueUrl = (season: number, leagueId: string, scoringPeriodId: number): URL => {
  const url = new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${season}/segments/0/leagues/${leagueId}`,
  )
  url.searchParams.set("view", "mTransactions2")
  url.searchParams.set("scoringPeriodId", String(scoringPeriodId))
  return url
}

const readTransactions = async (
  url: URL,
  cookies: EspnCookies,
  fetchImpl: typeof fetch,
): Promise<ActivityTransaction[]> => {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: espnCookieHeader(cookies),
      Origin: "https://fantasy.espn.com",
      Referer: "https://fantasy.espn.com/",
      "X-Fantasy-Filter": FILTER,
    },
    redirect: "manual",
  })
  if (!response.ok) throw new Error("espn_activity_failed")
  const payload = (await response.json()) as { transactions?: ActivityTransaction[] }
  return payload.transactions ?? []
}

export const loadMatchupActivitySwaps = async (params: {
  leagueId: string
  season: number
  cookies: EspnCookies
  youTeamId: number
  oppTeamId: number
  periodDates: ReadonlyMap<number, string>
  today: string
  fetchImpl?: typeof fetch
}): Promise<{
  pastActualSwaps: PastActualSwap[]
  opponentPastActualSwaps: PastActualSwap[]
}> => {
  const fetchImpl = params.fetchImpl ?? fetch
  const periods = [
    ...new Set(
      [...params.periodDates.entries()]
        .filter(([, date]) => date <= params.today)
        .map(([id]) => id),
    ),
  ]
  const transactions: ActivityTransaction[] = []
  for (const period of periods) {
    const rows = await readTransactions(
      leagueUrl(params.season, params.leagueId, period),
      params.cookies,
      fetchImpl,
    )
    transactions.push(...rows)
  }

  return {
    pastActualSwaps: swapsFromTransactions(
      transactions,
      params.youTeamId,
      params.periodDates,
      params.today,
    ),
    opponentPastActualSwaps: swapsFromTransactions(
      transactions,
      params.oppTeamId,
      params.periodDates,
      params.today,
    ),
  }
}
