"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const linkClass = (active: boolean) =>
  [
    "rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]",
    active
      ? "bg-[var(--color-ink)] font-medium text-white"
      : "text-[var(--color-mute)] hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)]",
  ].join(" ")

export const SiteNav = () => {
  const pathname = usePathname()
  const isHome = pathname === "/"
  const isDraft =
    pathname.startsWith("/leagues") || pathname.includes("/draft")
  const isRoster = pathname.startsWith("/roster")
  const isTrade = pathname.startsWith("/trade")
  const isWaivers = pathname.startsWith("/waivers")

  return (
    <header className="border-b border-[var(--color-hairline)] bg-[var(--color-canvas)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3 sm:px-12 lg:px-20">
        <Link
          aria-label="Fantasy home"
          className="font-[family-name:var(--font-bebas-neue)] text-2xl tracking-[0.08em] text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
          href="/"
        >
          FANTASY
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Link aria-current={isHome ? "page" : undefined} className={linkClass(isHome)} href="/">
            Home
          </Link>
          <Link
            aria-current={isDraft ? "page" : undefined}
            className={linkClass(isDraft)}
            href="/leagues/new"
          >
            Draft
          </Link>
          <Link
            aria-current={isRoster ? "page" : undefined}
            className={linkClass(isRoster)}
            href="/roster"
          >
            Roster
          </Link>
          <Link
            aria-current={isTrade ? "page" : undefined}
            className={linkClass(isTrade)}
            href="/trade"
          >
            Trade
          </Link>
          <Link
            aria-current={isWaivers ? "page" : undefined}
            className={linkClass(isWaivers)}
            href="/waivers"
          >
            Waivers
          </Link>
        </nav>
      </div>
    </header>
  )
}
