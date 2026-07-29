import Link from "next/link"

export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-[var(--color-canvas)] px-6 py-16 sm:px-12 lg:px-20">
      <div className="mx-auto w-full max-w-7xl">
        <div className="max-w-5xl">
          <h1 className="font-[family-name:var(--font-bebas-neue)] text-[clamp(5rem,17vw,13rem)] leading-[0.78] tracking-[-0.02em] uppercase">
            FANTASY DRAFT
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-7 text-[var(--color-mute)] sm:text-xl">
            Build a smarter board for your ESPN fantasy basketball draft.
          </p>
          <Link
            className="mt-10 inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ink)] px-8 font-medium text-white transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/leagues/new"
          >
            Start draft prep
          </Link>
        </div>
      </div>
    </main>
  )
}
