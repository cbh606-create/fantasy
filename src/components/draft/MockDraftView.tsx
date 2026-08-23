"use client"

import type { ChangeEvent } from "react"
import { BoardGrid } from "@/components/draft/BoardGrid"
import { MockDraftAnalysis } from "@/components/draft/MockDraftAnalysis"
import { PlayerPool } from "@/components/draft/PlayerPool"
import { RecPanel } from "@/components/draft/RecPanel"
import { Button } from "@/components/ui/Button"
import { ESPN_TEAM_COUNTS } from "@/lib/domain/leagueSize"
import { isUserTurn } from "@/lib/domain/snake"
import type {
  DraftBoard,
  LeagueState,
  Player,
  SimulationResult,
} from "@/lib/domain/types"
import {
  ADP_SOURCE_IDS,
  ADP_SOURCES,
  DEFAULT_ADP_SOURCE,
  formatAdpReferenceLine,
  type AdpSourceId,
} from "@/lib/players/adpSources"

export type MockLatestPick = {
  overall: number
  teamIndex: number
  player: Player
}

type MockDraftViewProps = {
  adpSource?: AdpSourceId
  isAdvancing: boolean
  isPlayersLoading?: boolean
  isSavingPick: boolean
  isSimulating?: boolean
  latestPick: MockLatestPick | null
  mockBoard: DraftBoard
  mockResult: SimulationResult | null
  onAdpSourceChange: (source: AdpSourceId) => void
  onMarkPicked: (playerId: string) => void
  onReset: () => void
  onSlotChange: (slot: number) => void
  onTeamsChange: (teams: number) => void
  perspectiveTeamIndex: number
  players: Player[]
  state: LeagueState
}

export const MockDraftView = ({
  adpSource = DEFAULT_ADP_SOURCE,
  isAdvancing,
  isPlayersLoading = false,
  isSavingPick,
  isSimulating = false,
  latestPick,
  mockBoard,
  mockResult,
  onAdpSourceChange,
  onMarkPicked,
  onReset,
  onSlotChange,
  onTeamsChange,
  perspectiveTeamIndex,
  players,
  state,
}: MockDraftViewProps) => {
  const teams = state.settings.teams
  const mockState: LeagueState = {
    ...state,
    board: mockBoard,
    perspectiveTeamIndex,
    players,
    source: "manual",
  }
  const userTurn = isUserTurn(mockBoard, perspectiveTeamIndex, teams)
  const pickedPlayerIds = mockBoard.picks.flatMap((pick) =>
    pick.playerId ? [pick.playerId] : [],
  )
  const draftComplete =
    mockBoard.currentOverall > teams * state.settings.rounds ||
    mockBoard.picks.every((pick) => pick.playerId !== null)
  const busy = isSavingPick || isAdvancing || isPlayersLoading
  const slotOptions = Array.from({ length: teams }, (_, index) => index + 1)

  const handleTeamsChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTeams = Number(event.target.value)
    if (!Number.isInteger(nextTeams) || !ESPN_TEAM_COUNTS.includes(nextTeams)) {
      return
    }
    onTeamsChange(nextTeams)
  }

  const handleSlotChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const slot = Number(event.target.value)
    if (!Number.isInteger(slot) || slot < 1 || slot > teams) {
      return
    }
    onSlotChange(slot)
  }

  const handleAdpSourceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onAdpSourceChange(event.target.value as AdpSourceId)
  }

  const handleRandomSlot = () => {
    if (slotOptions.length === 0) return

    const currentSlot = perspectiveTeamIndex + 1
    if (slotOptions.length === 1) {
      onSlotChange(slotOptions[0])
      return
    }

    let nextSlot =
      slotOptions[Math.floor(Math.random() * slotOptions.length)] ?? currentSlot
    for (let attempt = 0; attempt < 8 && nextSlot === currentSlot; attempt += 1) {
      nextSlot =
        slotOptions[Math.floor(Math.random() * slotOptions.length)] ?? currentSlot
    }
    onSlotChange(nextSlot)
  }

  return (
    <div>
      {latestPick ? (
        <div
          aria-live="polite"
          className="mb-3 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-soft-cloud)] px-4 py-3"
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
            {latestPick.player.positions.join("/")} ·{" "}
            {formatAdpReferenceLine(latestPick.player, adpSource)}
          </p>
        </div>
      ) : null}

      <div className="mb-4">
        <RecPanel
          emptyMessage={
            draftComplete
              ? "Draft complete."
              : busy
                ? "Opponents are picking…"
                : "Waiting for recommendations…"
          }
          isSimulating={isSimulating && userTurn && !draftComplete}
          layout="row"
          maxNextPicks={3}
          players={players}
          result={mockResult}
          showCategoryOutlook={false}
        />
      </div>

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
            <span className="tracking-[0.12em] uppercase">ADP source</span>
            <select
              aria-label="ADP source"
              className="h-9 min-w-[9rem] rounded-xl border border-[var(--color-hairline)] bg-white px-3 text-sm text-[var(--color-ink)]"
              disabled={busy}
              onChange={handleAdpSourceChange}
              value={adpSource}
            >
              {ADP_SOURCE_IDS.map((id) => (
                <option key={id} value={id}>
                  {ADP_SOURCES[id].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-mute)]">
            <span className="tracking-[0.12em] uppercase">Teams</span>
            <select
              aria-label="Number of teams"
              className="h-9 min-w-[7rem] rounded-xl border border-[var(--color-hairline)] bg-white px-3 text-sm text-[var(--color-ink)]"
              disabled={busy}
              onChange={handleTeamsChange}
              value={teams}
            >
              {ESPN_TEAM_COUNTS.map((teamCount) => (
                <option key={teamCount} value={teamCount}>
                  {teamCount} teams
                </option>
              ))}
            </select>
          </label>
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
            aria-label="Random pick slot"
            className="h-9 px-4 text-sm"
            disabled={busy || slotOptions.length < 2}
            onClick={handleRandomSlot}
            type="button"
            variant="secondary"
          >
            Random slot
          </Button>
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
          adpSource={adpSource}
          compact
          disabled={busy || !userTurn || draftComplete}
          onMarkPicked={onMarkPicked}
          pickedPlayerIds={pickedPlayerIds}
          players={players}
        />
        <BoardGrid label="Mock draft" state={mockState} />
      </div>
      <MockDraftAnalysis
        isAdvancing={isAdvancing}
        mockBoard={mockBoard}
        perspectiveTeamIndex={perspectiveTeamIndex}
        players={players}
        teams={teams}
      />
    </div>
  )
}
