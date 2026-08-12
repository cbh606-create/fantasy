import type { CategoryId } from "@/lib/domain/types"

export type WeeklyShooting = {
  FGM: number
  FGA: number
  FTM: number
  FTA: number
}

export type WeeklyPlayerStats = {
  projections: Record<CategoryId, number>
  shooting: WeeklyShooting
}
