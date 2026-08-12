"use client"

import { useEffect, useRef, useState } from "react"
import { LiveView } from "@/components/draft/LiveView"
import { MockDraftView } from "@/components/draft/MockDraftView"
import { PrepView } from "@/components/draft/PrepView"
import { buildEmptyBoard, teamIndexForOverall } from "@/lib/domain/snake"
import type {
  DraftBoard,
  LeagueState,
  SimulationResult,
} from "@/lib/domain/types"
import { advanceOneCpuPick } from "@/lib/sim/advanceCpuPicks"

const MOCK_PICK_DELAY_MS = 550

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }

    const timer = window.setTimeout(() => resolve(), ms)
    const handleAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }

    signal.addEventListener("abort", handleAbort, { once: true })
  })

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

type WorkspaceMode = "prep" | "mock" | "live"

const MODE_LABELS: Record<WorkspaceMode, string> = {
  prep: "Prep",
  mock: "Mock",
  live: "Live",
}

const applyPickToBoard = (
  board: DraftBoard,
  teams: number,
  playerId: string,
): DraftBoard => {
  const currentOverall = board.currentOverall
  const existingPick = board.picks.find((pick) => pick.overall === currentOverall)
  const currentPick = existingPick ?? {
    overall: currentOverall,
    round: Math.ceil(currentOverall / teams),
    teamIndex: teamIndexForOverall(currentOverall, teams),
    playerId: null,
  }
  const updatedPick = { ...currentPick, playerId }
  const updatedPicks = existingPick
    ? board.picks.map((pick) =>
        pick.overall === currentOverall ? updatedPick : pick,
      )
    : [...board.picks, updatedPick].sort(
        (firstPick, secondPick) => firstPick.overall - secondPick.overall,
      )
  const nextOpenPick = updatedPicks.find(
    (pick) => pick.overall > currentOverall && !pick.playerId,
  )

  return {
    picks: updatedPicks,
    currentOverall: nextOpenPick?.overall ?? currentOverall + 1,
  }
}

export const DraftWorkspace = ({ leagueId }: DraftWorkspaceProps) => {
  const [leagueName, setLeagueName] = useState("")
  const [espnLeagueId, setEspnLeagueId] = useState<string | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [state, setState] = useState<LeagueState | null>(null)
  const [mockBoard, setMockBoard] = useState<DraftBoard | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [mode, setMode] = useState<WorkspaceMode>("prep")
  const [simCount, setSimCount] = useState(40)
  const [isLoading, setIsLoading] = useState(true)
  const [isSimulating, setIsSimulating] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSavingPick, setIsSavingPick] = useState(false)
  const [isMockAdvancing, setIsMockAdvancing] = useState(false)
  const [isManualMode, setIsManualMode] = useState(false)
  const [syncError, setSyncError] = useState("")
  const [error, setError] = useState("")
  const simulationControllerRef = useRef<AbortController | null>(null)
  const simulationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mockAdvanceControllerRef = useRef<AbortController | null>(null)

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
      mockAdvanceControllerRef.current?.abort()
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

  const runMockCpuUntilUserTurn = async (baseState: LeagueState) => {
    mockAdvanceControllerRef.current?.abort()
    const controller = new AbortController()
    mockAdvanceControllerRef.current = controller
    setIsMockAdvancing(true)

    let current = baseState
    setMockBoard(current.board)
    let step = 0

    try {
      while (!controller.signal.aborted) {
        const next = advanceOneCpuPick(
          current,
          ((Date.now() >>> 0) + current.board.currentOverall + step) >>> 0,
        )
        if (!next) break

        current = next
        setMockBoard(current.board)
        step += 1
        await wait(MOCK_PICK_DELAY_MS, controller.signal)
      }
    } catch (requestError) {
      if (
        !(requestError instanceof DOMException) ||
        requestError.name !== "AbortError"
      ) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to advance mock draft",
        )
      }
    } finally {
      if (mockAdvanceControllerRef.current === controller) {
        setIsMockAdvancing(false)
      }
    }
  }

  const startMockDraft = (baseState: LeagueState) => {
    const empty = buildEmptyBoard(
      baseState.settings.teams,
      baseState.settings.rounds,
    )
    void runMockCpuUntilUserTurn({
      ...baseState,
      board: empty,
      source: "manual",
    })
  }

  const handleEnterMock = () => {
    setMode("mock")
    if (!state) return
    if (!mockBoard && !isMockAdvancing) startMockDraft(state)
  }

  const handleResetMock = () => {
    if (!state) return
    startMockDraft(state)
  }

  const handleMockMarkPicked = (playerId: string) => {
    if (!state || !mockBoard || isSavingPick || isMockAdvancing) return

    const afterHuman = applyPickToBoard(
      mockBoard,
      state.settings.teams,
      playerId,
    )
    void runMockCpuUntilUserTurn({
      ...state,
      board: afterHuman,
      source: "manual",
    })
  }

  const handleLiveMarkPicked = async (playerId: string) => {
    if (!state || isSavingPick) return

    const nextBoard = applyPickToBoard(
      state.board,
      state.settings.teams,
      playerId,
    )
    const nextState: LeagueState = {
      ...state,
      board: nextBoard,
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
          {(["prep", "mock", "live"] as const).map((workspaceMode) => (
            <button
              aria-selected={mode === workspaceMode}
              className={`rounded-full px-6 py-2.5 font-medium capitalize ${
                mode === workspaceMode
                  ? "bg-[var(--color-ink)] text-white"
                  : "text-[var(--color-mute)]"
              }`}
              key={workspaceMode}
              onClick={() => {
                if (workspaceMode === "mock") {
                  handleEnterMock()
                  return
                }

                setMode(workspaceMode)
              }}
              role="tab"
              type="button"
            >
              {MODE_LABELS[workspaceMode]}
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
          ) : null}
          {mode === "mock" && mockBoard ? (
            <MockDraftView
              isAdvancing={isMockAdvancing}
              isSavingPick={isSavingPick}
              mockBoard={mockBoard}
              onMarkPicked={handleMockMarkPicked}
              onReset={handleResetMock}
              state={state}
            />
          ) : null}
          {mode === "live" ? (
            <LiveView
              isManualMode={isManualMode}
              isSavingPick={isSavingPick}
              isSyncing={isSyncing}
              onContinueManually={() => {
                setIsManualMode(true)
                setSyncError("")
              }}
              onMarkPicked={handleLiveMarkPicked}
              onSync={handleSync}
              result={result}
              state={state}
              syncError={syncError}
            />
          ) : null}
        </div>
      </div>
    </main>
  )
}
