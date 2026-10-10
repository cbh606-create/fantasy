import { BoardGrid } from "@/components/draft/BoardGrid"
import { PlayerPool } from "@/components/draft/PlayerPool"
import { RecPanel } from "@/components/draft/RecPanel"
import { SyncBar } from "@/components/draft/SyncBar"
import type { LeagueState, SimulationResult } from "@/lib/domain/types"

type LiveViewProps = {
  isManualMode: boolean
  isSavingPick: boolean
  isSyncing: boolean
  onContinueManually: () => void
  onMarkPicked: (playerId: string) => void
  onSync: () => void
  result: SimulationResult | null
  state: LeagueState
  syncError: string
}

export const LiveView = ({
  isManualMode,
  isSavingPick,
  isSyncing,
  onContinueManually,
  onMarkPicked,
  onSync,
  result,
  state,
  syncError,
}: LiveViewProps) => {
  const pickedPlayerIds = state.board.picks.flatMap((pick) =>
    pick.playerId ? [pick.playerId] : [],
  )

  return (
    <div>
      <SyncBar
        error={syncError}
        isManualMode={isManualMode}
        isSyncing={isSyncing}
        onContinueManually={onContinueManually}
        onSync={onSync}
      />
      <div className="grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)_22rem]">
        <PlayerPool
          disabled={isSavingPick}
          onMarkPicked={onMarkPicked}
          pickedPlayerIds={pickedPlayerIds}
          players={state.players}
        />
        <BoardGrid state={state} />
        <RecPanel players={state.players} result={result} />
      </div>
    </div>
  )
}
