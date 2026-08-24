import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import type {
  SimulationInput,
  SimulationResult,
} from "@/lib/domain/types"
import { rateLimit } from "@/lib/rateLimit"
import { runDraftSimulation } from "@/lib/sim/engine"
import { simulateBodySchema } from "@/lib/validation/simulate"

const SIMULATION_LIMIT = 40
const SIMULATION_WINDOW_MS = 60_000
const SLOW_SIMULATION_MS = 8_000

type SimulationRunner = (input: SimulationInput) => SimulationResult

export const runWithSimCountFallback = (
  input: SimulationInput,
  runSimulation: SimulationRunner = runDraftSimulation,
  now: () => number = Date.now,
): SimulationResult => {
  const startedAt = now()
  const result = runSimulation(input)

  if (now() - startedAt <= SLOW_SIMULATION_MS) {
    return result
  }

  return runSimulation({
    ...input,
    simCount: Math.max(1, Math.floor(input.simCount / 2)),
  })
}

const validationResponse = (issues: Array<{ path: PropertyKey[]; message: string }>) => {
  const fields: Record<string, string> = {}

  for (const issue of issues) {
    const field = issue.path.join(".") || "body"
    fields[field] ??= issue.message
  }

  return NextResponse.json({ error: "validation", fields }, { status: 400 })
}

export const POST = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limit = rateLimit(
    `simulate:${userId}`,
    SIMULATION_LIMIT,
    SIMULATION_WINDOW_MS,
  )

  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "retry-after": String(Math.ceil((limit.retryAfterMs ?? 0) / 1_000)),
        },
      },
    )
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return validationResponse([{ path: [], message: "Invalid JSON body" }])
  }

  const parsedBody = simulateBodySchema.safeParse(body)

  if (!parsedBody.success) {
    return validationResponse(parsedBody.error.issues)
  }

  return NextResponse.json(runWithSimCountFallback(parsedBody.data))
}
