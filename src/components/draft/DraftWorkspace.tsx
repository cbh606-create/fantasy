"use client"

import { useEffect, useState } from "react"
import { PrepView } from "@/components/draft/PrepView"
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
  stateJson: string
}

export const DraftWorkspace = ({ leagueId }: DraftWorkspaceProps) => {
  const [leagueName, setLeagueName] = useState("")
  const [state, setState] = useState<LeagueState | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [simCount, setSimCount] = useState(40)
  const [isLoading, setIsLoading] = useState(true)
  const [isSimulating, setIsSimulating] = useState(false)
  const [error, setError] = useState("")

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
        setState(JSON.parse(league.stateJson) as LeagueState)
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

  const handleRunSimulation = async () => {
    if (!state) return

    setError("")
    setIsSimulating(true)

    try {
      const response = await fetch("/api/draft/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, simCount }),
      })

      if (!response.ok) throw new Error("Unable to run the simulation")

      setResult((await response.json()) as SimulationResult)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to run the simulation",
      )
    } finally {
      setIsSimulating(false)
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
        {error ? (
          <p
            className="mb-6 rounded-2xl bg-red-50 px-5 py-4 text-sm text-[var(--color-sale)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <PrepView
          isSimulating={isSimulating}
          onRunSimulation={handleRunSimulation}
          onSimCountChange={setSimCount}
          result={result}
          simCount={simCount}
          state={state}
        />
      </div>
    </main>
  )
}
