import type { ChangeEvent } from "react"
import { RankNonagon } from "@/components/trade/RankNonagon"
import { TeamPickupMenu } from "@/components/waivers/TeamPickupMenu"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import { formatTotal } from "@/lib/trade/offerCopy"
import type { StatBasis } from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"
import { groupPlayersByTeam } from "@/lib/waivers/groupByTeam"
import type { AddDropPreview } from "@/lib/waivers/types"

type PickupOption = {
  id: string
  name: string
  teamAbbr?: string | null
}

type AddDropBuilderProps = {
  addPlayerId: string | null
  available: PickupOption[]
  basis: StatBasis
  dropPlayerId: string | null
  isClaiming: boolean
  isPreviewing: boolean
  onAddChange: (playerId: string | null) => void
  onBasisChange: (basis: StatBasis) => void
  onConfirm: () => void
  onDropChange: (playerId: string | null) => void
  onPreview: () => void
  preview: AddDropPreview | null
  previewError: string
  state: SeasonLeagueState
  teamCount: number
  youWaiverRank: number
}

const playerName = (playerId: string, state: SeasonLeagueState) =>
  state.players.find((player) => player.id === playerId)?.name ?? "Unknown player"

const youRosterPlayerIds = (state: SeasonLeagueState): string[] => {
  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )

  return (
    youTeam?.entries.flatMap((entry) =>
      entry.playerId ? [entry.playerId] : [],
    ) ?? []
  )
}

const hasEmptySlot = (state: SeasonLeagueState): boolean =>
  state.teams
    .find((team) => team.teamIndex === state.perspectiveTeamIndex)
    ?.entries.some((entry) => entry.playerId === null) ?? false

export const AddDropBuilder = ({
  addPlayerId,
  available,
  basis,
  dropPlayerId,
  isClaiming,
  isPreviewing,
  onAddChange,
  onBasisChange,
  onConfirm,
  onDropChange,
  onPreview,
  preview,
  previewError,
  state,
  teamCount,
  youWaiverRank,
}: AddDropBuilderProps) => {
  const dropCandidates = youRosterPlayerIds(state)
  const addPlayer = addPlayerId
    ? state.players.find((player) => player.id === addPlayerId)
    : null
  const canPreview = Boolean(addPlayerId)
  const pickupOptions =
    !addPlayerId || available.some((player) => player.id === addPlayerId)
      ? available
      : [
          ...available,
          {
            id: addPlayerId,
            name: playerName(addPlayerId, state),
            teamAbbr: addPlayer?.teamAbbr,
          },
        ]
  const pickupGroups = groupPlayersByTeam(pickupOptions)
  const rankCategories =
    preview?.categoryDeltas.map((delta) => ({
      label: CATEGORY_SHORT_LABELS[delta.categoryId],
      rankBefore: delta.rankBefore,
      rankAfter: delta.rankAfter,
    })) ?? []

  const handleDropChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    onDropChange(value === "" ? null : value)
  }

  return (
    <section className="rounded-3xl border border-[var(--color-hairline)] p-5 sm:p-6">
      <p className="text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
        Add / drop
      </p>
      <h2 className="mt-1 text-2xl font-semibold">
        {addPlayerId ? playerName(addPlayerId, state) : "Select a pickup"}
      </h2>
      {addPlayer ? (
        <p className="mt-2 text-[0.8125rem] text-[var(--color-mute)]">
          Status:{" "}
          <span className="font-medium">
            {addPlayer.availability === "waiver" ? "Waiver" : "Free agent"}
          </span>
          {addPlayer.availability === "waiver" ? (
            <span> · Your waiver rank #{youWaiverRank}</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-[0.8125rem] text-[var(--color-mute)]">
          Choose a pickup below, or from the lists.
        </p>
      )}

      <div className="mt-6">
        <label
          className="mb-2 block text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase"
          htmlFor="add-player"
        >
          Pickup
        </label>
        <TeamPickupMenu
          groups={pickupGroups}
          onSelect={onAddChange}
          selectedPlayerName={addPlayerId ? playerName(addPlayerId, state) : null}
        />
      </div>

      <div className="mt-6">
        <label
          className="mb-2 block text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase"
          htmlFor="drop-player"
        >
          Drop (optional)
        </label>
        <select
          className="w-full rounded-2xl border border-[var(--color-hairline)] bg-white px-4 py-2.5 text-[0.8125rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
          disabled={!addPlayerId}
          id="drop-player"
          onChange={handleDropChange}
          value={dropPlayerId ?? ""}
        >
          {hasEmptySlot(state) ? (
            <option value="">Use empty roster slot</option>
          ) : (
            <option value="">Select player to drop</option>
          )}
          {dropCandidates.map((playerId) => (
            <option key={playerId} value={playerId}>
              {playerName(playerId, state)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="rounded-full border border-[var(--color-hairline)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-soft-cloud)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canPreview || isPreviewing}
          onClick={onPreview}
          type="button"
        >
          {isPreviewing ? "Previewing…" : "Preview impact"}
        </button>
        <button
          className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!preview || isClaiming}
          onClick={onConfirm}
          type="button"
        >
          {isClaiming ? "Claiming…" : "Confirm claim"}
        </button>
      </div>

      {previewError ? (
        <p className="mt-4 text-sm text-[var(--color-sale)]" role="alert">
          {previewError}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Team strength</h3>
            <div
              aria-label="Stat basis"
              className="flex rounded-full bg-[var(--color-soft-cloud)] p-1"
              role="radiogroup"
            >
              {([
                ["total", "Total"],
                ["perGame", "Per game"],
              ] as const).map(([value, label]) => (
                <button
                  aria-checked={basis === value}
                  className={`rounded-full px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                    basis === value
                      ? "bg-[var(--color-ink)] text-white"
                      : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
                  }`}
                  key={value}
                  onClick={() => onBasisChange(value)}
                  role="radio"
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-sm">
            {`Overall #${preview.overall.rankBefore} → #${preview.overall.rankAfter} (rank sum ${preview.overall.rankSumBefore} → ${preview.overall.rankSumAfter})`}
          </p>
          <div className="mt-2 w-full max-w-xs">
            <RankNonagon categories={rankCategories} teamCount={teamCount} />
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Category changes</h3>
            <div className="mt-2 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)] text-[0.8125rem]">
              {preview.categoryDeltas.map((delta) => (
                <div
                  className="flex items-center justify-between gap-4 py-2"
                  key={delta.categoryId}
                >
                  <span className="w-12 font-medium">
                    {CATEGORY_SHORT_LABELS[delta.categoryId]}
                  </span>
                  <span className="tabular-nums">
                    {formatTotal(delta.categoryId, delta.beforeTotal)} →{" "}
                    {formatTotal(delta.categoryId, delta.afterTotal)}
                  </span>
                  <span className="tabular-nums text-[var(--color-mute)]">
                    #{delta.rankBefore} → #{delta.rankAfter}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-[0.8125rem] text-[var(--color-mute)]">
            Needs score {preview.before.needsScore.toFixed(1)} →{" "}
            {preview.after.needsScore.toFixed(1)}
          </p>
          {preview.requiresAssumeSuccess ? (
            <p className="mt-2 text-[0.8125rem] text-[var(--color-info)]">
              Waiver rank #{preview.youWaiverRank} — confirmation will ask you
              to assume a successful claim.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
