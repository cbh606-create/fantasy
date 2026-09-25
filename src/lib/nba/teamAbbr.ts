const NBA_TEAM_ABBR_ALIASES: Record<string, string> = {
  GS: "GSW",
  NY: "NYK",
  NO: "NOP",
  SA: "SAS",
  WSH: "WAS",
  UTAH: "UTA",
  PHO: "PHX",
  BRK: "BKN",
}

export const normalizeNbaTeamAbbr = (abbreviation: string): string => {
  const normalized = abbreviation.trim().toUpperCase()
  return NBA_TEAM_ABBR_ALIASES[normalized] ?? normalized
}
