import type { TradeShape } from "./types"
import { evenValueGap, passesShapeRules } from "./score"

export type SimShape = "1:1" | "1:2" | "2:1" | "2:2" | "2:3" | "3:2" | "3:3"

export const TRADE_SHAPES: SimShape[] = ["1:1", "1:2", "2:1", "2:2", "2:3", "3:2", "3:3"]

export type FairFillPlayer = {
  id: string
  name: string
}

export const shapeLimits = (shape: SimShape) => {
  const [send, receive] = shape.split(":").map(Number)

  return { send, receive }
}

export const fairFills = (
  shape: SimShape,
  sendIds: string[],
  receiveIds: string[],
  yourPlayers: FairFillPlayer[],
  theirPlayers: FairFillPlayer[],
  values: Map<string, number>,
): FairFillPlayer[] => {
  const limits = shapeLimits(shape)
  const sendShort = limits.send - sendIds.length
  const receiveShort = limits.receive - receiveIds.length
  if (sendShort + receiveShort !== 1 || sendShort < 0 || receiveShort < 0) return []

  const shortSide = sendShort === 1 ? "send" : "receive"
  const chosen = shortSide === "send" ? sendIds : receiveIds
  const pool = (shortSide === "send" ? yourPlayers : theirPlayers)
    .filter((player) => !chosen.includes(player.id))

  const ranked = pool.flatMap((player) => {
    const youPlayerIds = shortSide === "send" ? [...sendIds, player.id] : sendIds
    const themPlayerIds = shortSide === "receive" ? [...receiveIds, player.id] : receiveIds
    const tradePackage = {
      shape: `${limits.send}:${limits.receive}` as TradeShape,
      counterpartyTeamIndex: 0,
      youPlayerIds,
      themPlayerIds,
    }
    const check = passesShapeRules(tradePackage, values)
    if (!check.ok) return []

    const closeness = check.overpayRatio
      ?? evenValueGap(tradePackage, values)

    return [{ player, closeness }]
  })

  return ranked
    .sort((left, right) =>
      left.closeness - right.closeness
      || left.player.name.localeCompare(right.player.name))
    .slice(0, 3)
    .map((row) => row.player)
}

export const formatFairFill = (names: string[]) => {
  if (names.length === 0) return null
  if (names.length === 1) return `Add ${names[0]} to make this fair.`

  const last = names[names.length - 1]
  return `Add ${names.slice(0, -1).join(", ")} or ${last} to make this fair.`
}
