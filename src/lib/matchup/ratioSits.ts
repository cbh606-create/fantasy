import type { CategoryId } from "@/lib/domain/types"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import { MAX_RATIO_SITS } from "./constants"
import {
  youTotalsFromDaily,
  type DailyLineups,
} from "./dailyLineups"
import { gameWeightForTeamDate } from "./games"
import type { RatioSitSuggestion } from "./types"

const RATIO_TARGETS: CategoryId[] = ["FG_PCT", "FT_PCT", "TO"]
const COUNTING_PROTECT: CategoryId[] = [
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "PTS",
]

const clearPlayerOnDay = (
  daily: DailyLineups,
  date: string,
  playerId: string,
): DailyLineups => {
  const entries = daily[date]
  if (!entries) return daily
  return {
    ...daily,
    [date]: entries.map((entry) =>
      entry.playerId === playerId ? { ...entry, playerId: null } : entry,
    ),
  }
}

export const suggestRatioSits = (input: {
  daily: DailyLineups
  players: SeasonPlayer[]
  schedule: ScheduleResponse
  oppTotals: Record<CategoryId, number>
  categoryIds: CategoryId[]
}): RatioSitSuggestion[] => {
  const { daily, players, schedule, oppTotals, categoryIds } = input
  const enabled = new Set(categoryIds)
  const baselineYou = youTotalsFromDaily(daily, players, schedule)
  const baselineBoard = buildMatchupBoard(baselineYou, oppTotals, categoryIds)
  const baselineByCat = Object.fromEntries(
    baselineBoard.categories.map((row) => [row.categoryId, row]),
  )

  const candidates: RatioSitSuggestion[] = []
  const days = schedule.matchup.days

  for (const date of days) {
    const entries = daily[date] ?? []
    const startedIds = [
      ...new Set(
        entries.flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
      ),
    ]

    for (const playerId of startedIds) {
      const player = players.find((p) => p.id === playerId)
      if (!player?.teamAbbr) continue
      if (gameWeightForTeamDate(player.teamAbbr, date, schedule) <= 0) continue

      const nextDaily = clearPlayerOnDay(daily, date, playerId)
      const nextYou = youTotalsFromDaily(nextDaily, players, schedule)
      const nextBoard = buildMatchupBoard(nextYou, oppTotals, categoryIds)
      const nextByCat = Object.fromEntries(
        nextBoard.categories.map((row) => [row.categoryId, row]),
      )

      let bestTarget: CategoryId | null = null
      let bestDelta = 0

      for (const target of RATIO_TARGETS) {
        if (!enabled.has(target)) continue
        const base = baselineByCat[target]
        const next = nextByCat[target]
        if (!base || !next) continue
        if (base.outcome === "W") continue
        const delta = next.winProb - base.winProb
        if (delta > bestDelta) {
          bestDelta = delta
          bestTarget = target
        }
      }
      if (!bestTarget || bestDelta <= 0) continue

      let protectedOk = true
      for (const cat of COUNTING_PROTECT) {
        if (!enabled.has(cat)) continue
        const base = baselineByCat[cat]
        if (!base || base.outcome !== "W") continue
        if (nextByCat[cat]?.outcome !== "W") {
          protectedOk = false
          break
        }
      }
      if (protectedOk && enabled.has("TO") && bestTarget !== "TO") {
        const baseTo = baselineByCat.TO
        if (baseTo?.outcome === "W" && nextByCat.TO?.outcome !== "W") {
          protectedOk = false
        }
      }
      if (!protectedOk) continue

      const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString(
        undefined,
        {
          weekday: "short",
        },
      )
      candidates.push({
        playerId,
        date,
        targetCategoryId: bestTarget as RatioSitSuggestion["targetCategoryId"],
        deltaWinProb: bestDelta,
        reason: `Sit on ${dayLabel} · helps ${CATEGORY_SHORT_LABELS[bestTarget]} (+${bestDelta.toFixed(2)}) · counting W preserved`,
      })
    }
  }

  return candidates
    .sort((a, b) => {
      if (b.deltaWinProb !== a.deltaWinProb) return b.deltaWinProb - a.deltaWinProb
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.playerId.localeCompare(b.playerId)
    })
    .slice(0, MAX_RATIO_SITS)
}
