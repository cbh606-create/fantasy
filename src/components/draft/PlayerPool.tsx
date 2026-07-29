"use client"

import { useState } from "react"
import { Button } from "@/components/ui/Button"
import { SearchPill } from "@/components/ui/SearchPill"
import type { Player } from "@/lib/domain/types"

type PlayerPoolProps = {
  disabled?: boolean
  onMarkPicked: (playerId: string) => void
  pickedPlayerIds: string[]
  players: Player[]
}

export const PlayerPool = ({
  disabled = false,
  onMarkPicked,
  pickedPlayerIds,
  players,
}: PlayerPoolProps) => {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const availablePlayers = players
    .filter((player) => !pickedPlayerIds.includes(player.id))
    .filter((player) =>
      normalizedQuery
        ? player.name.toLowerCase().includes(normalizedQuery)
        : true,
    )
    .slice(0, 20)

  return (
    <aside className="rounded-[2rem] bg-[var(--color-soft-cloud)] p-5">
      <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
        Manual update
      </p>
      <h2 className="mt-2 text-2xl font-semibold">Player pool</h2>
      <SearchPill
        aria-label="Search players"
        className="mt-5 bg-white"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search available players"
        value={query}
      />
      {availablePlayers.length ? (
        <ul className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto">
          {availablePlayers.map((player) => (
            <li
              className="rounded-2xl bg-white p-3"
              key={player.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{player.name}</p>
                  <p className="mt-1 text-xs text-[var(--color-mute)]">
                    {player.positions.join("/")} · ADP {player.adp}
                  </p>
                </div>
                <Button
                  aria-label={`Mark ${player.name} picked`}
                  className="h-9 shrink-0 px-4 text-sm"
                  disabled={disabled}
                  onClick={() => onMarkPicked(player.id)}
                  variant="secondary"
                >
                  Picked
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-[var(--color-mute)]">
          No available players match your search.
        </p>
      )}
    </aside>
  )
}
