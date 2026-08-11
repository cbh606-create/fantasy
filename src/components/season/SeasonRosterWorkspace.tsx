"use client"

import { useCallback, useEffect, useState } from "react"
import { CompactCategoryProfile } from "@/components/season/CompactCategoryProfile"
import { ConflictModal } from "@/components/season/ConflictModal"
import { LeagueRankMatrix } from "@/components/season/LeagueRankMatrix"
import { PlayerRosterTable } from "@/components/season/PlayerRosterTable"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import { applyLocalLineup } from "@/lib/season/lineup"
import type { SeasonLeagueState, SeasonRosterEntry } from "@/lib/season/types"

type SeasonRosterWorkspaceProps = {
  leagueId: string
}

type SeasonLeagueResponse = {
  state: SeasonLeagueState
}

type RefreshResponse = {
  conflict?: boolean
  incomingState?: SeasonLeagueState
  errorCode?: string
  message?: string
}

const responseMessage = async (response: Response, fallback: string) => {
  const body = (await response.json().catch(() => ({}))) as RefreshResponse
  return body.message ?? body.errorCode ?? fallback
}

export const SeasonRosterWorkspace = ({
  leagueId,
}: SeasonRosterWorkspaceProps) => {
  const [data, setData] = useState<SeasonLeagueResponse | null>(null)
  const [draftEntries, setDraftEntries] = useState<SeasonRosterEntry[] | null>(null)
  const [error, setError] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [incomingState, setIncomingState] = useState<SeasonLeagueState | null>(null)

  const loadLeague = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/season-leagues/${leagueId}`, { signal })

    if (!response.ok) {
      throw new Error(await responseMessage(response, "Unable to load this roster"))
    }

    const nextData = (await response.json()) as SeasonLeagueResponse
    setData(nextData)
    setDraftEntries(null)
  }, [leagueId])

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      setError("")

      try {
        await loadLeague(controller.signal)
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load this roster",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void load()

    return () => controller.abort()
  }, [loadLeague])

  const userEntries = data?.state.teams.find(
    (team) => team.teamIndex === data.state.perspectiveTeamIndex,
  )?.entries ?? []
  const effectiveEntries = draftEntries ?? userEntries
  const rosteredPlayerIds = new Set(
    userEntries.flatMap((entry) => entry.playerId ? [entry.playerId] : []),
  )
  const rosteredPlayers = data?.state.players.filter(
    (player) => rosteredPlayerIds.has(player.id),
  ) ?? []
  const effectiveState = data
    ? applyLocalLineup(data.state, effectiveEntries)
    : null
  const effectiveAnalysis = effectiveState
    ? analyzeSeasonLeague(effectiveState)
    : null
  const userLevels = effectiveAnalysis?.byTeam.find(
    (team) => team.teamIndex === effectiveState!.perspectiveTeamIndex,
  )?.levels ?? []

  const handleStartEditing = () => {
    setDraftEntries(userEntries)
    setIsEditing(true)
  }

  const handlePlayerChange = (entryIndex: number, playerId: string | null) => {
    setDraftEntries((entries) => {
      if (!entries) return entries

      const nextEntries = entries.map((entry) => ({ ...entry }))
      const existingIndex = playerId
        ? nextEntries.findIndex((entry) => entry.playerId === playerId)
        : -1
      const previousPlayerId = nextEntries[entryIndex].playerId

      nextEntries[entryIndex].playerId = playerId
      if (existingIndex >= 0 && existingIndex !== entryIndex) {
        nextEntries[existingIndex].playerId = previousPlayerId
      }

      return nextEntries
    })
  }

  const handleSaveLineup = async () => {
    if (!draftEntries) return

    setError("")
    setIsSaving(true)

    try {
      const response = await fetch(`/api/season-leagues/${leagueId}/lineup`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries: draftEntries }),
      })

      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to save lineup"))
      }

      setData((await response.json()) as SeasonLeagueResponse)
      setDraftEntries(null)
      setIsEditing(false)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save lineup",
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleRefresh = async () => {
    setError("")
    setIsRefreshing(true)

    try {
      const response = await fetch(`/api/season-leagues/${leagueId}/refresh`, {
        method: "POST",
      })
      const refresh = (await response.json()) as RefreshResponse

      if (!response.ok) {
        throw new Error(refresh.message ?? refresh.errorCode ?? "Unable to refresh ESPN")
      }

      if (refresh.conflict && refresh.incomingState) {
        setIncomingState(refresh.incomingState)
        return
      }

      await loadLeague()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to refresh ESPN",
      )
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleResolveConflict = async (
    resolution: "apply_espn" | "keep_local",
  ) => {
    if (!incomingState) return

    setError("")
    setIsSaving(true)

    try {
      const response = await fetch(
        `/api/season-leagues/${leagueId}/resolve-conflict`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resolution, incomingState }),
        },
      )

      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to resolve refresh conflict"))
      }

      setIncomingState(null)
      await loadLeague()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to resolve refresh conflict",
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-mute)]" role="status">Loading roster workspace…</p>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-sale)]" role="alert">{error || "Unable to load this roster"}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-[96rem]">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-[var(--color-mute)]">
              {data.state.season} season · YOU · {data.state.source}
              {data.state.lastSyncedAt ? ` · synced ${new Date(data.state.lastSyncedAt).toLocaleDateString()}` : ""}
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
              {data.state.name}
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full border border-[var(--color-hairline)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-soft-cloud)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRefreshing || data.state.source === "manual"}
              onClick={handleRefresh}
              type="button"
            >
              {isRefreshing ? "Refreshing…" : "Refresh ESPN"}
            </button>
            {isEditing ? (
              <>
                <button
                  className="rounded-full border border-[var(--color-hairline)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-soft-cloud)]"
                  disabled={isSaving}
                  onClick={() => {
                    setDraftEntries(null)
                    setIsEditing(false)
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSaving}
                  onClick={handleSaveLineup}
                  type="button"
                >
                  {isSaving ? "Saving…" : "Save lineup"}
                </button>
              </>
            ) : (
              <button
                className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
                onClick={handleStartEditing}
                type="button"
              >
                Edit lineup
              </button>
            )}
          </div>
        </header>
        {error ? (
          <p className="mb-6 rounded-2xl bg-red-50 px-5 py-4 text-sm text-[var(--color-sale)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="space-y-10">
          <PlayerRosterTable
            entries={effectiveEntries}
            isEditing={isEditing}
            onPlayerChange={handlePlayerChange}
            players={rosteredPlayers}
          />
          <CompactCategoryProfile levels={userLevels} />
          <LeagueRankMatrix
            analysis={effectiveAnalysis!}
            perspectiveTeamIndex={data.state.perspectiveTeamIndex}
            teams={effectiveState!.teams}
          />
        </div>
      </div>
      {incomingState ? (
        <ConflictModal
          isResolving={isSaving}
          onResolve={handleResolveConflict}
        />
      ) : null}
    </main>
  )
}
