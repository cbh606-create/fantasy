"use client"

import { PlayerAvatar } from "@/components/draft/PlayerAvatar"

export type SimulationRosterPlayer = {
  id: string
  name: string
}

export type SimulationRosterProps = {
  label: string
  players: SimulationRosterPlayer[]
  pressedIds: string[]
  onPress: (playerId: string) => void
  dropId?: string | null
  droppableIds?: string[]
  onDrop?: (playerId: string) => void
  teamOptions?: { teamIndex: number, name: string }[]
  teamIndex?: number | null
  onTeamChange?: (teamIndex: number) => void
}

const pressedClass = "bg-[var(--color-ink)] text-white"
const quietClass = "border border-[var(--color-hairline)]"

export const SimulationRoster = ({
  label,
  players,
  pressedIds,
  onPress,
  dropId = null,
  droppableIds = [],
  onDrop,
  teamOptions,
  teamIndex = null,
  onTeamChange,
}: SimulationRosterProps) => {
  const handleTeamChange = (value: string) => {
    if (!onTeamChange || value === "") return
    onTeamChange(Number(value))
  }

  return (
    <section className="flex min-h-0 flex-col">
      <h3 className="text-sm font-semibold">{label}</h3>
      {teamOptions ? (
        <select
          aria-label="Team"
          className="mt-2 rounded border border-[var(--color-hairline)] px-2 py-1 text-sm"
          onChange={(event) => handleTeamChange(event.target.value)}
          value={teamIndex ?? ""}
        >
          <option value="">Choose a team</option>
          {teamOptions.map((team) => (
            <option key={team.teamIndex} value={team.teamIndex}>
              {team.name}
            </option>
          ))}
        </select>
      ) : null}
      <div aria-label={label} className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" role="group">
        {players.map((player) => {
          const pressed = pressedIds.includes(player.id)
          const showDrop = droppableIds.includes(player.id) && !pressed

          return (
            <div className="flex items-center gap-1" key={player.id}>
              <button
                aria-pressed={pressed}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm ${pressed ? pressedClass : quietClass}`}
                onClick={() => onPress(player.id)}
                type="button"
              >
                <PlayerAvatar nameShown player={{ id: player.id, name: player.name }} size="sm" />
                <span className="truncate">{player.name}</span>
              </button>
              {showDrop ? (
                <button
                  aria-pressed={dropId === player.id}
                  className={`rounded px-2 py-1 text-xs ${dropId === player.id ? quietClass : "text-[var(--color-mute)]"}`}
                  onClick={() => onDrop?.(player.id)}
                  type="button"
                >
                  Drop
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
