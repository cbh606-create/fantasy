import type { CategoryId } from "@/lib/domain/types"
import type {
  CategoryOutcome,
  MatchupBoard,
  SlotGroup,
  WinnerStreamRecipe,
} from "./types"
import type { SeasonPlayer, SeasonPosition } from "@/lib/season/types"

export type { SlotGroup, WinnerStreamRecipe }

export type WinnerStreamTeamBox = {
  espnTeamId: number
  catWins: number
  outcomes: Partial<Record<CategoryId, CategoryOutcome>>
}

export type WinnerStreamMatchupBox = {
  scoringPeriodId: number
  complete: boolean
  home: WinnerStreamTeamBox
  away: WinnerStreamTeamBox
}

export type WinnerStreamAddEvent = {
  scoringPeriodId: number
  espnTeamId: number
  addedPlayerId: string
  droppedPlayerId?: string
}

export type BuildWinnerStreamRecipesInput = {
  events: WinnerStreamAddEvent[]
  matchups: WinnerStreamMatchupBox[]
  players: SeasonPlayer[]
  enabledCats: CategoryId[]
  currentScoringPeriodId: number
}

export type StreamerRankKey = {
  delta: number
  hits: number
  index: number
}

const COUNTING_KINDS: CategoryId[] = [
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "PTS",
  "TO",
]

export const COUNTING_KIND_TIEBREAK: CategoryId[] = [
  "STL",
  "BLK",
  "AST",
  "REB",
  "TPM",
  "PTS",
  "TO",
]

const GUARD_POSITIONS: SeasonPosition[] = ["PG", "SG", "G"]
const FORWARD_POSITIONS: SeasonPosition[] = ["SF", "PF", "F"]

const kindContribution = (
  player: SeasonPlayer,
  categoryId: CategoryId,
): number => {
  const value = player.projections[categoryId] ?? 0
  return categoryId === "TO" ? -value : value
}

const tiebreakIndex = (categoryId: CategoryId): number => {
  const index = COUNTING_KIND_TIEBREAK.indexOf(categoryId)
  return index < 0 ? COUNTING_KIND_TIEBREAK.length : index
}

export const playerSlotGroup = (player: SeasonPlayer): SlotGroup => {
  const positions = player.positions ?? []
  if (positions.some((position) => GUARD_POSITIONS.includes(position))) {
    return "G"
  }
  if (positions.some((position) => FORWARD_POSITIONS.includes(position))) {
    return "F"
  }
  return "C"
}

export const playerAddKinds = (
  player: SeasonPlayer,
  enabledCats: CategoryId[],
): CategoryId[] => {
  const ranked = COUNTING_KINDS.filter((categoryId) =>
    enabledCats.includes(categoryId),
  )
    .map((categoryId) => ({
      categoryId,
      contribution: kindContribution(player, categoryId),
    }))
    .sort((left, right) => {
      if (right.contribution !== left.contribution) {
        return right.contribution - left.contribution
      }
      return tiebreakIndex(left.categoryId) - tiebreakIndex(right.categoryId)
    })

  const top = ranked[0]
  if (!top || top.contribution <= 0) return []

  const kinds = [top.categoryId]
  const second = ranked[1]
  if (second && second.contribution >= top.contribution * 0.85) {
    kinds.push(second.categoryId)
  }
  return kinds
}

const actingTeam = (
  matchup: WinnerStreamMatchupBox,
  espnTeamId: number,
): { acting: WinnerStreamTeamBox; opponent: WinnerStreamTeamBox } | null => {
  if (matchup.home.espnTeamId === espnTeamId) {
    return { acting: matchup.home, opponent: matchup.away }
  }
  if (matchup.away.espnTeamId === espnTeamId) {
    return { acting: matchup.away, opponent: matchup.home }
  }
  return null
}

const recipeKey = (recipe: Omit<WinnerStreamRecipe, "count">) =>
  `${recipe.situationCat}|${recipe.addKind}|${recipe.addGroup}`

export const buildWinnerStreamRecipes = ({
  events,
  matchups,
  players,
  enabledCats,
  currentScoringPeriodId,
}: BuildWinnerStreamRecipesInput): WinnerStreamRecipe[] => {
  const playersById = new Map(players.map((entry) => [entry.id, entry]))
  const completedPeriods = new Set(
    matchups
      .filter(
        (matchup) =>
          matchup.complete && matchup.scoringPeriodId !== currentScoringPeriodId,
      )
      .map((matchup) => matchup.scoringPeriodId),
  )
  const minCount = completedPeriods.size < 8 ? 1 : 2
  const counts = new Map<string, WinnerStreamRecipe>()

  for (const event of events) {
    if (event.scoringPeriodId === currentScoringPeriodId) continue
    const matchup = matchups.find(
      (row) =>
        row.scoringPeriodId === event.scoringPeriodId &&
        (row.home.espnTeamId === event.espnTeamId ||
          row.away.espnTeamId === event.espnTeamId),
    )
    if (!matchup?.complete) continue

    const sides = actingTeam(matchup, event.espnTeamId)
    if (!sides) continue
    if (sides.acting.catWins <= sides.opponent.catWins) continue

    const added = playersById.get(event.addedPlayerId)
    if (!added) continue

    const kinds = playerAddKinds(added, enabledCats)
    if (kinds.length === 0) continue

    const addGroup = playerSlotGroup(added)
    const situationCats = enabledCats.filter((categoryId) => {
      const outcome = sides.acting.outcomes[categoryId]
      return outcome === "L" || outcome === "T"
    })

    for (const situationCat of situationCats) {
      for (const addKind of kinds) {
        const next = { situationCat, addKind, addGroup, count: 0 }
        const key = recipeKey(next)
        const existing = counts.get(key) ?? next
        existing.count += 1
        counts.set(key, existing)
      }
    }
  }

  return [...counts.values()]
    .filter((recipe) => recipe.count >= minCount)
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      const situation = left.situationCat.localeCompare(right.situationCat)
      if (situation !== 0) return situation
      return left.addKind.localeCompare(right.addKind)
    })
    .slice(0, 6)
}

const weakBoardCats = (board: MatchupBoard): CategoryId[] =>
  board.categories
    .filter((row) => row.outcome === "L" || row.outcome === "T")
    .map((row) => row.categoryId)

export const winnerPriorHits = (
  player: SeasonPlayer,
  board: MatchupBoard,
  recipes: WinnerStreamRecipe[],
): number => {
  if (recipes.length === 0) return 0
  const weakCats = weakBoardCats(board)
  if (weakCats.length === 0) return 0

  const kinds = playerAddKinds(
    player,
    board.categories.map((row) => row.categoryId),
  )
  const group = playerSlotGroup(player)

  let hits = 0
  for (const recipe of recipes) {
    if (!weakCats.includes(recipe.situationCat)) continue
    if (kinds.includes(recipe.addKind)) {
      hits += 1
      continue
    }
    if (kinds.length === 0 && recipe.addGroup === group) hits += 1
  }
  return hits
}

export const compareStreamerRank = (
  left: StreamerRankKey,
  right: StreamerRankKey,
): number => {
  if (right.delta !== left.delta) return right.delta - left.delta
  if (right.hits !== left.hits) return right.hits - left.hits
  return left.index - right.index
}

export const winnerStreamHint = (
  board: MatchupBoard,
  recipes: WinnerStreamRecipe[],
): string | null => {
  if (recipes.length === 0) return null
  const weakCats = weakBoardCats(board)
  const streamed = new Set<CategoryId>()
  for (const recipe of recipes) {
    if (!weakCats.includes(recipe.situationCat)) continue
    streamed.add(recipe.addKind)
  }
  if (streamed.size === 0) return null

  const listed = COUNTING_KIND_TIEBREAK.filter((categoryId) =>
    streamed.has(categoryId),
  )
  if (listed.length === 0) return null
  return `Winners here streamed ${listed.join("/")} when trailing those cats`
}
