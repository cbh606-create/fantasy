import type { SeasonPosition, SeasonSlot } from "@/lib/season/types"

/** Default eligibility when ESPN/fixture did not supply positions. */
export const defaultPositionsForSlot = (slot: SeasonSlot): SeasonPosition[] => {
  switch (slot) {
    case "PG":
      return ["PG", "G"]
    case "SG":
      return ["SG", "G"]
    case "SF":
      return ["SF", "F"]
    case "PF":
      return ["PF", "F"]
    case "C":
      return ["C"]
    case "G":
      return ["PG", "SG", "G"]
    case "F":
      return ["SF", "PF", "F"]
    case "UTIL":
    case "BE":
    case "IL":
      return ["PG", "SG", "SF", "PF", "C", "G", "F"]
  }
}
