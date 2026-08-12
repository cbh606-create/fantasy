import type { SeasonPlayer } from "@/lib/season/types"
import type { PickupRecommendation } from "@/lib/waivers/types"

type RecommendedPickupsProps = {
  recommendations: PickupRecommendation[]
  playersById: Record<string, SeasonPlayer>
  selectedAddId: string | null
  onSelectAdd: (playerId: string) => void
}

const playerName = (
  playerId: string,
  playersById: Record<string, SeasonPlayer>,
) => playersById[playerId]?.name ?? "Unknown player"

export const RecommendedPickups = ({
  recommendations,
  playersById,
  selectedAddId,
  onSelectAdd,
}: RecommendedPickupsProps) => {
  if (!recommendations.length) {
    return (
      <p className="border-y border-[var(--color-hairline)] py-6 text-sm text-[var(--color-mute)]">
        No recommended pickups for your current needs.
      </p>
    )
  }

  return (
    <ul
      aria-label="Recommended pickups"
      className="divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]"
    >
      {recommendations.map((recommendation) => {
        const name = playerName(recommendation.playerId, playersById)
        const availability =
          playersById[recommendation.playerId]?.availability ?? "fa"

        return (
          <li key={recommendation.playerId}>
            <button
              aria-label={`Add ${name}`}
              aria-pressed={selectedAddId === recommendation.playerId}
              className={`w-full px-3 py-3 text-left text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                selectedAddId === recommendation.playerId
                  ? "bg-[var(--color-soft-cloud)]"
                  : "hover:bg-[var(--color-soft-cloud)]"
              }`}
              onClick={() => onSelectAdd(recommendation.playerId)}
              type="button"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold">{name}</span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                    availability === "fa"
                      ? "border-[var(--color-info)] text-[var(--color-info)]"
                      : "border-[var(--color-hairline)]"
                  }`}
                >
                  {availability === "fa" ? "FA" : "Waiver"}
                </span>
              </span>
              <span className="mt-1 block text-xs text-[var(--color-info)]">
                {recommendation.reasons[0] ?? "Available pickup"}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
