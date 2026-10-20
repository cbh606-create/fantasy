"use client"

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react"
import { AddTeamPlayerPicker } from "@/components/matchup/AddTeamPlayerPicker"
import { Banner } from "@/components/ui/Banner"
import { Chip } from "@/components/ui/Chip"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import { formatPlayerPositions } from "@/lib/season/slotLabels"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
} from "@/lib/season/types"
import {
  teamHasGameOnDate,
  streamingAddLimitForSchedule,
} from "@/lib/matchup/games"
import {
  MATCHUP_WEEK_MOVE_COL_CLASS,
  MATCHUP_WEEK_STREAMING_DAY_COL_CLASS,
  MATCHUP_WEEK_STREAMING_TABLE_CLASS,
  formatMatchupDayLabel,
} from "@/lib/matchup/weekCalendarLayout"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import { mostCategoriesSeedPuntIds } from "@/lib/matchup/mostCategories"
import {
  addOverrideCandidates,
  lockAfterPick,
  type StreamingAddLock,
} from "@/lib/matchup/streamingAddOverride"
import { carryForwardStreamerId } from "@/lib/matchup/streamingCarryForward"
import {
  buildStreamingPlan,
  streamingAddDropKey,
  streamingHoldUntil,
} from "@/lib/matchup/streamingPlans"
import {
  collectEarlierAddedStreamerIds,
  collectEarlierIrParkIds,
  collectEarlierRosterDropIds,
  hasOpenNonIlRosterSlot,
  irParkDropOptions,
  isAfterStreamingAddDropKey,
  parkedPlayerIdFromDropValue,
  parseStreamingAddDropKey,
  perspectiveRosterEntries,
  resolveStoredIrParkValue,
  rosterDropSelectOptions,
  rosterDropSelectPlayerIds,
} from "@/lib/matchup/streamingDropOptions"
import { isAdpProtected } from "@/lib/matchup/streamingDropPolicy"
import { winnerStreamHint } from "@/lib/matchup/winnerStreamPrior"
import type {
  MatchupBoard,
  StreamingChaseNote,
  StreamingPlan,
  StreamingPlanDayCell,
  StatWindow,
  WinnerStreamRecipe,
} from "@/lib/matchup/types"
import type { StatPairRow } from "@/lib/players/statPairCorrelation"
import type { CategoryId } from "@/lib/domain/types"

const MIN_ADD_BUDGET = 1
const MAX_ADD_BUDGET = 14

const EMPTY_WINNER_STREAM_RECIPES: WinnerStreamRecipe[] = []
const EMPTY_STAT_PAIRS: StatPairRow[] = []

type ForcedRosterDropValue = string | "open_slot" | "hold"

const localIsoDate = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const isPastStreamingDate = (date: string, today: string) => date < today

const canEditStreamingDate = (date: string, today: string) =>
  !isPastStreamingDate(date, today)


const plannedDropValue = (
  cell: StreamingPlanDayCell | undefined,
): ForcedRosterDropValue => {
  if (cell?.rosterDropKind === "player" && cell.rosterDropPlayerId) {
    return cell.rosterDropPlayerId
  }
  if (cell?.rosterDropKind === "open_slot") return "open_slot"
  // Spot swap: previous streamer is the drop, even when rosterDropKind is none.
  if (cell?.action === "drop_add" && cell.droppedPlayerId) {
    return cell.droppedPlayerId
  }
  return "hold"
}

type StreamingPlansPanelProps = {
  leagueId: string
  state: SeasonLeagueState
  schedule: ScheduleResponse
  board: MatchupBoard
  playersById: Record<string, SeasonPlayer>
  adpByPlayerId?: Record<string, number>
  onPreviewPlanChange?: (plan: StreamingPlan | null) => void
  onPreviewSpotCountChange?: (spot: 1 | 2 | 3 | null) => void
  previewSpotCount?: 1 | 2 | 3 | null
  onPlansBuilt?: (payload: {
    plans: StreamingPlan[]
    baselinePlans: StreamingPlan[]
    noneOpponentPlan: StreamingPlan | null
  }) => void
  /** Resolved opponent stream spots. Parent resolves Auto; do not resolve here. 0 = idle. */
  oppSpotCount?: 0 | 1 | 2 | 3
  forcedOpponentRosterDrops?: (string | null)[]
  opponentTeamIndex?: number
  /** Base (non-preview) daily lineups — used to skip adds on full days. */
  daily?: DailyLineups
  winnerStreamRecipes?: WinnerStreamRecipe[]
  today?: string
  statWindow?: StatWindow
  statPairs?: StatPairRow[]
  puntSeedReady?: boolean
}

const playerName = (
  playerId: string | null | undefined,
  playersById: Record<string, SeasonPlayer>,
) => {
  if (!playerId) return "—"
  return playersById[playerId]?.name ?? "—"
}

const isAddAction = (action: StreamingPlanDayCell["action"]) =>
  action === "add" || action === "drop_add"

const playerPlaysOn = (
  player: SeasonPlayer | undefined,
  date: string,
  schedule: ScheduleResponse,
): boolean => {
  if (!player?.teamAbbr) return false
  return teamHasGameOnDate(player.teamAbbr, date, schedule)
}

/** Soft row tints for spot 1…3 (including 1-spot plans). */
const SPOT_ROW_CLASS = [
  "bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] border-l-[3px] border-l-[var(--color-success)]",
  "bg-[color-mix(in_srgb,#b45309_10%,transparent)] border-l-[3px] border-l-[#b45309]",
  "bg-[color-mix(in_srgb,#0369a1_10%,transparent)] border-l-[3px] border-l-[#0369a1]",
] as const

const spotRowClass = (spotIndex: number) => SPOT_ROW_CLASS[spotIndex] ?? ""

/** Distinct colors for plan-wide add ordinals (1-based). */
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

const countAddsBySpot = (plan: StreamingPlan): number[] => {
  const counts = Array.from({ length: plan.spotCount }, () => 0)
  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (cell.action === "add" || cell.action === "drop_add") {
        counts[cell.spotIndex] = (counts[cell.spotIndex] ?? 0) + 1
      }
    }
  }
  return counts
}

const cellFor = (
  plan: StreamingPlan,
  date: string,
  spotIndex: number,
): StreamingPlanDayCell | undefined =>
  plan.days
    .find((day) => day.date === date)
    ?.cells.find((cell) => cell.spotIndex === spotIndex)

const dropPlanLabel = (
  cell: StreamingPlanDayCell | undefined,
  playersById: Record<string, SeasonPlayer>,
): string => {
  if (!cell) return "—"
  if (cell.rosterDropKind === "open_slot") return "Open slot"
  if (cell.rosterDropKind === "ir" && cell.rosterDropPlayerId) {
    const player = playersById[cell.rosterDropPlayerId]
    const note = player?.injuryStatus === "out" ? "" : " (after OUT)"
    return `To IR · ${playerName(cell.rosterDropPlayerId, playersById)}${note}`
  }
  if (cell.rosterDropPlayerId) {
    return playerName(cell.rosterDropPlayerId, playersById)
  }
  if (cell.action === "drop_add") {
    return playerName(cell.droppedPlayerId, playersById)
  }
  if (cell.action === "hold") return "Hold"
  return "—"
}

const targetCatChips = (categoryIds: CategoryId[]) =>
  categoryIds.map((categoryId) => (
    <span
      className="ml-0.5 inline-flex rounded-md bg-[var(--color-soft-cloud)] px-1 py-px text-[0.625rem] font-medium text-[var(--color-mute)]"
      key={categoryId}
    >
      {CATEGORY_SHORT_LABELS[categoryId]}
    </span>
  ))

const DropCell = ({
  cell,
  date,
  onForcedRosterDropChange,
  onStaleIrReset,
  plan,
  playersById,
  rosterEntries,
  schedule,
  spotIndex,
  today,
  forcedDropValue,
}: {
  cell: StreamingPlanDayCell | undefined
  date: string
  onForcedRosterDropChange: (key: string, value: ForcedRosterDropValue) => void
  /** Sets only this key to Hold; no lock, later-drop, or preview changes. */
  onStaleIrReset: (key: string) => void
  plan: StreamingPlan
  playersById: Record<string, SeasonPlayer>
  rosterEntries: SeasonLeagueState["teams"][number]["entries"]
  schedule: ScheduleResponse
  spotIndex: number
  today: string
  forcedDropValue: ForcedRosterDropValue
}) => {
  const [lazyOptions, setLazyOptions] = useState<
    { value: string; label: string }[] | null
  >(null)

  const key = streamingAddDropKey(date, spotIndex)
  const value = forcedDropValue
  const earlierParkedIds = collectEarlierIrParkIds(plan, date, spotIndex)
  const irOptions =
    earlierParkedIds.length > 0
      ? []
      : irParkDropOptions({
          entries: rosterEntries,
          playersById,
          date,
          schedule,
        })

  useEffect(() => {
    setLazyOptions(null)
  }, [value, date, spotIndex])

  useEffect(() => {
    if (!canEditStreamingDate(date, today)) return
    if (resolveStoredIrParkValue(value, irOptions) === value) return
    onStaleIrReset(key)
  }, [date, irOptions, key, onStaleIrReset, today, value])

  if (isPastStreamingDate(date, today)) {
    return (
      <span className="text-[var(--color-mute)]">
        {dropPlanLabel(cell, playersById)}
      </span>
    )
  }

  if (!canEditStreamingDate(date, today)) {
    return (
      <span className="text-[var(--color-mute)]">
        {dropPlanLabel(cell, playersById)}
      </span>
    )
  }

  const closedLabel = parkedPlayerIdFromDropValue(value)
    ? (irOptions.find((option) => option.value === value)?.label ??
      `To IR · ${playerName(parkedPlayerIdFromDropValue(value) ?? "", playersById)}`)
    : value === "hold"
      ? "Hold"
      : value === "open_slot"
        ? "Open slot"
        : playerName(value, playersById)

  const ensureOptions = () => {
    setLazyOptions((current) => {
      if (current) return current
      const earlierDroppedIds = [
        ...collectEarlierRosterDropIds(plan, date, spotIndex),
        ...earlierParkedIds,
      ]
      const earlierAddedStreamerIds = collectEarlierAddedStreamerIds(
        plan,
        date,
        spotIndex,
      )
      const selectPlayerIds = rosterDropSelectPlayerIds(
        rosterEntries,
        playersById,
        earlierDroppedIds,
        earlierAddedStreamerIds,
      )
      return [
        ...rosterDropSelectOptions({
          eligiblePlayerIds: selectPlayerIds,
          earlierDroppedIds,
          allowOpenSlot: hasOpenNonIlRosterSlot(rosterEntries),
          includeHold: true,
          playersById,
        }),
        ...irOptions,
      ]
    })
  }

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value
    if (next === "open_slot") {
      onForcedRosterDropChange(key, "open_slot")
      return
    }
    if (next === "hold") {
      onForcedRosterDropChange(key, "hold")
      return
    }
    onForcedRosterDropChange(key, next)
  }

  const options = lazyOptions ?? [{ value, label: closedLabel }]

  return (
    <select
      aria-label={`Roster drop ${formatMatchupDayLabel(date)} spot ${spotIndex + 1}`}
      className="w-full max-w-full rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] py-0.5 text-[0.75rem] text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
      onChange={handleChange}
      onFocus={ensureOptions}
      onMouseDown={ensureOptions}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

const formatChaseNote = (note: StreamingChaseNote) => {
  const labels = note.categoryIds
    .map((categoryId) => CATEGORY_SHORT_LABELS[categoryId])
    .join(" · ")
  if (note.categoryIds.length < 2) return `${labels} · penalty 0`
  const rLabel = note.r == null ? "—" : note.r.toFixed(2)
  return `${labels} · r ${rLabel} · penalty ${note.penalty.toFixed(3)}`
}

const gameNightLabel = (hasGame: boolean) => (
  <span
    aria-label={hasGame ? "Game day" : "Off night"}
    className="ml-1 text-[0.625rem] font-medium text-[var(--color-mute)]"
  >
    {hasGame ? "Game" : "Off"}
  </span>
)

const gameNightToneClass = (hasGame: boolean) =>
  hasGame
    ? "rounded-md bg-[var(--color-soft-cloud)] px-1 py-0.5"
    : "rounded-md bg-[color-mix(in_srgb,var(--color-mute)_10%,transparent)] px-1 py-0.5"

const AddCell = ({
  cell,
  date,
  displayPlayerId,
  oppStreamerName,
  playersById,
  schedule,
  chaseNote,
  today,
  locks,
  allPlayers,
  availableIds,
  spotIndex,
  onAddSelect,
  onHoldThrough,
  selectEpoch = 0,
}: {
  cell: StreamingPlanDayCell | undefined
  date: string
  displayPlayerId: string | null
  oppStreamerName?: string | null
  playersById: Record<string, SeasonPlayer>
  schedule: ScheduleResponse
  chaseNote?: StreamingChaseNote
  today: string
  locks: readonly StreamingAddLock[]
  allPlayers: readonly SeasonPlayer[]
  availableIds: ReadonlySet<string>
  spotIndex: number
  onAddSelect?: (playerId: string) => boolean
  onHoldThrough?: () => void
  selectEpoch?: number
}) => {
  const selectValue = cell?.playerId ?? ""
  const shownPlayerId = cell?.playerId ?? displayPlayerId
  const seated = shownPlayerId ? playersById[shownPlayerId] : undefined
  const hasGame = playerPlaysOn(seated, date, schedule)
  const shownName = shownPlayerId
    ? playerName(shownPlayerId, playersById)
    : "—"

  const wrapTone = (child: ReactNode) =>
    shownPlayerId ? (
      <div
        className={gameNightToneClass(hasGame)}
        data-game-night={hasGame ? "game" : "off"}
      >
        {child}
      </div>
    ) : (
      child
    )

  const oppLabel = oppStreamerName ? (
    <span className="mt-0.5 block text-[0.625rem] text-[var(--color-mute)]">
      Opp: {oppStreamerName}
    </span>
  ) : null

  if (isPastStreamingDate(date, today)) {
    if (!shownPlayerId) {
      return (
        <>
          <span className="text-[var(--color-mute)]">—</span>
          {oppLabel}
        </>
      )
    }
    return wrapTone(
      <>
        <span
          className="inline-flex max-w-full flex-wrap items-baseline"
          title={hasGame ? "Game day" : "Off night"}
        >
          <span
            className={
              hasGame
                ? "font-bold text-[var(--color-ink)]"
                : "font-normal text-[var(--color-mute)]"
            }
          >
            {shownName}
          </span>
          {gameNightLabel(hasGame)}
        </span>
        {oppLabel}
      </>,
    )
  }

  if (canEditStreamingDate(date, today) && onAddSelect) {
    const value = selectValue
    const closedLabel = value
      ? playerName(value, playersById)
      : shownPlayerId
        ? shownName
        : "—"
    const chips = targetCatChips(cell?.targetCategoryIds ?? [])

    return wrapTone(
      <>
        <AddTeamPlayerPicker
          ariaLabel={`Stream add ${formatMatchupDayLabel(date)} spot ${spotIndex + 1}`}
          loadCandidates={() =>
            addOverrideCandidates({
              players: allPlayers,
              availableIds,
              date,
              schedule,
              locks,
              query: "",
            })
          }
          onSelect={onAddSelect}
          selectEpoch={selectEpoch}
          title={hasGame ? "Game day" : "Off night"}
          value={value}
          valueLabel={closedLabel}
        />
        {shownPlayerId ? gameNightLabel(hasGame) : null}
        {cell?.addIndex != null ? (
          <span
            aria-label={`Add ${cell.addIndex}`}
            className={`ml-0.5 text-[0.8125rem] font-semibold tabular-nums ${addIndexColorClass(cell.addIndex)}`}
          >
            {cell.addIndex}
          </span>
        ) : null}
        {chips}
        {chaseNote && chaseNote.categoryIds.length > 0 ? (
          <span className="mt-0.5 block text-[0.625rem] leading-snug text-[var(--color-mute)]">
            {formatChaseNote(chaseNote)}
          </span>
        ) : null}
        {oppLabel}
      </>,
    )
  }

  const holdControl = (child: ReactNode) => {
    if (!onHoldThrough) return child
    return (
      <button
        aria-label={`Hold through ${formatMatchupDayLabel(date)}`}
        className="block w-full max-w-full text-left"
        onClick={(event) => {
          event.stopPropagation()
          onHoldThrough()
        }}
        type="button"
      >
        {child}
      </button>
    )
  }

  if (!shownPlayerId) {
    return holdControl(
      <>
        <span className="text-[var(--color-mute)]">—</span>
        {oppLabel}
      </>,
    )
  }

  const nameClass = hasGame
    ? "font-bold text-[var(--color-ink)]"
    : "font-normal text-[var(--color-mute)]"
  const meta = (
    <span className="ml-1 text-[var(--color-mute)]">
      {formatPlayerPositions(seated)}
      {seated?.teamAbbr ? ` · ${seated.teamAbbr}` : ""}
    </span>
  )

  const chips = targetCatChips(cell?.targetCategoryIds ?? [])
  const nameBlock = wrapTone(
    <>
      <span
        className="inline-flex max-w-full flex-wrap items-baseline"
        title={hasGame ? "Game day" : "Off night"}
      >
        <span className={nameClass}>{shownName}</span>
        {cell?.playerId && cell.addIndex != null ? (
          <span
            aria-label={`Add ${cell.addIndex}`}
            className={`ml-0.5 text-[0.8125rem] font-semibold tabular-nums ${addIndexColorClass(cell.addIndex)}`}
          >
            {cell.addIndex}
          </span>
        ) : null}
        {gameNightLabel(hasGame)}
        {meta}
        {chips}
      </span>
      {chaseNote &&
      cell?.playerId &&
      isAddAction(cell.action) &&
      chaseNote.categoryIds.length > 0 ? (
        <span className="mt-0.5 block text-[0.625rem] leading-snug text-[var(--color-mute)]">
          {formatChaseNote(chaseNote)}
        </span>
      ) : null}
      {oppLabel}
    </>,
  )

  if (cell?.playerId && isAddAction(cell.action) && !onHoldThrough) {
    return nameBlock
  }

  return holdControl(nameBlock)
}

const clampBudget = (value: number) =>
  Math.min(MAX_ADD_BUDGET, Math.max(MIN_ADD_BUDGET, value))

export const StreamingPlansPanel = ({
  leagueId,
  state,
  schedule,
  board,
  playersById,
  adpByPlayerId,
  onPreviewPlanChange,
  onPreviewSpotCountChange,
  previewSpotCount: previewSpotCountProp,
  onPlansBuilt,
  oppSpotCount,
  forcedOpponentRosterDrops,
  opponentTeamIndex,
  daily,
  winnerStreamRecipes = EMPTY_WINNER_STREAM_RECIPES,
  today = localIsoDate(),
  statWindow,
  statPairs = EMPTY_STAT_PAIRS,
  puntSeedReady = true,
}: StreamingPlansPanelProps) => {
  const slateAddLimit = useMemo(
    () => streamingAddLimitForSchedule(schedule),
    [schedule],
  )
  const [addBudget, setAddBudget] = useState(slateAddLimit)
  useEffect(() => {
    setAddBudget(slateAddLimit)
  }, [slateAddLimit])
  const [internalPreviewSpotCount, setInternalPreviewSpotCount] = useState<
    1 | 2 | 3 | null
  >(null)
  const previewSpotCount =
    previewSpotCountProp !== undefined
      ? previewSpotCountProp
      : internalPreviewSpotCount
  const setPreviewSpotCount =
    onPreviewSpotCountChange ?? setInternalPreviewSpotCount
  const [forcedRosterDropsBySpotCount, setForcedRosterDropsBySpotCount] =
    useState<
      Partial<Record<1 | 2 | 3, Record<string, ForcedRosterDropValue>>>
    >({})
  const [puntCategoryIds, setPuntCategoryIds] = useState<CategoryId[]>([])
  const boardForPuntSeedRef = useRef(board)
  boardForPuntSeedRef.current = board
  const seededPuntKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (state.scoringMode !== "most_categories") return
    if (!puntSeedReady) return

    const key = `${state.scoringMode}:${opponentTeamIndex}:${statWindow}`
    if (seededPuntKeysRef.current.has(key)) return
    seededPuntKeysRef.current.add(key)

    const next = mostCategoriesSeedPuntIds(boardForPuntSeedRef.current)
    setPuntCategoryIds((current) => {
      if (
        current.length === next.length &&
        current.every((id) => next.includes(id))
      ) {
        return current
      }
      return next
    })
  }, [state.scoringMode, opponentTeamIndex, statWindow, puntSeedReady])

  const handleTogglePunt = (categoryId: CategoryId) => {
    setPuntCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    )
  }

  useEffect(() => {
    setForcedRosterDropsBySpotCount({})
  }, [addBudget])

  const [addLocksBySpotCount, setAddLocksBySpotCount] = useState<
    Partial<Record<1 | 2 | 3, StreamingAddLock[]>>
  >({})
  const [streamingMoveError, setStreamingMoveError] = useState<string | null>(
    null,
  )
  const [addSelectEpoch, setAddSelectEpoch] = useState(0)
  const matchupDaysKey = schedule.matchup.days.join()

  useEffect(() => {
    setAddLocksBySpotCount({})
    setStreamingMoveError(null)
  }, [addBudget, opponentTeamIndex, matchupDaysKey])

  // Sit/start updates `daily` on the click. Plan search is slow, so paint the
  // lineup first and rebuild plans after that commit.
  const [planDaily, setPlanDaily] = useState(daily)
  useEffect(() => {
    setPlanDaily(daily)
  }, [daily])

  const forcedDrops1 = forcedRosterDropsBySpotCount[1]
  const forcedDrops2 = forcedRosterDropsBySpotCount[2]
  const forcedDrops3 = forcedRosterDropsBySpotCount[3]
  const addLocks1 = addLocksBySpotCount[1]
  const addLocks2 = addLocksBySpotCount[2]
  const addLocks3 = addLocksBySpotCount[3]

  const rosterDropCandidates = useMemo(() => {
    const byId = new Map(state.players.map((player) => [player.id, player]))
    const rows: { id: string; name: string }[] = []
    const seen = new Set<string>()
    for (const entry of perspectiveRosterEntries(state)) {
      if (entry.slot === "IL" || !entry.playerId || seen.has(entry.playerId)) {
        continue
      }
      const player = byId.get(entry.playerId)
      if (!player) continue
      seen.add(entry.playerId)
      rows.push({ id: player.id, name: player.name })
    }
    rows.sort((left, right) => left.name.localeCompare(right.name))
    return rows
  }, [state])
  const defaultDroppableIds = useMemo(
    () =>
      rosterDropCandidates
        .filter((player) => !isAdpProtected(adpByPlayerId?.[player.id]))
        .map((player) => player.id),
    [adpByPlayerId, rosterDropCandidates],
  )
  const [droppableIds, setDroppableIds] = useState<string[] | null>(null)
  const rosterDropKey = rosterDropCandidates.map((player) => player.id).join()
  useEffect(() => {
    setDroppableIds(null)
  }, [rosterDropKey])
  const activeDroppableIds = droppableIds ?? defaultDroppableIds
  const droppableKey = [...activeDroppableIds].sort().join()
  const droppablePlayerIds = useMemo(
    () => new Set(activeDroppableIds),
    // activeDroppableIds is captured when droppableKey changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [droppableKey],
  )

  const handleToggleDroppable = (playerId: string) => {
    setDroppableIds((current) => {
      const base = current ?? defaultDroppableIds
      return base.includes(playerId)
        ? base.filter((id) => id !== playerId)
        : [...base, playerId]
    })
  }

  const sharedPlanInput = {
    state,
    schedule,
    board,
    addLimit: addBudget,
    adpByPlayerId,
    daily: planDaily,
    winnerStreamRecipes,
    today,
    ...(oppSpotCount ? { oppSpotCount } : {}),
    ...(forcedOpponentRosterDrops ? { forcedOpponentRosterDrops } : {}),
    opponentTeamIndex,
    statWindow,
    puntCategoryIds,
    statPairs,
    droppablePlayerIds,
  }

  const plan1Base = useMemo(
    () =>
      buildStreamingPlan({
        ...sharedPlanInput,
        spotCount: 1,
        forcedRosterDrops: forcedDrops1,
      }),
    // sharedPlanInput fields listed explicitly for eslint
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state,
      schedule,
      board,
      addBudget,
      adpByPlayerId,
      forcedDrops1,
      planDaily,
      winnerStreamRecipes,
      today,
      oppSpotCount,
      forcedOpponentRosterDrops,
      opponentTeamIndex,
      statWindow,
      puntCategoryIds,
      statPairs,
      droppableKey,
    ],
  )

  const plan2Base = useMemo(
    () =>
      buildStreamingPlan({
        ...sharedPlanInput,
        spotCount: 2,
        forcedRosterDrops: forcedDrops2,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state,
      schedule,
      board,
      addBudget,
      adpByPlayerId,
      forcedDrops2,
      planDaily,
      winnerStreamRecipes,
      today,
      oppSpotCount,
      forcedOpponentRosterDrops,
      opponentTeamIndex,
      statWindow,
      puntCategoryIds,
      statPairs,
      droppableKey,
    ],
  )

  const plan3Base = useMemo(
    () =>
      buildStreamingPlan({
        ...sharedPlanInput,
        spotCount: 3,
        forcedRosterDrops: forcedDrops3,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state,
      schedule,
      board,
      addBudget,
      adpByPlayerId,
      forcedDrops3,
      planDaily,
      winnerStreamRecipes,
      today,
      oppSpotCount,
      forcedOpponentRosterDrops,
      opponentTeamIndex,
      statWindow,
      puntCategoryIds,
      statPairs,
      droppableKey,
    ],
  )

  const plan1 = useMemo(() => {
    if (!addLocks1?.length) return plan1Base
    return buildStreamingPlan({
      ...sharedPlanInput,
      spotCount: 1,
      forcedRosterDrops: forcedDrops1,
      forcedAdds: addLocks1,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan1Base, addLocks1, forcedDrops1, state, schedule, board, addBudget, adpByPlayerId, planDaily, winnerStreamRecipes, today, oppSpotCount, forcedOpponentRosterDrops, opponentTeamIndex, statWindow, puntCategoryIds, statPairs, droppableKey])

  const plan2 = useMemo(() => {
    if (!addLocks2?.length) return plan2Base
    return buildStreamingPlan({
      ...sharedPlanInput,
      spotCount: 2,
      forcedRosterDrops: forcedDrops2,
      forcedAdds: addLocks2,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan2Base, addLocks2, forcedDrops2, state, schedule, board, addBudget, adpByPlayerId, planDaily, winnerStreamRecipes, today, oppSpotCount, forcedOpponentRosterDrops, opponentTeamIndex, statWindow, puntCategoryIds, statPairs, droppableKey])

  const plan3 = useMemo(() => {
    if (!addLocks3?.length) return plan3Base
    return buildStreamingPlan({
      ...sharedPlanInput,
      spotCount: 3,
      forcedRosterDrops: forcedDrops3,
      forcedAdds: addLocks3,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan3Base, addLocks3, forcedDrops3, state, schedule, board, addBudget, adpByPlayerId, planDaily, winnerStreamRecipes, today, oppSpotCount, forcedOpponentRosterDrops, opponentTeamIndex, statWindow, puntCategoryIds, statPairs, droppableKey])

  const plans = useMemo(
    () => [plan1Base, plan2Base, plan3Base],
    [plan1Base, plan2Base, plan3Base],
  )

  const displayPlans = useMemo(
    () => [plan1, plan2, plan3],
    [plan1, plan2, plan3],
  )

  const lockedPlan = useMemo(() => {
    if (previewSpotCount == null) return null
    const locks = addLocksBySpotCount[previewSpotCount]
    if (!locks?.length) return null
    return (
      displayPlans.find((plan) => plan.spotCount === previewSpotCount) ?? null
    )
  }, [addLocksBySpotCount, displayPlans, previewSpotCount])

  const noneOpponentPlan = useMemo(() => {
    if (!oppSpotCount) return null
    return buildStreamingPlan({
      state,
      schedule,
      board,
      addLimit: addBudget,
      adpByPlayerId,
      spotCount: 1,
      youIdle: true,
      daily: planDaily,
      winnerStreamRecipes,
      today,
      oppSpotCount,
      ...(forcedOpponentRosterDrops
        ? { forcedOpponentRosterDrops }
        : {}),
      opponentTeamIndex,
      statWindow,
      puntCategoryIds,
      statPairs,
      droppablePlayerIds,
    })
  }, [
    addBudget,
    adpByPlayerId,
    board,
    planDaily,
    forcedOpponentRosterDrops,
    opponentTeamIndex,
    oppSpotCount,
    schedule,
    state,
    statWindow,
    statPairs,
    puntCategoryIds,
    today,
    winnerStreamRecipes,
    droppableKey,
  ])

  useEffect(() => {
    onPlansBuilt?.({
      plans: displayPlans,
      baselinePlans: plans,
      noneOpponentPlan,
    })
  }, [displayPlans, noneOpponentPlan, onPlansBuilt, plans])

  useEffect(() => {
    if (previewSpotCount == null || !lockedPlan) return
    const locks = addLocksBySpotCount[previewSpotCount] ?? []
    const rejected = locks.filter((lock) =>
      lockedPlan.rejectedAddLocks.includes(lock),
    )
    if (rejected.length === 0) return
    setStreamingMoveError(
      "That player could not be added on that day. Free a slot or pick someone who plays.",
    )
    setAddSelectEpoch((epoch) => epoch + 1)
    setAddLocksBySpotCount((prev) => {
      const current = prev[previewSpotCount] ?? []
      const next = current.filter(
        (lock) => !lockedPlan.rejectedAddLocks.includes(lock),
      )
      if (next.length === current.length) return prev
      return { ...prev, [previewSpotCount]: next }
    })
  }, [addLocksBySpotCount, lockedPlan, previewSpotCount])

  const streamHint = winnerStreamHint(board, winnerStreamRecipes)

  const handleForcedRosterDropChange = (
    spotCount: 1 | 2 | 3,
    key: string,
    value: ForcedRosterDropValue,
  ) => {
    setStreamingMoveError(null)
    if (value === "hold") {
      const { date, spotIndex } = parseStreamingAddDropKey(key)
      setAddLocksBySpotCount((prev) => {
        const current = prev[spotCount] ?? []
        const next = current.filter(
          (lock) =>
            !(lock.date === date && lock.spotIndex === spotIndex),
        )
        if (next.length === current.length) return prev
        return { ...prev, [spotCount]: next }
      })
    }
    setForcedRosterDropsBySpotCount((prev) => {
      const nextForSpot = { ...(prev[spotCount] ?? {}), [key]: value }
      for (const forcedKey of Object.keys(nextForSpot)) {
        if (isAfterStreamingAddDropKey(forcedKey, key)) {
          delete nextForSpot[forcedKey]
        }
      }
      return { ...prev, [spotCount]: nextForSpot }
    })
    setPreviewSpotCount(spotCount)
  }

  const handleStaleIrReset = (spotCount: 1 | 2 | 3, key: string) => {
    setForcedRosterDropsBySpotCount((prev) => ({
      ...prev,
      [spotCount]: { ...(prev[spotCount] ?? {}), [key]: "hold" },
    }))
  }

  const previewSpotRef = useRef(previewSpotCount)
  previewSpotRef.current = previewSpotCount

  useEffect(() => {
    if (onPreviewSpotCountChange) return
    const spot = previewSpotRef.current
    if (spot == null) return
    onPreviewPlanChange?.(
      displayPlans.find((plan) => plan.spotCount === spot) ?? null,
    )
  }, [displayPlans, onPreviewPlanChange, onPreviewSpotCountChange])

  const resolvedPlayers: Record<string, SeasonPlayer> = {
    ...Object.fromEntries(state.players.map((player) => [player.id, player])),
    ...playersById,
  }
  const rosterEntries = perspectiveRosterEntries(state)
  const availableIds = useMemo(
    () => new Set(state.availablePlayerIds),
    [state.availablePlayerIds],
  )

  const softCaps = [1, 2, 3].map((spotCount) =>
    Math.ceil(addBudget / spotCount),
  )

  const focusSpotCount = (spotCount: 1 | 2 | 3) => {
    if (previewSpotCount === spotCount) return
    setPreviewSpotCount(spotCount)
  }

  const handleHoldUntil = (
    spotCount: 1 | 2 | 3,
    lockDate: string,
    spotIndex: number,
    holdUntil: string,
  ) => {
    setAddLocksBySpotCount((prev) => {
      const current = prev[spotCount] ?? []
      return {
        ...prev,
        [spotCount]: current.map((lock) =>
          lock.date === lockDate && lock.spotIndex === spotIndex
            ? { ...lock, holdUntil }
            : lock,
        ),
      }
    })
    focusSpotCount(spotCount)
  }

  const handleAddSelect = (
    spotCount: 1 | 2 | 3,
    date: string,
    spotIndex: number,
    playerId: string,
  ): boolean => {
    const player = resolvedPlayers[playerId]
    if (!player) return false

    const plan =
      displayPlans.find((item) => item.spotCount === spotCount) ??
      plans.find((item) => item.spotCount === spotCount)
    const cell = plan ? cellFor(plan, date, spotIndex) : undefined
    const dropKey = streamingAddDropKey(date, spotIndex)
    const explicitDrop = forcedRosterDropsBySpotCount[spotCount]?.[dropKey]

    if (explicitDrop === "hold" && playerId !== (cell?.playerId ?? null)) {
      setStreamingMoveError(
        "Choose who to drop (or Open slot) before adding a streamer.",
      )
      setAddSelectEpoch((epoch) => epoch + 1)
      return false
    }

    const plannedDrop = plannedDropValue(cell)
    if (
      explicitDrop == null &&
      plannedDrop !== "hold" &&
      playerId !== (cell?.playerId ?? null)
    ) {
      setForcedRosterDropsBySpotCount((prev) => {
        const current = prev[spotCount] ?? {}
        if (current[dropKey] === plannedDrop) return prev
        return {
          ...prev,
          [spotCount]: { ...current, [dropKey]: plannedDrop },
        }
      })
    }

    setStreamingMoveError(null)
    const baseline = plans.find((item) => item.spotCount === spotCount)
    const recommendedPlayerId = baseline
      ? (cellFor(baseline, date, spotIndex)?.playerId ?? null)
      : null
    setAddLocksBySpotCount((prev) => {
      const current = prev[spotCount] ?? []
      const existing = current.find(
        (lock) => lock.date === date && lock.spotIndex === spotIndex,
      )
      const defaultHold = streamingHoldUntil(
        player,
        date,
        spotCount,
        schedule,
      )
      const holdUntil =
        existing &&
        existing.holdUntil >= date &&
        existing.holdUntil > defaultHold
          ? existing.holdUntil
          : defaultHold
      return {
        ...prev,
        [spotCount]: lockAfterPick(current, {
          date,
          spotIndex,
          playerId,
          holdUntil,
          recommendedPlayerId,
        }),
      }
    })
    focusSpotCount(spotCount)
    return true
  }

  const handleResetToSuggested = () => {
    setAddLocksBySpotCount({})
    setForcedRosterDropsBySpotCount({})
    setStreamingMoveError(null)
    setAddSelectEpoch((epoch) => epoch + 1)
  }

  const hasPlanOverrides = (() => {
    for (const locks of Object.values(addLocksBySpotCount)) {
      if (locks && locks.length > 0) return true
    }
    for (const drops of Object.values(forcedRosterDropsBySpotCount)) {
      if (drops && Object.keys(drops).length > 0) return true
    }
    return false
  })()

  return (
    <section className="min-w-0">
      <div className="mb-3">
        <p className="text-[0.65rem] tracking-[0.16em] text-[var(--color-mute)] uppercase">
          Punt
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_CATEGORY_IDS.map((categoryId) => {
            const label = CATEGORY_SHORT_LABELS[categoryId]
            const selected = puntCategoryIds.includes(categoryId)
            return (
              <Chip
                aria-label={`Punt ${label}`}
                key={categoryId}
                onClick={() => handleTogglePunt(categoryId)}
                variant={selected ? "active" : "default"}
              >
                {label}
              </Chip>
            )
          })}
        </div>
      </div>
      {rosterDropCandidates.length > 0 ? (
        <div className="mb-3">
          <p className="text-[0.65rem] tracking-[0.16em] text-[var(--color-mute)] uppercase">
            Drop
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {rosterDropCandidates.map((player) => {
              const selected = activeDroppableIds.includes(player.id)
              const shortName = player.name.trim().split(/\s+/).at(-1) ?? player.name
              return (
                <button
                  aria-label={`Droppable ${player.name}`}
                  aria-pressed={selected}
                  className={
                    selected
                      ? "rounded-full bg-[var(--color-ink)] px-2 py-0.5 text-[0.6875rem] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                      : "rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-[0.6875rem] font-medium text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                  }
                  key={player.id}
                  onClick={() => handleToggleDroppable(player.id)}
                  type="button"
                >
                  {shortName}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Streaming plans</h2>
            <button
              aria-label="Reset to suggested plan"
              aria-pressed={!hasPlanOverrides}
              className={
                hasPlanOverrides
                  ? "rounded-full border border-[var(--color-ink)] px-2.5 py-0.5 text-[0.75rem] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                  : "rounded-full border border-[var(--color-hairline)] px-2.5 py-0.5 text-[0.75rem] font-medium text-[var(--color-mute)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:opacity-60"
              }
              disabled={!hasPlanOverrides}
              onClick={handleResetToSuggested}
              type="button"
            >
              Suggested
            </button>
          </div>
          <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
            Drops are free. Prefer dense schedules and hold through off nights
            when more games remain. Names stay until an actual drop; game nights
            use a stronger shade and Off nights a lighter one. Adds stay even
            across spots (max {softCaps[1]}/spot on 2-spot, {softCaps[2]}/spot
            on 3-spot).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[0.8125rem]">
            <label
              className="text-[var(--color-mute)]"
              htmlFor="streaming-add-budget"
            >
              Weekly add budget
            </label>
            <button
              aria-label="Decrease weekly add budget"
              className="rounded-full border border-[var(--color-hairline)] px-2.5 py-1 font-medium text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:opacity-40"
              disabled={addBudget <= MIN_ADD_BUDGET}
              onClick={() => setAddBudget((value) => clampBudget(value - 1))}
              type="button"
            >
              −
            </button>
            <input
              className="w-12 rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] py-1 text-center tabular-nums text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
              id="streaming-add-budget"
              inputMode="numeric"
              max={MAX_ADD_BUDGET}
              min={MIN_ADD_BUDGET}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                if (Number.isInteger(parsed)) setAddBudget(clampBudget(parsed))
              }}
              type="number"
              value={addBudget}
            />
            <button
              aria-label="Increase weekly add budget"
              className="rounded-full border border-[var(--color-hairline)] px-2.5 py-1 font-medium text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:opacity-40"
              disabled={addBudget >= MAX_ADD_BUDGET}
              onClick={() => setAddBudget((value) => clampBudget(value + 1))}
              type="button"
            >
              +
            </button>
          </div>
          {streamHint ? (
            <p className="max-w-md text-[0.75rem] text-[var(--color-mute)]">
              {streamHint}
            </p>
          ) : null}
        </div>
      </div>

      {previewSpotCount != null ? (
        <p className="mt-2 text-[0.8125rem] text-[var(--color-mute)]" role="status">
          Previewing {previewSpotCount}-spot plan — board & daily show simulated
          adds/drops.
        </p>
      ) : null}

      {streamingMoveError ? (
        <Banner className="mt-2" tone="danger">
          {streamingMoveError}
        </Banner>
      ) : null}

      <div className="mt-3 space-y-5">
        {displayPlans.map((plan) => {
          const dates = plan.days.map((day) => day.date)
          const addsBySpot = countAddsBySpot(plan)

          return (
            <div key={plan.spotCount}>
              <h3 className="text-[0.8125rem] font-semibold">
                {plan.spotCount}-spot
              </h3>
              <p className="mt-0.5 text-[0.75rem] text-[var(--color-mute)]">
                Adds {plan.addsUsed}/{plan.addLimit} · {plan.gameStarts} starts
                {plan.spotCount > 1
                  ? ` · ${addsBySpot
                      .map((count, index) => `S${index + 1}: ${count}`)
                      .join(" · ")}`
                  : ""}
              </p>
              {plan.summaryReasons.length > 0 ? (
                <p className="mt-0.5 text-[0.75rem] text-[var(--color-mute)]">
                  {plan.summaryReasons.join(" · ")}
                </p>
              ) : null}

              {dates.length > 0 ? (
                <div className="mt-2 overflow-x-auto">
                  <table
                    className={`${MATCHUP_WEEK_STREAMING_TABLE_CLASS} text-left text-[0.75rem] leading-snug`}
                  >
                    <colgroup>
                      <col className={MATCHUP_WEEK_MOVE_COL_CLASS} />
                      {dates.map((date) => (
                        <col
                          className={MATCHUP_WEEK_STREAMING_DAY_COL_CLASS}
                          key={date}
                        />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="border-t border-[var(--color-hairline)]">
                        <th
                          className={`${MATCHUP_WEEK_MOVE_COL_CLASS} py-1.5 pr-2 pl-2 font-medium text-[var(--color-mute)]`}
                          scope="col"
                        >
                          Move
                        </th>
                        {dates.map((date) => {
                          const hasStreamerGame = Array.from(
                            { length: plan.spotCount },
                            (_, spotIndex) =>
                              cellFor(plan, date, spotIndex),
                          ).some((cell) => {
                            if (
                              !cell?.playerId ||
                              cell.action === "empty"
                            ) {
                              return false
                            }
                            return playerPlaysOn(
                              resolvedPlayers[cell.playerId],
                              date,
                              schedule,
                            )
                          })

                          return (
                            <th
                              className={`${MATCHUP_WEEK_STREAMING_DAY_COL_CLASS} px-1 py-1.5 text-center text-[0.7rem] tracking-[0.08em] uppercase whitespace-nowrap ${
                                hasStreamerGame
                                  ? "font-bold text-[var(--color-ink)]"
                                  : "font-medium text-[var(--color-mute)]"
                              }`}
                              key={date}
                              scope="col"
                              title={
                                hasStreamerGame
                                  ? "Streamer game day"
                                  : undefined
                              }
                            >
                              {formatMatchupDayLabel(date)}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: plan.spotCount }, (_, spotIndex) => {
                        const rowTone = spotRowClass(spotIndex)

                        return (
                          <Fragment key={spotIndex}>
                            <tr
                              className={`border-t border-[var(--color-hairline)] ${rowTone}`}
                            >
                              <th
                                className={`${MATCHUP_WEEK_MOVE_COL_CLASS} py-1.5 pr-2 pl-2 font-medium text-[var(--color-mute)]`}
                                scope="row"
                              >
                                {plan.spotCount > 1
                                  ? `Spot ${spotIndex + 1} Add`
                                  : "Add"}
                              </th>
                              {dates.map((date) => {
                                const streamerPlayerId =
                                  plan.opponentDays.find(
                                    (day) => day.date === date,
                                  )?.streamerPlayerId
                                const oppName = streamerPlayerId
                                  ? playerName(streamerPlayerId, resolvedPlayers)
                                  : null
                                const cell = cellFor(plan, date, spotIndex)
                                const displayPlayerId = carryForwardStreamerId(
                                  plan.days,
                                  date,
                                  spotIndex,
                                )
                                const spotLocks =
                                  addLocksBySpotCount[plan.spotCount] ?? []
                                const lockOnDate = spotLocks.find(
                                  (lock) =>
                                    lock.spotIndex === spotIndex &&
                                    lock.date === date,
                                )
                                const priorLock = spotLocks
                                  .filter(
                                    (lock) =>
                                      lock.spotIndex === spotIndex &&
                                      lock.date < date,
                                  )
                                  .sort((left, right) =>
                                    left.date < right.date ? 1 : -1,
                                  )[0]
                                const weekEnd = dates[dates.length - 1]
                                const holdLockDate =
                                  !lockOnDate &&
                                  priorLock &&
                                  weekEnd != null &&
                                  date <= weekEnd
                                    ? priorLock.date
                                    : undefined

                                return (
                                  <td
                                    className={`${MATCHUP_WEEK_STREAMING_DAY_COL_CLASS} relative px-1 py-1.5 align-top break-words`}
                                    key={`${date}-add-${spotIndex}`}
                                    onClick={
                                      holdLockDate
                                        ? () =>
                                            handleHoldUntil(
                                              plan.spotCount,
                                              holdLockDate,
                                              spotIndex,
                                              date,
                                            )
                                        : undefined
                                    }
                                  >
                                    <AddCell
                                      allPlayers={state.players}
                                      availableIds={availableIds}
                                      cell={cell}
                                      chaseNote={plan.chaseNote}
                                      date={date}
                                      displayPlayerId={displayPlayerId}
                                      locks={spotLocks}
                                      selectEpoch={addSelectEpoch}
                                      spotIndex={spotIndex}
                                      onAddSelect={(playerId) =>
                                        handleAddSelect(
                                          plan.spotCount,
                                          date,
                                          spotIndex,
                                          playerId,
                                        )
                                      }
                                      onHoldThrough={
                                        holdLockDate
                                          ? () =>
                                              handleHoldUntil(
                                                plan.spotCount,
                                                holdLockDate,
                                                spotIndex,
                                                date,
                                              )
                                          : undefined
                                      }
                                      oppStreamerName={
                                        oppName === "—" ? null : oppName
                                      }
                                      playersById={resolvedPlayers}
                                      schedule={schedule}
                                      today={today}
                                    />
                                  </td>
                                )
                              })}
                            </tr>
                            <tr
                              className={`border-t border-[var(--color-hairline)] ${rowTone}`}
                            >
                              <th
                                className={`${MATCHUP_WEEK_MOVE_COL_CLASS} py-1.5 pr-2 pl-2 font-medium text-[var(--color-mute)]`}
                                scope="row"
                              >
                                {plan.spotCount > 1
                                  ? `Spot ${spotIndex + 1} Drop`
                                  : "Drop"}
                              </th>
                              {dates.map((date) => {
                                const cell = cellFor(plan, date, spotIndex)

                                return (
                                  <td
                                    className={`${MATCHUP_WEEK_STREAMING_DAY_COL_CLASS} px-1 py-1.5 align-top break-words text-[var(--color-mute)]`}
                                    key={`${date}-drop-${spotIndex}`}
                                  >
                                    <DropCell
                                      cell={cell}
                                      date={date}
                                      forcedDropValue={
                                        forcedRosterDropsBySpotCount[
                                          plan.spotCount
                                        ]?.[streamingAddDropKey(date, spotIndex)] ??
                                        plannedDropValue(cell)
                                      }
                                      onForcedRosterDropChange={(key, value) =>
                                        handleForcedRosterDropChange(
                                          plan.spotCount,
                                          key,
                                          value,
                                        )
                                      }
                                      onStaleIrReset={(key) =>
                                        handleStaleIrReset(plan.spotCount, key)
                                      }
                                      plan={plan}
                                      playersById={resolvedPlayers}
                                      rosterEntries={rosterEntries}
                                      schedule={schedule}
                                      spotIndex={spotIndex}
                                      today={today}
                                    />
                                  </td>
                                )
                              })}
                            </tr>
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
