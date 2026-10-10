export type EspnConnectStatus =
  | "pending"
  | "awaiting_login"
  | "succeeded"
  | "timed_out"
  | "failed"
  | "cancelled"

export const CONNECT_SESSION_TTL_MS = 10 * 60 * 1000

export const isTerminalConnectStatus = (
  status: EspnConnectStatus,
): boolean =>
  status === "succeeded" ||
  status === "timed_out" ||
  status === "failed" ||
  status === "cancelled"
