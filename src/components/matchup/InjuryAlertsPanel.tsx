import Link from "next/link"
import { useEffect, useState } from "react"
import type {
  InjuryPickupRecommendation,
  InjuryPickupsResult,
} from "@/lib/injuries/types"

type InjuryAlertsPanelProps = {
  leagueId: string
}

const urgencyLabel = (urgency: InjuryPickupRecommendation["urgency"]) =>
  urgency === "roster" ? "Roster" : "League"

export const InjuryAlertsPanel = ({ leagueId }: InjuryAlertsPanelProps) => {
  const [result, setResult] = useState<InjuryPickupsResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const loadAlerts = async () => {
      setIsLoading(true)

      try {
        const response = await fetch(
          `/api/injuries/pickups?seasonLeagueId=${leagueId}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          throw new Error("Unable to load injury alerts")
        }

        const payload = (await response.json()) as InjuryPickupsResult
        setResult(payload)
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return
        }

        setResult(null)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadAlerts()

    return () => controller.abort()
  }, [leagueId])

  const recommendations = result?.recommendations ?? []

  if (isLoading || !recommendations.length) return null

  return (
    <section>
      <h2 className="text-lg font-semibold">Injury alerts</h2>
      <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
        Roster replacements first — claim on Waivers
      </p>
      <ul
        aria-label="Injury alerts"
        className="mt-3 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]"
      >
        {recommendations.map((recommendation) => {
          const statusLabel = recommendation.status.toUpperCase()

          return (
            <li
              key={`${recommendation.injuredPlayerId}-${recommendation.addPlayerId}`}
            >
              <Link
                aria-label={`Add ${recommendation.addPlayerName}`}
                className="flex items-center justify-between gap-3 px-3 py-3 text-[0.8125rem] transition-colors hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                href={`/waivers/${leagueId}?addPlayerId=${recommendation.addPlayerId}`}
              >
                <span>
                  <span className="flex items-center gap-2">
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
                </span>
                <span aria-hidden="true" className="text-[var(--color-mute)]">
                  →
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
