"use client"

import type { ChangeEvent } from "react"
import { BoardGrid } from "@/components/draft/BoardGrid"
import { PlayerPool } from "@/components/draft/PlayerPool"
import { Button } from "@/components/ui/Button"
import { isUserTurn } from "@/lib/domain/snake"
import type { DraftBoard, LeagueState, Player } from "@/lib/domain/types"

export type MockLatestPick = {
  overall: number
  teamIndex: number
  player: Player
}

type MockDraftViewProps = {
  isAdvancing: boolean
  isSavingPick: boolean
  latestPick: MockLatestPick | null
  mockBoard: DraftBoard
  onMarkPicked: (playerId: string) => void
  onReset: () => void
  onSlotChange: (slot: number) => void
  perspectiveTeamIndex: number
  players: Player[]
  state: LeagueState
}

export const MockDraftView = ({
  isAdvancing,
  isSavingPick,
  latestPick,
  mockBoard,
  onMarkPicked,
  onReset,
  onSlotChange,
  perspectiveTeamIndex,
  players,
  state,
}: MockDraftViewProps) => {
  const mockState: LeagueState = {
    ...state,
    board: mockBoard,
    perspectiveTeamIndex,
    players,
    source: "manual",
  }
  const userTurn = isUserTurn(
    mockBoard,
    perspectiveTeamIndex,
    state.settings.teams,
  )
  const pickedPlayerIds = mockBoard.picks.flatMap((pick) =>
    pick.playerId ? [pick.playerId] : [],
  )
  const draftComplete =
    mockBoard.currentOverall > state.settings.teams * state.settings.rounds ||
    mockBoard.picks.every((pick) => pick.playerId !== null)
  const busy = isSavingPick || isAdvancing
  const slotOptions = Array.from(
    { length: state.settings.teams },
    (_, index) => index + 1,
  )

  const handleSlotChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const slot = Number(event.target.value)
    if (!Number.isInteger(slot) || slot < 1 || slot > state.settings.teams) {
      return
    }
    onSlotChange(slot)
  }

  return (
    <div>
      {latestPick ? (
        <div
          aria-live="polite"
          className="mb-4 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-soft-cloud)] px-4 py-3"
          role="status"
        >
          <p className="text-[0.65rem] tracking-[0.14em] text-[var(--color-mute)] uppercase">
            Latest pick
          </p>
          <p className="mt-1 text-sm font-semibold sm:text-base">
            #{latestPick.overall} · Team {latestPick.teamIndex + 1}
            {latestPick.teamIndex === perspectiveTeamIndex ? " (You)" : ""}
            {" — "}
            {latestPick.player.name}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-mute)]">
            {latestPick.player.positions.join("/")} · ADP {latestPick.player.adp}
          </p>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] tracking-[0.16em] text-[var(--color-mute)] uppercase">
            Mock draft
          </p>
          <p className="mt-1 text-xs text-[var(--color-mute)] sm:text-sm" role="status">
            Practice only — does not change your Live board.
            {isAdvancing
              ? " Opponents are picking…"
              : userTurn && !draftComplete
                ? " Your turn to pick."
                : draftComplete
                  ? " Draft complete."
                  : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--color-mute)]">
            <span className="tracking-[0.12em] uppercase">Your pick slot</span>
            <select
              aria-label="Your pick slot"
              className="h-9 min-w-[7rem] rounded-xl border border-[var(--color-hairline)] bg-white px-3 text-sm text-[var(--color-ink)]"
              disabled={busy}
              onChange={handleSlotChange}
              value={perspectiveTeamIndex + 1}
            >
              {slotOptions.map((slot) => (
                <option key={slot} value={slot}>
                  Slot {slot}
                </option>
              ))}
            </select>
          </label>
          <Button
            aria-label="Reset mock draft"
            className="h-9 px-4 text-sm"
            disabled={busy}
            onClick={onReset}
            type="button"
            variant="secondary"
          >
            Reset mock draft
          </Button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <PlayerPool
          compact
          disabled={busy || !userTurn || draftComplete}
          onMarkPicked={onMarkPicked}
          pickedPlayerIds={pickedPlayerIds}
          players={players}
        />
        <BoardGrid label="Mock draft" state={mockState} />
      </div>
    </div>
  )
}
