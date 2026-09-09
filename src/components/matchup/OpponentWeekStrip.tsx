import {
  MATCHUP_WEEK_DAY_COL_CLASS,
  MATCHUP_WEEK_PLAYER_COL_CLASS,
  MATCHUP_WEEK_SLOT_COL_CLASS,
  MATCHUP_WEEK_TABLE_CLASS,
  formatMatchupDayLabel,
} from "@/lib/matchup/weekCalendarLayout"
import type {
  OpponentStreamDay,
  OpponentStreamDayCell,
} from "@/lib/matchup/types"
import type { SeasonPlayer } from "@/lib/season/types"

const ADD_INDEX_COLOR_CLASS = [
  "text-[var(--color-success)]",
  "text-[#b45309]",
  "text-[#0369a1]",
  "text-[#be123c]",
  "text-[#0f766e]",
  "text-[#c2410c]",
  "text-[#4d7c0f]",
] as const

const addIndexColorClass = (addIndex: number) =>
  ADD_INDEX_COLOR_CLASS[(addIndex - 1) % ADD_INDEX_COLOR_CLASS.length] ??
  "text-[var(--color-mute)]"

const streamerLabel = (
  playerId: string | null | undefined,
  playersById: Record<string, SeasonPlayer>,
) => {
  if (!playerId) return "—"
  return playersById[playerId]?.name ?? "—"
}

const formatOppMove = (
  cell: OpponentStreamDayCell | undefined,
  playersById: Record<string, SeasonPlayer>,
) => {
  if (!cell) return "—"
  const addName = streamerLabel(cell.playerId, playersById)
  const dropName = streamerLabel(cell.droppedPlayerId, playersById)
  if (cell.action === "hold" && cell.playerId) return addName
  if (cell.action === "empty" || (!cell.playerId && !cell.droppedPlayerId)) {
    return "—"
  }
  if (dropName === "—" && addName !== "—") return `— → ${addName}`
  if (addName === "—") return dropName
  return `${dropName} → ${addName}`
}

const fallbackCells = (
  oppDay: OpponentStreamDay | undefined,
  spotCount: number,
): OpponentStreamDayCell[] => {
  if (oppDay?.cells && oppDay.cells.length > 0) return oppDay.cells
  return Array.from({ length: spotCount }, (_, spotIndex) => ({
    spotIndex,
    playerId: spotIndex === 0 ? (oppDay?.streamerPlayerId ?? null) : null,
    droppedPlayerId: spotIndex === 0 ? (oppDay?.droppedPlayerId ?? null) : null,
    action:
      spotIndex === 0 && oppDay?.streamerPlayerId
        ? oppDay.droppedPlayerId
          ? "drop_add"
          : "add"
        : "empty",
    addIndex: null,
  }))
}

export const OpponentWeekStrip = ({
  days,
  opponentName,
  opponentDays,
  playersById,
  oppSpotCount = 1,
}: {
  days: string[]
  opponentName: string
  opponentDays: OpponentStreamDay[]
  playersById: Record<string, SeasonPlayer>
  oppSpotCount?: 1 | 2 | 3
}) => {
  const dayByDate = Object.fromEntries(
    opponentDays.map((day) => [day.date, day]),
  )
  const spotCount = Math.max(
    oppSpotCount,
    ...opponentDays.map((day) => day.cells?.length ?? 0),
    1,
  ) as number

  return (
    <section aria-label="Opponent week" className="border-t border-[var(--color-hairline)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-soft-cloud)] px-2 py-2 text-[0.8125rem]">
        <p className="font-medium text-[var(--color-ink)]">{opponentName}</p>
      </div>
      <table
        className={`${MATCHUP_WEEK_TABLE_CLASS} text-left text-[0.75rem] leading-tight`}
      >
        <colgroup>
          <col className={MATCHUP_WEEK_SLOT_COL_CLASS} />
          <col className={MATCHUP_WEEK_PLAYER_COL_CLASS} />
          {days.map((day) => (
            <col className={MATCHUP_WEEK_DAY_COL_CLASS} key={day} />
          ))}
        </colgroup>
        <tbody>
          <tr className="border-t border-[var(--color-hairline)]">
            <th
              className={`${MATCHUP_WEEK_SLOT_COL_CLASS} sticky left-0 z-10 bg-[var(--color-canvas)] px-2 py-1.5 font-semibold tracking-wide text-[var(--color-mute)]`}
              scope="row"
            >
              Opp
            </th>
            <th
              className={`${MATCHUP_WEEK_PLAYER_COL_CLASS} sticky left-12 z-10 bg-[var(--color-canvas)] px-2.5 py-1.5 font-medium text-[var(--color-ink)]`}
              scope="row"
            >
              Games
            </th>
            {days.map((day) => {
              const games = dayByDate[day]?.rosterGameCount ?? 0
              return (
                <td
                  aria-label={`Opp ${formatMatchupDayLabel(day)}: ${games} games`}
                  className={`${MATCHUP_WEEK_DAY_COL_CLASS} px-1 py-1.5 text-center tabular-nums text-[var(--color-ink)]`}
                  key={`${day}-games`}
                >
                  {games}
                </td>
              )
            })}
          </tr>
          {Array.from({ length: spotCount }, (_, spotIndex) => (
            <tr
              className="border-t border-[var(--color-hairline)]"
              key={`opp-spot-${spotIndex}`}
            >
              <th
                className={`${MATCHUP_WEEK_SLOT_COL_CLASS} sticky left-0 z-10 bg-[var(--color-canvas)] px-2 py-1.5 font-semibold tracking-wide text-[var(--color-mute)]`}
                scope="row"
              >
                {spotCount > 1 ? `S${spotIndex + 1}` : "Str"}
              </th>
              <th
                className={`${MATCHUP_WEEK_PLAYER_COL_CLASS} sticky left-12 z-10 bg-[var(--color-canvas)] px-2.5 py-1.5 font-medium text-[var(--color-mute)]`}
                scope="row"
              >
                {spotCount > 1 ? `Spot ${spotIndex + 1}` : "Stream"}
              </th>
              {days.map((day) => {
                const cell = fallbackCells(dayByDate[day], spotCount)[spotIndex]
                const move = formatOppMove(cell, playersById)
                const addIndex = cell?.addIndex
                return (
                  <td
                    aria-label={`Opp ${formatMatchupDayLabel(day)} spot ${spotIndex + 1}: ${move}`}
                    className={`${MATCHUP_WEEK_DAY_COL_CLASS} px-1 py-1.5 align-top text-[0.7rem] leading-tight text-[var(--color-ink)]`}
                    key={`${day}-spot-${spotIndex}`}
                  >
                    <span className="inline-flex max-w-full flex-wrap items-baseline gap-0.5">
                      <span>{move}</span>
                      {addIndex != null ? (
                        <span
                          aria-label={`Opp add ${addIndex}`}
                          className={`text-[0.6875rem] font-semibold tabular-nums ${addIndexColorClass(addIndex)}`}
                        >
                          {addIndex}
                        </span>
                      ) : null}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
