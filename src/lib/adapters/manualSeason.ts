import { defaultCategorySettings } from "@/lib/domain/categories"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonTeamRoster,
} from "@/lib/season/types"

export type ManualSeasonLeagueInput = Pick<
  SeasonLeagueState,
  "name" | "season" | "perspectiveTeamIndex" | "teams" | "players"
>

const normalizeEntries = (
  entries: SeasonRosterEntry[],
): SeasonRosterEntry[] =>
  SEASON_ROSTER_SLOTS.map((slot, index) => ({
    slot,
    playerId: entries[index]?.playerId ?? null,
  }))

const normalizeTeam = (team: SeasonTeamRoster): SeasonTeamRoster => ({
  ...team,
  entries: normalizeEntries(team.entries),
})

const normalizePlayer = (player: SeasonPlayer): SeasonPlayer => ({
  ...player,
  teamAbbr: player.teamAbbr?.toUpperCase(),
  projections: { ...player.projections },
  shooting: { ...player.shooting },
})

export const manualToSeasonLeagueState = (
  input: ManualSeasonLeagueInput,
): SeasonLeagueState => ({
  name: input.name,
  season: input.season,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: input.perspectiveTeamIndex,
  teams: input.teams.map(normalizeTeam),
  players: input.players.map(normalizePlayer),
  source: "manual",
})
