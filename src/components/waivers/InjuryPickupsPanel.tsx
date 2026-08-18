import { useEffect, useState } from "react"
import type {
  InjuryPickupRecommendation,
  InjuryPickupsResult,
} from "@/lib/injuries/types"

type InjuryPickupsPanelProps = {
  leagueId: string
  onSelectAdd: (playerId: string) => void
  selectedAddId: string | null
}

const urgencyLabel = (urgency: InjuryPickupRecommendation["urgency"]) =>
  urgency === "roster" ? "Roster" : "League"

export const InjuryPickupsPanel = ({
  leagueId,
  onSelectAdd,
  selectedAddId,
}: InjuryPickupsPanelProps) => {
  const [result, setResult] = useState<InjuryPickupsResult | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const loadPickups = async () => {
      setIsLoading(true)
      setError("")

      try {
        const response = await fetch(
          `/api/injuries/pickups?seasonLeagueId=${leagueId}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          throw new Error("Unable to load injury pickups")
        }

        const payload = (await response.json()) as InjuryPickupsResult
        setResult(payload)
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return
        }

        setResult(null)
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load injury pickups",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadPickups()

    return () => controller.abort()
  }, [leagueId])

  const handleSelectAdd = (playerId: string) => {
    onSelectAdd(playerId)
  }

  const recommendations = result?.recommendations ?? []

  return (
    <section className="rounded-3xl bg-[var(--color-soft-cloud)] p-5">
      <p className="text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
        Replacement
      </p>
      <h2 className="mt-1 text-lg font-semibold">Injury pickups</h2>
      <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
        Depth-chart backups for OUT / GTD — distinct from season needs
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm text-[var(--color-mute)]" role="status">
          Loading injury pickups…
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-[var(--color-sale)]" role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && !recommendations.length ? (
        <p className="mt-4 border-y border-[var(--color-hairline)] py-6 text-[0.8125rem] text-[var(--color-mute)]">
          No injury-driven pickups right now.
        </p>
      ) : null}

      {recommendations.length ? (
        <ul
          aria-label="Injury pickups"
          className="mt-4 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]"
        >
          {recommendations.map((recommendation) => {
            const isSelected = selectedAddId === recommendation.addPlayerId
            const statusLabel = recommendation.status.toUpperCase()

            return (
              <li key={`${recommendation.injuredPlayerId}-${recommendation.addPlayerId}`}>
                <button
                  aria-label={`Add ${recommendation.addPlayerName}`}
                  aria-pressed={isSelected}
                  className={`w-full px-3 py-3 text-left text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                    isSelected ? "bg-white" : "hover:bg-white"
                  }`}
                  onClick={() => handleSelectAdd(recommendation.addPlayerId)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {recommendation.injuredPlayerName} ({statusLabel}) →{" "}
                      {recommendation.addPlayerName}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                        recommendation.urgency === "roster"
                          ? "border-[var(--color-sale)] text-[var(--color-sale)]"
                          : "border-[var(--color-hairline)]"
                      }`}
                    >
                      {urgencyLabel(recommendation.urgency)}
                    </span>
                  </span>
                  {recommendation.reasons.map((reason) => (
                    <span
                      className="mt-1 block text-xs text-[var(--color-info)]"
                      key={reason}
                    >
                      {reason}
                    </span>
                  ))}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
