import { canonicalTeam } from "./crosswalk"

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
}

export type InjuryReplacement = {
  injuredPlayerId: string
  status: "out" | "gtd"
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

export const selectInjuryReplacements = (
  inputs: InjurySelectionInputs,
): InjuryReplacement[] => {
  const available = new Set(inputs.availablePlayerIds)
  const rows: InjuryReplacement[] = []

  for (const update of latestUpdates(inputs.updates, inputs.now)) {
    const injuredEspnId = inputs.crosswalk.get(update.rotowirePlayerId)
    if (!injuredEspnId) continue

    const position = positionListFor(
      inputs.depth,
      update.teamAbbr,
      update.rotowirePlayerId,
    )
    if (!position) continue

    const lineup = nextLineup(inputs.lineups, update.teamAbbr, inputs.now)
    const injuredIsStarting =
      lineup?.starters.some((starter) => starter.playerId === update.rotowirePlayerId) ??
      false

    if (lineup && !injuredIsStarting) {
      const matches = lineup.starters.filter((starter) => {
        if (starter.playerId === update.rotowirePlayerId) return false
        return starterPosition(starter, inputs.depth, update.teamAbbr) === position.position
      })
      const matched = matches[0]
      const addEspnId = matched ? inputs.crosswalk.get(matched.playerId) : undefined
      if (matches.length === 1 && addEspnId && available.has(addEspnId)) {
        rows.push({
          injuredPlayerId: injuredEspnId,
          status: update.status,
          addPlayerId: addEspnId,
          source: "lineup",
        })
        continue
      }
    }

    const backupRotowireId = position.playerIds
      .slice(position.index + 1)
      .find((playerId) => {
        const espnId = inputs.crosswalk.get(playerId)
        return espnId !== undefined && available.has(espnId)
      })
    const addEspnId = backupRotowireId
      ? inputs.crosswalk.get(backupRotowireId)
      : undefined
    if (!addEspnId) continue

    rows.push({
      injuredPlayerId: injuredEspnId,
      status: update.status,
      addPlayerId: addEspnId,
      source: "depth",
    })
  }

  return rows
}
