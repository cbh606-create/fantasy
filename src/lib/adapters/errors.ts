export type EspnErrorCode =
  | "ESPN_AUTH"
  | "ESPN_TIMEOUT"
  | "ESPN_UNAVAILABLE"
  | "ESPN_PARTIAL"

export class EspnAdapterError extends Error {
  readonly code: EspnErrorCode

  constructor(code: EspnErrorCode) {
    super(`ESPN adapter failed: ${code}`)
    this.name = "EspnAdapterError"
    this.code = code
  }
}
