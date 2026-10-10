/** Soft pastel fills for draft board team columns (cycles by team index). */
const TEAM_PASTEL_CLASSES = [
  "bg-rose-50 border-rose-200/80",
  "bg-sky-50 border-sky-200/80",
  "bg-amber-50 border-amber-200/80",
  "bg-emerald-50 border-emerald-200/80",
  "bg-orange-50 border-orange-200/80",
  "bg-teal-50 border-teal-200/80",
  "bg-lime-50 border-lime-200/80",
  "bg-cyan-50 border-cyan-200/80",
  "bg-fuchsia-50 border-fuchsia-200/80",
  "bg-stone-100 border-stone-300/80",
  "bg-yellow-50 border-yellow-200/80",
  "bg-indigo-50 border-indigo-200/80",
] as const

const TEAM_HEADER_CLASSES = [
  "text-rose-700",
  "text-sky-700",
  "text-amber-800",
  "text-emerald-800",
  "text-orange-800",
  "text-teal-800",
  "text-lime-800",
  "text-cyan-800",
  "text-fuchsia-800",
  "text-stone-700",
  "text-yellow-800",
  "text-indigo-700",
] as const

export const teamPastelCellClass = (teamIndex: number): string =>
  TEAM_PASTEL_CLASSES[teamIndex % TEAM_PASTEL_CLASSES.length]

export const teamPastelHeaderClass = (teamIndex: number): string =>
  TEAM_HEADER_CLASSES[teamIndex % TEAM_HEADER_CLASSES.length]
