"use client"

import { BoardGrid } from "@/components/draft/BoardGrid"
import { PlayerPool } from "@/components/draft/PlayerPool"
import { Button } from "@/components/ui/Button"
import { isUserTurn } from "@/lib/domain/snake"
import type { DraftBoard, LeagueState } from "@/lib/domain/types"

type MockDraftViewProps = {
  isSavingPick: boolean
  mockBoard: DraftBoard
  onMarkPicked: (playerId: string) => void
  onReset: () => void
  state: LeagueState
}

export const MockDraftView = ({
  isSavingPick,
  mockBoard,
  onMarkPicked,
  onReset,
  state,
}: MockDraftViewProps) => {
  const mockState: LeagueState = {
    ...state,
    board: mockBoard,
    source: "manual",
  }
  const userTurn = isUserTurn(
    mockBoard,
    state.perspectiveTeamIndex,
    state.settings.teams,
  )
  const pickedPlayerIds = mockBoard.picks.flatMap((pick) =>
    pick.playerId ? [pick.playerId] : [],
  )
  const draftComplete =
    mockBoard.currentOverall > state.settings.teams * state.settings.rounds ||
    mockBoard.picks.every((pick) => pick.playerId !== null)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
            Mock draft
          </p>
          <p className="mt-1 text-sm text-[var(--color-mute)]">
            Practice only — does not change your Live board.
            {userTurn && !draftComplete
              ? " Your turn to pick."
              : draftComplete
                ? " Draft complete."
                : " Advancing opponents…"}
          </p>
        </div>
        <Button
          aria-label="Reset mock draft"
          onClick={onReset}
          type="button"
          variant="secondary"
        >
          Reset mock draft
        </Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <PlayerPool
          disabled={isSavingPick || !userTurn || draftComplete}
          onMarkPicked={onMarkPicked}
          pickedPlayerIds={pickedPlayerIds}
          players={state.players}
        />
        <BoardGrid state={mockState} />
      </div>
    </div>
  )
}
