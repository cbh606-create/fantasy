import Link from "next/link"
import type { SeasonPlayer } from "@/lib/season/types"
import type { StreamerSuggestion } from "@/lib/matchup/types"

type StreamersPanelProps = {
  leagueId: string
  streamers: StreamerSuggestion[]
  playersById: Record<string, SeasonPlayer>
}

const playerName = (
  playerId: string,
  playersById: Record<string, SeasonPlayer>,
) => playersById[playerId]?.name ?? "Unknown player"

export const StreamersPanel = ({
  leagueId,
  streamers,
  playersById,
}: StreamersPanelProps) => (
  <section>
    <h2 className="text-lg font-semibold">Streamers</h2>
    {!streamers.length ? (
      <p className="mt-3 border-y border-[var(--color-hairline)] py-6 text-[0.8125rem] text-[var(--color-mute)]">
        No streamer targets this week.
      </p>
    ) : (
      <ul
        aria-label="Streamer recommendations"
        className="mt-3 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]"
      >
        {streamers.map((streamer) => {
          const name = playerName(streamer.playerId, playersById)

          return (
            <li key={streamer.playerId}>
              <Link
                className="flex items-center justify-between gap-3 px-3 py-3 text-[0.8125rem] transition-colors hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                href={`/waivers/${leagueId}?addPlayerId=${streamer.playerId}`}
              >
                <span>
                  <span className="block font-semibold">{name}</span>
                  <span className="mt-1 block text-xs text-[var(--color-info)]">
                    {streamer.reasons[0] ?? `${streamer.gamesThisWeek} games`}
                  </span>
                </span>
                <span aria-hidden="true" className="text-[var(--color-mute)]">
                  →
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    )}
  </section>
)
