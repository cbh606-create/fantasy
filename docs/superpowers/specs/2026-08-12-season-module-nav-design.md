# Season Module Cross-Nav — Design Spec

**Date:** 2026-08-12  
**Status:** Approved for implementation  
**Product:** In-workspace links between Matchup, Roster, Trade, Waivers, and Draft  
**Related:** Matchup Advisor, Season Roster, Trade, Waivers

---

## 1. Goal

From any season league workspace, jump to the **same league** in another season tool (or Draft setup) without returning to module list pages.

### Success criteria

- Shared `SeasonModuleNav` with `leagueId` + `current` module
- Links: Matchup / Roster / Trade / Waivers → `/[module]/[leagueId]`; Draft → `/leagues/new`
- Placed in Matchup, Roster, Trade, Waivers workspace headers
- Replaces standalone **Open roster** links in those headers
- Current module marked with `aria-current="page"` and active styles (align with SiteNav)

### Non-goals

- SiteNav remembering last league id
- Binding Draft to a `SeasonLeague` id
- Changing global SiteNav order

---

## 2. Design

**File:** `src/components/SeasonModuleNav.tsx`

```ts
type SeasonModule = "matchup" | "roster" | "trade" | "waivers" | "draft"

type SeasonModuleNavProps = {
  leagueId: string
  current: SeasonModule
}
```

Visual: compact text/link row (`text-sm`), active = ink pill or strong weight like SiteNav. Keyboard focus rings required.

**Wire-up:** `MatchupWorkspace`, `SeasonRosterWorkspace`, `TradeWorkspace`, `WaiversWorkspace` — remove redundant Open roster where present.

**Tests:** Unit smoke — renders five links; current Matchup has `aria-current="page"`; Roster href includes `leagueId`.

---

## 3. Out of scope follow-ups

- Prefetch / last-league shortcuts on SiteNav (approach B from brainstorm)
