"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DailyLineupPanel } from "@/components/matchup/DailyLineupPanel"
import { MatchupPlanBar } from "@/components/matchup/MatchupPlanBar"
import { InjuryAlertsPanel } from "@/components/matchup/InjuryAlertsPanel"
import { MatchupBoard } from "@/components/matchup/MatchupBoard"
import { OpponentPicker } from "@/components/matchup/OpponentPicker"
import { OpponentWeekStrip } from "@/components/matchup/OpponentWeekStrip"
import { RatioSitsPanel } from "@/components/matchup/RatioSitsPanel"
import { SitStartPanel } from "@/components/matchup/SitStartPanel"
import { StreamingPlansPanel } from "@/components/matchup/StreamingPlansPanel"
import { SeasonToolShell } from "@/components/season/SeasonToolShell"
import { useSyncActiveSeasonLeague } from "@/components/season/useSyncActiveSeasonLeague"
import { Banner } from "@/components/ui/Banner"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { buildMatchupBoard } from "@/lib/matchup/board"
import { isActiveSlot } from "@/lib/matchup/constants"
import {
  clearNoGameActiveSlots,
  dailyLineupsMatchDays,
  findPlayerSlotIndex,
  initDailyLineups,
  playerGameDays,
  readDailyLineups,
  togglePlayerDay,
  writeDailyLineups,
  youTotalsFromDaily,
  type DailyLineups,
  type TogglePlayerDayResult,
} from "@/lib/matchup/dailyLineups"
import { suggestRatioSits } from "@/lib/matchup/ratioSits"
import {
  sitStartBadgesByPlayerDay,
  visibleSitStartSuggestions,
} from "@/lib/matchup/sitStart"
import { planningMatchupBoard } from "@/lib/matchup/streamerMove"
import { applyStreamingPlanPreview, previewSeatKey } from "@/lib/matchup/applyStreamingPlanPreview"
import {
  pickRecommendedYouSpot,
  scoreYouSpotPlans,
  shouldAutoApplyYouSpot,
  type YouSpotCount,
} from "@/lib/matchup/recommendYouSpot"
import { rosterSlotsFor } from "@/lib/matchup/eligibility"
import {
  emptyNonIlSeatCount,
  resolveOppSpotCount,
} from "@/lib/matchup/opponentStreaming"
import type {
  MatchupAdvice,
  MatchupBoard as MatchupBoardData,
  OppSpotChoice,
  RatioSitSuggestion,
  SitStartSuggestion,
  StatWindow,
  StreamingPlan,
} from "@/lib/matchup/types"
import { isStatWindow } from "@/lib/matchup/types"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
} from "@/lib/season/types"

type MatchupWorkspaceProps = {
  leagueId: string
}

type MatchupResponse = MatchupAdvice & {
  schedule: ScheduleResponse
  playersById: Record<string, SeasonPlayer>
  teams: { teamIndex: number; name: string }[]
  state?: SeasonLeagueState
}

const enabledCategoryIds = (state: SeasonLeagueState): CategoryId[] => {
  const enabled = state.categories
    .filter((category) => category.enabled)
    .map((category) => category.id)

  return enabled.length > 0 ? enabled : ALL_CATEGORY_IDS
}

const oppTotalsFromBoard = (
  board: MatchupBoardData,
): Record<CategoryId, number> =>
  Object.fromEntries(
    board.categories.map((row) => [row.categoryId, row.opp]),
  ) as Record<CategoryId, number>

const youRosterPlayerIds = (state: SeasonLeagueState): string[] => {
  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  return (youTeam?.entries ?? []).flatMap((entry) =>
    entry.slot !== "IL" && entry.playerId ? [entry.playerId] : [],
  )
}

const resolveDailyLineups = (
  leagueId: string,
  days: string[],
  state: SeasonLeagueState,
  schedule: ScheduleResponse,
): DailyLineups => {
  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  const activeEntries = youTeam?.entries ?? []
  const rosterSlots = rosterSlotsFor(state)
  const stored = readDailyLineups(leagueId)

  if (stored && dailyLineupsMatchDays(stored, days, rosterSlots)) {
    const sanitized = clearNoGameActiveSlots(
      stored,
      schedule,
      state.players,
      activeEntries,
      rosterSlots,
    )
    if (sanitized !== stored) {
      writeDailyLineups(leagueId, sanitized)
    }
    return sanitized
  }

  const fresh = initDailyLineups(
    days,
    activeEntries,
    rosterSlots,
    state.players,
    schedule,
  )
  writeDailyLineups(leagueId, fresh)
  return fresh
}

const isAbortError = (error: unknown, signal?: AbortSignal) => {
  if (signal?.aborted) return true
  if (error instanceof DOMException && error.name === "AbortError") return true
  return error instanceof Error && error.name === "AbortError"
}

const matchupFetchErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message === "Failed to fetch") {
    return "Matchup server did not respond. Wait a moment and refresh."
  }
  return error instanceof Error ? error.message : "Unable to load matchup workspace"
}

const opponentStorageKey = (leagueId: string) => `matchup-opponent:${leagueId}`

const readStoredOpponent = (leagueId: string): number | null => {
  if (typeof window === "undefined") return null

  const stored = window.localStorage.getItem(opponentStorageKey(leagueId))
  if (!stored) return null

  const parsed = Number.parseInt(stored, 10)
  return Number.isInteger(parsed) ? parsed : null
}

const statWindowStorageKey = (id: string) => `matchup-stat-window:${id}`

const readStoredStatWindow = (id: string): StatWindow => {
  if (typeof window === "undefined") return "season"
  const stored = window.localStorage.getItem(statWindowStorageKey(id))
  return isStatWindow(stored) ? stored : "season"
}

const hasIncompleteActiveLineup = (state: SeasonLeagueState): boolean => {
  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  if (!youTeam) return false

  return youTeam.entries.some(
    (entry) => isActiveSlot(entry.slot) && entry.playerId === null,
  )
}

const swapKey = (suggestion: SitStartSuggestion) =>
  `${suggestion.benchPlayerId}:${suggestion.activePlayerId}`

const previewStreamerIds = (plan: StreamingPlan | null): Set<string> => {
  const ids = new Set<string>()
  if (!plan) return ids
  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (cell.playerId && cell.action !== "empty") ids.add(cell.playerId)
    }
  }
  return ids
}

/** Earliest plan date when a roster player is cut. Streamer swap-outs stay toggleable. */
const previewDroppedFromDateByPlayerId = (
  plan: StreamingPlan | null,
): Record<string, string> => {
  const fromById: Record<string, string> = {}
  if (!plan) return fromById

  const noteDrop = (playerId: string, date: string) => {
    const previous = fromById[playerId]
    if (!previous || date < previous) fromById[playerId] = date
  }

  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (
        (cell.action === "add" || cell.action === "drop_add") &&
        cell.rosterDropKind === "player" &&
        cell.rosterDropPlayerId
      ) {
        noteDrop(cell.rosterDropPlayerId, day.date)
      }
    }
  }
  return fromById
}

/** Dates a preview streamer occupies a streaming-plan spot (add/hold/drop_add). */
const previewStreamerOwnedDatesByPlayerId = (
  plan: StreamingPlan | null,
): Record<string, Set<string>> => {
  const byId: Record<string, Set<string>> = {}
  if (!plan) return byId

  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (!cell.playerId || cell.action === "empty") continue
      const dates = byId[cell.playerId] ?? new Set<string>()
      dates.add(day.date)
      byId[cell.playerId] = dates
    }
  }
  return byId
}

export const MatchupWorkspace = ({ leagueId }: MatchupWorkspaceProps) => {
  useSyncActiveSeasonLeague(leagueId)

  const [state, setState] = useState<SeasonLeagueState | null>(null)
  const [matchupData, setMatchupData] = useState<MatchupResponse | null>(null)
  const [opponentTeamIndex, setOpponentTeamIndex] = useState<number | null>(null)
  const [statWindow, setStatWindow] = useState<StatWindow>(() =>
    readStoredStatWindow(leagueId),
  )
  const statWindowRef = useRef(statWindow)
  statWindowRef.current = statWindow
  const [daily, setDaily] = useState<DailyLineups | null>(null)
  const [previewPlan, setPreviewPlan] = useState<StreamingPlan | null>(null)
  const [previewSpotCount, setPreviewSpotCount] = useState<1 | 2 | 3 | null>(
    null,
  )
  const [oppSpotChoice, setOppSpotChoice] = useState<OppSpotChoice>("auto")
  const [forcedOpponentRosterDrops, setForcedOpponentRosterDrops] = useState<
    (string | null)[]
  >([])
  const [builtPlans, setBuiltPlans] = useState<StreamingPlan[]>([])
  const [noneOpponentPlan, setNoneOpponentPlan] =
    useState<StreamingPlan | null>(null)
  const appliedOppKeyRef = useRef<string | null>(null)
  const [previewSatSeats, setPreviewSatSeats] = useState<Set<string>>(
    () => new Set(),
  )
  const [keepRosterSeats, setKeepRosterSeats] = useState<Set<string>>(
    () => new Set(),
  )
  const [error, setError] = useState("")
  const [opponentError, setOpponentError] = useState("")
  const [applyError, setApplyError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [applyingSwapKey, setApplyingSwapKey] = useState<string | null>(null)
  const opponentFetchRef = useRef<AbortController | null>(null)

  const syncDailyFromState = useCallback(
    (
      nextState: SeasonLeagueState,
      days: string[],
      schedule: ScheduleResponse,
      reset = false,
    ) => {
      if (reset) {
        const youTeam = nextState.teams.find(
          (team) => team.teamIndex === nextState.perspectiveTeamIndex,
        )
        const fresh = initDailyLineups(
          days,
          youTeam?.entries ?? [],
          rosterSlotsFor(nextState),
          nextState.players,
          schedule,
        )
        writeDailyLineups(leagueId, fresh)
        setDaily(fresh)
        return
      }

      const resolved = resolveDailyLineups(leagueId, days, nextState, schedule)
      setDaily(resolved)
    },
    [leagueId],
  )

  const fetchMatchup = useCallback(
    async (
      opponentParam: number | "auto",
      options: {
        signal?: AbortSignal
        includeState?: boolean
        resetDaily?: boolean
        applyState?: boolean
        statWindow?: StatWindow
      } = {},
    ) => {
      const {
        signal,
        includeState = false,
        resetDaily = false,
        applyState = false,
        statWindow: statWindowParam = statWindowRef.current,
      } = options
      const params = new URLSearchParams({
        seasonLeagueId: leagueId,
        opponentTeamIndex: String(opponentParam),
      })
      if (includeState) params.set("includeState", "1")
      params.set("statWindow", statWindowParam)

      const load = async () => {
        const response = await fetch(`/api/matchup?${params}`, { signal })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error ?? "Unable to load matchup advice")
        }

        return (await response.json()) as MatchupResponse
      }

      let payload: MatchupResponse
      try {
        payload = await load()
      } catch (firstError) {
        if (isAbortError(firstError, signal)) throw firstError
        if (
          !(firstError instanceof Error) ||
          firstError.message !== "Failed to fetch"
        ) {
          throw firstError
        }
        payload = await load()
      }
      setMatchupData(payload)
      setError("")
      setOpponentError("")
      setOpponentTeamIndex(payload.opponentTeamIndex)

      if (applyState || includeState) {
        if (!payload.state) {
          throw new Error("Unable to load matchup workspace")
        }

        setState(payload.state)
        syncDailyFromState(
          payload.state,
          payload.schedule.matchup.days,
          payload.schedule,
          resetDaily,
        )
      }

      return payload
    },
    [leagueId, syncDailyFromState],
  )

  useEffect(() => {
    const controller = new AbortController()

    const bootstrap = async () => {
      try {
        setError("")
        setPreviewPlan(null)
        const storedOpponent = readStoredOpponent(leagueId)
        const storedWindow = readStoredStatWindow(leagueId)
        setStatWindow(storedWindow)
        let payload: MatchupResponse

        try {
          payload = await fetchMatchup(storedOpponent ?? "auto", {
            signal: controller.signal,
            includeState: true,
            applyState: true,
            statWindow: storedWindow,
          })
        } catch (firstError) {
          if (isAbortError(firstError, controller.signal)) return

          const message =
            firstError instanceof Error ? firstError.message : ""
          if (storedOpponent === null || message !== "invalid_opponent") {
            throw firstError
          }

          payload = await fetchMatchup("auto", {
            signal: controller.signal,
            includeState: true,
            applyState: true,
            statWindow: storedWindow,
          })
        }

        if (controller.signal.aborted) return

        window.localStorage.setItem(
          opponentStorageKey(leagueId),
          String(payload.opponentTeamIndex),
        )
      } catch (requestError) {
        if (isAbortError(requestError, controller.signal)) return

        const message = matchupFetchErrorMessage(requestError)
        setError(
          message === "no_opponent"
            ? "No opponent teams available"
            : message === "invalid_opponent"
              ? "Unable to load matchup advice"
              : message,
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void bootstrap()

    return () => {
      controller.abort()
      opponentFetchRef.current?.abort()
    }
  }, [fetchMatchup, leagueId])

  const handleOpponentChange = async (teamIndex: number) => {
    setForcedOpponentRosterDrops([])
    opponentFetchRef.current?.abort()

    const controller = new AbortController()
    opponentFetchRef.current = controller

    setOpponentError("")
    setApplyError("")
    setSuccessMessage("")
    setIsRefreshing(true)

    try {
      await fetchMatchup(teamIndex, { signal: controller.signal })
      if (controller.signal.aborted) return

      window.localStorage.setItem(opponentStorageKey(leagueId), String(teamIndex))
    } catch (requestError) {
      if (isAbortError(requestError, controller.signal)) {
        return
      }

      setOpponentError(matchupFetchErrorMessage(requestError))
    } finally {
      if (opponentFetchRef.current === controller) {
        setIsRefreshing(false)
      }
    }
  }

  const handleStatWindowChange = async (nextWindow: StatWindow) => {
    setStatWindow(nextWindow)
    window.localStorage.setItem(statWindowStorageKey(leagueId), nextWindow)

    if (opponentTeamIndex === null) return

    opponentFetchRef.current?.abort()

    const controller = new AbortController()
    opponentFetchRef.current = controller

    setOpponentError("")
    setApplyError("")
    setSuccessMessage("")
    setIsRefreshing(true)

    try {
      await fetchMatchup(opponentTeamIndex, {
        signal: controller.signal,
        includeState: false,
        statWindow: nextWindow,
      })
    } catch (requestError) {
      if (isAbortError(requestError, controller.signal)) {
        return
      }

      setOpponentError(matchupFetchErrorMessage(requestError))
    } finally {
      if (opponentFetchRef.current === controller) {
        setIsRefreshing(false)
      }
    }
  }

  const applyYouSpot = useCallback((spot: YouSpotCount) => {
    setPreviewSpotCount(spot)
    setPreviewSatSeats(new Set())
    setKeepRosterSeats(new Set())
    if (spot == null) {
      setPreviewPlan(null)
      return
    }
    setPreviewPlan(builtPlans.find((plan) => plan.spotCount === spot) ?? null)
  }, [builtPlans])

  const handleYouSpotCountChange = (spot: YouSpotCount) => {
    applyYouSpot(spot)
  }

  const handlePlansBuilt = useCallback(
    (payload: {
      plans: StreamingPlan[]
      noneOpponentPlan: StreamingPlan | null
    }) => {
      setBuiltPlans(payload.plans)
      setNoneOpponentPlan(payload.noneOpponentPlan)
    },
    [],
  )

  useEffect(() => {
    if (previewSpotCount == null) return
    setPreviewPlan(
      builtPlans.find((plan) => plan.spotCount === previewSpotCount) ?? null,
    )
  }, [builtPlans, previewSpotCount])

  const handleOppSpotChoiceChange = (choice: OppSpotChoice) => {
    setOppSpotChoice(choice)
  }

  const handleForcedOpponentRosterDropChange = (
    spotIndex: number,
    playerId: string | null,
  ) => {
    setForcedOpponentRosterDrops((previous) => {
      const next = previous.slice()
      while (next.length <= spotIndex) next.push(null)
      next[spotIndex] = playerId
      return next
    })
  }

  const youSpotScores = useMemo(() => {
    if (!daily || !matchupData || !state || !noneOpponentPlan) return []
    const players = [...state.players]
    const seen = new Set(players.map((player) => player.id))
    for (const player of Object.values(matchupData.playersById)) {
      if (seen.has(player.id)) continue
      players.push(player)
      seen.add(player.id)
    }
    return scoreYouSpotPlans({
      plans: builtPlans,
      noneOpponentDaily: noneOpponentPlan.opponentDaily,
      baseDaily: daily,
      players,
      schedule: matchupData.schedule,
      board: matchupData.board,
      statWindow,
    })
  }, [builtPlans, daily, matchupData, noneOpponentPlan, state, statWindow])

  const recommendedYouSpot = pickRecommendedYouSpot(youSpotScores)
  const oppAssumptionKey = `${oppSpotChoice}:${forcedOpponentRosterDrops.join(",")}`

  useEffect(() => {
    if (recommendedYouSpot === undefined) return
    if (!shouldAutoApplyYouSpot(appliedOppKeyRef.current, oppAssumptionKey)) {
      return
    }
    appliedOppKeyRef.current = oppAssumptionKey
    applyYouSpot(recommendedYouSpot)
  }, [applyYouSpot, oppAssumptionKey, recommendedYouSpot])

  const handleTogglePlayerDay = (
    playerId: string,
    day: string,
  ): TogglePlayerDayResult["status"] => {
    if (!daily || !matchupData || !state) return "missing_day"

    const playersMap: Record<string, SeasonPlayer> = {
      ...Object.fromEntries(state.players.map((player) => [player.id, player])),
      ...matchupData.playersById,
    }
    const streamerIds = previewStreamerIds(previewPlan)
    const droppedFromById = previewDroppedFromDateByPlayerId(previewPlan)
    const overlayOptions = {
      omitSeats: previewSatSeats,
      keepRosterSeats,
      rosterPlayerIds: youRosterPlayerIds(state),
    }
    const overlayDaily =
      previewPlan != null
        ? applyStreamingPlanPreview(
            daily,
            previewPlan,
            playersMap,
            matchupData.schedule,
            overlayOptions,
          )
        : daily

    const player =
      state.players.find((entry) => entry.id === playerId) ??
      playersMap[playerId]
    const hasGame = player
      ? playerGameDays(player, matchupData.schedule).has(day)
      : false

    if (!hasGame) return "missing_day"

    const overlayStarted =
      overlayDaily[day]?.some((entry) => entry.playerId === playerId) ?? false
    const key = previewSeatKey(day, playerId)

    // Preview streamers: sit/start is overlay-only (omitSeats), not saved daily.
    if (previewPlan != null && streamerIds.has(playerId)) {
      if (overlayStarted) {
        setPreviewSatSeats((previous) => {
          const next = new Set(previous)
          next.add(key)
          return next
        })
        return "sat"
      }
      const nextOmit = new Set(previewSatSeats)
      nextOmit.delete(key)
      const seated =
        applyStreamingPlanPreview(
          daily,
          previewPlan,
          playersMap,
          matchupData.schedule,
          {
            omitSeats: nextOmit,
            keepRosterSeats,
            rosterPlayerIds: youRosterPlayerIds(state),
          },
        )[day]?.some((entry) => entry.playerId === playerId) ?? false
      if (!seated) return "full"
      setPreviewSatSeats(nextOmit)
      return "started"
    }

    if (previewPlan != null) {
      const droppedFrom = droppedFromById[playerId]
      const isPlanRosterDrop =
        Boolean(droppedFrom && day >= droppedFrom) &&
        !streamerIds.has(playerId)
      if (overlayStarted) {
        const nextKeeps = new Set(keepRosterSeats)
        nextKeeps.delete(key)
        const stillStarted =
          applyStreamingPlanPreview(
            daily,
            previewPlan,
            playersMap,
            matchupData.schedule,
            {
              omitSeats: previewSatSeats,
              keepRosterSeats: nextKeeps,
              rosterPlayerIds: youRosterPlayerIds(state),
            },
          )[day]?.some((entry) => entry.playerId === playerId) ?? false
        setKeepRosterSeats(nextKeeps)
        if (!stillStarted) return "sat"
      } else {
        if (isPlanRosterDrop) return "ineligible"
        const nextKeeps = new Set(keepRosterSeats)
        nextKeeps.add(key)
        const seated =
          applyStreamingPlanPreview(
            daily,
            previewPlan,
            playersMap,
            matchupData.schedule,
            {
              omitSeats: previewSatSeats,
              keepRosterSeats: nextKeeps,
              rosterPlayerIds: youRosterPlayerIds(state),
            },
          )[day]?.some((entry) => entry.playerId === playerId) ?? false
        if (!seated) return "full"
        setKeepRosterSeats(nextKeeps)
        return "started"
      }
    }

    const { daily: next, status } = togglePlayerDay(
      daily,
      day,
      playerId,
      hasGame,
      playersMap,
      state.rosterSlots,
      matchupData.schedule,
    )

    if (status === "started" || status === "sat") {
      setKeepRosterSeats((previous) => {
        const nextKeeps = new Set(previous)
        if (status === "started") nextKeeps.add(key)
        else nextKeeps.delete(key)
        return nextKeeps
      })
      writeDailyLineups(leagueId, next)
      setDaily(next)
    }

    return status
  }

  const handleResetDaily = () => {
    if (!state || !matchupData) return

    setKeepRosterSeats(new Set())
    setPreviewSatSeats(new Set())
    syncDailyFromState(
      state,
      matchupData.schedule.matchup.days,
      matchupData.schedule,
      true,
    )
  }

  const handleApplyRatioSit = (suggestion: RatioSitSuggestion) => {
    if (!daily) return

    if (
      findPlayerSlotIndex(daily, suggestion.date, suggestion.playerId) < 0
    ) {
      return
    }

    handleTogglePlayerDay(suggestion.playerId, suggestion.date)
  }

  const handleApplySwap = async (suggestion: SitStartSuggestion) => {
    const key = swapKey(suggestion)
    setApplyingSwapKey(key)
    setApplyError("")
    setSuccessMessage("")

    try {
      const response = await fetch("/api/matchup/apply-lineup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seasonLeagueId: leagueId,
          benchPlayerId: suggestion.benchPlayerId,
          activePlayerId: suggestion.activePlayerId,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? "Unable to apply lineup swap")
      }

      if (opponentTeamIndex === null) return

      setSuccessMessage("Lineup updated locally")
      await fetchMatchup(opponentTeamIndex, {
        includeState: true,
        applyState: true,
        resetDaily: true,
      })
    } catch (requestError) {
      setApplyError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to apply lineup swap",
      )
    } finally {
      setApplyingSwapKey(null)
    }
  }

  const sitStartSuggestions = matchupData?.sitStart ?? []
  const sitStartDisplay = useMemo(() => {
    if (!state || !matchupData || !daily) {
      return { suggestions: [] as typeof sitStartSuggestions, badges: {} }
    }
    const youTeam = state.teams.find(
      (team) => team.teamIndex === state.perspectiveTeamIndex,
    )
    const playersById: Record<string, SeasonPlayer> = {
      ...Object.fromEntries(state.players.map((player) => [player.id, player])),
      ...matchupData.playersById,
    }
    const previewDaily = previewPlan
      ? applyStreamingPlanPreview(
          daily,
          previewPlan,
          playersById,
          matchupData.schedule,
          {
            omitSeats: previewSatSeats,
            keepRosterSeats,
            rosterPlayerIds: youRosterPlayerIds(state),
          },
        )
      : daily
    const input = {
      days: matchupData.schedule.matchup.days,
      schedule: matchupData.schedule,
      playersById,
      youEntries: youTeam?.entries ?? [],
      daily: previewDaily,
      droppedFromByPlayerId: previewDroppedFromDateByPlayerId(previewPlan),
    }
    const suggestions = visibleSitStartSuggestions(sitStartSuggestions, input)
    return {
      suggestions,
      badges: sitStartBadgesByPlayerDay(suggestions, input),
    }
  }, [
    daily,
    keepRosterSeats,
    matchupData,
    previewPlan,
    previewSatSeats,
    sitStartSuggestions,
    state,
  ])

  const planningBoard = useMemo(() => {
    if (!state || !matchupData || !daily) return undefined
    const playersById: Record<string, SeasonPlayer> = {
      ...Object.fromEntries(state.players.map((player) => [player.id, player])),
      ...matchupData.playersById,
    }
    const planningPlayers = [...state.players]
    const planningPlayerIds = new Set(state.players.map((player) => player.id))
    for (const entries of Object.values(daily)) {
      for (const entry of entries) {
        const playerId = entry.playerId
        if (!playerId || planningPlayerIds.has(playerId)) continue
        const player = playersById[playerId]
        if (!player) continue
        planningPlayers.push(player)
        planningPlayerIds.add(playerId)
      }
    }
    return planningMatchupBoard(
      daily,
      planningPlayers,
      matchupData.schedule,
      matchupData.board,
      statWindow,
    )
  }, [daily, state, matchupData, statWindow])

  if (isLoading) {
    return (
      <SeasonToolShell
        backHref="/matchup"
        backLabel="← All matchup leagues"
        status="Loading matchup advisor…"
      />
    )
  }

  if (!state || !matchupData || opponentTeamIndex === null || !daily) {
    return (
      <SeasonToolShell
        backHref="/matchup"
        backLabel="← All matchup leagues"
        error={error || "Unable to load matchup workspace"}
        unauthorizedHint="Sign in to load matchup advice for your leagues."
      />
    )
  }

  const showIncompleteBanner = hasIncompleteActiveLineup(state)

  const playersMap: Record<string, SeasonPlayer> = {
    ...Object.fromEntries(state.players.map((player) => [player.id, player])),
    ...matchupData.playersById,
  }

  const displayDaily =
    daily && previewPlan
      ? applyStreamingPlanPreview(
          daily,
          previewPlan,
          playersMap,
          matchupData.schedule,
          {
            omitSeats: previewSatSeats,
            keepRosterSeats,
            rosterPlayerIds: youRosterPlayerIds(state),
          },
        )
      : daily

  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  const oppTeam = state.teams.find((team) => team.teamIndex === opponentTeamIndex)
  const oppSpotCount = oppTeam
    ? resolveOppSpotCount(oppSpotChoice, oppTeam.entries)
    : undefined
  const displayOppPlan =
    previewPlan ??
    noneOpponentPlan ??
    builtPlans.find((plan) => plan.spotCount === 1) ??
    builtPlans[0] ??
    null
  const rosterPlayerIds = new Set(
    youTeam?.entries.flatMap((entry) =>
      entry.playerId ? [entry.playerId] : [],
    ) ?? [],
  )
  const rosterPlayers = state.players.filter((player) =>
    rosterPlayerIds.has(player.id),
  )
  const ilPlayerIds = new Set(
    youTeam?.entries.flatMap((entry) =>
      entry.slot === "IL" && entry.playerId ? [entry.playerId] : [],
    ) ?? [],
  )

  const extraPlayers = [...previewStreamerIds(previewPlan)]
    .map((playerId) => playersMap[playerId])
    .filter(
      (player): player is SeasonPlayer =>
        Boolean(player) && !rosterPlayerIds.has(player.id),
    )

  const totalsPlayerIds = new Set(state.players.map((player) => player.id))
  const playersForTotals = [...state.players]
  for (const extra of extraPlayers) {
    if (totalsPlayerIds.has(extra.id)) continue
    playersForTotals.push(extra)
    totalsPlayerIds.add(extra.id)
  }
  if (displayOppPlan) {
    for (const entries of Object.values(displayOppPlan.opponentDaily)) {
      for (const entry of entries) {
        const playerId = entry.playerId
        if (!playerId || totalsPlayerIds.has(playerId)) continue
        const player = playersMap[playerId]
        if (!player) continue
        playersForTotals.push(player)
        totalsPlayerIds.add(playerId)
      }
    }
  }

  const opponentDaily = displayOppPlan?.opponentDaily
  const liveOppTotals =
    opponentDaily && Object.keys(opponentDaily).length > 0
      ?           youTotalsFromDaily(
          opponentDaily,
          playersForTotals,
          matchupData.schedule,
          statWindow,
        )
      : oppTotalsFromBoard(matchupData.board)

  const liveBoard = buildMatchupBoard(
    youTotalsFromDaily(displayDaily, playersForTotals, matchupData.schedule, statWindow),
    liveOppTotals,
    enabledCategoryIds(state),
  )

  const ratioSits =
    previewPlan != null
      ? []
      : suggestRatioSits({
          daily: displayDaily,
          players: playersForTotals,
          schedule: matchupData.schedule,
          oppTotals: oppTotalsFromBoard(matchupData.board),
          categoryIds: liveBoard.categories.map((row) => row.categoryId),
          statWindow,
        })

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-2 py-6 sm:px-3">
      <div className="mx-auto max-w-[120rem]">
        <div className="mb-6">
          <Link
            className="w-fit font-medium text-sm text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/matchup"
          >
            ← All matchup leagues
          </Link>
        </div>

        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--color-mute)]">
              {state.season} season · matchup advisor
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
              {state.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem] text-[var(--color-mute)]">
              <span>
                {matchupData.scoringPeriod.startDate} – {matchupData.scoringPeriod.endDate}
              </span>
              <span className="rounded-full bg-[var(--color-soft-cloud)] px-2 py-0.5 text-[0.6875rem]">
                Schedule:{" "}
                {matchupData.schedule.source === "live"
                  ? "live"
                  : matchupData.schedule.source === "season"
                    ? "published · next week with games"
                    : "fixture fallback"}
              </span>
            </div>
          </div>
          <OpponentPicker
            onChange={handleOpponentChange}
            opponentTeamIndex={opponentTeamIndex}
            perspectiveTeamIndex={state.perspectiveTeamIndex}
            teams={matchupData.teams}
          />
        </header>

        <div className="mb-4 min-h-[3.25rem] space-y-2">
          {showIncompleteBanner ? (
            <Banner tone="mute">
              Incomplete lineup — fill active slots for a fair projection
            </Banner>
          ) : null}

          {opponentError ? (
            <Banner tone="danger">{opponentError}</Banner>
          ) : null}

          {applyError ? (
            <Banner tone="danger">{applyError}</Banner>
          ) : null}

          {successMessage ? (
            <Banner tone="success">{successMessage}</Banner>
          ) : null}
        </div>

        <p
          aria-live="polite"
          className={`mb-2 text-[0.8125rem] text-[var(--color-mute)] ${
            isRefreshing ? "visible" : "invisible"
          }`}
          role="status"
        >
          Refreshing projections…
        </p>

        <p className="mb-2 text-[0.7rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
          Using your day-by-day lineups
        </p>
        <div className="flex items-center gap-3">
          <MatchupPlanBar
            forcedOpponentRosterDrops={forcedOpponentRosterDrops}
            onForcedOpponentRosterDropChange={
              handleForcedOpponentRosterDropChange
            }
            onOppSpotChoiceChange={handleOppSpotChoiceChange}
            onYouSpotCountChange={handleYouSpotCountChange}
            openSeatCount={
              oppTeam ? emptyNonIlSeatCount(oppTeam.entries) : 0
            }
            opponentEntries={oppTeam?.entries}
            oppSpotChoice={oppSpotChoice}
            playersById={playersMap}
            recommendedYouSpot={recommendedYouSpot}
            resolvedOppSpotCount={oppSpotCount}
            statWindow={statWindow}
            onStatWindowChange={handleStatWindowChange}
            youSpotCount={previewSpotCount}
            youSpotScores={youSpotScores}
          />
          <div className="min-w-0 max-w-3xl flex-1">
            <MatchupBoard board={liveBoard} />
          </div>
        </div>

        <div className="mt-6 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] xl:gap-3">
          <div className="min-w-0">
            <DailyLineupPanel
              daily={displayDaily}
              days={matchupData.schedule.matchup.days}
              droppedFromDateByPlayerId={previewDroppedFromDateByPlayerId(
                previewPlan,
              )}
              extraPlayers={extraPlayers}
              ilPlayerIds={ilPlayerIds}
              onReset={handleResetDaily}
              onTogglePlayerDay={handleTogglePlayerDay}
              previewActive={previewPlan != null}
              previewPlayerIds={previewStreamerIds(previewPlan)}
              previewSpotCount={previewPlan?.spotCount}
              rosterPlayers={rosterPlayers}
              rosterEntries={youTeam?.entries}
              schedule={matchupData.schedule}
              streamerOwnedDatesByPlayerId={previewStreamerOwnedDatesByPlayerId(
                previewPlan,
              )}
              sitStartBadgesByPlayerDay={sitStartDisplay.badges}
              weekFooter={
                oppTeam ? (
                  <OpponentWeekStrip
                    days={matchupData.schedule.matchup.days}
                    opponentDays={displayOppPlan?.opponentDays ?? []}
                    opponentName={oppTeam.name}
                    oppSpotCount={oppSpotCount}
                    playersById={playersMap}
                  />
                ) : null
              }
            />
          </div>

          <StreamingPlansPanel
            adpByPlayerId={matchupData.adpByPlayerId}
            board={planningBoard ?? matchupData.board}
            daily={daily ?? undefined}
            leagueId={leagueId}
            onPlansBuilt={handlePlansBuilt}
            onPreviewSpotCountChange={handleYouSpotCountChange}
            previewSpotCount={previewSpotCount}
            opponentTeamIndex={opponentTeamIndex}
            oppSpotCount={oppSpotCount}
            forcedOpponentRosterDrops={forcedOpponentRosterDrops}
            playersById={matchupData.playersById}
            schedule={matchupData.schedule}
            state={state}
            statWindow={statWindow}
            winnerStreamRecipes={matchupData.winnerStreamRecipes}
          />
        </div>

        <div className="mt-8 space-y-8">
          <InjuryAlertsPanel leagueId={leagueId} />
          <SitStartPanel
            applyingSwapKey={applyingSwapKey}
            onApply={handleApplySwap}
            playersById={matchupData.playersById}
            suggestions={sitStartDisplay.suggestions}
          />
          {previewPlan == null ? (
            <RatioSitsPanel
              applyingKey={null}
              onApply={handleApplyRatioSit}
              playersById={playersMap}
              suggestions={ratioSits}
            />
          ) : null}
        </div>
      </div>
    </main>
  )
}
