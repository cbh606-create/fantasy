type AvailablePlayerSummary = {
  id: string
  name: string
  teamAbbr?: string
  availability: "fa" | "waiver"
}

type AvailablePoolTableProps = {
  available: AvailablePlayerSummary[]
  selectedAddId: string | null
  onSelectAdd: (playerId: string) => void
}

const availabilityLabel = (availability: AvailablePlayerSummary["availability"]) =>
  availability === "fa" ? "FA" : "Waiver"

export const AvailablePoolTable = ({
  available,
  selectedAddId,
  onSelectAdd,
}: AvailablePoolTableProps) => {
  if (!available.length) {
    return (
      <p className="border-y border-[var(--color-hairline)] py-6 text-sm text-[var(--color-mute)]">
        No players available in the pool.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto border-y border-[var(--color-hairline)]">
      <table className="w-full text-left text-[0.8125rem]">
        <caption className="sr-only">Available players</caption>
        <thead>
          <tr className="border-b border-[var(--color-hairline)] text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
            <th className="px-3 py-2 font-medium" scope="col">
              Player
            </th>
            <th className="px-3 py-2 font-medium" scope="col">
              Team
            </th>
            <th className="px-3 py-2 font-medium" scope="col">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-hairline)]">
          {available.map((player) => {
            const isSelected = selectedAddId === player.id

            return (
              <tr
                className={
                  isSelected ? "bg-[var(--color-soft-cloud)]" : "hover:bg-[var(--color-soft-cloud)]"
                }
                key={player.id}
              >
                <td className="px-3 py-2">
                  <button
                    aria-label={`Select ${player.name}`}
                    aria-pressed={isSelected}
                    className="w-full text-left font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                    onClick={() => onSelectAdd(player.id)}
                    type="button"
                  >
                    {player.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-[var(--color-mute)]">
                  {player.teamAbbr ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      player.availability === "fa"
                        ? "border-[var(--color-info)] text-[var(--color-info)]"
                        : "border-[var(--color-hairline)]"
                    }`}
                  >
                    {availabilityLabel(player.availability)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
