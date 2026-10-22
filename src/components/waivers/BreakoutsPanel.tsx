"use client"

import { useEffect, useState } from "react"
import { PlayerAvatar } from "@/components/draft/PlayerAvatar"
import {
  formatBreakoutLast7,
  type BreakoutLast7,
} from "@/lib/injuries/breakout"
import type { SeasonPlayer } from "@/lib/season/types"

type BreakoutsPanelProps = {
  leagueId: string
  playersById: Record<string, SeasonPlayer>
  selectedAddId: string | null
  onSelectAdd: (playerId: string) => void
}

type BreakoutRow = {
  playerId: string
  last7?: BreakoutLast7 | null
}

export const BreakoutsPanel = ({
  leagueId,
  playersById,
  selectedAddId,
  onSelectAdd,
}: BreakoutsPanelProps) => {
  const [rows, setRows] = useState<BreakoutRow[]>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const loadBreakouts = async () => {
      setIsLoading(true)
      setError("")

      try {
        const response = await fetch(
          `/api/injuries/breakouts?seasonLeagueId=${leagueId}`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error("Unable to load breakouts")
        const payload = (await response.json()) as {
          recommendations?: BreakoutRow[]
        }
        setRows(payload.recommendations ?? [])
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return
        setRows([])
        setError("Unable to load breakouts")
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadBreakouts()
    return () => controller.abort()
  }, [leagueId])

  const visible = rows.flatMap((row) => {
    const player = playersById[row.playerId]
    if (!player) return []
    return [{ ...row, name: player.name }]
  })

  const handleSelectAdd = (playerId: string) => {
    onSelectAdd(playerId)
  }

  return (
    <section className="rounded-3xl bg-[var(--color-soft-cloud)] p-5">
      <p className="text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">Role</p>
      <h2 className="mt-1 text-lg font-semibold">Breakouts</h2>
      {isLoading ? (
        <p className="mt-4 text-sm text-[var(--color-mute)]" role="status">Loading breakouts…</p>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-[var(--color-sale)]" role="alert">{error}</p>
      ) : null}
      {!isLoading && !error && visible.length === 0 ? (
        <p className="mt-4 border-y border-[var(--color-hairline)] py-6 text-[0.8125rem] text-[var(--color-mute)]">
          No breakouts right now.
        </p>
      ) : null}
      {visible.length > 0 ? (
        <ul aria-label="Breakouts" className="mt-4 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]">
          {visible.map((row) => {
            const isSelected = selectedAddId === row.playerId
            const record = formatBreakoutLast7(row.last7 ?? null)
            return (
              <li key={row.playerId}>
                <button
                  aria-label={`${row.name}, ${record}`}
                  aria-pressed={isSelected}
                  className={`flex w-full flex-col px-3 py-3 text-left text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${isSelected ? "bg-white" : "hover:bg-white"}`}
                  onClick={() => handleSelectAdd(row.playerId)}
                  type="button"
                >
                  <span className="flex items-center gap-3">
                    <PlayerAvatar
                      nameShown
                      player={{ id: row.playerId, name: row.name }}
                      size="md"
                    />
                    <span className="truncate font-semibold">{row.name}</span>
                  </span>
                  <span className="mt-1 block whitespace-nowrap text-xs tabular-nums text-[var(--color-mute)]">{record}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
