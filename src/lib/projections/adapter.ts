import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { RookiePrior, RosterSnapshot, SeasonBox } from "@/lib/projections/types"

export type FixtureSeason = {
  boxes: SeasonBox[]
  rosters: RosterSnapshot[]
  rookies: RookiePrior[]
  actuals?: SeasonBox[]
}

const SEASON_FILES: Record<number, string> = {
  2025: "data/fixtures/projection-season-t.json",
  2026: "data/fixtures/projection-season-t1.json"
}

export const loadFixtureSeason = async (path: string): Promise<FixtureSeason> => {
  const raw = await readFile(resolve(process.cwd(), path), "utf8")
  return JSON.parse(raw) as FixtureSeason
}

const loadSeasonFixture = (season: number): Promise<FixtureSeason> => {
  const path = SEASON_FILES[season]
  if (!path) {
    return Promise.resolve({ boxes: [], rosters: [], rookies: [] })
  }
  return loadFixtureSeason(path)
}

export const loadSeasonBoxes = async (season: number): Promise<SeasonBox[]> => {
  const fixture = await loadSeasonFixture(season)
  return fixture.boxes
}

export const loadRosters = async (season: number): Promise<RosterSnapshot[]> => {
  const fixture = await loadSeasonFixture(season)
  return fixture.rosters
}

export const loadRookiePriors = async (season: number): Promise<RookiePrior[]> => {
  const fixture = await loadSeasonFixture(season)
  return fixture.rookies
}
