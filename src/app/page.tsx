import Link from "next/link"

export default function Home() {
  return (
    <main className="relative flex min-h-[calc(100vh-3.75rem)] items-center overflow-hidden bg-[var(--color-canvas)]">
      <div
        aria-hidden="true"
        className="athletic-fade pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#ffffff_0%,_#f3f3f3_45%,_#e8e8e8_100%)]"
      />
      <div
        aria-hidden="true"
        className="athletic-grid athletic-fade pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-[var(--color-ink)]/[0.04] blur-3xl"
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-16 sm:px-12 lg:px-20">
        <p className="athletic-rise text-xs font-medium tracking-[0.28em] text-[var(--color-mute)] uppercase">
          Head-to-head performance
        </p>
        <h1 className="athletic-rise-delay mt-4 font-[family-name:var(--font-bebas-neue)] text-[clamp(5.5rem,18vw,14rem)] leading-[0.76] tracking-[-0.01em] text-[var(--color-ink)] uppercase">
          FANTASY
        </h1>
        <p className="athletic-rise-delay mt-8 max-w-lg text-base leading-7 text-[var(--color-mute)] sm:text-lg">
          Category projections, sit/start calls, and streamers — built for
          winning this week.
        </p>

        <div className="athletic-rise-delay-2 mt-10 flex flex-wrap items-center gap-3">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ink)] px-8 text-sm font-semibold tracking-wide text-white uppercase transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/matchup"
          >
            Open matchup
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--color-ink)] bg-transparent px-8 text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase transition-colors hover:bg-[var(--color-ink)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/leagues/new"
          >
            Start mock draft
          </Link>
        </div>

        <div className="athletic-rise-delay-2 mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm tracking-wide text-[var(--color-mute)] uppercase">
          <Link
            className="transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/roster"
          >
            Roster
          </Link>
          <Link
            className="transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/trade"
          >
            Trade
          </Link>
          <Link
            className="transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/waivers"
          >
            Waivers
          </Link>
        </div>
      </div>
    </main>
  )
}
