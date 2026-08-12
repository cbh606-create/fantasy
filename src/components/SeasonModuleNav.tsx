import Link from "next/link"

export type SeasonModule = "matchup" | "roster" | "trade" | "waivers" | "draft"

type SeasonModuleNavProps = {
  leagueId: string
  current: SeasonModule
}

const linkClass = (active: boolean) =>
  [
    "rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]",
    active
      ? "bg-[var(--color-ink)] font-medium text-white"
      : "text-[var(--color-mute)] hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)]",
  ].join(" ")

const modules: { id: SeasonModule; label: string; href: (leagueId: string) => string }[] = [
  { id: "matchup", label: "Matchup", href: (id) => `/matchup/${id}` },
  { id: "roster", label: "Roster", href: (id) => `/roster/${id}` },
  { id: "trade", label: "Trade", href: (id) => `/trade/${id}` },
  { id: "waivers", label: "Waivers", href: (id) => `/waivers/${id}` },
  { id: "draft", label: "Draft", href: () => "/leagues/new" },
]

export const SeasonModuleNav = ({ leagueId, current }: SeasonModuleNavProps) => (
  <nav aria-label="Season modules" className="flex flex-wrap items-center gap-1.5">
    {modules.map((module) => {
      const active = module.id === current

      return (
        <Link
          aria-current={active ? "page" : undefined}
          className={linkClass(active)}
          href={module.href(leagueId)}
          key={module.id}
        >
          {module.label}
        </Link>
      )
    })}
  </nav>
)
