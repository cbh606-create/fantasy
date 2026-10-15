type TeamPlayer = {
  name: string
  teamAbbr?: string | null
}

export const NO_TEAM_LABEL = "FA"

export const groupPlayersByTeam = <T extends TeamPlayer>(players: T[]) => {
  const byTeam = new Map<string, T[]>()

  for (const player of players) {
    const team = player.teamAbbr?.trim() || NO_TEAM_LABEL
    const group = byTeam.get(team) ?? []
    group.push(player)
    byTeam.set(team, group)
  }

  return [...byTeam.entries()]
    .sort(([left], [right]) => {
      if (left === NO_TEAM_LABEL) return 1
      if (right === NO_TEAM_LABEL) return -1
      return left.localeCompare(right)
    })
    .map(([team, group]) => ({
      team,
      players: [...group].sort((left, right) => left.name.localeCompare(right.name)),
    }))
}
