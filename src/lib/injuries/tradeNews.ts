import { canonicalTeam } from "./crosswalk"

export type TradeNewsItem = {
  rotowirePlayerId: string
  teamAbbr: string
  headline: string
  notes: string
  position: string
  at: string
}

const COMPLETED = [
  "traded to",
  "traded from",
  "has been traded",
  "was traded",
  "in exchange for",
]

const REJECTED = [
  "rumor",
  "rumour",
  "talks",
  "unlikely",
  "could be traded",
  "may be traded",
  "trade candidate",
  "on the trade block",
  "trade interest",
]

const NBA_TEAM_NAMES: Array<{ code: string; names: string[] }> = [
  { code: "ATL", names: ["atlanta hawks", "hawks", "atlanta", "atl"] },
  { code: "BOS", names: ["boston celtics", "celtics", "boston", "bos"] },
  { code: "BKN", names: ["brooklyn nets", "nets", "brooklyn", "bkn"] },
  { code: "CHA", names: ["charlotte hornets", "hornets", "charlotte", "cha"] },
  { code: "CHI", names: ["chicago bulls", "bulls", "chicago", "chi"] },
  { code: "CLE", names: ["cleveland cavaliers", "cavaliers", "cavs", "cleveland", "cle"] },
  { code: "DAL", names: ["dallas mavericks", "mavericks", "mavs", "dallas", "dal"] },
  { code: "DEN", names: ["denver nuggets", "nuggets", "denver", "den"] },
  { code: "DET", names: ["detroit pistons", "pistons", "detroit", "det"] },
  { code: "GSW", names: ["golden state warriors", "warriors", "golden state", "gsw"] },
  { code: "HOU", names: ["houston rockets", "rockets", "houston", "hou"] },
  { code: "IND", names: ["indiana pacers", "pacers", "indiana", "ind"] },
  { code: "LAC", names: ["los angeles clippers", "la clippers", "clippers", "clips", "los angeles", "lac"] },
  { code: "LAL", names: ["los angeles lakers", "lakers", "los angeles", "lal"] },
  { code: "MEM", names: ["memphis grizzlies", "grizzlies", "memphis", "mem"] },
  { code: "MIA", names: ["miami heat", "heat", "miami", "mia"] },
  { code: "MIL", names: ["milwaukee bucks", "bucks", "milwaukee", "mil"] },
  { code: "MIN", names: ["minnesota timberwolves", "timberwolves", "wolves", "minnesota", "min"] },
  { code: "NOP", names: ["new orleans pelicans", "pelicans", "new orleans", "nop"] },
  { code: "NYK", names: ["new york knicks", "knicks", "new york", "nyk"] },
  { code: "OKC", names: ["oklahoma city thunder", "thunder", "oklahoma city", "okc"] },
  { code: "ORL", names: ["orlando magic", "magic", "orlando", "orl"] },
  { code: "PHI", names: ["philadelphia 76ers", "76ers", "sixers", "philadelphia", "phi"] },
  { code: "PHX", names: ["phoenix suns", "suns", "phoenix", "phx"] },
  { code: "POR", names: ["portland trail blazers", "trail blazers", "blazers", "portland", "por"] },
  { code: "SAC", names: ["sacramento kings", "kings", "sacramento", "sac"] },
  { code: "SAS", names: ["san antonio spurs", "spurs", "san antonio", "sas"] },
  { code: "TOR", names: ["toronto raptors", "raptors", "toronto", "tor"] },
  { code: "UTA", names: ["utah jazz", "jazz", "utah", "uta"] },
  { code: "WAS", names: ["washington wizards", "wizards", "washington", "was"] },
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "")

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const spansOf = (
  fragment: string,
  needle: string,
): Array<{ start: number; end: number }> => {
  const found: Array<{ start: number; end: number }> = []
  let from = 0
  while (from <= fragment.length) {
    const start = fragment.indexOf(needle, from)
    if (start === -1) break
    const before = fragment[start - 1] ?? " "
    const after = fragment[start + needle.length] ?? " "
    if (/[^a-z0-9]/.test(before) && /[^a-z0-9]/.test(after)) {
      found.push({ start, end: start + needle.length })
    }
    from = start + needle.length
  }
  return found
}

const uniqueTeamsIn = (fragment: string): string[] => {
  const hits: Array<{ code: string; start: number; end: number }> = []
  for (const team of NBA_TEAM_NAMES) {
    const code = canonicalTeam(team.code)
    for (const name of team.names) {
      for (const span of spansOf(fragment, name)) hits.push({ code, ...span })
    }
  }
  const kept = hits.filter(
    (hit) =>
      !hits.some(
        (other) =>
          other.code !== hit.code &&
          other.start <= hit.start &&
          other.end >= hit.end &&
          other.end - other.start > hit.end - hit.start,
      ),
  )
  return [...new Set(kept.map((hit) => hit.code))]
}

export const isCompletedTrade = (headline: string, notes: string): boolean => {
  const body = `${headline}\n${notes}`.toLowerCase()
  if (REJECTED.some((phrase) => body.includes(phrase))) return false
  return COMPLETED.some((phrase) => body.includes(phrase))
}

export const teamsMentionedAfter = (value: string, marker: string): string[] => {
  const body = value.toLowerCase()
  const index = body.indexOf(marker)
  if (index === -1) return []
  const teams = uniqueTeamsIn(body.slice(index + marker.length))
  return teams.length === 1 ? teams : []
}

export const parseTradeNews = (payload: unknown): TradeNewsItem[] => {
  if (!isRecord(payload)) return []

  return list(payload.Updates).flatMap((update) => {
    const player = isRecord(update.Player) ? update.Player : {}
    const team = isRecord(update.Team) ? update.Team : {}
    const rotowirePlayerId = text(player.Id)
    const at = text(update.DateTime)
    if (rotowirePlayerId.length === 0 || at.length === 0) return []

    return [
      {
        rotowirePlayerId,
        teamAbbr: text(team.Code),
        headline: text(update.Headline),
        notes: text(update.Notes),
        position: text(player.Position),
        at,
      },
    ]
  })
}
