import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { projectSeason } from "../src/lib/projections/pipeline.ts"
import type {
  NbaPosition,
  RookiePrior,
  RosterSnapshot,
  SeasonBox
} from "../src/lib/projections/types.ts"

const STATS_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete"
const TEAMS_URL = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams"

const DRAFT_2026: Array<{ slot: number; name: string; positions: NbaPosition[] }> = [
  { slot: 1, name: "AJ Dybantsa", positions: ["SF"] },
  { slot: 2, name: "Darryn Peterson", positions: ["SG"] },
  { slot: 3, name: "Cameron Boozer", positions: ["PF"] },
  { slot: 4, name: "Caleb Wilson", positions: ["SF"] },
  { slot: 5, name: "Keaton Wagler", positions: ["SG"] },
  { slot: 6, name: "Mikel Brown Jr.", positions: ["PG"] },
  { slot: 7, name: "Darius Acuff Jr.", positions: ["PG"] },
  { slot: 8, name: "Kingston Flemings", positions: ["PG"] },
  { slot: 9, name: "Morez Johnson Jr.", positions: ["PF"] },
  { slot: 10, name: "Brayden Burries", positions: ["SG"] },
  { slot: 11, name: "Yaxel Lendeborg", positions: ["PF"] },
  { slot: 12, name: "Aday Mara", positions: ["C"] },
  { slot: 13, name: "Nate Ament", positions: ["SF"] },
  { slot: 14, name: "Hannes Steinbach", positions: ["PF"] },
  { slot: 15, name: "Dailyn Swain", positions: ["SG"] },
  { slot: 16, name: "Bennett Stirtz", positions: ["PG"] },
  { slot: 17, name: "Ebuka Okorie", positions: ["SG"] },
  { slot: 18, name: "Christian Anderson", positions: ["PG"] },
  { slot: 19, name: "Allen Graves", positions: ["SF"] },
  { slot: 20, name: "Jayden Quaintance", positions: ["C"] },
  { slot: 21, name: "Karim Lopez", positions: ["SF"] },
  { slot: 22, name: "Labaron Philon Jr.", positions: ["PG"] },
  { slot: 23, name: "Zuby Ejiofor", positions: ["PF"] },
  { slot: 24, name: "Cameron Carr", positions: ["SG"] },
  { slot: 25, name: "Sergio de Larrea", positions: ["SF"] },
  { slot: 26, name: "Tarris Reed Jr.", positions: ["C"] },
  { slot: 27, name: "Chris Cenac Jr.", positions: ["PF"] },
  { slot: 28, name: "Joshua Jefferson", positions: ["PF"] },
  { slot: 29, name: "Alex Karaban", positions: ["PF"] },
  { slot: 30, name: "Koa Peat", positions: ["PF"] },
  { slot: 31, name: "Bruce Thornton", positions: ["PG"] },
  { slot: 32, name: "Richie Saunders", positions: ["SG"] },
  { slot: 33, name: "Isaiah Evans", positions: ["SG"] },
  { slot: 34, name: "Meleek Thomas", positions: ["SG"] },
  { slot: 35, name: "Trevon Brazile", positions: ["PF"] },
  { slot: 36, name: "Baba Miller", positions: ["PF"] },
  { slot: 37, name: "Ryan Conwell", positions: ["SG"] },
  { slot: 38, name: "Braden Smith", positions: ["PG"] },
  { slot: 39, name: "Jack Kayil", positions: ["PG"] },
  { slot: 40, name: "Dillon Mitchell", positions: ["SF"] },
  { slot: 41, name: "Otega Oweh", positions: ["SG"] },
  { slot: 42, name: "Ja'Kobi Gillespie", positions: ["PG"] },
  { slot: 43, name: "Tyler Bilodeau", positions: ["PF"] },
  { slot: 44, name: "Maliq Brown", positions: ["PF"] },
  { slot: 45, name: "Emanuel Sharp", positions: ["SG"] },
  { slot: 46, name: "Felix Okpata", positions: ["SF"] },
  { slot: 47, name: "Tyler Nickel", positions: ["SF"] },
  { slot: 48, name: "Tobi Lawal", positions: ["PF"] },
  { slot: 49, name: "Bryce Hopkins", positions: ["SF"] },
  { slot: 50, name: "Jaden Bradley", positions: ["PG"] },
  { slot: 51, name: "Izaiyah Nelson", positions: ["PF"] },
  { slot: 52, name: "Henri Veesaar", positions: ["C"] },
  { slot: 53, name: "Ugonna Onyenso", positions: ["C"] },
  { slot: 54, name: "Lajae Jones", positions: ["SG"] },
  { slot: 55, name: "Nick Martinelli", positions: ["SF"] },
  { slot: 56, name: "Vsevolod Ishchenko", positions: ["SG"] },
  { slot: 57, name: "Narcisse Ngoy", positions: ["PF"] },
  { slot: 58, name: "Jaron Pierre Jr.", positions: ["SG"] },
  { slot: 59, name: "Trey Kaufman-Renn", positions: ["PF"] },
  { slot: 60, name: "Malique Lewis", positions: ["SF"] }
]

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

const zip = (names: string[], values: number[]) =>
  Object.fromEntries(names.map((name, i) => [name, Number(values[i] ?? 0)]))

const normName = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "")
    .replace(/(jr|sr|ii|iii|iv)$/g, "")

const mapPosition = (abbr: string | undefined): NbaPosition => {
  const key = (abbr ?? "G").toUpperCase()
  if (key === "PG" || key === "SG" || key === "SF" || key === "PF" || key === "C") return key
  if (key === "G") return "SG"
  if (key === "F") return "SF"
  if (key === "C") return "C"
  if (key === "G-F" || key === "GF") return "SG"
  if (key === "F-G" || key === "FG") return "SF"
  if (key === "F-C" || key === "FC") return "PF"
  if (key === "C-F" || key === "CF") return "C"
  return "SF"
}

const fetchJson = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json"
    }
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

type EspnTeam = {
  abbreviation?: string
  displayName?: string
  name?: string
  shortDisplayName?: string
  nickname?: string
  location?: string
}

const aliasKey = (value: string) => value.trim().toLowerCase()

const registerTeamAlias = (map: Map<string, string>, alias: string, abbr: string) => {
  const key = aliasKey(alias)
  if (!key) return
  map.set(key, abbr)
}

const buildTeamAbbrevMap = (teams: EspnTeam[]) => {
  const map = new Map<string, string>()
  for (const team of teams) {
    const abbr = String(team.abbreviation ?? "").trim()
    if (!abbr) continue
    registerTeamAlias(map, abbr, abbr)
    registerTeamAlias(map, team.displayName ?? "", abbr)
    registerTeamAlias(map, team.name ?? "", abbr)
    registerTeamAlias(map, team.shortDisplayName ?? "", abbr)
    registerTeamAlias(map, team.nickname ?? "", abbr)
    const display = String(team.displayName ?? "").trim()
    if (display.includes(" ")) {
      registerTeamAlias(map, display.split(" ").pop() ?? "", abbr)
    }
    const locationName = [team.location, team.name].filter(Boolean).join(" ")
    if (locationName) registerTeamAlias(map, locationName, abbr)
  }
  return map
}

const toRosterTeamId = (teamId: string, map: Map<string, string>) => {
  if (teamId === "FA" || teamId === "TOT") return teamId
  return map.get(aliasKey(teamId)) ?? teamId
}

const remapBoxTeamIds = (boxes: SeasonBox[], map: Map<string, string>) => {
  for (const box of boxes) {
    box.teamId = toRosterTeamId(box.teamId, map)
  }
}

const loadLastSeasonBoxes = async (): Promise<SeasonBox[]> => {
  const first = await fetchJson(
    `${STATS_URL}?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=100&season=2026&seasontype=2`
  )
  const pages = Number(first.pagination.pages)
  const rows = [...first.athletes]
  for (let page = 2; page <= pages; page += 1) {
    await sleep(120)
    const next = await fetchJson(
      `${STATS_URL}?region=us&lang=en&contentorigin=espn&isqualified=false&page=${page}&limit=100&season=2026&seasontype=2`
    )
    rows.push(...next.athletes)
  }

  const catNames = Object.fromEntries(
    first.categories.map((cat: { name: string; names: string[] }) => [cat.name, cat.names])
  )
  const boxes: SeasonBox[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const athlete = row.athlete
    const id = String(athlete.id)
    if (seen.has(id)) continue
    seen.add(id)
    const byCat = Object.fromEntries(
      row.categories.map((cat: { name: string; values: number[] }) => [
        cat.name,
        zip(catNames[cat.name], cat.values)
      ])
    )
    const general = byCat.general ?? {}
    const offense = byCat.offensive ?? {}
    const defense = byCat.defensive ?? {}
    const gp = general.gamesPlayed ?? 0
    const mp = general.minutes ?? 0
    boxes.push({
      playerId: id,
      name: athlete.displayName,
      season: 2026,
      teamId: athlete.teamName ?? "FA",
      age: Number(athlete.age ?? 25),
      positions: [mapPosition(athlete.position?.abbreviation)],
      gp,
      mp,
      mpg: gp > 0 ? mp / gp : 0,
      usg: 20,
      pts: offense.points ?? 0,
      reb: general.rebounds ?? 0,
      ast: offense.assists ?? 0,
      stl: defense.steals ?? 0,
      blk: defense.blocks ?? 0,
      tov: offense.turnovers ?? 0,
      tpm: offense.threePointFieldGoalsMade ?? 0,
      fgm: offense.fieldGoalsMade ?? 0,
      fga: offense.fieldGoalsAttempted ?? 0,
      ftm: offense.freeThrowsMade ?? 0,
      fta: offense.freeThrowsAttempted ?? 0
    })
  }

  const teamTotals = new Map<string, { mp: number; fga: number; fta: number; tov: number }>()
  for (const box of boxes) {
    const cur = teamTotals.get(box.teamId) ?? { mp: 0, fga: 0, fta: 0, tov: 0 }
    cur.mp += box.mp
    cur.fga += box.fga
    cur.fta += box.fta
    cur.tov += box.tov
    teamTotals.set(box.teamId, cur)
  }
  for (const box of boxes) {
    const team = teamTotals.get(box.teamId)
    if (!team || team.mp <= 0) continue
    const playerPoss = box.fga + 0.44 * box.fta + box.tov
    const teamPoss = team.fga + 0.44 * team.fta + team.tov
    if (box.mp <= 0 || teamPoss <= 0) continue
    box.usg = (100 * playerPoss * (team.mp / 5)) / (box.mp * teamPoss)
  }

  return boxes
}

const loadRosters = async (
  boxes: SeasonBox[]
): Promise<{ rosters: RosterSnapshot[]; rookies: RookiePrior[]; teamAbbrevMap: Map<string, string> }> => {
  const teamsJson = await fetchJson(TEAMS_URL)
  const teams = teamsJson.sports[0].leagues[0].teams.map((entry: { team: EspnTeam }) => entry.team)
  const teamAbbrevMap = buildTeamAbbrevMap(teams)
  const boxById = new Map(boxes.map((box) => [box.playerId, box]))
  const lastYearByTeam = new Map<string, SeasonBox[]>()
  for (const box of boxes) {
    const teamKey = toRosterTeamId(box.teamId, teamAbbrevMap)
    const list = lastYearByTeam.get(teamKey) ?? []
    list.push(box)
    lastYearByTeam.set(teamKey, list)
  }

  const draftByName = new Map(DRAFT_2026.map((row) => [normName(row.name), row]))
  const rookies: RookiePrior[] = []
  const rosters: RosterSnapshot[] = []

  for (const team of teams) {
    const abbr = String(team.abbreviation)
    await sleep(120)
    const rosterJson = await fetchJson(
      `${TEAMS_URL}/${String(team.abbreviation).toLowerCase()}/roster`
    )
    const athletes = rosterJson.athletes ?? []
    const ranked = athletes
      .map((athlete: { id: string; displayName: string; age?: number; position?: { abbreviation?: string } }) => {
        const box = boxById.get(String(athlete.id))
        const draft = draftByName.get(normName(athlete.displayName))
        const positions = box?.positions ?? draft?.positions ?? [mapPosition(athlete.position?.abbreviation)]
        const priorMpg = box?.mpg ?? (draft ? (draft.slot <= 4 ? 30 : draft.slot <= 14 ? 24 : draft.slot <= 30 ? 18 : 14) : 10)
        return { athlete, box, draft, positions, priorMpg }
      })
      .sort((a, b) => b.priorMpg - a.priorMpg)
      .slice(0, 13)

    const players = ranked.map((row) => {
      if (!row.box) {
        rookies.push({
          playerId: String(row.athlete.id),
          name: row.athlete.displayName,
          positions: row.positions,
          age: Number(row.athlete.age ?? 20),
          draftSlot: row.draft?.slot ?? null
        })
      }
      return { playerId: String(row.athlete.id), positions: row.positions }
    })

    const currentIds = new Set(players.map((player: { playerId: string }) => player.playerId))
    const lastYearBoxes = lastYearByTeam.get(abbr) ?? []
    const departed = lastYearBoxes
      .filter((box) => !currentIds.has(box.playerId) && box.mpg >= 12)
      .map((box) => ({
        playerId: box.playerId,
        lastMpg: box.mpg,
        lastUsg: box.usg,
        positions: box.positions
      }))

    rosters.push({
      season: 2027,
      teamId: abbr,
      pace: 100,
      players,
      departed
    })
  }

  return { rosters, rookies, teamAbbrevMap }
}

const main = async () => {
  console.log("loading 2025-26 boxes")
  const boxes = await loadLastSeasonBoxes()
  console.log(`boxes ${boxes.length}`)
  console.log("loading 2026-27 rosters")
  const { rosters, rookies, teamAbbrevMap } = await loadRosters(boxes)
  console.log(`rosters ${rosters.length} rookies ${rookies.length}`)
  remapBoxTeamIds(boxes, teamAbbrevMap)
  const projections = projectSeason(boxes, rosters, rookies)
  const boxById = new Map(boxes.map((box) => [box.playerId, box]))
  const perGame = (box: SeasonBox) => {
    const gp = box.gp > 0 ? box.gp : 1
    return {
      mpg: Number(box.mpg.toFixed(1)),
      gp: box.gp,
      usg: Number(box.usg.toFixed(1)),
      PTS: Number((box.pts / gp).toFixed(1)),
      REB: Number((box.reb / gp).toFixed(1)),
      AST: Number((box.ast / gp).toFixed(1)),
      STL: Number((box.stl / gp).toFixed(1)),
      BLK: Number((box.blk / gp).toFixed(1)),
      TO: Number((box.tov / gp).toFixed(1)),
      TPM: Number((box.tpm / gp).toFixed(1)),
      FG_PCT: Number((box.fga > 0 ? box.fgm / box.fga : 0).toFixed(3)),
      FT_PCT: Number((box.fta > 0 ? box.ftm / box.fta : 0).toFixed(3))
    }
  }

  const mapped = projections.map((row) => {
    const box = boxById.get(row.playerId)
    const last = box && box.gp >= 10 ? perGame(box) : null
    return {
      playerId: row.playerId,
      name: row.name,
      teamId: row.teamId,
      positions: row.positions,
      mpg: Number(row.mpg.toFixed(1)),
      gp: row.gp,
      usg: Number(row.usg.toFixed(1)),
      PTS: Number(row.projections.PTS.toFixed(1)),
      REB: Number(row.projections.REB.toFixed(1)),
      AST: Number(row.projections.AST.toFixed(1)),
      STL: Number(row.projections.STL.toFixed(1)),
      BLK: Number(row.projections.BLK.toFixed(1)),
      TO: Number(row.projections.TO.toFixed(1)),
      TPM: Number(row.projections.TPM.toFixed(1)),
      FG_PCT: Number(row.projections.FG_PCT.toFixed(3)),
      FT_PCT: Number(row.projections.FT_PCT.toFixed(3)),
      FGM: Number(row.shooting.FGM.toFixed(1)),
      FGA: Number(row.shooting.FGA.toFixed(1)),
      FTM: Number(row.shooting.FTM.toFixed(1)),
      FTA: Number(row.shooting.FTA.toFixed(1)),
      source: row.source,
      last
    }
  })

  const STAT_KEYS = ["PTS", "REB", "AST", "STL", "BLK", "TO", "TPM"] as const
  const mae = (rows: typeof mapped, key: (typeof STAT_KEYS)[number] | "mpg") => {
    if (rows.length === 0) return 0
    const total = rows.reduce((sum, row) => {
      const actual = key === "mpg" ? row.last!.mpg : row.last![key]
      const pred = key === "mpg" ? row.mpg : row[key]
      return sum + Math.abs(pred - actual)
    }, 0)
    return Number((total / rows.length).toFixed(2))
  }
  const compared = mapped.filter((row) => row.source === "model" && row.last)
  const stable = compared.filter((row) => Math.abs(row.mpg - row.last!.mpg) < 4)
  const roleUp = compared.filter((row) => row.mpg - row.last!.mpg >= 4)
  const roleDown = compared.filter((row) => row.last!.mpg - row.mpg >= 4)
  const stablePtsMiss = stable.filter((row) => Math.abs(row.PTS - row.last!.PTS) > 4)
  const validation = {
    compared: compared.length,
    stableRole: stable.length,
    roleUp: roleUp.length,
    roleDown: roleDown.length,
    rookies: mapped.filter((row) => row.source === "rookie_prior").length,
    mae: {
      stable: Object.fromEntries(["mpg", ...STAT_KEYS].map((key) => [key, mae(stable, key as "mpg")])),
      roleUp: Object.fromEntries(["mpg", ...STAT_KEYS].map((key) => [key, mae(roleUp, key as "mpg")])),
      roleDown: Object.fromEntries(["mpg", ...STAT_KEYS].map((key) => [key, mae(roleDown, key as "mpg")]))
    },
    stablePtsMisses: stablePtsMiss
      .sort((a, b) => Math.abs(b.PTS - b.last!.PTS) - Math.abs(a.PTS - a.last!.PTS))
      .slice(0, 15)
      .map((row) => ({
        name: row.name,
        teamId: row.teamId,
        lastMpg: row.last!.mpg,
        mpg: row.mpg,
        lastPts: row.last!.PTS,
        pts: row.PTS
      }))
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: "ESPN 2025-26 regular season totals + ESPN 2026-27 preseason rosters",
    engine: "feat/nba-stats-projection projectSeason",
    season: "2026-27",
    counts: {
      boxes: boxes.length,
      rostered: projections.length,
      rookies: projections.filter((row) => row.source === "rookie_prior").length
    },
    validation,
    projections: mapped
  }
  const path = resolve("data/live/projections-2026-27.json")
  await writeFile(path, JSON.stringify(out, null, 2), "utf8")
  console.log(`wrote ${path} n=${out.projections.length}`)
  console.log(JSON.stringify(validation, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
