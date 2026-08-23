import { z } from "zod"
import {
  DEFAULT_TEAMS,
  ESPN_MAX_TEAMS,
  ESPN_MIN_TEAMS,
} from "@/lib/domain/leagueSize"

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
  adpBySource: z.record(z.string(), z.number()).optional(),
  espnId: z.string().optional(),
  status: z.enum(["active", "out", "gtd"]).optional(),
})

export const manualLeagueInputSchema = z
  .object({
    teams: z
      .number()
      .int()
      .min(ESPN_MIN_TEAMS)
      .max(ESPN_MAX_TEAMS)
      .default(DEFAULT_TEAMS),
    userPickSlot: z.number().int().min(1).max(ESPN_MAX_TEAMS),
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
  .superRefine((value, context) => {
    if (value.userPickSlot > value.teams) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "userPickSlot must be within teams",
        path: ["userPickSlot"],
      })
    }
  })

export type ManualLeagueInput = z.infer<typeof manualLeagueInputSchema>
