"use client"

import { useEffect, useRef, useState } from "react"
import { LiveView } from "@/components/draft/LiveView"
import { PrepView } from "@/components/draft/PrepView"
import { teamIndexForOverall } from "@/lib/domain/snake"
import type {
  LeagueState,
  SimulationResult,
} from "@/lib/domain/types"

type DraftWorkspaceProps = {
  leagueId: string
}

type LeagueResponse = {
  id: string
  name: string
  espnLeagueId: string | null
  season: number | null
  stateJson: string
}

type WorkspaceMode = "prep" | "live"

export const DraftWorkspace = ({ leagueId }: DraftWorkspaceProps) => {
  const [leagueName, setLeagueName] = useState("")
  const [espnLeagueId, setEspnLeagueId] = useState<string | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [state, setState] = useState<LeagueState | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [mode, setMode] = useState<WorkspaceMode>("prep")
  const [simCount, setSimCount] = useState(40)
  const [isLoading, setIsLoading] = useState(true)
  const [isSimulating, setIsSimulating] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSavingPick, setIsSavingPick] = useState(false)
  const [isManualMode, setIsManualMode] = useState(false)
  const [syncError, setSyncError] = useState("")
  const [error, setError] = useState("")
  const simulationControllerRef = useRef<AbortController | null>(null)
  const simulationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const loadLeague = async () => {
      setError("")

      try {
        const response = await fetch(`/api/leagues/${leagueId}`, {
          signal: controller.signal,
        })

        if (!response.ok) throw new Error("Unable to load this league")

        const league = (await response.json()) as LeagueResponse
        setLeagueName(league.name)
        setEspnLeagueId(league.espnLeagueId)
        setSeason(league.season)
        const leagueState = JSON.parse(league.stateJson) as LeagueState
        setState(leagueState)
        setIsManualMode(leagueState.source === "manual")
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load this league",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadLeague()

    return () => controller.abort()
  }, [leagueId])

  useEffect(
    () => () => {
      if (simulationTimerRef.current) {
        clearTimeout(simulationTimerRef.current)
      }
      simulationControllerRef.current?.abort()
    },
    [],
  )

  const runSimulation = async (
    simulationState: LeagueState,
    controller: AbortController,
  ) => {
    setError("")
    setIsSimulating(true)

    try {
      const response = await fetch("/api/draft/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: simulationState, simCount }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error("Unable to run the simulation")

      setResult((await response.json()) as SimulationResult)
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        return
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to run the simulation",
      )
    } finally {
      if (!controller.signal.aborted) setIsSimulating(false)
    }
  }

  const handleRunSimulation = () => {
    if (!state) return

    simulationControllerRef.current?.abort()
    const controller = new AbortController()
    simulationControllerRef.current = controller
    void runSimulation(state, controller)
  }

  const scheduleSimulation = (nextState: LeagueState) => {
    if (simulationTimerRef.current) {
      clearTimeout(simulationTimerRef.current)
    }
    simulationControllerRef.current?.abort()

    simulationTimerRef.current = setTimeout(() => {
      const controller = new AbortController()
      simulationControllerRef.current = controller
      void runSimulation(nextState, controller)
    }, 400)
  }

  const handleSync = async () => {
    if (!state || !espnLeagueId || season === null) return

    setSyncError("")
    setIsSyncing(true)

    try {
      const response = await fetch("/api/espn/sync-board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: leagueId,
          leagueId: espnLeagueId,
          season,
        }),
      })
      const syncResult = (await response.json()) as {
        league?: LeagueResponse
        message?: string
      }

      if (!response.ok || !syncResult.league) {
        throw new Error(syncResult.message || "Unable to sync the ESPN board")
      }

      const syncedState = JSON.parse(
        syncResult.league.stateJson,
      ) as LeagueState
      setState(syncedState)
      setIsManualMode(false)
      scheduleSimulation(syncedState)
    } catch (requestError) {
      setSyncError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sync the ESPN board",
      )
    } finally {
      setIsSyncing(false)
    }
  }

  const handleMarkPicked = async (playerId: string) => {
    if (!state || isSavingPick) return

    const currentOverall = state.board.currentOverall
    const existingPick = state.board.picks.find(
      (pick) => pick.overall === currentOverall,
    )
    const currentPick = existingPick ?? {
      overall: currentOverall,
      round: Math.ceil(currentOverall / state.settings.teams),
      teamIndex: teamIndexForOverall(currentOverall, state.settings.teams),
      playerId: null,
    }
    const updatedPick = { ...currentPick, playerId }
    const updatedPicks = existingPick
      ? state.board.picks.map((pick) =>
          pick.overall === currentOverall ? updatedPick : pick,
        )
      : [...state.board.picks, updatedPick].sort(
          (firstPick, secondPick) => firstPick.overall - secondPick.overall,
        )
    const nextOpenPick = updatedPicks.find(
      (pick) => pick.overall > currentOverall && !pick.playerId,
    )
    const nextState: LeagueState = {
      ...state,
      board: {
        picks: updatedPicks,
        currentOverall: nextOpenPick?.overall ?? currentOverall + 1,
      },
      source: state.source === "espn" ? "mixed" : state.source,
    }

    setError("")
    setIsSavingPick(true)

    try {
      const response = await fetch(`/api/leagues/${leagueId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: nextState }),
      })

      if (!response.ok) throw new Error("Unable to mark this player picked")

      setState(nextState)
      scheduleSimulation(nextState)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to mark this player picked",
      )
    } finally {
      setIsSavingPick(false)
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-mute)]" role="status">
          Loading draft workspace…
        </p>
      </main>
    )
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-sale)]" role="alert">
          {error || "Unable to load this league"}
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-[96rem]">
        <header className="mb-8">
          <p className="text-sm text-[var(--color-mute)]">Draft workspace</p>
          <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
            {leagueName}
          </h1>
        </header>
        <div
          className="mb-6 flex w-fit rounded-full bg-[var(--color-soft-cloud)] p-1"
          role="tablist"
          aria-label="Draft workspace mode"
        >
          {(["prep", "live"] as const).map((workspaceMode) => (
            <button
              aria-selected={mode === workspaceMode}
              className={`rounded-full px-6 py-2.5 font-medium capitalize ${
                mode === workspaceMode
                  ? "bg-[var(--color-ink)] text-white"
                  : "text-[var(--color-mute)]"
              }`}
              key={workspaceMode}
              onClick={() => setMode(workspaceMode)}
              role="tab"
              type="button"
            >
              {workspaceMode === "prep" ? "Prep" : "Live"}
            </button>
          ))}
        </div>
        {error ? (
          <p
            className="mb-6 rounded-2xl bg-red-50 px-5 py-4 text-sm text-[var(--color-sale)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div role="tabpanel">
          {mode === "prep" ? (
            <PrepView
              isSimulating={isSimulating}
              onRunSimulation={handleRunSimulation}
              onSimCountChange={setSimCount}
              result={result}
              simCount={simCount}
              state={state}
            />
          ) : (
            <LiveView
              isManualMode={isManualMode}
              isSavingPick={isSavingPick}
              isSyncing={isSyncing}
              onContinueManually={() => {
                setIsManualMode(true)
                setSyncError("")
              }}
              onMarkPicked={handleMarkPicked}
              onSync={handleSync}
              result={result}
              state={state}
              syncError={syncError}
            />
          )}
        </div>
      </div>
    </main>
  )
}
