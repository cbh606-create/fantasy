"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { CompactCategoryProfile } from "@/components/season/CompactCategoryProfile"
import { ConflictModal } from "@/components/season/ConflictModal"
import { LeagueRankMatrix } from "@/components/season/LeagueRankMatrix"
import { PlayerSchedulePanel } from "@/components/season/PlayerSchedulePanel"
import { PlayerRosterTable } from "@/components/season/PlayerRosterTable"
import { SeasonToolShell } from "@/components/season/SeasonToolShell"
import { useSyncActiveSeasonLeague } from "@/components/season/useSyncActiveSeasonLeague"
import {
  analyzeSeasonLeague,
  type SeasonAnalysis,
} from "@/lib/season/analysis"
import { eligibleForSlot } from "@/lib/matchup/eligibility"
import { applyLocalLineup } from "@/lib/season/lineup"
import { buildPlayerMatchupSchedule } from "@/lib/season/schedule"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonRosterEntry,
} from "@/lib/season/types"

type SeasonRosterWorkspaceProps = {
  leagueId: string
}

type SeasonLeagueResponse = {
  state: SeasonLeagueState
  analysis: SeasonAnalysis
}

type WorkspaceTab = "stats" | "schedule"

type RefreshResponse = {
  conflict?: boolean
  incomingState?: SeasonLeagueState
  errorCode?: string
  message?: string
}

const responseMessage = async (response: Response, fallback: string) => {
  if (response.status === 401) return "unauthorized"
  const body = (await response.json().catch(() => ({}))) as RefreshResponse
  return body.message ?? body.errorCode ?? fallback
}

export const SeasonRosterWorkspace = ({
  leagueId,
}: SeasonRosterWorkspaceProps) => {
  useSyncActiveSeasonLeague(leagueId)

  const [data, setData] = useState<SeasonLeagueResponse | null>(null)
  const [draftEntries, setDraftEntries] = useState<SeasonRosterEntry[] | null>(null)
  const [error, setError] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [incomingState, setIncomingState] = useState<SeasonLeagueState | null>(null)
  const [authExpired, setAuthExpired] = useState(false)
  const [tab, setTab] = useState<WorkspaceTab>("stats")
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null)
  const [scheduleError, setScheduleError] = useState("")
  const [isScheduleLoading, setIsScheduleLoading] = useState(false)

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

  useEffect(() => {
    if (tab !== "schedule" || schedule || !data) return

    const controller = new AbortController()

    const loadSchedule = async () => {
      setScheduleError("")
      setIsScheduleLoading(true)

      try {
        const response = await fetch(
          `/api/schedule?seasonLeagueId=${leagueId}`,
          { signal: controller.signal },
        )

        if (!response.ok) throw new Error("Unable to load schedule")

        setSchedule((await response.json()) as ScheduleResponse)
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return

        setScheduleError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load schedule",
        )
      } finally {
        if (!controller.signal.aborted) setIsScheduleLoading(false)
      }
    }

    void loadSchedule()

    return () => controller.abort()
  }, [data, leagueId, schedule, tab])

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
  const draftFingerprint = draftEntries
    ? draftEntries.map((entry) => `${entry.slot}:${entry.playerId ?? ""}`).join("|")
    : null
  const effectiveAnalysis = useMemo(() => {
    if (!data) return null
    if (!draftFingerprint || !draftEntries) {
      return data.analysis ?? analyzeSeasonLeague(data.state)
    }

    return analyzeSeasonLeague(applyLocalLineup(data.state, draftEntries))
  }, [data, draftEntries, draftFingerprint])
  const perspectiveTeamIndex = data?.state.perspectiveTeamIndex
  const userLevels = effectiveAnalysis?.byTeam.find(
    (team) => team.teamIndex === perspectiveTeamIndex,
  )?.levels ?? []
  const scheduleRows = schedule
    ? buildPlayerMatchupSchedule({
        entries: effectiveEntries,
        players: data?.state.players ?? [],
        schedule,
      })
    : []

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
    if (!draftEntries || !data) return

    const playersById = new Map(data.state.players.map((player) => [player.id, player]))
    for (const entry of draftEntries) {
      if (!entry.playerId) continue
      const player = playersById.get(entry.playerId)
      if (!eligibleForSlot(player, entry.slot)) {
        setError(
          `${player?.name ?? "Player"} cannot fill ${entry.slot === "IL" ? "IR" : entry.slot}`,
        )
        return
      }
    }

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
    setAuthExpired(false)
    setIsRefreshing(true)

    try {
      const response = await fetch(`/api/season-leagues/${leagueId}/refresh`, {
        method: "POST",
      })
      const refresh = (await response.json()) as RefreshResponse

      if (!response.ok) {
        if (
          refresh.errorCode === "ESPN_AUTH" ||
          refresh.errorCode === "ESPN_NO_CREDENTIALS"
        ) {
          setAuthExpired(true)
        }
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
      <SeasonToolShell
        backHref="/roster"
        backLabel="← All rosters"
        status="Loading roster workspace…"
      />
    )
  }

  if (!data) {
    return (
      <SeasonToolShell
        backHref="/roster"
        backLabel="← All rosters"
        error={error || "Unable to load this roster"}
        unauthorizedHint="Sign in to load this roster."
      />
    )
  }

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-[96rem]">
        <div className="mb-6 flex flex-wrap items-center gap-4 text-sm">
          <Link
            aria-label="Back to home"
            className="font-medium text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/"
          >
            ← Home
          </Link>
          <Link
            className="text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/roster"
          >
            All rosters
          </Link>
        </div>
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
        {authExpired ? (
          <div
            className="mb-6 rounded-2xl border border-[var(--color-sale)]/30 bg-red-50 px-5 py-4 text-sm text-[var(--color-sale)]"
            role="alert"
          >
            Your ESPN connection expired.{" "}
            <Link
              className="font-medium underline underline-offset-2"
              href="/roster"
            >
              Reconnect with ESPN
            </Link>{" "}
            through the login window, then refresh again. You can still paste
            fresh espn_s2 / SWID on Rosters if needed.
          </div>
        ) : null}
        <div
          aria-label="Roster workspace view"
          className="mb-6 flex w-fit rounded-full bg-[var(--color-soft-cloud)] p-1"
          role="tablist"
        >
          {(["stats", "schedule"] as const).map((workspaceTab) => (
            <button
              aria-controls={`${workspaceTab}-panel`}
              aria-selected={tab === workspaceTab}
              className={`rounded-full px-6 py-2.5 font-medium capitalize ${
                tab === workspaceTab
                  ? "bg-[var(--color-ink)] text-white"
                  : "text-[var(--color-mute)]"
              }`}
              id={`${workspaceTab}-tab`}
              key={workspaceTab}
              onClick={() => setTab(workspaceTab)}
              role="tab"
              type="button"
            >
              {workspaceTab === "stats" ? "Stats" : "Schedule"}
            </button>
          ))}
        </div>
        {error ? (
          <p className="mb-6 rounded-2xl bg-red-50 px-5 py-4 text-sm text-[var(--color-sale)]" role="alert">
            {error}
          </p>
        ) : null}
        <div
          aria-labelledby="stats-tab"
          className={tab === "stats" ? "space-y-10" : "hidden"}
          hidden={tab !== "stats"}
          id="stats-panel"
          role="tabpanel"
        >
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
            teams={data.state.teams}
          />
        </div>
        <div
          aria-labelledby="schedule-tab"
          className={tab === "schedule" ? "" : "hidden"}
          hidden={tab !== "schedule"}
          id="schedule-panel"
          role="tabpanel"
        >
          {isScheduleLoading ? (
            <p className="text-[var(--color-mute)]" role="status">
              Loading schedule…
            </p>
          ) : null}
          {scheduleError ? (
            <p className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-[var(--color-sale)]" role="alert">
              {scheduleError}
            </p>
          ) : null}
          {schedule ? (
            <PlayerSchedulePanel
              matchup={schedule.matchup}
              rows={scheduleRows}
            />
          ) : null}
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
