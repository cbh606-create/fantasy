import { capnightPlayerZ } from "@/lib/players/capnightZ"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

export const playerValue = (
  player: SeasonPlayer,
  _leaguePlayers: SeasonPlayer[],
): number => capnightPlayerZ(player.name).value

export const buildPlayerValueMap = (
  state: SeasonLeagueState,
): Map<string, number> =>
  new Map(
    state.players.map((player) => [player.id, capnightPlayerZ(player.name).value]),
  )
