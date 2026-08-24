import type { CategoryId } from "@/lib/domain/types"

const CATEGORY_IDS: CategoryId[] = [
  "FG_PCT",
  "FT_PCT",
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "TO",
  "PTS",
]

export type Projections = Record<CategoryId, number>

export type HashtagProjectionRow = {
  name: string
  teamAbbr?: string
  gp?: number
  projections: Projections
  shooting?: {
    FGM: number
    FGA: number
    FTM: number
    FTA: number
  }
}

export type MatchReport = {
  matches: { rowIndex: number; playerId: string }[]
  unmatched: { rowIndex: number; name: string }[]
  ambiguous: { rowIndex: number; name: string; playerIds: string[] }[]
}

export type ApplyReport = {
  matched: { rowIndex: number; playerId: string }[]
  unmatched: { rowIndex: number; name: string }[]
  ambiguous: { rowIndex: number; name: string; playerIds: string[] }[]
}

export type ScaleOptions = {
  perGame: boolean
  gp: number
}

export type ApplyOptions = {
  perGame: boolean
  gpDefault: number
}

type PoolPlayer = {
  id: string
  name: string
  teamAbbr?: string
  projections: Projections
  shooting?: {
    FGM: number
    FGA: number
    FTM: number
    FTA: number
  }
}

const HEADER_ALIASES: Record<string, string> = {
  player: "name",
  name: "name",
  team: "teamAbbr",
  "team abbr": "teamAbbr",
  gp: "gp",
  g: "gp",
  "fg%": "FG_PCT",
  fg_pct: "FG_PCT",
  "ft%": "FT_PCT",
  ft_pct: "FT_PCT",
  "3pm": "TPM",
  tpm: "TPM",
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  stl: "STL",
  blk: "BLK",
  to: "TO",
  fgm: "FGM",
  fga: "FGA",
  ftm: "FTM",
  fta: "FTA",
}

const REQUIRED_FIELDS = new Set([
  "name",
  "FG_PCT",
  "FT_PCT",
  "TPM",
  "PTS",
  "REB",
  "AST",
  "STL",
  "BLK",
  "TO",
])

const SUFFIX_PATTERN = /\s+(jr|sr|ii|iii|iv)$/

const normalizeHeader = (header: string): string => {
  const key = header.trim().toLowerCase()
  return HEADER_ALIASES[key] ?? key.toUpperCase()
}

const parseCsvLine = (line: string): string[] => {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === "\"") {
      inQuotes = !inQuotes
      continue
    }
    if (char === "," && !inQuotes) {
      fields.push(current.trim())
      current = ""
      continue
    }
    current += char
  }

  fields.push(current.trim())
  return fields
}

const parseNumber = (value: string): number => {
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed)) {
    return 0
  }
  return parsed
}

const normalizePercent = (value: number): number => {
  if (value > 1) {
    return value / 100
  }
  return value
}

export const normalizePlayerName = (name: string): string => {
  const stripped = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  return stripped.replace(SUFFIX_PATTERN, "").trim()
}

export const scaleProjections = (
  raw: Partial<Projections> & Record<string, number>,
  opts: ScaleOptions,
): Projections => {
  const gp = opts.gp
  const scaled = {} as Projections

  for (const categoryId of CATEGORY_IDS) {
    const value = raw[categoryId] ?? 0
    if (categoryId === "FG_PCT" || categoryId === "FT_PCT") {
      scaled[categoryId] = normalizePercent(value)
      continue
    }
    scaled[categoryId] = opts.perGame ? value * gp : value
  }

  return scaled
}

export const parseHashtagCsv = (text: string): HashtagProjectionRow[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    throw new Error("Hashtag CSV is empty")
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)
  const columnIndex = new Map(headers.map((header, index) => [header, index]))

  for (const requiredField of REQUIRED_FIELDS) {
    if (!columnIndex.has(requiredField)) {
      throw new Error(`Hashtag CSV missing required column: ${requiredField}`)
    }
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const readField = (field: string): string => {
      const index = columnIndex.get(field)
      if (index === undefined) {
        return ""
      }
      return values[index] ?? ""
    }

    const projections = {} as Projections
    for (const categoryId of CATEGORY_IDS) {
      projections[categoryId] = parseNumber(readField(categoryId))
    }

    const row: HashtagProjectionRow = {
      name: readField("name"),
      projections,
    }

    const teamAbbr = readField("teamAbbr")
    if (teamAbbr) {
      row.teamAbbr = teamAbbr.toUpperCase()
    }

    const gpValue = readField("gp")
    if (gpValue) {
      row.gp = parseNumber(gpValue)
    }

    const shootingFields = ["FGM", "FGA", "FTM", "FTA"] as const
    const hasShooting = shootingFields.some((field) => columnIndex.has(field))
    if (hasShooting) {
      row.shooting = {
        FGM: parseNumber(readField("FGM")),
        FGA: parseNumber(readField("FGA")),
        FTM: parseNumber(readField("FTM")),
        FTA: parseNumber(readField("FTA")),
      }
    }

    return row
  })
}

export const matchHashtagRows = (
  rows: HashtagProjectionRow[],
  players: { id: string; name: string; teamAbbr?: string }[],
): MatchReport => {
  const matches: MatchReport["matches"] = []
  const unmatched: MatchReport["unmatched"] = []
  const ambiguous: MatchReport["ambiguous"] = []

  rows.forEach((row, rowIndex) => {
    const normalizedRowName = normalizePlayerName(row.name)
    const nameMatches = players.filter(
      (player) => normalizePlayerName(player.name) === normalizedRowName,
    )

    if (nameMatches.length === 0) {
      unmatched.push({ rowIndex, name: row.name })
      return
    }

    if (nameMatches.length === 1) {
      matches.push({ rowIndex, playerId: nameMatches[0].id })
      return
    }

    if (row.teamAbbr) {
      const teamMatches = nameMatches.filter(
        (player) => player.teamAbbr?.toUpperCase() === row.teamAbbr?.toUpperCase(),
      )
      if (teamMatches.length === 1) {
        matches.push({ rowIndex, playerId: teamMatches[0].id })
        return
      }
      ambiguous.push({
        rowIndex,
        name: row.name,
        playerIds: teamMatches.length > 0
          ? teamMatches.map((player) => player.id)
          : nameMatches.map((player) => player.id),
      })
      return
    }

    ambiguous.push({
      rowIndex,
      name: row.name,
      playerIds: nameMatches.map((player) => player.id),
    })
  })

  return { matches, unmatched, ambiguous }
}

export const applyHashtagProjections = <T extends PoolPlayer>(
  players: T[],
  rows: HashtagProjectionRow[],
  options: ApplyOptions,
): { players: T[]; report: ApplyReport } => {
  const matchReport = matchHashtagRows(rows, players)
  const matchedByPlayerId = new Map(
    matchReport.matches.map((match) => [match.playerId, match.rowIndex]),
  )

  const nextPlayers = players.map((player) => {
    const rowIndex = matchedByPlayerId.get(player.id)
    if (rowIndex === undefined) {
      return player
    }

    const row = rows[rowIndex]
    const gp = row.gp ?? options.gpDefault
    const projections = scaleProjections(row.projections, {
      perGame: options.perGame,
      gp,
    })

    const updated: T = {
      ...player,
      projections,
    }

    if (row.shooting && player.shooting) {
      updated.shooting = { ...row.shooting }
    }

    return updated
  })

  return {
    players: nextPlayers,
    report: {
      matched: matchReport.matches,
      unmatched: matchReport.unmatched,
      ambiguous: matchReport.ambiguous,
    },
  }
}
