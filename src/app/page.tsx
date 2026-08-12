import Link from "next/link"

export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-[var(--color-canvas)] px-6 py-16 sm:px-12 lg:px-20">
      <div className="mx-auto w-full max-w-7xl">
        <div className="max-w-5xl">
          <h1 className="font-[family-name:var(--font-bebas-neue)] text-[clamp(5rem,17vw,13rem)] leading-[0.78] tracking-[-0.02em] uppercase">
            FANTASY
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-7 text-[var(--color-mute)] sm:text-xl">
            Win this week&apos;s head-to-head with category projections, sit/start
            swaps, and streamer targets.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ink)] px-8 font-medium text-white transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
              href="/matchup"
            >
              Open matchup advisor
            </Link>
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--color-hairline)] px-8 font-medium transition-colors hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
              href="/leagues/new"
            >
              Start draft prep
            </Link>
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--color-hairline)] px-8 font-medium transition-colors hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
              href="/roster"
            >
              Open season roster
            </Link>
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--color-hairline)] px-8 font-medium transition-colors hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
              href="/trade"
            >
              Find trades
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
