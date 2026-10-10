import type { ChangeEvent } from "react"

type OpponentTeam = {
  teamIndex: number
  name: string
}

type OpponentPickerProps = {
  teams: OpponentTeam[]
  perspectiveTeamIndex: number
  opponentTeamIndex: number
  onChange: (teamIndex: number) => void
}

export const OpponentPicker = ({
  teams,
  perspectiveTeamIndex,
  opponentTeamIndex,
  onChange,
}: OpponentPickerProps) => {
  const opponents = teams.filter(
    (team) => team.teamIndex !== perspectiveTeamIndex,
  )

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(Number.parseInt(event.target.value, 10))
  }

  return (
    <label className="flex flex-col gap-1.5 text-[0.8125rem]">
      <span className="text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
        Opponent
      </span>
      <select
        aria-label="Matchup opponent"
        className="rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2 text-[0.8125rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
        onChange={handleChange}
        value={opponentTeamIndex}
      >
        {opponents.map((team) => (
          <option key={team.teamIndex} value={team.teamIndex}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  )
}
