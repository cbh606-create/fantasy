"use client"

import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"

type SeasonLeagueListItem = {
  id: string
  name: string
  season: number
  source: "espn" | "manual" | "mixed"
  updatedAt: string
}

export default function RosterListPage() {
  const [leagues, setLeagues] = useState<SeasonLeagueListItem[]>([])
  const [name, setName] = useState("")
  const [espnName, setEspnName] = useState("")
  const [leagueId, setLeagueId] = useState("120853513")
  const [teamId, setTeamId] = useState("9")
  const [season, setSeason] = useState("2026")
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const loadLeagues = async () => {
      try {
        const response = await fetch("/api/season-leagues", {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Unable to load season leagues")
        setLeagues((await response.json()) as SeasonLeagueListItem[])
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
            : "Unable to load season leagues",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadLeagues()

    return () => controller.abort()
  }, [])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return

    setError("")
    setIsCreating(true)

    try {
      const response = await fetch("/api/season-leagues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), manual: true }),
      })
      if (!response.ok) throw new Error("Unable to create season league")

      const league = (await response.json()) as SeasonLeagueListItem
      window.location.assign(`/roster/${league.id}`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create season league",
      )
    } finally {
      setIsCreating(false)
    }
  }

  const handleImportEspn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const parsedTeamId = Number.parseInt(teamId, 10)
    const parsedSeason = Number.parseInt(season, 10)

    if (
      !leagueId.trim() ||
      !Number.isInteger(parsedTeamId) ||
      !Number.isInteger(parsedSeason)
    ) {
      setError("Enter leagueId, teamId, and season")
      return
    }

    setError("")
    setIsImporting(true)

    try {
      const response = await fetch("/api/espn/season-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: espnName.trim() || undefined,
          leagueId: leagueId.trim(),
          teamId: parsedTeamId,
          season: parsedSeason,
        }),
      })

      const payload = (await response.json()) as {
        id?: string
        error?: string
        errorCode?: string
        message?: string
      }

      if (!response.ok) {
        if (payload.errorCode === "ESPN_AUTH") {
          throw new Error(
            "ESPN auth failed — set ESPN_LIVE=true and ESPN_S2 / ESPN_SWID in .env",
          )
        }
        if (payload.errorCode) {
          throw new Error(payload.message ?? payload.errorCode)
        }
        throw new Error(payload.error ?? "Unable to import ESPN league")
      }

      if (!payload.id) throw new Error("Unable to import ESPN league")
      window.location.assign(`/roster/${payload.id}`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to import ESPN league",
      )
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="text-sm text-[var(--color-mute)]">Season analysis</p>
          <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
            Rosters
          </h1>
          {isLoading ? (
            <p className="mt-8 text-[var(--color-mute)]" role="status">
              Loading season leagues…
            </p>
          ) : leagues.length ? (
            <ul className="mt-8 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]">
              {leagues.map((league) => (
                <li key={league.id}>
                  <Link
                    className="flex items-center justify-between gap-4 py-5 transition-colors hover:text-[var(--color-info)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
                    href={`/roster/${league.id}`}
                  >
                    <span>
                      <span className="block text-lg font-medium">
                        {league.name}
                      </span>
                      <span className="mt-1 block text-sm text-[var(--color-mute)]">
                        {league.season} · {league.source}
                      </span>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-[var(--color-mute)]">
              No season leagues yet. Import ESPN or create a manual league.
            </p>
          )}
        </div>

        <div className="space-y-6">
          <aside className="h-fit rounded-[2rem] bg-[var(--color-soft-cloud)] p-6">
            <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
              ESPN import
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Import private league</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-mute)]">
              Uses server cookies (`ESPN_S2`, `ESPN_SWID`) when `ESPN_LIVE=true`.
            </p>
            <form className="mt-5 space-y-3" onSubmit={handleImportEspn}>
              <label className="block text-sm font-medium" htmlFor="espn-league-id">
                League ID
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="espn-league-id"
                onChange={(event) => setLeagueId(event.target.value)}
                required
                value={leagueId}
              />
              <label className="block text-sm font-medium" htmlFor="espn-team-id">
                Team ID
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="espn-team-id"
                inputMode="numeric"
                onChange={(event) => setTeamId(event.target.value)}
                required
                value={teamId}
              />
              <label className="block text-sm font-medium" htmlFor="espn-season">
                Season
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="espn-season"
                inputMode="numeric"
                onChange={(event) => setSeason(event.target.value)}
                required
                value={season}
              />
              <label className="block text-sm font-medium" htmlFor="espn-name">
                Display name (optional)
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="espn-name"
                onChange={(event) => setEspnName(event.target.value)}
                placeholder="My 2026 league"
                value={espnName}
              />
              <button
                className="w-full rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isImporting}
                type="submit"
              >
                {isImporting ? "Importing…" : "Import ESPN league"}
              </button>
            </form>
          </aside>

          <aside className="h-fit rounded-[2rem] bg-[var(--color-soft-cloud)] p-6">
            <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
              Manual league
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Start from a fixture roster
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-mute)]">
              Create a 12-team, 14-slot season league you can edit locally.
            </p>
            <form className="mt-5 space-y-3" onSubmit={handleCreate}>
              <label className="block text-sm font-medium" htmlFor="league-name">
                League name
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="league-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="My 2026 roster"
                required
                value={name}
              />
              <button
                className="w-full rounded-full border border-[var(--color-hairline)] bg-white px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isCreating}
                type="submit"
              >
                {isCreating ? "Creating…" : "Create manual league"}
              </button>
            </form>
          </aside>

          {error ? (
            <p className="text-sm text-[var(--color-sale)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
