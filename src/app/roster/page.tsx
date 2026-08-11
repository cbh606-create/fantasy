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
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const loadLeagues = async () => {
      try {
        const response = await fetch("/api/season-leagues", { signal: controller.signal })
        if (!response.ok) throw new Error("Unable to load season leagues")
        setLeagues((await response.json()) as SeasonLeagueListItem[])
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return
        setError(requestError instanceof Error ? requestError.message : "Unable to load season leagues")
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
      setError(requestError instanceof Error ? requestError.message : "Unable to create season league")
    } finally {
      setIsCreating(false)
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
            <p className="mt-8 text-[var(--color-mute)]" role="status">Loading season leagues…</p>
          ) : leagues.length ? (
            <ul className="mt-8 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]">
              {leagues.map((league) => (
                <li key={league.id}>
                  <Link
                    className="flex items-center justify-between gap-4 py-5 transition-colors hover:text-[var(--color-info)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
                    href={`/roster/${league.id}`}
                  >
                    <span>
                      <span className="block text-lg font-medium">{league.name}</span>
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
            <p className="mt-8 text-[var(--color-mute)]">No season leagues yet. Create one to start analyzing your full roster.</p>
          )}
        </div>
        <aside className="h-fit rounded-[2rem] bg-[var(--color-soft-cloud)] p-6">
          <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">Manual league</p>
          <h2 className="mt-2 text-2xl font-semibold">Start from a fixture roster</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-mute)]">Create a 12-team, 14-slot season league you can edit locally.</p>
          <form className="mt-5 space-y-3" onSubmit={handleCreate}>
            <label className="block text-sm font-medium" htmlFor="league-name">League name</label>
            <input
              className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
              id="league-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="My 2026 roster"
              required
              value={name}
            />
            <button
              className="w-full rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCreating}
              type="submit"
            >
              {isCreating ? "Creating…" : "Create manual league"}
            </button>
          </form>
          {error ? <p className="mt-4 text-sm text-[var(--color-sale)]" role="alert">{error}</p> : null}
        </aside>
      </div>
    </main>
  )
}
