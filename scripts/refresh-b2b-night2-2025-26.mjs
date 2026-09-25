/**
 * Build 2025-26 B2B night-2 play rates.
 *
 * Prefers NBA league game logs (two requests).
 * Falls back to ESPN athlete gamelogs + teammate-derived team dates.
 *
 * Opportunity = that player's team had a B2B night 2.
 * Appearance = minutes > 0 that night. DNP/rest count as not playing.
 *
 * Usage:
 *   node scripts/refresh-b2b-night2-2025-26.mjs
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const OUT_REL = "data/players/b2b_night2_2025_26.json"
const POOL_REL = "data/players/proj_2026_27.json"
const USER_AGENT =
  "fantasy-draft-tool/0.1 (local B2B night-2 refresh; +https://github.com/cbh606-create/fantasy)"
const NBA_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
}
const NBA_TEAM_LOG =
  "https://stats.nba.com/stats/leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=ASC&LeagueID=00&PlayerOrTeam=T&Season=2025-26&SeasonType=Regular+Season&Sorter=DATE"
const NBA_PLAYER_LOG =
  "https://stats.nba.com/stats/leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=ASC&LeagueID=00&PlayerOrTeam=P&Season=2025-26&SeasonType=Regular+Season&Sorter=DATE"
const GAMELOG = (espnId) =>
  `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${espnId}/gamelog?season=2026`
const ESPN_CONCURRENCY = 6

const TEAM_ALIAS = {
  GS: "GSW",
  NY: "NYK",
  NO: "NOP",
  SA: "SAS",
  WSH: "WAS",
  UTAH: "UTA",
  PHO: "PHX",
  BRK: "BKN",
}

const normalizeTeam = (value) => {
  const team = String(value ?? "").trim().toUpperCase()
  return TEAM_ALIAS[team] ?? team
}

const previousIsoDate = (iso) => {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const nbaDateToIso = (value) => {
  const raw = String(value ?? "").trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

const normalizeName = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")

const minutesFromStat = (value) => {
  const raw = String(value ?? "").trim()
  if (!raw || raw === "-" || raw === "--") return 0
  const minutes = Number.parseFloat(raw.split(":")[0] ?? "")
  return Number.isFinite(minutes) ? minutes : 0
}

const fetchJson = async (url, headers = { "User-Agent": USER_AGENT, Accept: "application/json" }) => {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${url} → ${response.status}`)
  return response.json()
}

const rowsFromNbaLog = (payload) => {
  const result = payload?.resultSets?.[0]
  const headers = result?.headers ?? []
  const rowSet = result?.rowSet ?? []
  return rowSet.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index]])),
  )
}

const night2DatesByTeam = (teamDates) => {
  const out = new Map()
  for (const [team, dates] of teamDates) {
    const night2 = new Set()
    for (const date of dates) {
      if (dates.has(previousIsoDate(date))) night2.add(date)
    }
    out.set(team, night2)
  }
  return out
}

const loadPool = async () => {
  const raw = JSON.parse(await readFile(path.join(process.cwd(), POOL_REL), "utf8"))
  return (raw.players ?? []).map((player) => ({
    id: player.id,
    name: player.name,
    espnId:
      player.espnId ||
      (String(player.id).startsWith("espn-") ? String(player.id).slice(5) : null),
    teamAbbr: normalizeTeam(player.teamAbbr),
  }))
}

const ratesFromPlayed = (pool, teamDates, playedByPoolId, teamsByPoolId) => {
  const night2 = night2DatesByTeam(teamDates)
  const players = {}
  for (const player of pool) {
    const teams = teamsByPoolId.get(player.id) ?? new Set(player.teamAbbr ? [player.teamAbbr] : [])
    const opportunities = new Set()
    for (const team of teams) {
      for (const date of night2.get(team) ?? []) opportunities.add(date)
    }
    const played = playedByPoolId.get(player.id) ?? new Set()
    let appearances = 0
    for (const date of opportunities) {
      if (played.has(date)) appearances += 1
    }
    players[player.id] = {
      appearances,
      opportunities: opportunities.size,
    }
  }
  return players
}

const ratesFromNbaLogs = (pool, teamRows, playerRows) => {
  const teamDates = new Map()
  for (const row of teamRows) {
    const team = normalizeTeam(row.TEAM_ABBREVIATION)
    const date = nbaDateToIso(row.GAME_DATE)
    if (!team || !date) continue
    if (!teamDates.has(team)) teamDates.set(team, new Set())
    teamDates.get(team).add(date)
  }
  const byName = new Map()
  for (const player of pool) {
    const key = normalizeName(player.name)
    if (key && !byName.has(key)) byName.set(key, player)
  }
  const playedByPoolId = new Map()
  const teamsByPoolId = new Map()
  for (const row of playerRows) {
    const player = byName.get(normalizeName(row.PLAYER_NAME))
    if (!player) continue
    const date = nbaDateToIso(row.GAME_DATE)
    const minutes = Number(row.MIN ?? 0)
    if (!date || !(minutes > 0)) continue
    if (!playedByPoolId.has(player.id)) playedByPoolId.set(player.id, new Set())
    playedByPoolId.get(player.id).add(date)
    if (!teamsByPoolId.has(player.id)) teamsByPoolId.set(player.id, new Set())
    teamsByPoolId.get(player.id).add(normalizeTeam(row.TEAM_ABBREVIATION))
  }
  return ratesFromPlayed(pool, teamDates, playedByPoolId, teamsByPoolId)
}

const regularSeasonTypes = (payload) => {
  const types = payload?.seasonTypes ?? []
  const regular = types.filter((row) => /regular/i.test(String(row.displayName ?? row.name ?? "")))
  return regular.length > 0 ? regular : types
}

const eventRowsFromSeasonType = (seasonType) => {
  const categories = seasonType?.categories ?? []
  const rows = []
  for (const category of categories) {
    if (!Array.isArray(category?.events)) continue
    rows.push(...category.events)
  }
  return rows
}

const parseEspnGamelog = (payload) => {
  const eventsById = payload?.events ?? {}
  const played = new Set()
  const teams = new Set()
  const teamDates = []
  for (const seasonType of regularSeasonTypes(payload)) {
    for (const row of eventRowsFromSeasonType(seasonType)) {
      const eventId = String(row.eventId ?? row.id ?? "")
      const event = eventsById[eventId] ?? {}
      const rawDate = event.gameDate
      const date = rawDate
        ? new Date(rawDate).toLocaleDateString("en-CA", {
            timeZone: "America/New_York",
          })
        : ""
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const team = normalizeTeam(event.team?.abbreviation)
      const minutes = minutesFromStat(row.stats?.[0])
      if (team) {
        teams.add(team)
        teamDates.push({ team, date })
      }
      if (minutes > 0) played.add(date)
    }
  }
  return { played, teams, teamDates }
}

const mapPool = async (items, concurrency, worker) => {
  let cursor = 0
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
}

const writeRates = async (players, source) => {
  const out = {
    meta: {
      season: "2025-26",
      source,
      nbaSeasonLabel: "2025-26",
      minOpportunities: 4,
      generatedAt: new Date().toISOString(),
      count: Object.keys(players).length,
    },
    players,
  }
  const dest = path.join(process.cwd(), OUT_REL)
  await writeFile(dest, `${JSON.stringify(out, null, 2)}\n`)
  console.log(`Wrote ${dest} (${out.meta.count} players via ${source})`)
}

const main = async () => {
  const pool = await loadPool()
  try {
    console.log("Fetching NBA 2025-26 league game logs...")
    const [teamPayload, playerPayload] = await Promise.all([
      fetchJson(NBA_TEAM_LOG, NBA_HEADERS),
      fetchJson(NBA_PLAYER_LOG, NBA_HEADERS),
    ])
    const teamRows = rowsFromNbaLog(teamPayload)
    const playerRows = rowsFromNbaLog(playerPayload)
    if (teamRows.length === 0 || playerRows.length === 0) {
      throw new Error("empty NBA league game log")
    }
    const players = ratesFromNbaLogs(pool, teamRows, playerRows)
    await writeRates(players, "nba-stats-leaguegamelog")
    return
  } catch (error) {
    console.warn(`NBA logs failed (${error.message}); falling back to ESPN gamelogs`)
  }

  const teamDates = new Map()
  const playedByPoolId = new Map()
  const teamsByPoolId = new Map()
  const withEspn = pool.filter((row) => row.espnId)
  let done = 0
  let parsed = 0
  await mapPool(withEspn, ESPN_CONCURRENCY, async (player) => {
    try {
      const payload = await fetchJson(GAMELOG(player.espnId))
      const log = parseEspnGamelog(payload)
      if (log.played.size > 0 || log.teamDates.length > 0) parsed += 1
      playedByPoolId.set(player.id, log.played)
      const teams = new Set(log.teams)
      if (player.teamAbbr) teams.add(player.teamAbbr)
      teamsByPoolId.set(player.id, teams)
      for (const row of log.teamDates) {
        if (!teamDates.has(row.team)) teamDates.set(row.team, new Set())
        teamDates.get(row.team).add(row.date)
      }
    } catch {
      teamsByPoolId.set(player.id, new Set(player.teamAbbr ? [player.teamAbbr] : []))
    }
    done += 1
    if (done % 40 === 0) {
      console.log(`  espn fallback ${done}/${withEspn.length} (parsed ${parsed})`)
    }
  })

  const players = ratesFromPlayed(pool, teamDates, playedByPoolId, teamsByPoolId)
  await writeRates(players, "espn-athlete-gamelog")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
