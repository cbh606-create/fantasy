import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import {
  DEPTH_BASE,
  DEPTH_STEP,
  GTD_WEIGHT,
  MAX_INJURY_PICKUPS,
} from "./constants"
import type { DepthChartProvider, InjuryEventProvider } from "./providers"
import type {
  InjuryPickupRecommendation,
  InjuryPickupsResult,
} from "./types"

type RecommendInjuryPickupsInput = {
  state: SeasonLeagueState
  depth: DepthChartProvider
  injuries: InjuryEventProvider
  playersById?: Map<string, SeasonPlayer>
}

const resolvePlayerName = (
  playerId: string,
  playersById: Map<string, SeasonPlayer>,
): string => playersById.get(playerId)?.name ?? playerId

const scoreBackup = (depthRank: number, status: "out" | "gtd"): number => {
  const base = Math.max(0, DEPTH_BASE - (depthRank - 1) * DEPTH_STEP)
  return status === "gtd" ? base * GTD_WEIGHT : base
}

const youRosterPlayerIds = (state: SeasonLeagueState): Set<string> => {
  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  const ids = (youTeam?.entries ?? [])
    .map((entry) => entry.playerId)
    .filter((playerId): playerId is string => playerId !== null)

  return new Set(ids)
}

export const recommendInjuryPickups = ({
  state,
  depth,
  injuries,
  playersById,
}: RecommendInjuryPickupsInput): InjuryPickupsResult => {
  const events = injuries.list()
  const available = new Set(state.availablePlayerIds)
  const rosterIds = youRosterPlayerIds(state)
  const names = playersById ?? new Map(state.players.map((player) => [player.id, player]))

  const candidates: InjuryPickupRecommendation[] = []

  for (const event of events) {
    const backups = depth.backups(event.teamAbbr, event.playerId)
    const urgency = rosterIds.has(event.playerId) ? "roster" : "league"
    const injuredPlayerName = resolvePlayerName(event.playerId, names)

    backups.forEach((addPlayerId, index) => {
      if (!available.has(addPlayerId)) {
        return
      }

      const depthRank = index + 1
      const reasons = [
        `${event.teamAbbr} depth #${depthRank} behind ${injuredPlayerName} (${event.status.toUpperCase()})`,
      ]
      if (urgency === "roster") {
        reasons.push("On your roster — replace minutes")
      }

      candidates.push({
        injuredPlayerId: event.playerId,
        injuredPlayerName,
        addPlayerId,
        addPlayerName: resolvePlayerName(addPlayerId, names),
        teamAbbr: event.teamAbbr,
        status: event.status,
        depthRank,
        urgency,
        score: scoreBackup(depthRank, event.status),
        reasons,
      })
    })
  }

  const byAddPlayerId = new Map<string, InjuryPickupRecommendation>()
  for (const recommendation of candidates) {
    const existing = byAddPlayerId.get(recommendation.addPlayerId)
    if (!existing || recommendation.score > existing.score) {
      byAddPlayerId.set(recommendation.addPlayerId, recommendation)
    }
  }

  const recommendations = [...byAddPlayerId.values()]
    .sort((left, right) => {
      if (left.urgency !== right.urgency) {
        return left.urgency === "roster" ? -1 : 1
      }

      return right.score - left.score
    })
    .slice(0, MAX_INJURY_PICKUPS)

  return {
    events,
    recommendations,
    source: { depth: "fixture", injuries: "fixture" },
  }
}
