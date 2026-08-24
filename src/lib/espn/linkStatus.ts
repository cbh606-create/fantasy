export type EspnLinkStatus =
  | "none"
  | "saved"
  | "checking"
  | "verified"
  | "expired"

export const espnLinkStatusLabel = (status: EspnLinkStatus): string => {
  switch (status) {
    case "none":
      return "Not connected"
    case "saved":
      return "Cookies saved (not verified yet)"
    case "checking":
      return "Checking ESPN…"
    case "verified":
      return "Verified with ESPN"
    case "expired":
      return "Cookies expired / rejected"
  }
}

export const espnLinkStatusTone = (
  status: EspnLinkStatus,
): "mute" | "ok" | "bad" | "info" => {
  switch (status) {
    case "verified":
      return "ok"
    case "expired":
      return "bad"
    case "checking":
      return "info"
    case "saved":
      return "info"
    case "none":
      return "mute"
  }
}
