export const espnHeadshotUrl = (espnId: string): string =>
  `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`

export const playerInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) return ""

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export const espnIdFromPlayerId = (id?: string): string | undefined => {
  if (!id) return undefined
  if (/^\d+$/.test(id)) return id
  const prefixed = id.match(/^espn-(\d+)$/i)
  return prefixed?.[1]
}

export const resolvePlayerImageUrl = (player: {
  imageUrl?: string
  espnId?: string
  id?: string
}): string | undefined => {
  if (player.imageUrl) return player.imageUrl
  if (player.espnId) return espnHeadshotUrl(player.espnId)
  const fromId = espnIdFromPlayerId(player.id)
  if (fromId) return espnHeadshotUrl(fromId)
  return undefined
}
