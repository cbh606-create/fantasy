"use client"

import Link from "next/link"
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { formatPlayerPositions } from "@/lib/season/slotLabels"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
} from "@/lib/season/types"
import { WEEKLY_ADD_LIMIT } from "@/lib/matchup/constants"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import {
  buildStreamingPlan,
  streamingAddDropKey,
} from "@/lib/matchup/streamingPlans"
import {
  collectEarlierRosterDropIds,
  eligibleRosterDropPlayerIds,
  hasOpenNonIlRosterSlot,
  isAfterStreamingAddDropKey,
  perspectiveRosterEntries,
  rosterDropSelectOptions,
} from "@/lib/matchup/streamingDropOptions"
import { suggestStreamingStrategyMode } from "@/lib/matchup/streamingStrategy"
import type {
  MatchupBoard,
  StreamingPlan,
  StreamingPlanDayCell,
  StreamingStrategyMode,
} from "@/lib/matchup/types"

const MIN_ADD_BUDGET = 1
const MAX_ADD_BUDGET = 14

const STRATEGY_OPTIONS: { id: StreamingStrategyMode; label: string }[] = [
  { id: "aggressive", label: "Aggressive" },
  { id: "balanced", label: "Balanced" },
  { id: "conservative", label: "Conservative" },
]

const PREVIEW_OPTIONS: { id: 1 | 2 | 3 | null; label: string }[] = [
  { id: null, label: "None" },
  { id: 1, label: "1-spot" },
  { id: 2, label: "2-spot" },
  { id: 3, label: "3-spot" },
]

type StreamingPlansPanelProps = {
  leagueId: string
  state: SeasonLeagueState
  schedule: ScheduleResponse
  board: MatchupBoard
  playersById: Record<string, SeasonPlayer>
  adpByPlayerId?: Record<string, number>
  onPreviewPlanChange?: (plan: StreamingPlan | null) => void
  /** Base (non-preview) daily lineups — used to skip adds on full days. */
  daily?: DailyLineups
}

const formatDayLabel = (day: string) => {
  const date = new Date(`${day}T12:00:00`)
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  })
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
  const team = player?.teamAbbr?.toUpperCase()
  if (!team) return false
  return schedule.games.some((game) => {
    if (game.date !== date) return false
    return (
      game.homeAbbr.toUpperCase() === team ||
      game.awayAbbr.toUpperCase() === team
    )
  })
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

const dropLabel = (
  cell: StreamingPlanDayCell | undefined,
  playersById: Record<string, SeasonPlayer>,
): string => {
  if (!cell) return "—"
  if (cell.action === "drop_add") {
    return playerName(cell.droppedPlayerId, playersById)
  }
  return "—"
}

const DropCell = ({
  cell,
  date,
  plan,
  playersById,
  rosterEntries,
  adpByPlayerId,
  onForcedRosterDropChange,
}: {
  cell: StreamingPlanDayCell | undefined
  date: string
  plan: StreamingPlan
  playersById: Record<string, SeasonPlayer>
  rosterEntries: SeasonLeagueState["teams"][number]["entries"]
  adpByPlayerId?: Record<string, number>
  onForcedRosterDropChange: (
    key: string,
    value: string | "open_slot",
  ) => void
}) => {
  if (!cell || cell.action !== "add") {
    return (
      <span className="text-[var(--color-mute)]">
        {dropLabel(cell, playersById)}
      </span>
    )
  }

  const key = streamingAddDropKey(date, cell.spotIndex)
  const earlierDroppedIds = collectEarlierRosterDropIds(
    plan,
    date,
    cell.spotIndex,
  )
  const eligiblePlayerIds = eligibleRosterDropPlayerIds(
    rosterEntries,
    playersById,
    earlierDroppedIds,
    adpByPlayerId,
  )
  const options = rosterDropSelectOptions({
    eligiblePlayerIds,
    earlierDroppedIds,
    allowOpenSlot: hasOpenNonIlRosterSlot(rosterEntries),
    playersById,
  })
  const value =
    cell.rosterDropKind === "open_slot"
      ? "open_slot"
      : (cell.rosterDropPlayerId ?? "")

  return (
    <select
      aria-label={`Roster drop ${formatDayLabel(date)} spot ${cell.spotIndex + 1}`}
      className="max-w-full rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] py-0.5 text-[0.75rem] text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
      onChange={(event) => {
        const next = event.target.value
        if (next === "open_slot") {
          onForcedRosterDropChange(key, "open_slot")
          return
        }
        onForcedRosterDropChange(key, next)
      }}
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

const AddCell = ({
  cell,
  date,
  leagueId,
  playersById,
  schedule,
}: {
  cell: StreamingPlanDayCell | undefined
  date: string
  leagueId: string
  playersById: Record<string, SeasonPlayer>
  schedule: ScheduleResponse
}) => {
  if (!cell || cell.action === "empty" || !cell.playerId) {
    return <span className="text-[var(--color-mute)]">—</span>
  }

  const seated = playersById[cell.playerId]
  const name = playerName(cell.playerId, playersById)
  const hasGame = playerPlaysOn(seated, date, schedule)
  const nameClass = hasGame
    ? "font-bold text-[var(--color-ink)]"
    : "font-normal text-[var(--color-mute)]"
  const meta = (
    <span className="ml-1 text-[var(--color-mute)]">
      {formatPlayerPositions(seated)}
      {seated?.teamAbbr ? ` · ${seated.teamAbbr}` : ""}
    </span>
  )

  if (isAddAction(cell.action)) {
    return (
      <AddCellHoverTip
        addIndex={cell.addIndex}
        alternativePlayerIds={cell.alternativePlayerIds ?? []}
        hasGame={hasGame}
        leagueId={leagueId}
        meta={meta}
        name={name}
        nameClass={nameClass}
        playerId={cell.playerId}
        playersById={playersById}
      />
    )
  }

  return (
    <span title={hasGame ? "Game day" : "Off night"}>
      <span className={nameClass}>{name}</span>
      {meta}
    </span>
  )
}

const AddCellHoverTip = ({
  addIndex,
  alternativePlayerIds,
  hasGame,
  leagueId,
  meta,
  name,
  nameClass,
  playerId,
  playersById,
}: {
  addIndex: number | null
  alternativePlayerIds: string[]
  hasGame: boolean
  leagueId: string
  meta: ReactNode
  name: string
  nameClass: string
  playerId: string
  playersById: Record<string, SeasonPlayer>
}) => {
  const tipId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const alternativeNames = alternativePlayerIds
    .map((id) => playerName(id, playersById))
    .filter((label) => label !== "—")
  const gameLabel = hasGame ? "Game day" : "Off night"

  const placeTip = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 224
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - width - 8),
    )
    setPos({ top: rect.bottom + 6, left })
  }

  const show = () => {
    placeTip()
    setOpen(true)
  }

  const hide = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  return (
    <span
      className="relative inline-flex max-w-full items-baseline"
      onMouseEnter={show}
      onMouseLeave={hide}
      ref={rootRef}
    >
      <Link
        aria-describedby={open ? tipId : undefined}
        className={`${nameClass} underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]`}
        href={`/waivers/${leagueId}?addPlayerId=${playerId}`}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) hide()
        }}
        onFocus={show}
      >
        {name}
      </Link>
      {addIndex != null ? (
        <span
          aria-label={`Add ${addIndex}`}
          className={`ml-0.5 text-[0.8125rem] font-semibold tabular-nums ${addIndexColorClass(addIndex)}`}
        >
          {addIndex}
        </span>
      ) : null}
      {meta}
      {open
        ? createPortal(
            <span
              className="w-56 rounded-xl border border-[var(--color-hairline)] bg-white p-2.5 text-left shadow-md"
              id={tipId}
              role="tooltip"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                zIndex: 60,
              }}
            >
              <span className="inline-flex rounded-md bg-[var(--color-soft-cloud)] px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-[var(--color-mute)] uppercase">
                {gameLabel}
              </span>
              {alternativeNames.length > 0 ? (
                <span className="mt-2 block">
                  <span className="text-[0.625rem] font-medium tracking-wide text-[var(--color-mute)] uppercase">
                    Also consider
                  </span>
                  <ul className="mt-1 space-y-0.5">
                    {alternativeNames.map((altName) => (
                      <li
                        className="text-[0.75rem] leading-snug font-medium text-[var(--color-ink)]"
                        key={altName}
                      >
                        {altName}
                      </li>
                    ))}
                  </ul>
                </span>
              ) : (
                <span className="mt-1.5 block text-[0.7rem] leading-snug text-[var(--color-mute)]">
                  No close alternatives today
                </span>
              )}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
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
  daily,
}: StreamingPlansPanelProps) => {
  const suggested = suggestStreamingStrategyMode(board)
  const [addBudget, setAddBudget] = useState(WEEKLY_ADD_LIMIT)
  const [strategyMode, setStrategyMode] =
    useState<StreamingStrategyMode>(suggested)
  const [previewSpotCount, setPreviewSpotCount] = useState<1 | 2 | 3 | null>(
    null,
  )
  const [forcedRosterDropsBySpotCount, setForcedRosterDropsBySpotCount] =
    useState<
      Partial<Record<1 | 2 | 3, Record<string, string | "open_slot">>>
    >({})

  useEffect(() => {
    setForcedRosterDropsBySpotCount({})
  }, [strategyMode, addBudget])

  const plans = useMemo(
    () =>
      ([1, 2, 3] as const).map((spotCount) =>
        buildStreamingPlan({
          state,
          schedule,
          board,
          addLimit: addBudget,
          strategyMode,
          adpByPlayerId,
          spotCount,
          forcedRosterDrops: forcedRosterDropsBySpotCount[spotCount],
          daily,
        }),
      ),
    [
      state,
      schedule,
      board,
      addBudget,
      strategyMode,
      adpByPlayerId,
      forcedRosterDropsBySpotCount,
      daily,
    ],
  )

  const handleForcedRosterDropChange = (
    spotCount: 1 | 2 | 3,
    key: string,
    value: string | "open_slot",
  ) => {
    setForcedRosterDropsBySpotCount((prev) => {
      const nextForSpot = { ...(prev[spotCount] ?? {}), [key]: value }
      for (const forcedKey of Object.keys(nextForSpot)) {
        if (isAfterStreamingAddDropKey(forcedKey, key)) {
          delete nextForSpot[forcedKey]
        }
      }
      return { ...prev, [spotCount]: nextForSpot }
    })
  }

  const selectPreviewSpot = (spot: 1 | 2 | 3 | null) => {
    setPreviewSpotCount(spot)
    if (spot == null) {
      onPreviewPlanChange?.(null)
      return
    }
    onPreviewPlanChange?.(
      plans.find((plan) => plan.spotCount === spot) ?? null,
    )
  }

  const previewSpotRef = useRef(previewSpotCount)
  previewSpotRef.current = previewSpotCount

  useEffect(() => {
    const spot = previewSpotRef.current
    if (spot == null) return
    onPreviewPlanChange?.(
      plans.find((plan) => plan.spotCount === spot) ?? null,
    )
  }, [plans, onPreviewPlanChange])

  const resolvedPlayers: Record<string, SeasonPlayer> = {
    ...Object.fromEntries(state.players.map((player) => [player.id, player])),
    ...playersById,
  }

  const softCaps = [1, 2, 3].map((spotCount) =>
    Math.ceil(addBudget / spotCount),
  )

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Streaming plans</h2>
          <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
            Drops are free. Prefer dense schedules and hold through off nights
            when more games remain. Game days are bold; off nights stay muted.
            Adds stay even across spots (max {softCaps[1]}/spot on 2-spot,{" "}
            {softCaps[2]}/spot on 3-spot).
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
          <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
            <span className="text-[var(--color-mute)]">Strategy</span>
            {STRATEGY_OPTIONS.map((option) => (
              <button
                aria-pressed={strategyMode === option.id}
                className={
                  strategyMode === option.id
                    ? "rounded-full border border-[var(--color-ink)] px-2.5 py-1 font-medium text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                    : "rounded-full border border-[var(--color-hairline)] px-2.5 py-1 font-medium text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                }
                key={option.id}
                onClick={() => setStrategyMode(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
            {strategyMode !== suggested ? (
              <span className="text-[var(--color-mute)]">
                Suggested:{" "}
                {STRATEGY_OPTIONS.find((option) => option.id === suggested)
                  ?.label ?? suggested}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
            <span className="text-[var(--color-mute)]">Preview</span>
            {PREVIEW_OPTIONS.map((option) => (
              <button
                aria-pressed={previewSpotCount === option.id}
                className={
                  previewSpotCount === option.id
                    ? "rounded-full border border-[var(--color-ink)] px-2.5 py-1 font-medium text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                    : "rounded-full border border-[var(--color-hairline)] px-2.5 py-1 font-medium text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                }
                key={option.label}
                onClick={() => selectPreviewSpot(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {previewSpotCount != null ? (
        <p className="mt-2 text-[0.8125rem] text-[var(--color-mute)]" role="status">
          Previewing {previewSpotCount}-spot plan — board & daily show simulated
          adds/drops.
        </p>
      ) : null}

      <div className="mt-3 space-y-5">
        {plans.map((plan) => {
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
                  <table className="w-full border-collapse text-left text-[0.75rem] leading-snug">
                    <thead>
                      <tr className="border-t border-[var(--color-hairline)]">
                        <th
                          className="w-[5.5rem] py-1.5 pr-2 font-medium text-[var(--color-mute)]"
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
                              className={
                                hasStreamerGame
                                  ? "min-w-[5.5rem] py-1.5 pr-3 font-bold text-[var(--color-ink)]"
                                  : "min-w-[5.5rem] py-1.5 pr-3 font-medium text-[var(--color-mute)]"
                              }
                              key={date}
                              scope="col"
                              title={
                                hasStreamerGame
                                  ? "Streamer game day"
                                  : undefined
                              }
                            >
                              {formatDayLabel(date)}
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
                                className="py-1.5 pr-2 pl-2 font-medium text-[var(--color-mute)]"
                                scope="row"
                              >
                                {plan.spotCount > 1
                                  ? `Spot ${spotIndex + 1} Add`
                                  : "Add"}
                              </th>
                              {dates.map((date) => (
                                <td
                                  className="py-1.5 pr-3 align-top"
                                  key={`${date}-add-${spotIndex}`}
                                >
                                  <AddCell
                                    cell={cellFor(plan, date, spotIndex)}
                                    date={date}
                                    leagueId={leagueId}
                                    playersById={resolvedPlayers}
                                    schedule={schedule}
                                  />
                                </td>
                              ))}
                            </tr>
                            <tr
                              className={`border-t border-[var(--color-hairline)] ${rowTone}`}
                            >
                              <th
                                className="py-1.5 pr-2 pl-2 font-medium text-[var(--color-mute)]"
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
                                    className="py-1.5 pr-3 align-top text-[var(--color-mute)]"
                                    key={`${date}-drop-${spotIndex}`}
                                  >
                                    <DropCell
                                      adpByPlayerId={adpByPlayerId}
                                      cell={cell}
                                      date={date}
                                      onForcedRosterDropChange={(key, value) =>
                                        handleForcedRosterDropChange(
                                          plan.spotCount,
                                          key,
                                          value,
                                        )
                                      }
                                      plan={plan}
                                      playersById={resolvedPlayers}
                                      rosterEntries={perspectiveRosterEntries(
                                        state,
                                      )}
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
