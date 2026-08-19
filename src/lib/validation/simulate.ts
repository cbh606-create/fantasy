import { z } from "zod"
import {
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

const categorySettingSchema = z.object({
  id: categoryIdSchema,
  enabled: z.boolean(),
  weight: z.number(),
})

const leagueSettingsSchema = z.object({
  teams: z.number().int().min(ESPN_MIN_TEAMS).max(ESPN_MAX_TEAMS),
  draftType: z.literal("snake"),
  rosterSlots: z.array(
    z.enum(["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "BE"]),
  ),
  categories: z.array(categorySettingSchema),
  userPickSlot: z.number().int().min(1).max(ESPN_MAX_TEAMS),
  puntCategoryIds: z.array(categoryIdSchema),
  focusCategoryIds: z.array(categoryIdSchema),
  rounds: z.number().int().positive(),
})

const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  positions: z.array(z.enum(["PG", "SG", "SF", "PF", "C"])),
  projections: z.record(categoryIdSchema, z.number()),
  adp: z.number(),
  espnId: z.string().optional(),
  status: z.enum(["active", "out", "gtd"]).optional(),
})

const draftPickSchema = z.object({
  overall: z.number().int().positive(),
  round: z.number().int().positive(),
  teamIndex: z.number().int().min(0).max(ESPN_MAX_TEAMS - 1),
  playerId: z.string().min(1).nullable(),
})

const leagueStateSchema = z
  .object({
    settings: leagueSettingsSchema,
    board: z.object({
      picks: z.array(draftPickSchema),
      currentOverall: z.number().int().positive(),
    }),
    players: z.array(playerSchema),
    source: z.enum(["espn", "manual", "mixed"]),
    perspectiveTeamIndex: z.number().int().min(0).max(ESPN_MAX_TEAMS - 1),
  })
  .superRefine((value, context) => {
    if (value.settings.userPickSlot > value.settings.teams) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "userPickSlot must be within teams",
        path: ["settings", "userPickSlot"],
      })
    }
    if (value.perspectiveTeamIndex >= value.settings.teams) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "perspectiveTeamIndex must be within teams",
        path: ["perspectiveTeamIndex"],
      })
    }
  })

export const simulateBodySchema = z.object({
  state: leagueStateSchema,
  simCount: z.number().int().min(1).max(100).default(40),
  seed: z.number().int().default(() => Date.now() >>> 0),
  forcePickPlayerId: z.string().min(1).optional(),
  fastRecommendations: z.boolean().optional(),
})

export type SimulateBody = z.infer<typeof simulateBodySchema>
