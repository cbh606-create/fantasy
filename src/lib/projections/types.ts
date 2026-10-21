import type { CategoryId } from "@/lib/domain/categories"

export type NbaPosition = "PG" | "SG" | "SF" | "PF" | "C"
export type PositionBucket = "G" | "wing" | "big"

export type ShootingVolume = {
  FGM: number
  FGA: number
  FTM: number
  FTA: number
}

export type Rates = {
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  tpm: number
  shooting: ShootingVolume
}

export type SeasonBox = {
  playerId: string
  name: string
  season: number
  teamId: string
  age: number
  positions: NbaPosition[]
  gp: number
  mp: number
  mpg: number
  usg: number
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  tpm: number
  fgm: number
  fga: number
  ftm: number
  fta: number
  possessions?: number
}

export type RosterPlayer = {
  playerId: string
  positions: NbaPosition[]
}

export type DepartedPlayer = {
  playerId: string
  lastMpg: number
  lastUsg: number
  positions: NbaPosition[]
}

export type RosterSnapshot = {
  season: number
  teamId: string
  pace?: number
  players: RosterPlayer[]
  departed: DepartedPlayer[]
}

export type RookiePrior = {
  playerId: string
  name: string
  positions: NbaPosition[]
  age: number
  draftSlot: number | null
  rates?: Rates
}

export type PlayerProjection = {
  playerId: string
  name: string
  season: number
  teamId: string
  positions: NbaPosition[]
  mpg: number
  gp: number
  usg: number
  rates: Rates
  projections: Record<CategoryId, number>
  shooting: ShootingVolume
  source: "model" | "rookie_prior"
  agingApplied: boolean
}
