import { ALL_CATEGORY_IDS, effectiveWeights } from "@/lib/domain/categories"
import type {
  CategoryId,
  CombinationPath,
  LeagueState,
  NextPickRec,
  Player,
  SimulationInput,
  SimulationResult,
} from "@/lib/domain/types"
import { createRng, pickOpponentPlayer } from "@/lib/sim/opponent"
import {
  categoryWinExpectancies,
  leagueMeanTotals,
  rosterTotals,
} from "@/lib/sim/score"
import { evaluateForcePick, greedyUserPick } from "@/lib/sim/userPolicy"

type CategoryValues = Record<CategoryId, number>

type SimulationOutcome = {
  userPath: string[]
  firstUserPickId?: string
  score: number
  categoryOutlook: CategoryValues
}

const emptyCategoryValues = (): CategoryValues =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as CategoryValues

const clampSimCount = (simCount: number): number => {
  if (!Number.isFinite(simCount)) {
    return 1
  }

  return Math.min(100, Math.max(1, Math.trunc(simCount)))
}

const averagePlayerProjections = (players: Player[]): CategoryValues => {
  const averages = emptyCategoryValues()

  if (players.length === 0) {
    return averages
  }

  for (const player of players) {
    for (const categoryId of ALL_CATEGORY_IDS) {
      averages[categoryId] += player.projections[categoryId] / players.length
    }
  }

  return averages
}

const buildRosters = (state: LeagueState): Player[][] => {
  const playerById = new Map(state.players.map((player) => [player.id, player]))
  const rosters = Array.from({ length: state.settings.teams }, () => [] as Player[])

  for (const pick of state.board.picks) {
    if (!pick.playerId) {
      continue
    }

    const player = playerById.get(pick.playerId)

    if (player) {
      rosters[pick.teamIndex].push(player)
    }
  }

  return rosters
}

const categoryOutlookFor = (
  userRoster: Player[],
  rosters: Player[][],
): CategoryValues => {
  const teamTotals = rosterTotals(userRoster)
  const leagueMeans = leagueMeanTotals(rosters)
  const outlook = emptyCategoryValues()

  for (const categoryId of ALL_CATEGORY_IDS) {
    const categoryOnlyWeights = emptyCategoryValues()
    categoryOnlyWeights[categoryId] = 1
    outlook[categoryId] = categoryWinExpectancies(
      teamTotals,
      leagueMeans,
      categoryOnlyWeights,
    )
  }

  return outlook
}

const simulateDraft = (
  state: LeagueState,
  seed: number,
  forcePickPlayerId?: string,
): SimulationOutcome => {
  const board = {
    ...state.board,
    picks: state.board.picks.map((pick) => ({ ...pick })),
  }
  const rosters = buildRosters(state).map((roster) => [...roster])
  const draftedPlayerIds = new Set(
    board.picks.flatMap((pick) => (pick.playerId ? [pick.playerId] : [])),
  )
  let remaining = state.players.filter(
    (player) => !draftedPlayerIds.has(player.id),
  )
  const weights = effectiveWeights(
    state.settings.categories,
    state.settings.puntCategoryIds,
    state.settings.focusCategoryIds,
  )
  const leagueAvg = averagePlayerProjections(state.players)
  const rng = createRng(seed)
  const userPath: string[] = []
  let firstUserPickId: string | undefined
  let hasHandledFirstOpenUserPick = false
  const startIndex = Math.max(0, board.currentOverall - 1)

  for (let pickIndex = startIndex; pickIndex < board.picks.length; pickIndex++) {
    const pick = board.picks[pickIndex]

    if (pick.playerId) {
      continue
    }

    if (remaining.length === 0) {
      break
    }

    const isPerspectivePick = pick.teamIndex === state.perspectiveTeamIndex
    let selectedPlayer: Player

    if (isPerspectivePick) {
      const forcedPlayer = !hasHandledFirstOpenUserPick
        ? remaining.find((player) => player.id === forcePickPlayerId)
        : undefined

      selectedPlayer = forcedPlayer
        ? evaluateForcePick(
            forcedPlayer,
            remaining,
            rosters[pick.teamIndex],
            rosters,
            weights,
            rng,
          ).player
        : greedyUserPick(
            remaining,
            rosters[pick.teamIndex],
            rosters,
            weights,
            rng,
          )
      hasHandledFirstOpenUserPick = true
      firstUserPickId ??= selectedPlayer.id
      userPath.push(selectedPlayer.id)
    } else {
      selectedPlayer = pickOpponentPlayer(
        remaining,
        rosters[pick.teamIndex],
        weights,
        leagueAvg,
        rng,
      )
    }

    pick.playerId = selectedPlayer.id
    rosters[pick.teamIndex].push(selectedPlayer)
    remaining = remaining.filter((player) => player.id !== selectedPlayer.id)
  }

  const userRoster = rosters[state.perspectiveTeamIndex]
  const leagueMeans = leagueMeanTotals(rosters)

  return {
    userPath,
    firstUserPickId,
    score: categoryWinExpectancies(
      rosterTotals(userRoster),
      leagueMeans,
      weights,
    ),
    categoryOutlook: categoryOutlookFor(userRoster, rosters),
  }
}

const aggregateCombinations = (
  outcomes: SimulationOutcome[],
): CombinationPath[] => {
  const aggregates = new Map<
    string,
    { playerIds: string[]; totalScore: number; count: number }
  >()

  for (const outcome of outcomes) {
    if (outcome.userPath.length === 0) {
      continue
    }

    const key = outcome.userPath.join("|")
    const aggregate = aggregates.get(key) ?? {
      playerIds: outcome.userPath,
      totalScore: 0,
      count: 0,
    }
    aggregate.totalScore += outcome.score
    aggregate.count += 1
    aggregates.set(key, aggregate)
  }

  return [...aggregates.entries()]
    .map(([key, aggregate]) => ({
      key,
      playerIds: aggregate.playerIds,
      score: aggregate.totalScore / aggregate.count,
      frequency: aggregate.count / outcomes.length,
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.frequency - left.frequency ||
        left.key.localeCompare(right.key),
    )
    .slice(0, 5)
    .map((combination) => ({
      playerIds: combination.playerIds,
      score: combination.score,
      frequency: combination.frequency,
    }))
}

const averageCategoryOutlook = (
  outcomes: SimulationOutcome[],
): CategoryValues => {
  const outlook = emptyCategoryValues()

  if (outcomes.length === 0) {
    return outlook
  }

  for (const outcome of outcomes) {
    for (const categoryId of ALL_CATEGORY_IDS) {
      outlook[categoryId] +=
        outcome.categoryOutlook[categoryId] / outcomes.length
    }
  }

  return outlook
}

export const runDraftSimulation = (
  input: SimulationInput,
): SimulationResult => {
  const startedAt = Date.now()
  const simCount = clampSimCount(input.simCount)
  const draftedPlayerIds = new Set(
    input.state.board.picks.flatMap((pick) =>
      pick.playerId ? [pick.playerId] : [],
    ),
  )
  const remaining = input.state.players.filter(
    (player) => !draftedPlayerIds.has(player.id),
  )
  const currentPick = input.state.board.picks.find(
    (pick) => pick.overall === input.state.board.currentOverall,
  )
  const isPerspectiveTurn =
    currentPick?.teamIndex === input.state.perspectiveTeamIndex &&
    currentPick.playerId === null

  const outcomes = Array.from({ length: simCount }, (_, index) =>
    simulateDraft(input.state, input.seed + index),
  )
  let nextPicks: NextPickRec[] = []

  if (isPerspectiveTurn) {
    const firstPickFrequencies = new Map<string, number>()

    for (const outcome of outcomes) {
      if (outcome.firstUserPickId) {
        firstPickFrequencies.set(
          outcome.firstUserPickId,
          (firstPickFrequencies.get(outcome.firstUserPickId) ?? 0) + 1,
        )
      }
    }

    const candidates = [...remaining]
      .sort((left, right) => left.adp - right.adp || left.id.localeCompare(right.id))
      .slice(0, 12)

    nextPicks = candidates
      .map((candidate) => {
        const candidateOutcomes = Array.from(
          { length: simCount },
          (_, index) =>
            simulateDraft(input.state, input.seed + index, candidate.id),
        )

        return {
          playerId: candidate.id,
          score:
            candidateOutcomes.reduce(
              (total, outcome) => total + outcome.score,
              0,
            ) / simCount,
          frequency:
            (firstPickFrequencies.get(candidate.id) ?? 0) / simCount,
        }
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.frequency - left.frequency ||
          left.playerId.localeCompare(right.playerId),
      )
  }

  return {
    nextPicks,
    topCombinations: aggregateCombinations(outcomes),
    categoryOutlook: averageCategoryOutlook(outcomes),
    meta: {
      simCount,
      seed: input.seed,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      source: input.state.source,
    },
  }
}
