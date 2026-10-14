type NamedValue = {
  id: string
  name: string
  value: number
}

export const PlayerValueNames = ({ players }: { players: NamedValue[] }) => (
  <>
    {players.map((player, index) => (
      <span key={player.id}>
        {index > 0 ? " + " : null}
        {player.name}
        <span className="ml-1 text-xs font-normal tabular-nums opacity-70">
          {player.value.toFixed(3)}
        </span>
      </span>
    ))}
  </>
)
