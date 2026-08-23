import { LeagueSetupForm } from "@/components/league/LeagueSetupForm"

export default function NewLeaguePage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-12 sm:px-12 sm:py-16 lg:px-20">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-mute)] uppercase">
            League setup
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-bebas-neue)] text-[clamp(4rem,10vw,8rem)] leading-[0.85] tracking-[-0.02em] uppercase">
            BUILD YOUR BOARD
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-7 text-[var(--color-mute)]">
            Set your draft position and category strategy, then start a mock
            draft right away — ESPN league ID is optional for live import.
          </p>
        </header>

        <div className="mt-12">
          <LeagueSetupForm />
        </div>
      </div>
    </main>
  )
}
