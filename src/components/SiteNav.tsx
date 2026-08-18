"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

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

const linkClass = (active: boolean) =>
  [
    "rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]",
    active
      ? "bg-[var(--color-ink)] font-medium text-white"
      : "text-[var(--color-mute)] hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)]",
  ].join(" ")

export const SiteNav = () => {
  const pathname = usePathname()

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
        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname)

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={linkClass(active)}
                href={item.href}
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
