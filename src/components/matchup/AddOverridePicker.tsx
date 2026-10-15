import type { SeasonPlayer } from "@/lib/season/types"

type AddOverridePickerProps = {
  alternatives: SeasonPlayer[]
  results: SeasonPlayer[]
  query: string
  error: string | null
  canRevert: boolean
  onQueryChange: (value: string) => void
  onPick: (playerId: string) => void
  onRevert: () => void
  onClose: () => void
}

const optionClass =
  "block w-full rounded-md px-1.5 py-1 text-left text-[0.75rem] font-medium text-[var(--color-ink)] hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"

export const AddOverridePicker = ({
  alternatives,
  results,
  query,
  error,
  canRevert,
  onQueryChange,
  onPick,
  onRevert,
  onClose,
}: AddOverridePickerProps) => {
  const shownIds = new Set(alternatives.map((player) => player.id))
  const filtered = results.filter((player) => !shownIds.has(player.id))

  return (
    <div
      aria-label="Replace add"
      className="max-h-72 w-56 overflow-y-auto rounded-xl border border-[var(--color-hairline)] bg-white p-2.5 text-left shadow-md"
      role="dialog"
    >
      {alternatives.map((player) => (
        <button
          className={optionClass}
          key={player.id}
          onClick={() => onPick(player.id)}
          type="button"
        >
          {player.name}
        </button>
      ))}
      <input
        aria-label="Search free agents"
        className="mt-1 w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-1.5 py-1 text-[0.75rem] text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
        onChange={(event) => onQueryChange(event.target.value)}
        value={query}
      />
      {filtered.map((player) => (
        <button
          className={optionClass}
          key={player.id}
          onClick={() => onPick(player.id)}
          type="button"
        >
          {player.name}
        </button>
      ))}
      {error ? (
        <p className="mt-1 text-[0.7rem] leading-snug text-[var(--color-mute)]">
          {error}
        </p>
      ) : null}
      {canRevert ? (
        <button className={optionClass} onClick={onRevert} type="button">
          Use recommendation
        </button>
      ) : null}
      <button
        aria-label="Close"
        className={optionClass}
        onClick={onClose}
        type="button"
      >
        Close
      </button>
    </div>
  )
}
