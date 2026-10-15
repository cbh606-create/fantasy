import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { canonicalTeam } from "./crosswalk"
import type { BreakoutStatLines, RateLine } from "./breakoutStats"
import type { ConfirmedLineup, DepthChart, InjuryUpdate } from "./selection"

export const PRIOR_ROLE_MINUTES_GAP = 8
export const PROJECTION_MINUTES_GAP = 5

export type BreakoutReason = "rates" | "attempts" | "lineup"

export type PriorRole = {
  teamAbbr: string | null
  line: RateLine | null
}

export type BreakoutPlayer = BreakoutStatLines & {
  id: string
  teamAbbr?: string | null
  prior?: PriorRole | null
}

export type BreakoutSelectionInputs = {
  players: readonly BreakoutPlayer[]
  availablePlayerIds: readonly string[]
  lineups: readonly ConfirmedLineup[]
  depth: DepthChart
  updates: readonly InjuryUpdate[]
  crosswalk: ReadonlyMap<string, string>
  now: Date
}

export type BreakoutPick = {
  playerId: string
  reasons: BreakoutReason[]
}

const zSum = (
  line: RateLine | null,
  pool: readonly RateLine[],
): number | null => {
  if (!line?.rates) return null
  const samples = pool.flatMap((item) => (item.rates ? [item.rates] : []))
  if (samples.length === 0) return null

  return ALL_CATEGORY_IDS.reduce((sum, categoryId) => {
    const values = samples.map((sample) => sample[categoryId])
    const mean = values.reduce((total, value) => total + value, 0) / values.length
    const deviation = Math.sqrt(
      values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length,
    )
    if (deviation === 0) return sum
    const value = line.rates?.[categoryId] ?? mean
    const z =
      categoryId === "TO" ? (mean - value) / deviation : (value - mean) / deviation
    return sum + z
  }, 0)
}

const zDidNotFall = (
  recent: RateLine | null,
  baseline: RateLine | null,
  recentPool: readonly RateLine[],
  baselinePool: readonly RateLine[],
): boolean => {
  const recentZ = zSum(recent, recentPool)
  const baselineZ = zSum(baseline, baselinePool)
  if (recentZ === null || baselineZ === null) return false
  return recentZ >= baselineZ
}

const changedTeam = (player: BreakoutPlayer): boolean => {
  const current = player.teamAbbr
  const prior = player.prior?.teamAbbr
  if (!current || !prior) return false
  return canonicalTeam(current) !== canonicalTeam(prior)
}

const ratesReason = (
  player: BreakoutPlayer,
  players: readonly BreakoutPlayer[],
): boolean => {
  const games = player.seasonGames
  const season = player.season
  const seasonMinutes = season?.minutesPerGame
  if (games === null || !(games > 0) || !season || seasonMinutes == null) return false

  const priorLine = player.prior?.line ?? null
  const priorMinutes = priorLine?.minutesPerGame ?? null
  if (priorMinutes != null) {
    if (changedTeam(player) && seasonMinutes > priorMinutes) return true
    const priorPool = players.flatMap((item) => (item.prior?.line ? [item.prior.line] : []))
    const seasonPool = players.flatMap((item) => (item.season ? [item.season] : []))
    return (
      seasonMinutes - priorMinutes >= PRIOR_ROLE_MINUTES_GAP &&
      zDidNotFall(season, priorLine, seasonPool, priorPool)
    )
  }

  const projectionMinutes = player.projection?.minutesPerGame
  if (projectionMinutes == null) return false
  const projectionPool = players.flatMap((item) => (item.projection ? [item.projection] : []))
  const seasonPool = players.flatMap((item) => (item.season ? [item.season] : []))
  return (
    seasonMinutes - projectionMinutes >= PROJECTION_MINUTES_GAP &&
    zDidNotFall(season, player.projection, seasonPool, projectionPool)
  )
}

const attemptsUp = (player: BreakoutPlayer): boolean => {
  const current = player.season?.fgaPerGame
  if (current == null) return false
  const baseline = player.prior?.line
    ? player.prior.line.fgaPerGame
    : player.projection?.fgaPerGame
  return baseline != null && current > baseline
}

const WINDOW_MS = 24 * 60 * 60 * 1000

const latestStatus = (
  updates: readonly InjuryUpdate[],
  rotowireId: string,
  now: Date,
): "out" | "gtd" | "other" | null => {
  let bestAt = Number.NEGATIVE_INFINITY
  let status: "out" | "gtd" | "other" | null = null
  for (const update of updates) {
    if (update.rotowirePlayerId !== rotowireId) continue
    const at = new Date(update.at).getTime()
    if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > WINDOW_MS) continue
    if (at >= bestAt) {
      bestAt = at
      status = update.status
    }
  }
  return status
}

const espnIsOut = (
  espnId: string,
  inputs: BreakoutSelectionInputs,
): boolean =>
  [...inputs.crosswalk.entries()].some(
    ([rotowireId, mappedEspnId]) =>
      mappedEspnId === espnId && latestStatus(inputs.updates, rotowireId, inputs.now) === "out",
  )

const lineupIds = (inputs: BreakoutSelectionInputs): string[] => {
  const ids: string[] = []
  for (const lineup of inputs.lineups) {
    const depthTeam = inputs.depth.teams.find(
      (team) => canonicalTeam(team.teamAbbr) === canonicalTeam(lineup.teamAbbr),
    )
    for (const starter of lineup.starters) {
      if (!starter.position) continue
      const starterEspn = inputs.crosswalk.get(starter.playerId)
      const rank1 = depthTeam?.positions.find((slot) => slot.position === starter.position)
        ?.playerIds[0]
      const rank1Espn = rank1 ? inputs.crosswalk.get(rank1) : undefined
      if (!starterEspn || !rank1Espn || starterEspn === rank1Espn) continue
      const rank1Status = latestStatus(inputs.updates, rank1 ?? "", inputs.now)
      if (rank1Status === "out" || rank1Status === "gtd") continue
      ids.push(starterEspn)
    }
  }
  return ids
}

export const selectBreakouts = (inputs: BreakoutSelectionInputs): BreakoutPick[] => {
  const available = new Set(inputs.availablePlayerIds)
  const reasons = new Map<string, BreakoutReason[]>()
  const add = (playerId: string, reason: BreakoutReason) => {
    if (!available.has(playerId) || espnIsOut(playerId, inputs)) return
    const current = reasons.get(playerId) ?? []
    if (!current.includes(reason)) current.push(reason)
    reasons.set(playerId, current)
  }

  for (const player of inputs.players) {
    if (!ratesReason(player, inputs.players)) continue
    add(player.id, "rates")
    if (attemptsUp(player)) add(player.id, "attempts")
  }
  for (const playerId of lineupIds(inputs)) add(playerId, "lineup")

  return [...reasons.entries()].map(([playerId, rowReasons]) => ({
    playerId,
    reasons: rowReasons,
  }))
}
