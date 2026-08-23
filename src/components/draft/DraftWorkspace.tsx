"use client"

import { startTransition, useEffect, useRef, useState } from "react"
import { LiveView } from "@/components/draft/LiveView"
import {
  MockDraftView,
  type MockLatestPick,
} from "@/components/draft/MockDraftView"
import { PrepView } from "@/components/draft/PrepView"
import {
  buildEmptyBoard,
  DEFAULT_DRAFT_ROUNDS,
  isUserTurn,
  teamIndexForOverall,
} from "@/lib/domain/snake"
import {
  DEFAULT_TEAMS,
  ESPN_MAX_TEAMS,
  ESPN_MIN_TEAMS,
} from "@/lib/domain/leagueSize"
import type {
  DraftBoard,
  LeagueState,
  Player,
  SimulationResult,
} from "@/lib/domain/types"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { advanceOneCpuPick } from "@/lib/sim/advanceCpuPicks"
import {
  DEFAULT_ADP_SOURCE,
  withProjectedAdp,
  type AdpSourceId,
} from "@/lib/players/adpSources"
import { filterDraftEligible } from "@/lib/players/draftEligible"

const toMockLeagueState = (
  baseState: LeagueState,
  perspectiveTeamIndex: number,
  players: Player[],
  board: DraftBoard,
  teams = baseState.settings.teams,
): LeagueState => ({
  ...baseState,
  perspectiveTeamIndex,
  players,
  board,
  source: "manual",
  settings: {
    ...baseState.settings,
    teams,
    rounds: DEFAULT_DRAFT_ROUNDS,
    userPickSlot: perspectiveTeamIndex + 1,
  },
})

const MOCK_PICK_DELAY_MS = 280
const MOCK_SIM_COUNT = 12
const MOCK_SIM_DEBOUNCE_MS = 50

const buildQuickMockRecommendations = (
  leagueState: LeagueState,
): SimulationResult => {
  const draftedPlayerIds = new Set(
    leagueState.board.picks.flatMap((pick) =>
      pick.playerId ? [pick.playerId] : [],
    ),
  )
  const topAvailable = [...leagueState.players]
    .filter((player) => !draftedPlayerIds.has(player.id))
    .sort(
      (left, right) =>
        left.adp - right.adp || left.id.localeCompare(right.id),
    )
    .slice(0, 3)
  const categoryOutlook = Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as SimulationResult["categoryOutlook"]

  return {
    nextPicks: topAvailable.map((player, index) => ({
      playerId: player.id,
      score: topAvailable.length - index,
      frequency: (topAvailable.length - index) / 6,
    })),
    topCombinations: [],
    categoryOutlook,
    meta: {
      simCount: 0,
      seed: 0,
      generatedAt: new Date().toISOString(),
      latencyMs: 0,
      source: leagueState.source,
    },
  }
}

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

type LeagueResponse = {
  id: string
  name: string
  espnLeagueId: string | null
  season: number | null
  stateJson: string
}

type WorkspaceMode = "prep" | "mock" | "live"

type DraftWorkspaceProps = {
  initialMode?: WorkspaceMode
  leagueId: string
}

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

export const DraftWorkspace = ({
  initialMode = "prep",
  leagueId,
}: DraftWorkspaceProps) => {
  const [leagueName, setLeagueName] = useState("")
  const [espnLeagueId, setEspnLeagueId] = useState<string | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [state, setState] = useState<LeagueState | null>(null)
  const [mockBoard, setMockBoard] = useState<DraftBoard | null>(null)
  const [mockPlayers, setMockPlayers] = useState<Player[] | null>(null)
  const [mockTeams, setMockTeams] = useState(DEFAULT_TEAMS)
  const [mockPerspectiveTeamIndex, setMockPerspectiveTeamIndex] = useState(0)
  const [latestMockPick, setLatestMockPick] = useState<MockLatestPick | null>(
    null,
  )
  const [adpSource, setAdpSource] = useState<AdpSourceId>(DEFAULT_ADP_SOURCE)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [mockResult, setMockResult] = useState<SimulationResult | null>(null)
  const [mode, setMode] = useState<WorkspaceMode>(initialMode)
  const [simCount, setSimCount] = useState(40)
  const [isLoading, setIsLoading] = useState(true)
  const [isSimulating, setIsSimulating] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSavingPick, setIsSavingPick] = useState(false)
  const [isMockAdvancing, setIsMockAdvancing] = useState(false)
  const [isMockSimulating, setIsMockSimulating] = useState(false)
  const [isMockPlayersLoading, setIsMockPlayersLoading] = useState(false)
  const [isManualMode, setIsManualMode] = useState(false)
  const [syncError, setSyncError] = useState("")
  const [error, setError] = useState("")
  const simulationControllerRef = useRef<AbortController | null>(null)
  const simulationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mockSimulationControllerRef = useRef<AbortController | null>(null)
  const mockSimulationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const mockAdvanceControllerRef = useRef<AbortController | null>(null)
  const mockStartRequestIdRef = useRef(0)
  const didAutoEnterMockRef = useRef(false)

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
      if (mockSimulationTimerRef.current) {
        clearTimeout(mockSimulationTimerRef.current)
      }
      mockSimulationControllerRef.current?.abort()
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

  const runMockSimulation = async (
    simulationState: LeagueState,
    controller: AbortController,
  ) => {
    setError("")
    setIsMockSimulating(true)

    try {
      const response = await fetch("/api/draft/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: simulationState,
          simCount: MOCK_SIM_COUNT,
          fastRecommendations: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error("Unable to run the simulation")

      setMockResult((await response.json()) as SimulationResult)
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        return
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to run the simulation",
      )
    } finally {
      if (!controller.signal.aborted) setIsMockSimulating(false)
    }
  }

  const abortMockSimulation = () => {
    if (mockSimulationTimerRef.current) {
      clearTimeout(mockSimulationTimerRef.current)
      mockSimulationTimerRef.current = null
    }
    mockSimulationControllerRef.current?.abort()
    setIsMockSimulating(false)
  }

  const scheduleMockSimulation = (nextState: LeagueState) => {
    abortMockSimulation()
    setMockResult(buildQuickMockRecommendations(nextState))

    mockSimulationTimerRef.current = setTimeout(() => {
      const controller = new AbortController()
      mockSimulationControllerRef.current = controller
      void runMockSimulation(nextState, controller)
    }, MOCK_SIM_DEBOUNCE_MS)
  }

  const clearMockSimulation = () => {
    abortMockSimulation()
    setMockResult(null)
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

  const resolveLatestPick = (
    previous: LeagueState,
    next: LeagueState,
  ): MockLatestPick | null => {
    const filled = next.board.picks.find((pick) => {
      if (!pick.playerId) return false
      const before = previous.board.picks.find(
        (candidate) => candidate.overall === pick.overall,
      )
      return before?.playerId !== pick.playerId
    })

    if (!filled?.playerId) return null

    const player = next.players.find((entry) => entry.id === filled.playerId)
    if (!player) return null

    return {
      overall: filled.overall,
      teamIndex: filled.teamIndex,
      player,
    }
  }

  const runMockCpuUntilUserTurn = async (baseState: LeagueState) => {
    abortMockSimulation()
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

        const latest = resolveLatestPick(current, next)
        const nextBoard = next.board
        current = next
        startTransition(() => {
          if (latest) setLatestMockPick(latest)
          setMockBoard(nextBoard)
        })
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
        const teams = current.settings.teams
        const total = teams * current.settings.rounds
        const complete = current.board.currentOverall > total
        if (
          !complete &&
          isUserTurn(current.board, current.perspectiveTeamIndex, teams)
        ) {
          scheduleMockSimulation(current)
        }
      }
    }
  }

  const loadFreshMockPlayers = async (fallback: Player[]) => {
    try {
      const response = await fetch("/api/players")
      if (!response.ok) return fallback

      const payload = (await response.json()) as { players?: Player[] }
      return payload.players?.length ? payload.players : fallback
    } catch {
      return fallback
    }
  }

  const startMockDraft = async (
    baseState: LeagueState,
    perspectiveTeamIndex = baseState.perspectiveTeamIndex,
    options: {
      refreshPlayers?: boolean
      teams?: number
      adpSource?: AdpSourceId
    } = {},
  ) => {
    clearMockSimulation()
    setLatestMockPick(null)
    const requestId = mockStartRequestIdRef.current + 1
    mockStartRequestIdRef.current = requestId
    const teams = Math.min(
      ESPN_MAX_TEAMS,
      Math.max(
        ESPN_MIN_TEAMS,
        options.teams ?? mockTeams ?? baseState.settings.teams,
      ),
    )
    const nextPerspective = Math.min(
      Math.max(0, perspectiveTeamIndex),
      teams - 1,
    )
    setMockTeams(teams)
    setMockPerspectiveTeamIndex(nextPerspective)
    const source = options.adpSource ?? adpSource
    const cachedPlayers = mockPlayers
    const needsFetch =
      Boolean(options.refreshPlayers) || !cachedPlayers?.length
    setIsMockPlayersLoading(needsFetch)
    try {
      let rawPlayers: Player[]
      if (needsFetch || !cachedPlayers?.length) {
        rawPlayers = await loadFreshMockPlayers(baseState.players)
      } else {
        rawPlayers = cachedPlayers
      }
      if (mockStartRequestIdRef.current !== requestId) return
      const projected = withProjectedAdp(rawPlayers, source)
      const rounds = baseState.settings.rounds ?? DEFAULT_DRAFT_ROUNDS
      const players = filterDraftEligible(projected, {
        primary: source,
        teams,
        rounds,
      })
      setMockPlayers(players)

      const empty = buildEmptyBoard(teams, DEFAULT_DRAFT_ROUNDS)
      void runMockCpuUntilUserTurn(
        toMockLeagueState(
          baseState,
          nextPerspective,
          players,
          empty,
          teams,
        ),
      )
    } finally {
      if (mockStartRequestIdRef.current === requestId) {
        setIsMockPlayersLoading(false)
      }
    }
  }

  const handleAdpSourceChange = (next: AdpSourceId) => {
    setAdpSource(next)
    if (!state) return
    void startMockDraft(state, mockPerspectiveTeamIndex, {
      refreshPlayers: true,
      teams: mockTeams,
      adpSource: next,
    })
  }

  const handleEnterMock = () => {
    setMode("mock")
    if (!state) return
    if (!mockBoard && !isMockAdvancing) {
      void startMockDraft(state, state.perspectiveTeamIndex, {
        refreshPlayers: true,
        teams: state.settings.teams,
      })
    }
  }

  useEffect(() => {
    if (didAutoEnterMockRef.current) return
    if (initialMode !== "mock" || !state || isLoading) return
    didAutoEnterMockRef.current = true
    handleEnterMock()
  }, [initialMode, state, isLoading])

  const handleResetMock = () => {
    if (!state) return
    void startMockDraft(state, mockPerspectiveTeamIndex, {
      teams: mockTeams,
    })
  }

  const handleMockSlotChange = (slot: number) => {
    if (!state) return
    const nextIndex = slot - 1
    if (
      nextIndex < 0 ||
      nextIndex >= mockTeams ||
      nextIndex === mockPerspectiveTeamIndex
    ) {
      return
    }
    void startMockDraft(state, nextIndex, {
      teams: mockTeams,
    })
  }

  const handleMockTeamsChange = (teams: number) => {
    if (!state) return
    if (
      !Number.isInteger(teams) ||
      teams < ESPN_MIN_TEAMS ||
      teams > ESPN_MAX_TEAMS ||
      teams === mockTeams
    ) {
      return
    }
    void startMockDraft(state, mockPerspectiveTeamIndex, {
      refreshPlayers: true,
      teams,
    })
  }

  const handleMockMarkPicked = (playerId: string) => {
    if (!state || !mockBoard || !mockPlayers || isSavingPick || isMockAdvancing) {
      return
    }

    const overall = mockBoard.currentOverall
    const teamIndex = teamIndexForOverall(overall, mockTeams)
    const player = mockPlayers.find((entry) => entry.id === playerId)
    if (player) {
      setLatestMockPick({ overall, teamIndex, player })
    }

    const afterHuman = applyPickToBoard(mockBoard, mockTeams, playerId)
    void runMockCpuUntilUserTurn(
      toMockLeagueState(
        state,
        mockPerspectiveTeamIndex,
        mockPlayers,
        afterHuman,
        mockTeams,
      ),
    )
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
          className="sticky top-[3.25rem] z-40 mb-6 flex w-fit rounded-full bg-[var(--color-soft-cloud)]/95 p-1 backdrop-blur-sm"
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
          {mode === "mock" && mockBoard && mockPlayers ? (
            <MockDraftView
              adpSource={adpSource}
              isAdvancing={isMockAdvancing}
              isPlayersLoading={isMockPlayersLoading}
              isSavingPick={isSavingPick}
              isSimulating={isMockSimulating}
              latestPick={latestMockPick}
              mockBoard={mockBoard}
              mockResult={mockResult}
              onAdpSourceChange={handleAdpSourceChange}
              onMarkPicked={handleMockMarkPicked}
              onReset={handleResetMock}
              onSlotChange={handleMockSlotChange}
              onTeamsChange={handleMockTeamsChange}
              perspectiveTeamIndex={mockPerspectiveTeamIndex}
              players={mockPlayers}
              state={toMockLeagueState(
                state,
                mockPerspectiveTeamIndex,
                mockPlayers,
                mockBoard,
                mockTeams,
              )}
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
