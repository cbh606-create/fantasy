/** ESPN Fantasy Basketball league size bounds (LM leagues). */
export const ESPN_MIN_TEAMS = 4
export const ESPN_MAX_TEAMS = 20
export const DEFAULT_TEAMS = 12

export const ESPN_TEAM_COUNTS = Array.from(
  { length: ESPN_MAX_TEAMS - ESPN_MIN_TEAMS + 1 },
  (_, index) => ESPN_MIN_TEAMS + index,
)
