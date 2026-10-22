import { canonicalTeam } from "./crosswalk"
import { isCompletedTrade, teamsMentionedAfter, type TradeNewsItem } from "./tradeNews"

export type DepthPosition = "PG" | "SG" | "SF" | "PF" | "C"

export type InjuryUpdate = {
  rotowirePlayerId: string
  teamAbbr: string
  status: "out" | "gtd" | "other"
  at: string
}

export type DepthChart = {
  teams: Array<{
    teamAbbr: string
    positions: Array<{ position: DepthPosition; playerIds: string[] }>
  }>
}

export type ConfirmedLineup = {
  teamAbbr: string
  startsAt: string
  starters: Array<{ playerId: string; position?: DepthPosition }>
}

export type InjurySelectionInputs = {
  updates: InjuryUpdate[]
  depth: DepthChart
  lineups: ConfirmedLineup[]
  crosswalk: ReadonlyMap<string, string>
  availablePlayerIds: readonly string[]
  now: Date
  news: TradeNewsItem[]
}

export type InjuryReplacement = {
  injuredPlayerId: string
  status: "out" | "gtd" | "traded"
  addPlayerId: string
  source: "lineup" | "depth"
}

const WINDOW_MS = 24 * 60 * 60 * 1000
const POSITIONS = new Set<DepthPosition>(["PG", "SG", "SF", "PF", "C"])

const isPosition = (value: string | undefined): value is DepthPosition =>
  value !== undefined && POSITIONS.has(value as DepthPosition)

type PositionList = {
  position: DepthPosition
  playerIds: string[]
  index: number
}

const positionListFor = (
  depth: DepthChart,
  teamAbbr: string,
  rotowirePlayerId: string,
): PositionList | null => {
  const team = depth.teams.find(
    (entry) => canonicalTeam(entry.teamAbbr) === canonicalTeam(teamAbbr),
  )
  if (!team) return null

  let best: PositionList | null = null
  for (const group of team.positions) {
    const index = group.playerIds.indexOf(rotowirePlayerId)
    if (index === -1) continue
    if (!best || index < best.index) {
      best = { position: group.position, playerIds: group.playerIds, index }
    }
  }

  return best
}

const latestUpdates = (
  updates: InjuryUpdate[],
  now: Date,
): Array<InjuryUpdate & { status: "out" | "gtd" }> => {
  const byPlayer = new Map<string, InjuryUpdate>()
  for (const update of updates) {
    const at = new Date(update.at).getTime()
    if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > WINDOW_MS) continue
    const current = byPlayer.get(update.rotowirePlayerId)
    if (!current || at >= new Date(current.at).getTime()) {
      byPlayer.set(update.rotowirePlayerId, update)
    }
  }

  return [...byPlayer.values()].filter(
    (update): update is InjuryUpdate & { status: "out" | "gtd" } =>
      update.status === "out" || update.status === "gtd",
  )
}

const nextLineup = (
  lineups: ConfirmedLineup[],
  teamAbbr: string,
  now: Date,
): ConfirmedLineup | null => {
  const upcoming = lineups
    .filter((lineup) => {
      if (canonicalTeam(lineup.teamAbbr) !== canonicalTeam(teamAbbr)) return false
      const startsAt = new Date(lineup.startsAt).getTime()
      return !Number.isNaN(startsAt) && startsAt > now.getTime()
    })
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    )

  return upcoming[0] ?? null
}

const starterPosition = (
  starter: ConfirmedLineup["starters"][number],
  depth: DepthChart,
  teamAbbr: string,
): DepthPosition | null => {
  if (isPosition(starter.position)) return starter.position
  return positionListFor(depth, teamAbbr, starter.playerId)?.position ?? null
}

const SINGLE_POSITIONS = new Set<DepthPosition>(["PG", "SG", "SF", "PF", "C"])

const pickReplacement = (
  inputs: InjurySelectionInputs,
  rotowirePlayerId: string,
  teamAbbr: string,
  available: Set<string>,
): { addPlayerId: string; source: "lineup" | "depth" } | null => {
  const position = positionListFor(inputs.depth, teamAbbr, rotowirePlayerId)
  if (!position) return null

  const lineup = nextLineup(inputs.lineups, teamAbbr, inputs.now)
  const isStarting =
    lineup?.starters.some((starter) => starter.playerId === rotowirePlayerId) ?? false

  if (lineup && !isStarting) {
    const matches = lineup.starters.filter((starter) => {
      if (starter.playerId === rotowirePlayerId) return false
      return starterPosition(starter, inputs.depth, teamAbbr) === position.position
    })
    const matched = matches[0]
    const addPlayerId = matched ? inputs.crosswalk.get(matched.playerId) : undefined
    if (matches.length === 1 && addPlayerId && available.has(addPlayerId)) {
      return { addPlayerId, source: "lineup" }
    }
  }

  const backupId = position.playerIds.slice(position.index + 1).find((playerId) => {
    const espnId = inputs.crosswalk.get(playerId)
    return espnId !== undefined && available.has(espnId)
  })
  const addPlayerId = backupId ? inputs.crosswalk.get(backupId) : undefined
  if (!addPlayerId) return null
  return { addPlayerId, source: "depth" }
}

const pickOpenPosition = (
  inputs: InjurySelectionInputs,
  teamAbbr: string,
  position: string,
  available: Set<string>,
): { addPlayerId: string; source: "depth" } | null => {
  if (!SINGLE_POSITIONS.has(position as DepthPosition)) return null
  const team = inputs.depth.teams.find(
    (entry) => canonicalTeam(entry.teamAbbr) === canonicalTeam(teamAbbr),
  )
  const group = team?.positions.find((entry) => entry.position === position)
  const backupId = group?.playerIds.find((playerId) => {
    const espnId = inputs.crosswalk.get(playerId)
    return espnId !== undefined && available.has(espnId)
  })
  const addPlayerId = backupId ? inputs.crosswalk.get(backupId) : undefined
  if (!addPlayerId) return null
  return { addPlayerId, source: "depth" }
}

const teamsListing = (depth: DepthChart, rotowirePlayerId: string): string[] =>
  depth.teams
    .filter((team) =>
      team.positions.some((group) => group.playerIds.includes(rotowirePlayerId)),
    )
    .map((team) => team.teamAbbr)

const vacatedTeam = (item: TradeNewsItem, depth: DepthChart): string | null => {
  const text = `${item.headline}\n${item.notes}`
  const destination = teamsMentionedAfter(text, "traded to")[0] ?? null
  const listed = teamsListing(depth, item.rotowirePlayerId)
  if (listed.length === 1 && canonicalTeam(listed[0]!) !== destination) return listed[0]!

  const origin = teamsMentionedAfter(text, "traded from")[0] ?? null
  if (origin && origin !== destination) return origin

  if (item.teamAbbr.length > 0 && canonicalTeam(item.teamAbbr) !== destination) {
    return item.teamAbbr
  }
  return null
}

const latestCompletedTrades = (items: TradeNewsItem[], now: Date): TradeNewsItem[] => {
  const byPlayer = new Map<string, TradeNewsItem>()
  for (const item of items) {
    const at = new Date(item.at).getTime()
    if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > WINDOW_MS) continue
    const current = byPlayer.get(item.rotowirePlayerId)
    if (!current || at >= new Date(current.at).getTime()) byPlayer.set(item.rotowirePlayerId, item)
  }
  return [...byPlayer.values()].filter((item) => isCompletedTrade(item.headline, item.notes))
}

export const selectInjuryReplacements = (
  inputs: InjurySelectionInputs,
): InjuryReplacement[] => {
  const available = new Set(inputs.availablePlayerIds)
  const rows: InjuryReplacement[] = []

  for (const update of latestUpdates(inputs.updates, inputs.now)) {
    const injuredEspnId = inputs.crosswalk.get(update.rotowirePlayerId)
    if (!injuredEspnId) continue

    const pick = pickReplacement(
      inputs,
      update.rotowirePlayerId,
      update.teamAbbr,
      available,
    )
    if (!pick) continue

    rows.push({
      injuredPlayerId: injuredEspnId,
      status: update.status,
      addPlayerId: pick.addPlayerId,
      source: pick.source,
    })
  }

  for (const item of latestCompletedTrades(inputs.news, inputs.now)) {
    const injuredPlayerId = inputs.crosswalk.get(item.rotowirePlayerId)
    const teamAbbr = vacatedTeam(item, inputs.depth)
    if (!injuredPlayerId || !teamAbbr) continue

    const onChart = positionListFor(inputs.depth, teamAbbr, item.rotowirePlayerId)
    const pick = onChart
      ? pickReplacement(inputs, item.rotowirePlayerId, teamAbbr, available)
      : pickOpenPosition(inputs, teamAbbr, item.position, available)
    if (!pick) continue

    rows.push({
      injuredPlayerId,
      status: "traded",
      addPlayerId: pick.addPlayerId,
      source: pick.source,
    })
  }

  return rows
}
