"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { MatchupBoard } from "@/components/matchup/MatchupBoard"
import { OpponentPicker } from "@/components/matchup/OpponentPicker"
import { SitStartPanel } from "@/components/matchup/SitStartPanel"
import { StreamersPanel } from "@/components/matchup/StreamersPanel"
import { Banner } from "@/components/ui/Banner"
import { isActiveSlot } from "@/lib/matchup/constants"
import type { MatchupAdvice, SitStartSuggestion } from "@/lib/matchup/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

type MatchupWorkspaceProps = {
  leagueId: string
}

type MatchupResponse = MatchupAdvice & {
  playersById: Record<string, SeasonPlayer>
  teams: { teamIndex: number; name: string }[]
}

const opponentStorageKey = (leagueId: string) => `matchup-opponent:${leagueId}`

const readStoredOpponent = (leagueId: string): number | null => {
  if (typeof window === "undefined") return null

  const stored = window.localStorage.getItem(opponentStorageKey(leagueId))
  if (!stored) return null

  const parsed = Number.parseInt(stored, 10)
  return Number.isInteger(parsed) ? parsed : null
}

const defaultOpponentIndex = (state: SeasonLeagueState): number | null => {
  const opponent = state.teams.find(
    (team) => team.teamIndex !== state.perspectiveTeamIndex,
  )
  return opponent?.teamIndex ?? null
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
  const [state, setState] = useState<SeasonLeagueState | null>(null)
  const [matchupData, setMatchupData] = useState<MatchupResponse | null>(null)
  const [opponentTeamIndex, setOpponentTeamIndex] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [opponentError, setOpponentError] = useState("")
  const [applyError, setApplyError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [applyingSwapKey, setApplyingSwapKey] = useState<string | null>(null)
  const opponentFetchRef = useRef<AbortController | null>(null)

  const loadMatchup = useCallback(
    async (opponentIndex: number, signal?: AbortSignal) => {
      const response = await fetch(
        `/api/matchup?seasonLeagueId=${leagueId}&opponentTeamIndex=${opponentIndex}`,
        { signal },
      )

      if (!response.ok) {
        throw new Error("Unable to load matchup advice")
      }

      const payload = (await response.json()) as MatchupResponse
      setMatchupData(payload)
    },
    [leagueId],
  )

  const refreshWorkspace = useCallback(
    async (opponentIndex: number, signal?: AbortSignal) => {
      const [leagueResponse] = await Promise.all([
        fetch(`/api/season-leagues/${leagueId}`, { signal }),
        loadMatchup(opponentIndex, signal),
      ])

      if (!leagueResponse.ok) {
        throw new Error("Unable to load matchup workspace")
      }

      const league = (await leagueResponse.json()) as { state: SeasonLeagueState }
      setState(league.state)
    },
    [leagueId, loadMatchup],
  )

  useEffect(() => {
    const controller = new AbortController()

    const bootstrap = async () => {
      try {
        const leagueResponse = await fetch(`/api/season-leagues/${leagueId}`, {
          signal: controller.signal,
        })

        if (!leagueResponse.ok) {
          throw new Error("Unable to load matchup workspace")
        }

        const league = (await leagueResponse.json()) as { state: SeasonLeagueState }
        setState(league.state)

        const storedOpponent = readStoredOpponent(leagueId)
        const validStored =
          storedOpponent !== null &&
          league.state.teams.some(
            (team) =>
              team.teamIndex === storedOpponent &&
              storedOpponent !== league.state.perspectiveTeamIndex,
          )
        const initialOpponent = validStored
          ? storedOpponent
          : defaultOpponentIndex(league.state)

        if (initialOpponent === null) {
          throw new Error("No opponent teams available")
        }

        setOpponentTeamIndex(initialOpponent)
        await loadMatchup(initialOpponent, controller.signal)
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load matchup workspace",
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
  }, [leagueId, loadMatchup])

  const handleOpponentChange = async (teamIndex: number) => {
    opponentFetchRef.current?.abort()

    const controller = new AbortController()
    opponentFetchRef.current = controller

    setOpponentError("")
    setApplyError("")
    setSuccessMessage("")
    setIsRefreshing(true)

    try {
      await loadMatchup(teamIndex, controller.signal)
      if (controller.signal.aborted) return

      setOpponentTeamIndex(teamIndex)
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
      await refreshWorkspace(opponentTeamIndex)
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

  if (!state || !matchupData || opponentTeamIndex === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-sale)]" role="alert">
          {error || "Unable to load matchup workspace"}
        </p>
      </main>
    )
  }

  const showIncompleteBanner = hasIncompleteActiveLineup(state)

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center gap-4 text-sm">
          <Link
            className="font-medium text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/matchup"
          >
            ← All matchup leagues
          </Link>
          <Link
            className="text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href={`/roster/${leagueId}`}
          >
            Open roster
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
            <p className="mt-2 text-[0.8125rem] text-[var(--color-mute)]">
              {matchupData.scoringPeriod.startDate} – {matchupData.scoringPeriod.endDate}
            </p>
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

        <MatchupBoard board={matchupData.board} />

        <div className="mt-8 space-y-8">
          <SitStartPanel
            applyingSwapKey={applyingSwapKey}
            onApply={handleApplySwap}
            playersById={matchupData.playersById}
            suggestions={matchupData.sitStart}
          />
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
