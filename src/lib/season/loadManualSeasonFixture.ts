import { readFileSync } from "node:fs"
import path from "node:path"
import type { ManualSeasonLeagueInput } from "@/lib/adapters/manualSeason"

/** Read the manual season fixture at request time so fixture edits apply without a server restart. */
export const loadManualSeasonFixture = (): ManualSeasonLeagueInput => {
  const fixturePath = path.join(
    process.cwd(),
    "data",
    "fixtures",
    "espn-season-league.json",
  )
  return JSON.parse(
    readFileSync(fixturePath, "utf8"),
  ) as ManualSeasonLeagueInput
}
