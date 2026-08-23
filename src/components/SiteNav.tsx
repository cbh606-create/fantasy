"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useContext, type ChangeEvent } from "react"
import {
  ActiveSeasonLeagueContext,
} from "@/components/season/ActiveSeasonLeagueProvider"

const NAV_ITEMS = [
  { href: "/", label: "Home", match: (pathname: string) => pathname === "/" },
  {
    href: "/matchup",
    label: "Matchup",
    match: (pathname: string) => pathname.startsWith("/matchup"),
  },
  {
    href: "/leagues/new",
    label: "Draft",
    match: (pathname: string) =>
      pathname.startsWith("/leagues") || pathname.includes("/draft"),
  },
  {
    href: "/roster",
    label: "Roster",
    match: (pathname: string) => pathname.startsWith("/roster"),
  },
  {
    href: "/trade",
    label: "Trade",
    match: (pathname: string) => pathname.startsWith("/trade"),
  },
  {
    href: "/waivers",
    label: "Waivers",
    match: (pathname: string) => pathname.startsWith("/waivers"),
  },
] as const

const SEASON_TOOL_PATHS = new Set(["/matchup", "/roster", "/trade", "/waivers"])

const linkClass = (active: boolean) =>
  [
    "rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]",
    active
      ? "bg-[var(--color-ink)] font-medium text-white"
      : "text-[var(--color-mute)] hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)]",
  ].join(" ")

const EMPTY_ACTIVE_LEAGUE = {
  activeId: null as string | null,
  isLoading: true,
  leagues: [] as { id: string; name: string; season: number }[],
  setActiveId: (_id: string | null) => {},
}

export const SiteNav = () => {
  const pathname = usePathname()
  // Optional context: Fast Refresh can remount SiteNav before the provider
  // for one frame; throwing here surfaces as Internal Server Error.
  const leagueContext = useContext(ActiveSeasonLeagueContext) ?? EMPTY_ACTIVE_LEAGUE
  const { activeId, isLoading, leagues, setActiveId } = leagueContext

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setActiveId(event.target.value || null)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-hairline)] bg-[var(--color-canvas)]">
      <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-4 px-6 py-3 sm:px-10 lg:px-14">
        <Link
          aria-label="Fantasy home"
          className="shrink-0 font-[family-name:var(--font-bebas-neue)] text-2xl tracking-[0.12em] text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
          href="/"
        >
          FANTASY
        </Link>
        <label className="sr-only" htmlFor="active-season-roster">
          Active season roster
        </label>
        <select
          aria-label="Active season roster"
          className="min-w-0 max-w-48 rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-1.5 text-sm text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:text-[var(--color-mute)]"
          disabled={leagues.length === 0}
          id="active-season-roster"
          onChange={handleChange}
          value={activeId ?? ""}
        >
          <option value="">
            {isLoading ? "Loading season rosters…" : "No active roster"}
          </option>
          {leagues.map((league) => (
            <option key={league.id} value={league.id}>
              {league.name} · {league.season}
            </option>
          ))}
        </select>
        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname)
            const href =
              activeId && SEASON_TOOL_PATHS.has(item.href)
                ? `${item.href}/${activeId}`
                : item.href

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={linkClass(active)}
                href={href}
                key={item.href}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
