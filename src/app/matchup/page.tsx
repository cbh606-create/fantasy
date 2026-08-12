"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type SeasonLeagueListItem = {
  id: string
  name: string
  season: number
  source: "espn" | "manual" | "mixed"
}

export default function MatchupListPage() {
  const [leagues, setLeagues] = useState<SeasonLeagueListItem[]>([])
  const [error, setError] = useState("")
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
        if (requestError instanceof DOMException && requestError.name === "AbortError") return

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

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-[var(--color-mute)]">Season analysis</p>
        <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
          Matchup advisor
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-mute)]">
          Choose a season roster to see this week&apos;s category board, sit/start
          swaps, and streamer targets.
        </p>
        {isLoading ? (
          <p className="mt-8 text-[var(--color-mute)]" role="status">
            Loading season leagues…
          </p>
        ) : error ? (
          <p className="mt-8 text-[var(--color-sale)]" role="alert">{error}</p>
        ) : leagues.length ? (
          <ul className="mt-8 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link
                  className="flex items-center justify-between gap-4 py-2.5 text-[0.8125rem] transition-colors hover:text-[var(--color-info)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
                  href={`/matchup/${league.id}`}
                >
                  <span>
                    <span className="block text-base font-medium">{league.name}</span>
                    <span className="mt-0.5 block text-xs text-[var(--color-mute)]">
                      {league.season} · {league.source}
                    </span>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 text-sm text-[var(--color-mute)]">
            No season rosters yet.{" "}
            <Link className="font-medium text-[var(--color-ink)] underline" href="/roster">
              Create a roster
            </Link>{" "}
            to open the matchup advisor.
          </p>
        )}
      </div>
    </main>
  )
}
