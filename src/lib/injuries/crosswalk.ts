export type CrosswalkEspnPlayer = {
  id: string
  name: string
  teamAbbr?: string
}

export type CrosswalkRotoPlayer = {
  id: string
  firstName: string
  lastName: string
  teamAbbr: string
}

export type CrosswalkAlias = {
  rotowireId: string
  espnId: string
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"])

const TEAM_ALIASES: Record<string, string> = {
  PHO: "PHX",
  BRK: "BKN",
  CHO: "CHA",
  GS: "GSW",
  SA: "SAS",
  NY: "NYK",
  NO: "NOP",
  WSH: "WAS",
}

export const normalizePersonName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['.'’]/g, "")
    .split(/\s+/)
    .filter((part) => part.length > 0 && !SUFFIXES.has(part))
    .join(" ")

export const canonicalTeam = (code: string): string => {
  const upper = code.trim().toUpperCase()
  return TEAM_ALIASES[upper] ?? upper
}

const personKey = (name: string, teamAbbr: string): string =>
  `${normalizePersonName(name)}|${canonicalTeam(teamAbbr)}`

const pushId = (groups: Map<string, string[]>, key: string, id: string) => {
  const ids = groups.get(key) ?? []
  ids.push(id)
  groups.set(key, ids)
}

export const buildCrosswalk = (
  espnPlayers: CrosswalkEspnPlayer[],
  rotowirePlayers: CrosswalkRotoPlayer[],
  aliases: readonly CrosswalkAlias[] = [],
): Map<string, string> => {
  const espnByKey = new Map<string, string[]>()
  for (const player of espnPlayers) {
    if (!player.teamAbbr || player.name.trim().length === 0) continue
    pushId(espnByKey, personKey(player.name, player.teamAbbr), player.id)
  }

  const rotowireByKey = new Map<string, string[]>()
  for (const player of rotowirePlayers) {
    pushId(
      rotowireByKey,
      personKey(`${player.firstName} ${player.lastName}`, player.teamAbbr),
      player.id,
    )
  }

  const map = new Map<string, string>()
  for (const [key, rotowireIds] of rotowireByKey) {
    const espnIds = espnByKey.get(key) ?? []
    if (rotowireIds.length !== 1 || espnIds.length !== 1) continue
    map.set(rotowireIds[0]!, espnIds[0]!)
  }

  for (const alias of aliases) {
    if (!map.has(alias.rotowireId)) map.set(alias.rotowireId, alias.espnId)
  }

  return map
}
