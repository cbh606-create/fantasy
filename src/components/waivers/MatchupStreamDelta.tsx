import type { MatchupStreamPreviewResult } from "@/lib/waivers/matchupStreamTypes"

type MatchupStreamDeltaProps = {
  error: string
  isLoading: boolean
  preview: MatchupStreamPreviewResult | null
}

const recordLine = (preview: MatchupStreamPreviewResult) => {
  if (!preview.before || !preview.after) return null

  return `YOU ${preview.before.wins}–${preview.before.losses}–${preview.before.ties} → ${preview.after.wins}–${preview.after.losses}–${preview.after.ties}`
}

export const MatchupStreamDelta = ({
  error,
  isLoading,
  preview,
}: MatchupStreamDeltaProps) => {
  if (!isLoading && !error && !preview) return null

  const record = preview ? recordLine(preview) : null

  return (
    <aside
      aria-label="Matchup stream delta"
      className="rounded-3xl bg-[var(--color-soft-cloud)] p-5"
    >
      <p className="text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
        Live matchup
      </p>
      <h2 className="mt-1 text-lg font-semibold">Stream delta</h2>

      {isLoading ? (
        <p className="mt-3 text-sm text-[var(--color-mute)]" role="status">
          Updating matchup stream…
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-[var(--color-sale)]" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-3">
          <p className="text-[0.8125rem] font-medium">{preview.summary}</p>
          {record ? (
            <p className="mt-1 text-xs tabular-nums text-[var(--color-mute)]">
              {record}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--color-mute)]">
              Volume / needs — pick an opponent for H2H deltas
            </p>
          )}
        </div>
      ) : null}
    </aside>
  )
}
