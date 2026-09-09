/**
 * Pull the published 2026-27 NBA regular-season schedule from ESPN scoreboard
 * and write data/fixtures/nba-schedule-2026-27.json.
 *
 * ESPN far-future dates can flake (empty payloads or transient HTTP errors).
 * This script retries each day once and skips days that still fail. It never
 * invents games — commit whatever a successful pull yields.
 *
 * ESPN 2026-27 scoreboard uses UTAH (player pool uses UTA) and may emit
 * TBD vs TBD placeholders. TBD rows are dropped; they are not replaced.
 *
 * Usage:
 *   node scripts/refresh-nba-schedule.mjs
 */

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
const SEASON = "2026-27"
const START_ISO = "2026-10-20"
const END_ISO = "2027-04-11"
const CONCURRENCY = 4
const NEW_YORK_TIME_ZONE = "America/New_York"
const OUT_REL = "data/fixtures/nba-schedule-2026-27.json"

const ESPN_TEAM_ABBR_MAP = {
  GS: "GSW",
  NY: "NYK",
  NO: "NOP",
  SA: "SAS",
  WSH: "WAS",
  UTAH: "UTA",
}

const normalizeEspnTeamAbbr = (abbreviation) => {
  const normalized = abbreviation.trim().toUpperCase()
  return ESPN_TEAM_ABBR_MAP[normalized] ?? normalized
}

const formatNewYorkIsoDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const addUtcDays = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const listDates = (startIso, endIso) => {
  const dates = []
  let current = startIso
  while (current <= endIso) {
    dates.push(current)
    current = addUtcDays(current, 1)
  }
  return dates
}

const getTeamAbbreviation = (competitors, homeAway) => {
  const competitor = competitors.find((entry) => entry.homeAway === homeAway)
  const abbreviation = competitor?.team?.abbreviation
  return typeof abbreviation === "string"
    ? normalizeEspnTeamAbbr(abbreviation)
    : null
}

const normalizeCompetition = (competition, eventDate) => {
  if (!Array.isArray(competition.competitors)) return null

  const homeAbbr = getTeamAbbreviation(competition.competitors, "home")
  const awayAbbr = getTeamAbbreviation(competition.competitors, "away")
  const rawDate =
    typeof competition.date === "string" ? competition.date : eventDate
  if (!homeAbbr || !awayAbbr || typeof rawDate !== "string") return null
  if (homeAbbr === "TBD" || awayAbbr === "TBD") return null

  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return null

  const nyDate = formatNewYorkIsoDate(date)
  if (nyDate < START_ISO || nyDate > END_ISO) return null

  return {
    date: nyDate,
    homeAbbr,
    awayAbbr,
  }
}

const normalizeScoreboard = (payload) => {
  const events =
    typeof payload === "object" &&
    payload !== null &&
    "events" in payload &&
    Array.isArray(payload.events)
      ? payload.events
      : []

  return events.flatMap((event) => {
    if (!Array.isArray(event.competitions)) return []
    return event.competitions
      .map((competition) => normalizeCompetition(competition, event.date))
      .filter((game) => game !== null)
  })
}

const fetchScoreboard = async (yyyymmdd) => {
  const url = `${ESPN_SCOREBOARD_URL}?dates=${yyyymmdd}`
  const attempt = async () => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`ESPN scoreboard request failed: ${response.status}`)
    }
    return response.json()
  }

  try {
    return await attempt()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Retrying ${yyyymmdd}: ${message}`)
    return await attempt()
  }
}

const mapPool = async (items, concurrency, mapper) => {
  const results = new Array(items.length)
  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await mapper(items[current])
    }
  })
  await Promise.all(workers)
  return results
}

const main = async () => {
  const dates = listDates(START_ISO, END_ISO)
  let skippedDays = 0

  const dailyGames = await mapPool(dates, CONCURRENCY, async (isoDate) => {
    const yyyymmdd = isoDate.replaceAll("-", "")
    try {
      const payload = await fetchScoreboard(yyyymmdd)
      return normalizeScoreboard(payload)
    } catch (error) {
      skippedDays += 1
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Skipping ${isoDate} after retry: ${message}`)
      return []
    }
  })

  const seen = new Set()
  const games = dailyGames.flat().filter((game) => {
    const key = `${game.date}|${game.homeAbbr}|${game.awayAbbr}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  games.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.homeAbbr !== b.homeAbbr) return a.homeAbbr < b.homeAbbr ? -1 : 1
    return a.awayAbbr < b.awayAbbr ? -1 : 1
  })

  const teams = new Set()
  for (const game of games) {
    teams.add(game.homeAbbr)
    teams.add(game.awayAbbr)
  }

  const outPath = path.resolve(process.cwd(), OUT_REL)
  await mkdir(path.dirname(outPath), { recursive: true })
  const payload = {
    season: SEASON,
    games,
  }
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")

  console.log(`Wrote ${OUT_REL}`)
  console.log(`games: ${games.length}`)
  console.log(`teams: ${teams.size}`)
  if (skippedDays > 0) {
    console.warn(`skippedDays: ${skippedDays}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
