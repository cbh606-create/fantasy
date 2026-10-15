"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

type PickupPlayer = {
  id: string
  name: string
}

type PickupTeamGroup = {
  team: string
  players: PickupPlayer[]
}

type TeamPickupMenuProps = {
  groups: PickupTeamGroup[]
  onSelect: (playerId: string) => void
  selectedPlayerName: string | null
}

export const TeamPickupMenu = ({
  groups,
  onSelect,
  selectedPlayerName,
}: TeamPickupMenuProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTeam, setActiveTeam] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const teamButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const playerButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()
  const activeGroup = groups.find((group) => group.team === activeTeam) ?? null

  const closeMenu = () => {
    setIsOpen(false)
    setActiveTeam(null)
  }

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  const focusTeam = (index: number) => {
    if (!groups.length) return
    const next = (index + groups.length) % groups.length
    const team = groups[next]?.team ?? null
    setActiveTeam(team)
    teamButtonRefs.current[next]?.focus()
  }

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    setIsOpen(true)
    const index = event.key === "ArrowUp" ? groups.length - 1 : 0
    requestAnimationFrame(() => focusTeam(index))
  }

  const handleTeamKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      focusTeam(index + 1)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      focusTeam(index - 1)
      return
    }
    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault()
      const team = groups[index]?.team
      if (!team) return
      setActiveTeam(team)
      requestAnimationFrame(() => playerButtonRefs.current[0]?.focus())
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      closeMenu()
    }
  }

  const handlePlayerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
    playerId: string,
  ) => {
    const players = activeGroup?.players ?? []
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!players.length) return
      const delta = event.key === "ArrowDown" ? 1 : -1
      const next = (index + delta + players.length) % players.length
      playerButtonRefs.current[next]?.focus()
      return
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      const teamIndex = groups.findIndex((group) => group.team === activeTeam)
      teamButtonRefs.current[teamIndex]?.focus()
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      onSelect(playerId)
      closeMenu()
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      const teamIndex = groups.findIndex((group) => group.team === activeTeam)
      setActiveTeam(null)
      teamButtonRefs.current[teamIndex]?.focus()
    }
  }

  const handleSelectPlayer = (playerId: string) => {
    onSelect(playerId)
    closeMenu()
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-hairline)] bg-white px-4 py-2.5 text-left text-[0.8125rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
        id="add-player"
        onClick={() => {
          if (isOpen) closeMenu()
          else setIsOpen(true)
        }}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        <span>{selectedPlayerName ?? "Select a pickup"}</span>
        <span aria-hidden="true" className="text-[var(--color-mute)]">
          ▾
        </span>
      </button>
      {isOpen ? (
        <div className="absolute z-20 mt-1 flex items-start" id={menuId}>
          <ul
            aria-label="Teams"
            className="max-h-72 w-36 overflow-y-auto rounded-2xl border border-[var(--color-hairline)] bg-white py-1 shadow-lg"
            role="menu"
          >
            {groups.map((group, index) => (
              <li key={group.team} role="none">
                <button
                  aria-expanded={activeTeam === group.team}
                  aria-haspopup="menu"
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-[0.8125rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                    activeTeam === group.team ? "bg-[var(--color-soft-cloud)]" : "hover:bg-[var(--color-soft-cloud)]"
                  }`}
                  onClick={() => setActiveTeam(group.team)}
                  onKeyDown={(event) => handleTeamKeyDown(event, index)}
                  onMouseEnter={() => setActiveTeam(group.team)}
                  ref={(node) => {
                    teamButtonRefs.current[index] = node
                  }}
                  role="menuitem"
                  tabIndex={0}
                  type="button"
                >
                  <span>{group.team}</span>
                  <span aria-hidden="true" className="text-[var(--color-mute)]">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {activeGroup ? (
            <ul
              aria-label={`${activeGroup.team} players`}
              className="ml-1 max-h-72 min-w-56 overflow-y-auto rounded-2xl border border-[var(--color-hairline)] bg-white py-1 shadow-lg"
              role="menu"
            >
              {activeGroup.players.map((player, index) => (
                <li key={player.id} role="none">
                  <button
                    className="w-full px-4 py-2 text-left text-[0.8125rem] hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                    onClick={() => handleSelectPlayer(player.id)}
                    onKeyDown={(event) => handlePlayerKeyDown(event, index, player.id)}
                    ref={(node) => {
                      playerButtonRefs.current[index] = node
                    }}
                    role="menuitem"
                    tabIndex={0}
                    type="button"
                  >
                    {player.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
