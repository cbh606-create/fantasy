"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { DailyLineupPanel } from "@/components/matchup/DailyLineupPanel"
import { InjuryAlertsPanel } from "@/components/matchup/InjuryAlertsPanel"
import { MatchupBoard } from "@/components/matchup/MatchupBoard"
import { OpponentPicker } from "@/components/matchup/OpponentPicker"
import { SitStartPanel } from "@/components/matchup/SitStartPanel"
import { StreamersPanel } from "@/components/matchup/StreamersPanel"
import { useSyncActiveSeasonLeague } from "@/components/season/useSyncActiveSeasonLeague"
import { Banner } from "@/components/ui/Banner"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { buildMatchupBoard } from "@/lib/matchup/board"
import { isActiveSlot } from "@/lib/matchup/constants"
import {
  dailyLineupsMatchDays,
  initDailyLineups,
  playerGameDays,
  readDailyLineups,
  togglePlayerDay,
  writeDailyLineups,
  youTotalsFromDaily,
  type DailyLineups,
  type TogglePlayerDayResult,
} from "@/lib/matchup/dailyLineups"
import { rosterSlotsFor } from "@/lib/matchup/eligibility"
import type { MatchupAdvice, MatchupBoard as MatchupBoardData, SitStartSuggestion } from "@/lib/matchup/types"
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

const resolveDailyLineups = (
  leagueId: string,
  days: string[],
  state: SeasonLeagueState,
): DailyLineups => {
  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  const activeEntries = youTeam?.entries ?? []
  const rosterSlots = rosterSlotsFor(state)
  const stored = readDailyLineups(leagueId)

  if (stored && dailyLineupsMatchDays(stored, days, rosterSlots)) {
    return stored
  }

  const fresh = initDailyLineups(days, activeEntries, rosterSlots)
  writeDailyLineups(leagueId, fresh)
  return fresh
}

const opponentStorageKey = (leagueId: string) => `matchup-opponent:${leagueId}`

const readStoredOpponent = (leagueId: string): number | null => {
  if (typeof window === "undefined") return null

  const stored = window.localStorage.getItem(opponentStorageKey(leagueId))
  if (!stored) return null

  const parsed = Number.parseInt(stored, 10)
  return Number.isInteger(parsed) ? parsed : null
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

export const MatchupWorkspace = ({ leagueId }: MatchupWorkspaceProps) => {
  useSyncActiveSeasonLeague(leagueId)

  const [state, setState] = useState<SeasonLeagueState | null>(null)
  const [matchupData, setMatchupData] = useState<MatchupResponse | null>(null)
  const [opponentTeamIndex, setOpponentTeamIndex] = useState<number | null>(null)
  const [daily, setDaily] = useState<DailyLineups | null>(null)
  const [error, setError] = useState("")
  const [opponentError, setOpponentError] = useState("")
  const [applyError, setApplyError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [applyingSwapKey, setApplyingSwapKey] = useState<string | null>(null)
  const opponentFetchRef = useRef<AbortController | null>(null)

  const syncDailyFromState = useCallback(
    (nextState: SeasonLeagueState, days: string[], reset = false) => {
      if (reset) {
        const youTeam = nextState.teams.find(
          (team) => team.teamIndex === nextState.perspectiveTeamIndex,
        )
        const fresh = initDailyLineups(
          days,
          youTeam?.entries ?? [],
          rosterSlotsFor(nextState),
        )
        writeDailyLineups(leagueId, fresh)
        setDaily(fresh)
        return
      }

      const resolved = resolveDailyLineups(leagueId, days, nextState)
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
      } = {},
    ) => {
      const { signal, includeState = false, resetDaily = false, applyState = false } =
        options
      const params = new URLSearchParams({
        seasonLeagueId: leagueId,
        opponentTeamIndex: String(opponentParam),
      })
      if (includeState) params.set("includeState", "1")

      const response = await fetch(`/api/matchup?${params}`, { signal })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error ?? "Unable to load matchup advice")
      }

      const payload = (await response.json()) as MatchupResponse
      setMatchupData(payload)
      setOpponentTeamIndex(payload.opponentTeamIndex)

      if (applyState || includeState) {
        if (!payload.state) {
          throw new Error("Unable to load matchup workspace")
        }

        setState(payload.state)
        syncDailyFromState(
          payload.state,
          payload.schedule.matchup.days,
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
        const storedOpponent = readStoredOpponent(leagueId)
        let payload: MatchupResponse

        try {
          payload = await fetchMatchup(storedOpponent ?? "auto", {
            signal: controller.signal,
            includeState: true,
            applyState: true,
          })
        } catch (firstError) {
          if (controller.signal.aborted) return

          const message =
            firstError instanceof Error ? firstError.message : ""
          if (storedOpponent === null || message !== "invalid_opponent") {
            throw firstError
          }

          payload = await fetchMatchup("auto", {
            signal: controller.signal,
            includeState: true,
            applyState: true,
          })
        }

        if (controller.signal.aborted) return

        window.localStorage.setItem(
          opponentStorageKey(leagueId),
          String(payload.opponentTeamIndex),
        )
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return

        const message =
          requestError instanceof Error
            ? requestError.message
            : "Unable to load matchup workspace"
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
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        return
      }

      setOpponentError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load matchup advice",
      )
    } finally {
      if (opponentFetchRef.current === controller) {
        setIsRefreshing(false)
      }
    }
  }

  const handleTogglePlayerDay = (
    playerId: string,
    day: string,
  ): TogglePlayerDayResult["status"] => {
    if (!daily || !matchupData) return "missing_day"

    const player = state?.players.find((entry) => entry.id === playerId)
    const hasGame = player
      ? playerGameDays(player, matchupData.schedule).has(day)
      : false

    const { daily: next, status } = togglePlayerDay(
      daily,
      day,
      playerId,
      hasGame,
      matchupData.playersById,
      state?.rosterSlots,
    )

    if (status === "started" || status === "sat") {
      writeDailyLineups(leagueId, next)
      setDaily(next)
    }

    return status
  }

  const handleResetDaily = () => {
    if (!state || !matchupData) return

    syncDailyFromState(state, matchupData.schedule.matchup.days, true)
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

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-mute)]" role="status">
          Loading matchup advisor…
        </p>
      </main>
    )
  }

  if (!state || !matchupData || opponentTeamIndex === null || !daily) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-sale)]" role="alert">
          {error || "Unable to load matchup workspace"}
        </p>
      </main>
    )
  }

  const showIncompleteBanner = hasIncompleteActiveLineup(state)

  const liveBoard = buildMatchupBoard(
    youTotalsFromDaily(daily, state.players, matchupData.schedule),
    oppTotalsFromBoard(matchupData.board),
    enabledCategoryIds(state),
  )

  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  const rosterPlayerIds = new Set(
    youTeam?.entries.flatMap((entry) =>
      entry.playerId ? [entry.playerId] : [],
    ) ?? [],
  )
  const rosterPlayers = state.players.filter((player) =>
    rosterPlayerIds.has(player.id),
  )

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl">
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

        {showIncompleteBanner ? (
          <Banner className="mb-6" tone="mute">
            Incomplete lineup — fill active slots for a fair projection
          </Banner>
        ) : null}

        {opponentError ? (
          <Banner className="mb-6" tone="danger">
            {opponentError}
          </Banner>
        ) : null}

        {applyError ? (
          <Banner className="mb-6" tone="danger">
            {applyError}
          </Banner>
        ) : null}

        {successMessage ? (
          <Banner className="mb-6" tone="success">
            {successMessage}
          </Banner>
        ) : null}

        {isRefreshing ? (
          <p className="mb-4 text-[0.8125rem] text-[var(--color-mute)]" role="status">
            Refreshing projections…
          </p>
        ) : null}

        <p className="mb-2 text-[0.7rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
          Using your day-by-day lineups
        </p>
        <MatchupBoard board={liveBoard} />

        <DailyLineupPanel
          daily={daily}
          days={matchupData.schedule.matchup.days}
          onReset={handleResetDaily}
          onTogglePlayerDay={handleTogglePlayerDay}
          rosterPlayers={rosterPlayers}
          schedule={matchupData.schedule}
        />

        <div className="mt-8 space-y-8">
          <SitStartPanel
            applyingSwapKey={applyingSwapKey}
            onApply={handleApplySwap}
            playersById={matchupData.playersById}
            suggestions={matchupData.sitStart}
          />
          <InjuryAlertsPanel leagueId={leagueId} />
          <StreamersPanel
            leagueId={leagueId}
            playersById={matchupData.playersById}
            streamers={matchupData.streamers}
          />
        </div>
      </div>
    </main>
  )
}
