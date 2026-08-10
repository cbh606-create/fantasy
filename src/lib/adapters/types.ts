import { z } from "zod"

const categoryIdSchema = z.enum([
  "FG_PCT",
  "FT_PCT",
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "TO",
  "PTS",
])

const positionSchema = z.enum(["PG", "SG", "SF", "PF", "C"])

const categorySettingSchema = z.object({
  id: categoryIdSchema,
  enabled: z.boolean(),
  weight: z.number(),
})

export const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  positions: z.array(positionSchema),
  projections: z.record(categoryIdSchema, z.number()),
  adp: z.number(),
  espnId: z.string().optional(),
  status: z.enum(["active", "out", "gtd"]).optional(),
})

export const manualLeagueInputSchema = z.object({
  userPickSlot: z.number().int().min(1).max(12),
  categories: z.array(categorySettingSchema).optional(),
  puntCategoryIds: z.array(categoryIdSchema).optional(),
  focusCategoryIds: z.array(categoryIdSchema).optional(),
  rounds: z.number().int().min(1).default(13),
  players: z.array(playerSchema).optional(),
  playerPoolSource: z
    .enum(["stats_2025_26", "proj_2026_27", "sample"])
    .optional(),
  picks: z
    .array(
      z.object({
        overall: z.number().int().min(1),
        playerId: z.string(),
      }),
    )
    .optional(),
})

export type ManualLeagueInput = z.infer<typeof manualLeagueInputSchema>
