import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

/**
 * Rebuild espn-season-league.json player overlays via a snake ADP draft:
 * each round every team takes one ADP-ordered player into one remaining slot.
 * That avoids stacking all top ADP names on the perspective team.
 */

const fixture = JSON.parse(
  execSync("git show HEAD:data/fixtures/espn-season-league.json", {
    encoding: "utf8",
    maxBuffer: 50_000_000,
  }),
)

const pool = JSON.parse(readFileSync("data/players/proj_2026_27.json", "utf8"))
  .players.filter(
    (player) =>
      player.status === "active" &&
      typeof player.teamAbbr === "string" &&
      player.teamAbbr.length >= 2 &&
      Array.isArray(player.positions) &&
      player.positions.length > 0,
  )
  .slice()
  .sort(
    (left, right) =>
      (left.adp ?? 999) - (right.adp ?? 999) ||
      String(left.id).localeCompare(String(right.id)),
  )

const eligibleForSlot = (positions, slot) => {
  if (slot === "BE" || slot === "IL" || slot === "UTIL") return true
  if (slot === "G") {
    return positions.some(
      (position) => position === "PG" || position === "SG" || position === "G",
    )
  }
  if (slot === "F") {
    return positions.some(
      (position) => position === "SF" || position === "PF" || position === "F",
    )
  }
  return positions.includes(slot)
}

const estimateShooting = (projections) => {
  const pts = projections.PTS ?? 0
  const fgPct = projections.FG_PCT ?? 0.45
  const ftPct = projections.FT_PCT ?? 0.75
  const fgm = pts * 0.38
  const fga = fgPct > 0 ? fgm / fgPct : fgm / 0.45
  const ftm = pts * 0.18
  const fta = ftPct > 0 ? ftm / ftPct : ftm / 0.75
  return { FGM: fgm, FGA: fga, FTM: ftm, FTA: fta }
}

const overlayPlayer = (stableId, real, availability) => ({
  id: stableId,
  name: real.name,
  teamAbbr: real.teamAbbr,
  positions: [...real.positions],
  projections: { ...real.projections },
  shooting: estimateShooting(real.projections),
  ...(availability ? { availability } : {}),
})

const usedEspnIds = new Set()
const playersById = new Map()

/** @type {Map<number, { slot: string, playerId: string }[]>} */
const remainingSlotsByTeam = new Map()
/** @type {Map<number, Set<string>>} */
const usedNbaTeamsByTeam = new Map()

for (const team of fixture.teams) {
  remainingSlotsByTeam.set(
    team.teamIndex,
    team.entries
      .filter((entry) => entry.playerId)
      .map((entry) => ({ slot: entry.slot, playerId: entry.playerId })),
  )
  usedNbaTeamsByTeam.set(team.teamIndex, new Set())
}

const draftOrder = fixture.teams
  .map((team) => team.teamIndex)
  .sort((left, right) => left - right)

const maxRounds = Math.max(
  ...[...remainingSlotsByTeam.values()].map((slots) => slots.length),
  0,
)

const pickForTeam = (teamIndex) => {
  const remaining = remainingSlotsByTeam.get(teamIndex)
  if (!remaining || remaining.length === 0) return null

  const usedNba = usedNbaTeamsByTeam.get(teamIndex)

  const tryPick = (requireUniqueNba) => {
    for (const real of pool) {
      if (usedEspnIds.has(real.id)) continue
      if (requireUniqueNba && usedNba.has(real.teamAbbr)) continue

      const slotIndex = remaining.findIndex((entry) =>
        eligibleForSlot(real.positions, entry.slot),
      )
      if (slotIndex < 0) continue

      const [entry] = remaining.splice(slotIndex, 1)
      usedEspnIds.add(real.id)
      usedNba.add(real.teamAbbr)
      playersById.set(entry.playerId, overlayPlayer(entry.playerId, real))
      return { entry, real }
    }
    return null
  }

  return tryPick(true) ?? tryPick(false)
}

for (let round = 0; round < maxRounds; round += 1) {
  const order =
    round % 2 === 0 ? draftOrder : [...draftOrder].reverse()
  for (const teamIndex of order) {
    const picked = pickForTeam(teamIndex)
    if (!picked) {
      const left = remainingSlotsByTeam.get(teamIndex)?.length ?? 0
      if (left > 0) {
        throw new Error(
          `Could not fill round ${round + 1} for team ${teamIndex} (${left} slots left)`,
        )
      }
    }
  }
}

for (const [teamIndex, leftover] of remainingSlotsByTeam) {
  if (leftover.length > 0) {
    throw new Error(
      `Team ${teamIndex} still has unfilled slots: ${leftover
        .map((entry) => entry.slot)
        .join(",")}`,
    )
  }
}

for (const playerId of fixture.availablePlayerIds ?? []) {
  const real = pool.find((player) => !usedEspnIds.has(player.id))
  if (!real) throw new Error("No available player left")
  usedEspnIds.add(real.id)
  const previous = fixture.players.find((player) => player.id === playerId)
  playersById.set(
    playerId,
    overlayPlayer(playerId, real, previous?.availability ?? "fa"),
  )
}

const next = {
  ...fixture,
  players: fixture.players.map(
    (player) => playersById.get(player.id) ?? player,
  ),
}

writeFileSync(
  "data/fixtures/espn-season-league.json",
  `${JSON.stringify(next, null, 2)}\n`,
)

const byId = new Map(next.players.map((player) => [player.id, player]))
const adpByNameTeam = new Map(
  pool.map((player) => [`${player.name}|${player.teamAbbr}`, player.adp]),
)

for (const team of next.teams) {
  const adps = team.entries
    .filter((entry) => entry.playerId)
    .map((entry) => {
      const player = byId.get(entry.playerId)
      return adpByNameTeam.get(`${player.name}|${player.teamAbbr}`) ?? 999
    })
  console.log(
    `\n${team.name} (team ${team.teamIndex}) · ADP ${Math.min(...adps)}–${Math.max(...adps)}:`,
  )
  for (const entry of team.entries) {
    if (!entry.playerId) continue
    const player = byId.get(entry.playerId)
    const adp = adpByNameTeam.get(`${player.name}|${player.teamAbbr}`) ?? "?"
    console.log(
      `  ${entry.slot.padEnd(4)} ${player.name.padEnd(22)} ${player.positions.join("/").padEnd(8)} ${player.teamAbbr}  adp=${adp}`,
    )
  }
}
