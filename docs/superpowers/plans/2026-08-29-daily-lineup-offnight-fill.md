# Daily Lineup Off-Night Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After seating that day’s starts, fill leftover empty actives with off-night roster players (prefer home) so thin nights stay compact; Sit and plan-drops still go to BE.

**Architecture:** In `buildLineupDisplayRows` focus branch, after Pass 1, restore an off-night-only pass (`gameWeightForTeamDate === 0`, prefer home then first empty eligible active). Do not restore Sit-into-hole or PV-into-active. Leftover has-game ids still go to BE (grow if needed).

**Tech Stack:** TypeScript, Vitest, existing `eligibleForSlot` / `gameWeightForTeamDate`.

## Global Constraints

- Pass 1 unchanged: `daily[focusDay]` starts in engine slots; never displaced by an off-night
- Empty active after starts: off-night roster only; prefer weekly home if empty and eligible; else first empty eligible active
- Sit / plan-drop (has game, not started): BE only; may grow BE
- Unstarted preview: `PV` under IL; started preview: engine slot
- Off-night fills are display-only; not written to `DailyLineups`
- `togglePlayerDay` unchanged; no auto-start
- Missing focus inputs → home-row builder
- Slot order: PG → last UTIL, then BE, then IL, then leftover PV

---

## File map

| File | Role |
| --- | --- |
| `src/lib/matchup/dailyLineups.ts` | Off-night pass after starts in `buildLineupDisplayRows` |
| `tests/unit/matchupDailyLineups.test.ts` | Spec §5 focus-day cases |

`LineupDisplayFocus` and `buildLineupDisplayRows` signatures stay the same. Panel chrome unchanged unless a seating assertion breaks (then update that assertion only).

Monday fixture games: BOS, MIA, ATL, SAS, ORL. Off-nights: `b` (NYK/SG), `e` (DET/PF). Starts: `a`@PG, `c`@SF, `d`@C, `f`@UTIL.

---

### Task 1: Off-night fill after starts

**Files:**
- Modify: `src/lib/matchup/dailyLineups.ts` (`buildLineupDisplayRows` focus branch, after the `startedIds` loop)
- Test: `tests/unit/matchupDailyLineups.test.ts` (`describe("buildLineupDisplayRows focus-day seats")`)

**Interfaces:**

```ts
export const buildLineupDisplayRows = (
  rosterEntries: SeasonRosterEntry[],
  extraPlayerIds?: string[],
  extraIlPlayerIds?: string[],
  focus?: LineupDisplayFocus,
): DailySlotRow[]
```

- Consumes: existing `roster` / `mondayStarts` / `focus` / `occupant` fixtures
- Produces: same function; off-nights on empty actives; Sit/drop still on BE

- [ ] **Step 1: Update the focus-day tests**

Keep fixtures. Replace these three tests in `describe("buildLineupDisplayRows focus-day seats")`:

```ts
  it("fills empty actives with off-nights; Sit and PV stay down", () => {
    const rows = buildLineupDisplayRows(roster, ["streamer"], [], focus)

    expect(rows.map((row) => row.slot)).toEqual([
      "PG",
      "SG",
      "SF",
      "PF",
      "C",
      "UTIL",
      "BE",
      "IL",
      "PV",
    ])
    expect(occupant(rows, "PG")).toBe("a")
    expect(occupant(rows, "SG")).toBe("b")
    expect(occupant(rows, "SF")).toBe("c")
    expect(occupant(rows, "PF")).toBe("e")
    expect(occupant(rows, "C")).toBe("d")
    expect(occupant(rows, "UTIL")).toBe("f")
    expect(rows.filter((row) => row.slot === "BE").every((row) => row.playerId === null)).toBe(
      true,
    )
    expect(occupant(rows, "IL")).toBe("injured")
    expect(rows.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])
  })

  it("does not write an off-night fill into daily", () => {
    const rows = buildLineupDisplayRows(roster, [], [], focus)
    expect(occupant(rows, "SG")).toBe("b")
    expect(focus.daily[mon]?.find((entry) => entry.slot === "SG")?.playerId).toBeNull()
  })

  it("re-seats Tuesday starts and fills leftover actives with off-nights", () => {
    const daily: DailyLineups = {
      ...mondayStarts,
      [tue]: [
        { slot: "PG", playerId: null },
        { slot: "SG", playerId: "b" },
        { slot: "SF", playerId: null },
        { slot: "PF", playerId: "e" },
        { slot: "C", playerId: null },
        { slot: "UTIL", playerId: null },
      ],
    }
    const rows = buildLineupDisplayRows(roster, ["streamer"], [], {
      ...focus,
      focusDay: tue,
      daily,
    })
    expect(occupant(rows, "SG")).toBe("b")
    expect(occupant(rows, "PF")).toBe("e")
    expect(occupant(rows, "PG")).toBe("a")
    expect(occupant(rows, "SF")).toBe("c")
    expect(occupant(rows, "C")).toBe("d")
    expect(occupant(rows, "UTIL")).toBe("f")
    expect(rows.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])
  })
```

Keep these tests as they are (they still match the spec):

- `"puts a Sit player with a game on BE and leaves the home active empty"` — `d` has a Mon game, so C stays empty (no off-night is C-eligible).
- `"does not put a plan-dropped-style roster id on an active when they are not started"` — `a` has a Mon game; PG stays empty.
- `"keeps a started preview on the engine slot and a full-day preview on PV"`
- `"keeps IL on the IL row even when that player has a game"`
- `"leaves home-row occupants when focus inputs are omitted"`

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npx vitest run tests/unit/matchupDailyLineups.test.ts -t "focus-day seats"`

Expected: FAIL. Current leftover loop puts `b` and `e` on BE; SG/PF stay null; Tuesday PG/SF/C/UTIL stay null.

- [ ] **Step 3: Implement the off-night pass**

In `src/lib/matchup/dailyLineups.ts`, after the `startedIds` placement loop and **before** the leftover-to-BE loop, add:

```ts
  const playerHasGame = (playerId: string) => {
    const teamAbbr = lookup(playerId)?.teamAbbr
    if (!teamAbbr) return false
    return gameWeightForTeamDate(teamAbbr, focusDay, schedule) > 0
  }

  const placeOffNight = (playerId: string) => {
    const player = lookup(playerId)
    const home = homeRowFor(playerId)
    if (
      home &&
      isActiveDisplaySlot(home.slot) &&
      eligibleForSlot(player, home.slot)
    ) {
      if (placeOn(home, playerId)) return true
    }
    return placeEligibleActive(playerId)
  }

  for (const entry of rosterEntries) {
    if (entry.slot === "IL" || !entry.playerId) continue
    if (placed.has(entry.playerId) || playerHasGame(entry.playerId)) continue
    if (placeOffNight(entry.playerId)) placed.add(entry.playerId)
  }
```

Do not place Sit / extras with a game onto actives. Keep the existing leftover BE loop for remaining ids. `gameWeightForTeamDate` is already imported.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/unit/matchupDailyLineups.test.ts tests/unit/DailyLineupPanel.test.tsx`

Expected: PASS. If a panel test fails only because an off-night now occupies a previously empty active, update that assertion to match this spec (off-night on active, Sit/PV still down). Do not change `togglePlayerDay`.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/matchupDailyLineups.test.ts src/lib/matchup/dailyLineups.ts
git commit -m "feat(matchup): fill empty daily seats with off-nights"
```

If `DailyLineupPanel.test.tsx` changed in step 4, include it in the same commit.

---

## Self-review

| Spec requirement | Task |
| --- | --- |
| Off-night fills empty home/eligible active | Task 1 new tests + pass |
| Not written to `daily` | `"does not write an off-night fill into daily"` |
| Sit / drop stay on BE | Existing Sit + plan-drop tests kept |
| Starts not displaced | Monday/Tuesday start assertions |
| Unstarted PV under IL | First test + preview test |
| Omit focus → home-row | Existing last test |
