import { describe, expect, it } from "vitest"
import { buildCrosswalk, canonicalTeam, normalizePersonName } from "@/lib/injuries/crosswalk"

describe("crosswalk names", () => {
  it("normalizes punctuation, case, and suffixes", () => {
    expect(normalizePersonName("Gary Trent Jr.")).toBe("gary trent")
    expect(canonicalTeam("pho")).toBe("PHX")
  })
})

describe("buildCrosswalk", () => {
  it("maps one RotoWire id to one ESPN id by name and team", () => {
    const map = buildCrosswalk(
      [{ id: "espn-naw", name: "Nickeil Alexander-Walker", teamAbbr: "PHX" }],
      [{ id: "4765", firstName: "Nickeil", lastName: "Alexander-Walker", teamAbbr: "PHO" }],
    )

    expect(map.get("4765")).toBe("espn-naw")
  })

  it("stores neither id when two ESPN players share a name and team", () => {
    const map = buildCrosswalk(
      [
        { id: "espn-a", name: "Chris Johnson", teamAbbr: "ATL" },
        { id: "espn-b", name: "Chris Johnson", teamAbbr: "ATL" },
      ],
      [{ id: "rw-1", firstName: "Chris", lastName: "Johnson", teamAbbr: "ATL" }],
    )

    expect(map.has("rw-1")).toBe(false)
  })

  it("adds an alias only for an id the names did not map", () => {
    const map = buildCrosswalk(
      [{ id: "espn-nic", name: "Nic Claxton", teamAbbr: "BKN" }],
      [{ id: "rw-nic", firstName: "Nicolas", lastName: "Claxton", teamAbbr: "BKN" }],
      [{ rotowireId: "rw-nic", espnId: "espn-nic" }],
    )

    expect(map.get("rw-nic")).toBe("espn-nic")
  })
})
