import { db } from "@/lib/db"
import {
  CONNECT_SESSION_TTL_MS,
  type EspnConnectStatus,
  isTerminalConnectStatus,
} from "@/lib/espn/connectTypes"

export type EspnConnectSessionRecord = {
  id: string
  clerkUserId: string
  status: EspnConnectStatus
  errorCode: string | null
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

export class ConnectSessionConflictError extends Error {
  name = "ConnectSessionConflictError"

  constructor() {
    super("An active connect session already exists for this user")
  }
}

export {
  CONNECT_SESSION_TTL_MS,
  isTerminalConnectStatus,
} from "@/lib/espn/connectTypes"

type EspnConnectSessionRow = {
  id: string
  clerkUserId: string
  status: string
  errorCode: string | null
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const mapRowToRecord = (
  row: EspnConnectSessionRow,
): EspnConnectSessionRecord => ({
  id: row.id,
  clerkUserId: row.clerkUserId,
  status: row.status as EspnConnectStatus,
  errorCode: row.errorCode,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const createConnectSession = async (
  clerkUserId: string,
): Promise<EspnConnectSessionRecord> => {
  const existing = await db.espnConnectSession.findMany({
    where: { clerkUserId },
  })

  for (const session of existing) {
    const record = mapRowToRecord(session)
    if (!isTerminalConnectStatus(record.status)) {
      const updated = await expireConnectSessionIfNeeded(record)
      if (!isTerminalConnectStatus(updated.status)) {
        throw new ConnectSessionConflictError()
      }
    }
  }

  const row = await db.espnConnectSession.create({
    data: {
      clerkUserId,
      status: "pending",
      expiresAt: new Date(Date.now() + CONNECT_SESSION_TTL_MS),
    },
  })

  return mapRowToRecord(row)
}

export const getConnectSessionForUser = async (
  sessionId: string,
  clerkUserId: string,
): Promise<EspnConnectSessionRecord | null> => {
  const row = await db.espnConnectSession.findFirst({
    where: { id: sessionId, clerkUserId },
  })

  if (!row) return null

  return mapRowToRecord(row)
}

export const updateConnectSessionStatus = async (
  sessionId: string,
  status: EspnConnectStatus,
  errorCode?: string | null,
): Promise<EspnConnectSessionRecord> => {
  const row = await db.espnConnectSession.update({
    where: { id: sessionId },
    data: {
      status,
      ...(errorCode !== undefined ? { errorCode } : {}),
    },
  })

  return mapRowToRecord(row)
}

export const expireConnectSessionIfNeeded = async (
  session: EspnConnectSessionRecord,
): Promise<EspnConnectSessionRecord> => {
  const isActive =
    session.status === "pending" || session.status === "awaiting_login"

  if (!isActive || session.expiresAt.getTime() > Date.now()) {
    return session
  }

  return updateConnectSessionStatus(session.id, "timed_out")
}
