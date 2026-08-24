import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

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
  .sort((left, right) => (left.adp ?? 999) - (right.adp ?? 999))

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

const usedEspnIds = new Set()
const murphy = pool.find((player) => player.name === "Trey Murphy III")
const perspective = fixture.perspectiveTeamIndex

const pickReal = (slot, usedTeams, preferEspnId) => {
  if (preferEspnId) {
    const preferred = pool.find(
      (player) => player.id === preferEspnId && !usedEspnIds.has(player.id),
    )
    if (
      preferred &&
      eligibleForSlot(preferred.positions, slot) &&
      !usedTeams.has(preferred.teamAbbr)
    ) {
      usedEspnIds.add(preferred.id)
      usedTeams.add(preferred.teamAbbr)
      return preferred
    }
  }

  const candidate =
    pool.find(
      (player) =>
        !usedEspnIds.has(player.id) &&
        eligibleForSlot(player.positions, slot) &&
        !usedTeams.has(player.teamAbbr),
    ) ||
    pool.find(
      (player) =>
        !usedEspnIds.has(player.id) && eligibleForSlot(player.positions, slot),
    )

  if (!candidate) throw new Error(`No player for slot ${slot}`)
  usedEspnIds.add(candidate.id)
  usedTeams.add(candidate.teamAbbr)
  return candidate
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

const playersById = new Map()

const assignTeam = (team) => {
  const usedTeams = new Set()
  let utilIndex = 0
  for (const entry of team.entries) {
    if (!entry.playerId) continue
    const prefer =
      team.teamIndex === perspective && entry.slot === "UTIL" && utilIndex === 0
        ? murphy?.id
        : undefined
    if (entry.slot === "UTIL") utilIndex += 1
    const real = pickReal(entry.slot, usedTeams, prefer)
    playersById.set(entry.playerId, overlayPlayer(entry.playerId, real))
  }
}

const perspectiveTeam = fixture.teams.find(
  (team) => team.teamIndex === perspective,
)
const otherTeams = fixture.teams.filter(
  (team) => team.teamIndex !== perspective,
)
if (!perspectiveTeam) throw new Error("Missing perspective team")

assignTeam(perspectiveTeam)
for (const team of otherTeams) assignTeam(team)

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

const you = next.teams.find((team) => team.teamIndex === perspective)
const byId = new Map(next.players.map((player) => [player.id, player]))
console.log("You roster:")
for (const entry of you.entries) {
  const player = byId.get(entry.playerId)
  console.log(
    `${entry.slot.padEnd(4)} ${entry.playerId} ${player.name} · ${player.positions.join("/")} · ${player.teamAbbr}`,
  )
}
