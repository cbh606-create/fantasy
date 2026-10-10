"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useActiveSeasonLeague } from "@/components/season/ActiveSeasonLeagueProvider"

type SeasonTool = "matchup" | "waivers" | "trade"

type SeasonToolIndexPageProps = {
  tool: SeasonTool
  title: string
  description: string
}

const emptyStateCopy: Record<SeasonTool, string> = {
  matchup: "to open the matchup advisor.",
  waivers: "to browse waivers.",
  trade: "to start finding trades.",
}

export const SeasonToolIndexPage = ({
  tool,
  title,
  description,
}: SeasonToolIndexPageProps) => {
  const router = useRouter()
  const { activeId, leagues, isLoading, error } = useActiveSeasonLeague()
  const hasActiveLeague =
    Boolean(activeId) && leagues.some((league) => league.id === activeId)

  useEffect(() => {
    if (isLoading || !activeId || !hasActiveLeague) return

    router.replace(`/${tool}/${activeId}`)
  }, [activeId, hasActiveLeague, isLoading, router, tool])

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-[var(--color-mute)]">Season analysis</p>
        <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-mute)]">
          {description}
        </p>
        {isLoading ? (
          <p className="mt-8 text-[var(--color-mute)]" role="status">
            Loading season leagues…
          </p>
        ) : error ? (
          <p className="mt-8 text-[var(--color-sale)]" role="alert">
            {error}
          </p>
        ) : leagues.length ? (
          <ul className="mt-8 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link
                  className="flex items-center justify-between gap-4 py-2.5 text-[0.8125rem] transition-colors hover:text-[var(--color-info)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
                  href={`/${tool}/${league.id}`}
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
            {emptyStateCopy[tool]}
          </p>
        )}
      </div>
    </main>
  )
}
