type MatchReportLike = {
  matched: unknown[]
  unmatched: unknown[]
  ambiguous: unknown[]
}

export type SeasonPatchMode =
  | { mode: "all" }
  | { mode: "none" }
  | { mode: "one"; id: string }

export const resolveSeasonPatchMode = (input: {
  skipSeasons: boolean
  seasonLeagueId?: string
}): SeasonPatchMode => {
  if (input.skipSeasons) return { mode: "none" }
  if (input.seasonLeagueId) return { mode: "one", id: input.seasonLeagueId }
  return { mode: "all" }
}

export const buildYahooOverlayMeta = (input: {
  sourceFile: string
  parsed: number
  report: MatchReportLike
  importedAt?: string
}): Record<string, unknown> => ({
  projectionOverlay: "yahoo",
  yahooImportedAt: input.importedAt ?? new Date().toISOString(),
  yahooSourceFile: input.sourceFile,
  yahooParsed: input.parsed,
  yahooMatched: input.report.matched.length,
  yahooUnmatched: input.report.unmatched.length,
  yahooAmbiguous: input.report.ambiguous.length,
})
