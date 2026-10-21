import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { CATEGORY_SHORT_LABELS, formatCategoryStat } from "@/lib/season/formatCategoryStat"
import { canonicalTeam } from "./crosswalk"
import type { BreakoutStatLines, RateLine } from "./breakoutStats"
import type { ConfirmedLineup, DepthChart, InjuryUpdate } from "./selection"

export const PRIOR_ROLE_MINUTES_GAP = 8
export const TEAM_CHANGE_MINUTES_GAP = 3
export const PROJECTION_MINUTES_GAP = 5
export const VACATED_FGA_GAP = 4
export const VACATED_MINUTES = 28
export const SPECIALIST_MIN_MINUTES = 20
export const SPECIALIST_MAX_MINUTES = 28
export const SPECIALIST_MIN_GAMES = 3
export const SPECIALIST_STOCKS = 2
export const SPECIALIST_THREES = 2
export const SPECIALIST_REBOUNDS = 8
export const SPECIALIST_BLOCKS = 2
export const NO_PRIOR_EARLY_MINUTES = 28
export const NO_PRIOR_LATER_MINUTES = 24
export const FADE_MINUTES = 24
export const FADE_POINTS = 4
const EARLY_SAMPLE_GAMES = 8

export type BreakoutReason = "rates" | "attempts" | "lineup"

export type BreakoutEvidence = {
  games: number | null
  baselineMinutes: number | null
  seasonMinutes: number | null
  baseline: "prior" | "projection" | null
  zHeld: boolean | null
  attempts: "up" | "down" | "flat" | null
}

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

export type BreakoutLast7 = {
  games: number
  minutesPerGame: number | null
  rates: Record<CategoryId, number> | null
}

export type BreakoutPick = {
  playerId: string
  reasons: BreakoutReason[]
  evidence: BreakoutEvidence
  last7: BreakoutLast7 | null
}

const emptyEvidence = (): BreakoutEvidence => ({
  games: null,
  baselineMinutes: null,
  seasonMinutes: null,
  baseline: null,
  zHeld: null,
  attempts: null,
})

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

const linesOf = (
  players: readonly BreakoutPlayer[],
  key: "season" | "last7" | "projection" | "prior",
): RateLine[] => {
  if (key === "season") return players.flatMap((item) => (item.season ? [item.season] : []))
  if (key === "last7") return players.flatMap((item) => (item.last7 ? [item.last7] : []))
  if (key === "projection") return players.flatMap((item) => (item.projection ? [item.projection] : []))
  return players.flatMap((item) => (item.prior?.line ? [item.prior.line] : []))
}

const zHeldForWindow = (
  player: BreakoutPlayer,
  recent: RateLine,
  recentKey: "season" | "last7",
  players: readonly BreakoutPlayer[],
): boolean => {
  const priorLine = player.prior?.line ?? null
  if (priorLine) return zDidNotFall(recent, priorLine, linesOf(players, recentKey), linesOf(players, "prior"))
  if (!player.projection) return false
  return zDidNotFall(recent, player.projection, linesOf(players, recentKey), linesOf(players, "projection"))
}

const specialistLine = (line: RateLine | null, games: number): boolean => {
  const minutes = line?.minutesPerGame
  const rates = line?.rates
  if (minutes == null || !rates || games < SPECIALIST_MIN_GAMES) return false
  if (minutes < SPECIALIST_MIN_MINUTES || minutes >= SPECIALIST_MAX_MINUTES) return false
  return (
    rates.STL + rates.BLK >= SPECIALIST_STOCKS ||
    rates.TPM >= SPECIALIST_THREES ||
    rates.REB >= SPECIALIST_REBOUNDS ||
    rates.BLK >= SPECIALIST_BLOCKS
  )
}

const scoringCooled = (player: BreakoutPlayer): boolean => {
  const games = player.seasonGames
  const seasonPts = player.season?.rates?.PTS
  const recent = player.last7
  const recentMinutes = recent?.minutesPerGame
  const recentPts = recent?.rates?.PTS
  if (games === null || games < EARLY_SAMPLE_GAMES) return false
  if (seasonPts == null || recentMinutes == null || recentPts == null) return false
  return recentMinutes >= FADE_MINUTES && recentPts <= seasonPts - FADE_POINTS
}

const windowQualifies = (
  player: BreakoutPlayer,
  line: RateLine,
  games: number,
  players: readonly BreakoutPlayer[],
  recentKey: "season" | "last7",
): boolean => {
  const minutes = line.minutesPerGame
  if (minutes == null || !(games > 0)) return false
  const priorMinutes = player.prior?.line?.minutesPerGame ?? null
  const early = games < EARLY_SAMPLE_GAMES
  const zOk = () => zHeldForWindow(player, line, recentKey, players)

  if (priorMinutes != null) {
    if (changedTeam(player) && minutes - priorMinutes >= TEAM_CHANGE_MINUTES_GAP) return true
    if (!changedTeam(player) && minutes - priorMinutes >= PRIOR_ROLE_MINUTES_GAP && (early || zOk())) {
      return true
    }
    const priorFga = player.prior?.line?.fgaPerGame ?? null
    const fga = line.fgaPerGame
    return (
      !changedTeam(player) &&
      priorFga != null &&
      fga != null &&
      fga - priorFga >= VACATED_FGA_GAP &&
      minutes >= VACATED_MINUTES &&
      (early || zOk())
    )
  }

  if (early) return minutes >= NO_PRIOR_EARLY_MINUTES
  if (minutes < NO_PRIOR_LATER_MINUTES || !zOk()) return false
  if (minutes >= NO_PRIOR_EARLY_MINUTES) return true
  const projectionMinutes = player.projection?.minutesPerGame
  return projectionMinutes != null && minutes - projectionMinutes >= PROJECTION_MINUTES_GAP
}

const specialistReason = (player: BreakoutPlayer): boolean => {
  const games = player.seasonGames
  const seasonOk = Boolean(
    player.season && games !== null && games > 0 && specialistLine(player.season, games),
  )
  const recent = player.last7
  const recentOk = Boolean(recent && recent.gamesPlayed > 0 && specialistLine(recent, recent.gamesPlayed))
  if (recent && recent.gamesPlayed >= SPECIALIST_MIN_GAMES && !specialistLine(recent, recent.gamesPlayed)) {
    return false
  }
  return seasonOk || recentOk
}

const ratesReason = (
  player: BreakoutPlayer,
  players: readonly BreakoutPlayer[],
): boolean => {
  const season = player.season
  const games = player.seasonGames
  const last7 = player.last7
  if (specialistReason(player)) return true
  if (scoringCooled(player)) return false
  if (season && games !== null && games > 0 && windowQualifies(player, season, games, players, "season")) {
    return true
  }
  return Boolean(
    last7 &&
      last7.gamesPlayed > 0 &&
      windowQualifies(player, last7, last7.gamesPlayed, players, "last7"),
  )
}

const zHeldFor = (
  player: BreakoutPlayer,
  players: readonly BreakoutPlayer[],
): boolean | null => {
  const season = player.season
  if (!season) return null
  const priorLine = player.prior?.line ?? null
  if (priorLine) {
    const priorPool = players.flatMap((item) => (item.prior?.line ? [item.prior.line] : []))
    const seasonPool = players.flatMap((item) => (item.season ? [item.season] : []))
    const recentZ = zSum(season, seasonPool)
    const baselineZ = zSum(priorLine, priorPool)
    if (recentZ === null || baselineZ === null) return null
    return recentZ >= baselineZ
  }
  if (!player.projection) return null
  const projectionPool = players.flatMap((item) => (item.projection ? [item.projection] : []))
  const seasonPool = players.flatMap((item) => (item.season ? [item.season] : []))
  const recentZ = zSum(season, seasonPool)
  const baselineZ = zSum(player.projection, projectionPool)
  if (recentZ === null || baselineZ === null) return null
  return recentZ >= baselineZ
}

const attemptBaseline = (player: BreakoutPlayer): number | null => {
  if (player.prior?.line) return player.prior.line.fgaPerGame
  return player.projection?.fgaPerGame ?? null
}

const attemptsUp = (player: BreakoutPlayer): boolean => {
  const current = player.season?.fgaPerGame
  const baseline = attemptBaseline(player)
  return current != null && baseline != null && current > baseline
}

const attemptsDirection = (player: BreakoutPlayer): BreakoutEvidence["attempts"] => {
  const current = player.season?.fgaPerGame
  const baseline = attemptBaseline(player)
  if (current == null || baseline == null) return null
  if (current > baseline) return "up"
  if (current < baseline) return "down"
  return "flat"
}

const evidenceFor = (
  player: BreakoutPlayer | undefined,
  players: readonly BreakoutPlayer[],
): BreakoutEvidence => {
  if (!player) return emptyEvidence()
  const priorMinutes = player.prior?.line?.minutesPerGame ?? null
  const projectionMinutes = player.projection?.minutesPerGame ?? null
  const baseline = priorMinutes != null ? "prior" : projectionMinutes != null ? "projection" : null
  return {
    games: player.seasonGames,
    baselineMinutes: baseline === "prior" ? priorMinutes : projectionMinutes,
    seasonMinutes: player.season?.minutesPerGame ?? null,
    baseline,
    zHeld: zHeldFor(player, players),
    attempts: attemptsDirection(player),
  }
}

const last7Line = (line: RateLine | null | undefined): BreakoutLast7 | null => {
  if (!line || !(line.gamesPlayed > 0)) return null
  return {
    games: line.gamesPlayed,
    minutesPerGame: line.minutesPerGame,
    rates: line.rates,
  }
}

const LAST7_MAIN_STATS = ["PTS", "REB", "AST", "TPM"] as const satisfies readonly CategoryId[]

export const formatBreakoutLast7 = (line: BreakoutLast7 | null): string => {
  if (!line?.rates) return "No last 7 games"
  return LAST7_MAIN_STATS.map(
    (categoryId) => `${formatCategoryStat(categoryId, line.rates?.[categoryId] ?? 0)} ${CATEGORY_SHORT_LABELS[categoryId]}`,
  ).join(" · ")
}

export const formatBreakoutEvidence = (evidence: BreakoutEvidence): string => {
  if (evidence.seasonMinutes == null) return ""
  const minutes =
    evidence.baselineMinutes == null
      ? `${evidence.seasonMinutes.toFixed(1)} mpg`
      : `${evidence.baselineMinutes.toFixed(1)} → ${evidence.seasonMinutes.toFixed(1)} mpg`
  const games = evidence.games == null ? "" : `${evidence.games} GP`
  const z = evidence.zHeld === null ? "" : evidence.zHeld ? "z held" : "z down"
  const attempts =
    evidence.attempts === "up"
      ? "FGA up"
      : evidence.attempts === "down"
        ? "FGA down"
        : evidence.attempts === "flat"
          ? "FGA flat"
          : "FGA n/a"
  return [minutes, games, z, attempts].filter((part) => part.length > 0).join(" · ")
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

  const byId = new Map(inputs.players.map((player) => [player.id, player]))
  return [...reasons.entries()].map(([playerId, rowReasons]) => ({
    playerId,
    reasons: rowReasons,
    evidence: evidenceFor(byId.get(playerId), inputs.players),
    last7: last7Line(byId.get(playerId)?.last7),
  }))
}
