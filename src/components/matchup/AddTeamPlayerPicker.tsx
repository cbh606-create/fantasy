import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { SeasonPlayer } from "@/lib/season/types"

export const groupAddCandidatesByTeam = (
  players: readonly SeasonPlayer[],
): Array<{ team: string; players: SeasonPlayer[] }> => {
  const byTeam = new Map<string, SeasonPlayer[]>()
  for (const player of players) {
    const team = player.teamAbbr?.trim() || "FA"
    const list = byTeam.get(team) ?? []
    list.push(player)
    byTeam.set(team, list)
  }
  for (const list of byTeam.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name))
  }
  return [...byTeam.entries()]
    .sort(([left], [right]) => {
      if (left === "FA") return 1
      if (right === "FA") return -1
      return left.localeCompare(right)
    })
    .map(([team, teamPlayers]) => ({ team, players: teamPlayers }))
}

type AddTeamPlayerPickerProps = {
  ariaLabel: string
  title?: string
  value: string
  valueLabel: string
  loadCandidates: () => SeasonPlayer[]
  onSelect: (playerId: string) => boolean
  selectEpoch?: number
}

type MenuCoords = {
  top: number
  left: number
}

const MENU_WIDTH_PX = 240
const MENU_MAX_HEIGHT_PX = 288
const MENU_GAP_PX = 4

const menuItemClass =
  "block w-full rounded-md px-1.5 py-1 text-left text-[0.75rem] font-medium text-[var(--color-ink)] hover:bg-[var(--color-soft-cloud)] focus-visible:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"

const menuCoordsFor = (trigger: HTMLElement): MenuCoords => {
  const rect = trigger.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP_PX
  const openUp = spaceBelow < MENU_MAX_HEIGHT_PX && rect.top > spaceBelow
  const top = openUp
    ? Math.max(8, rect.top - MENU_MAX_HEIGHT_PX - MENU_GAP_PX)
    : rect.bottom + MENU_GAP_PX
  const left = Math.min(
    Math.max(8, rect.left),
    Math.max(8, window.innerWidth - MENU_WIDTH_PX - 8),
  )
  return { top, left }
}

export const AddTeamPlayerPicker = ({
  ariaLabel,
  title,
  value,
  valueLabel,
  loadCandidates,
  onSelect,
  selectEpoch = 0,
}: AddTeamPlayerPickerProps) => {
  const [open, setOpen] = useState(false)
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<SeasonPlayer[] | null>(null)
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const playersId = useId()

  useEffect(() => {
    setOpen(false)
    setHoveredTeam(null)
    setCandidates(null)
    setMenuCoords(null)
  }, [value, selectEpoch])

  useLayoutEffect(() => {
    if (!open) {
      setMenuCoords(null)
      return
    }
    const updateCoords = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      setMenuCoords(menuCoordsFor(trigger))
    }
    updateCoords()
    window.addEventListener("resize", updateCoords)
    window.addEventListener("scroll", updateCoords, true)
    return () => {
      window.removeEventListener("resize", updateCoords)
      window.removeEventListener("scroll", updateCoords, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
      setHoveredTeam(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        setHoveredTeam(null)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  const ensureCandidates = () => {
    setCandidates((current) => current ?? loadCandidates())
  }

  const handleOpen = () => {
    ensureCandidates()
    setOpen(true)
  }

  const teams = candidates ? groupAddCandidatesByTeam(candidates) : []
  const hoveredPlayers =
    hoveredTeam == null
      ? []
      : (teams.find((entry) => entry.team === hoveredTeam)?.players ?? [])

  const handlePick = (playerId: string) => {
    const applied = onSelect(playerId)
    if (!applied) return
    setOpen(false)
    setHoveredTeam(null)
  }

  const menu =
    open && menuCoords ? (
      <div
        className="fixed z-[80] flex max-h-72 overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-white text-left shadow-md"
        id={listboxId}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        ref={menuRef}
        role="listbox"
        style={{ top: menuCoords.top, left: menuCoords.left }}
      >
        <div
          aria-label="Teams"
          className="max-h-72 w-20 shrink-0 overflow-y-auto border-r border-[var(--color-hairline)] p-1.5"
        >
          {teams.map(({ team }) => (
            <button
              aria-label={`Team ${team}`}
              className={`${menuItemClass}${
                hoveredTeam === team ? " bg-[var(--color-soft-cloud)]" : ""
              }`}
              key={team}
              onFocus={() => setHoveredTeam(team)}
              onMouseEnter={() => setHoveredTeam(team)}
              type="button"
            >
              {team}
            </button>
          ))}
          {teams.length === 0 ? (
            <p className="px-1.5 py-1 text-[0.7rem] text-[var(--color-mute)]">
              No adds
            </p>
          ) : null}
        </div>
        <div
          aria-label={hoveredTeam ? `${hoveredTeam} players` : "Players"}
          className="max-h-72 w-40 overflow-y-auto p-1.5"
          id={playersId}
        >
          {hoveredTeam == null ? (
            <p className="px-1.5 py-1 text-[0.7rem] text-[var(--color-mute)]">
              Hover a team
            </p>
          ) : (
            hoveredPlayers.map((player) => (
              <button
                aria-label={`Add ${player.name}`}
                className={menuItemClass}
                key={player.id}
                onClick={(event) => {
                  event.stopPropagation()
                  handlePick(player.id)
                }}
                role="option"
                type="button"
              >
                {player.name}
              </button>
            ))
          )}
        </div>
      </div>
    ) : null

  return (
    <div className="relative inline-block max-w-full" ref={rootRef}>
      <button
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="w-full max-w-full truncate rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-1 py-0.5 text-left text-[0.75rem] text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
        onClick={(event) => {
          event.stopPropagation()
          if (open) {
            setOpen(false)
            setHoveredTeam(null)
            return
          }
          handleOpen()
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault()
            handleOpen()
          }
        }}
        ref={triggerRef}
        role="combobox"
        title={title}
        type="button"
      >
        {valueLabel}
      </button>
      {typeof document !== "undefined" && menu
        ? createPortal(menu, document.body)
        : null}
      {value ? <span className="sr-only">{value}</span> : null}
    </div>
  )
}
