# Active Season League Global Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist one active season league across Matchup, Trade, Waivers, and Roster detail via a SiteNav selector and localStorage, with list-page redirects for Matchup/Trade/Waivers.

**Architecture:** SSR-safe storage helpers + `ActiveSeasonLeagueProvider` (fetch leagues, hold `activeId`) wrapping the app. SiteNav renders a labeled `<select>` and active-aware nav hrefs. Shared index redirect component for matchup/waivers/trade. Detail routes sync `leagueId` → active id. Roster `/roster` index does not auto-redirect.

**Tech Stack:** Next.js App Router, React client components, Vitest + Testing Library, existing `GET /api/season-leagues`. Worktree: `.worktrees/feat-season-roster` on `feat/matchup-advisor`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-active-season-league-design.md`
- Season tools only (not Draft)
- Storage key: `activeSeasonLeagueId`
- Matchup/Trade/Waivers index: redirect when active id valid
- Roster index: no auto-redirect; nav still deep-links to `/roster/{id}`
- Detail `/{tool}/[id]` sets active id on mount
- Stale id → clear
- No semicolons; `handle*` handlers; Tailwind; conventional commits
- Tests: `npx.cmd vitest run --maxWorkers=1 <paths>`
- Do not commit unrelated WIP

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/season/activeSeasonLeague.ts` | storage read/write/clear |
| `src/components/season/ActiveSeasonLeagueProvider.tsx` | context + leagues fetch |
| `src/components/season/SeasonToolIndexPage.tsx` | shared list + redirect |
| `src/components/season/useSyncActiveSeasonLeague.ts` | hook: sync route id → active |
| `src/components/SiteNav.tsx` | select + hrefs |
| `src/app/layout.tsx` | provider wrap |
| `src/app/matchup/page.tsx`, `waivers/page.tsx`, `trade/page.tsx` | use shared index |
| `src/app/roster/page.tsx` | optional “Open active” link only |
| Detail workspaces or pages | call sync hook |
| `tests/unit/activeSeasonLeague.test.ts` | storage |
| `tests/unit/ActiveSeasonLeagueProvider.test.tsx` | provider + nav pieces |
| `tests/unit/SeasonToolIndexPage.test.tsx` | redirect |

---

### Task 1: Storage helpers + unit tests

**Files:**
- Create: `src/lib/season/activeSeasonLeague.ts`
- Create: `tests/unit/activeSeasonLeague.test.ts`

**Interfaces:**
- Produces:
  - `ACTIVE_SEASON_LEAGUE_STORAGE_KEY = "activeSeasonLeagueId"`
  - `readActiveSeasonLeagueId(): string | null`
  - `writeActiveSeasonLeagueId(id: string): void`
  - `clearActiveSeasonLeagueId(): void`
  - All no-ops / null when `typeof window === "undefined"`

- [ ] **Step 1: Write failing tests** (jsdom)

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import {
  ACTIVE_SEASON_LEAGUE_STORAGE_KEY,
  clearActiveSeasonLeagueId,
  readActiveSeasonLeagueId,
  writeActiveSeasonLeagueId,
} from "@/lib/season/activeSeasonLeague"

afterEach(() => {
  window.localStorage.clear()
})

describe("activeSeasonLeague storage", () => {
  it("reads null when empty", () => {
    expect(readActiveSeasonLeagueId()).toBeNull()
  })

  it("writes and reads an id", () => {
    writeActiveSeasonLeagueId("league-1")
    expect(window.localStorage.getItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY)).toBe(
      "league-1",
    )
    expect(readActiveSeasonLeagueId()).toBe("league-1")
  })

  it("clears the id", () => {
    writeActiveSeasonLeagueId("league-1")
    clearActiveSeasonLeagueId()
    expect(readActiveSeasonLeagueId()).toBeNull()
  })
})
```

- [ ] **Step 2: Run — FAIL**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/activeSeasonLeague.test.ts
```

- [ ] **Step 3: Implement helpers**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```powershell
git commit -m @"
feat(season): add active season league localStorage helpers

Persist the selected season league id for cross-page navigation.
"@
```

---

### Task 2: Provider + SiteNav selector + layout

**Files:**
- Create: `src/components/season/ActiveSeasonLeagueProvider.tsx`
- Modify: `src/components/SiteNav.tsx`
- Modify: `src/app/layout.tsx`
- Create: `tests/unit/ActiveSeasonLeagueProvider.test.tsx`

**Interfaces:**
- Consumes: storage helpers; `GET /api/season-leagues`
- Produces context:
  ```ts
  type SeasonLeagueListItem = { id: string; name: string; season: number; source: "espn" | "manual" | "mixed" }
  type ActiveSeasonLeagueContextValue = {
    activeId: string | null
    leagues: SeasonLeagueListItem[]
    isLoading: boolean
    error: string
    setActiveId: (id: string | null) => void
  }
  export const useActiveSeasonLeague = () => ...
  ```
- On leagues load: if `activeId` not in list → `clear` + set null
- `setActiveId`: update state + write/clear storage
- Initial `activeId`: read from storage after mount (avoid hydration mismatch — start `null`, then hydrate in `useEffect`)

**SiteNav:**
- `useActiveSeasonLeague()`
- `<label className="sr-only">` or visible compact label + `<select aria-label="Active season roster">`
- `handleChange` → `setActiveId`
- Nav hrefs use `activeId` per spec
- Disabled select when `leagues.length === 0`

**Layout:** wrap `<SiteNav />` + children with provider inside `ClerkProvider`.

- [ ] **Step 1: Failing RTL tests** — mock fetch leagues; render provider+nav; change select → storage updated; Matchup link href becomes `/matchup/{id}`

- [ ] **Step 2: Implement provider + SiteNav + layout**

- [ ] **Step 3: Tests PASS**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/activeSeasonLeague.test.ts tests/unit/ActiveSeasonLeagueProvider.test.tsx
```

- [ ] **Step 4: Commit**

```powershell
git commit -m @"
feat(season): add SiteNav active season league selector

Wire provider context so Matchup, Trade, Waivers, and Roster share one league.
"@
```

---

### Task 3: Index redirect for Matchup / Trade / Waivers + Roster shortcut

**Files:**
- Create: `src/components/season/SeasonToolIndexPage.tsx`
- Modify: `src/app/matchup/page.tsx`, `src/app/waivers/page.tsx`, `src/app/trade/page.tsx` to thin wrappers
- Modify: `src/app/roster/page.tsx` — if `activeId` and league found, show link “Open {name} →” to `/roster/{id}` near top (no redirect)
- Create: `tests/unit/SeasonToolIndexPage.test.tsx`

**Interfaces:**
- `SeasonToolIndexPage({ tool: "matchup" | "waivers" | "trade"; title: string; description: string })`
- Uses `useActiveSeasonLeague` + `useRouter` from `next/navigation`
- When `!isLoading && activeId && leagues.some(l => l.id === activeId)` → `router.replace(\`/${tool}/${activeId}\`)`
- Else render existing list UI (copy markup from current matchup page; parameterize title/description/empty CTA)

Mock `useRouter` in tests; assert `replace` called.

- [ ] **Step 1: Failing redirect test**

- [ ] **Step 2: Implement shared page + wire three routes + roster shortcut**

- [ ] **Step 3: PASS + Commit**

```powershell
git commit -m @"
feat(season): redirect tool indexes to the active season league

Skip repeated roster picking on Matchup, Trade, and Waivers list pages.
"@
```

---

### Task 4: Detail route sync active id

**Files:**
- Create: `src/components/season/useSyncActiveSeasonLeague.ts`
- Modify: `MatchupWorkspace`, `WaiversWorkspace`, `TradeWorkspace`, `SeasonRosterWorkspace` — call `useSyncActiveSeasonLeague(leagueId)` at top (must be under provider; layout already wraps)

**Hook:**
```ts
export const useSyncActiveSeasonLeague = (leagueId: string) => {
  const { setActiveId, activeId } = useActiveSeasonLeague()
  useEffect(() => {
    if (leagueId && leagueId !== activeId) setActiveId(leagueId)
  }, [leagueId, activeId, setActiveId])
}
```

Avoid infinite loops: `setActiveId` should be stable (`useCallback`).

- [ ] **Step 1: Unit test hook or workspace smoke** — render with provider, pass leagueId, expect storage write

- [ ] **Step 2: Wire four workspaces**

- [ ] **Step 3: Full related suite PASS**

```powershell
npx.cmd vitest run --maxWorkers=1 tests/unit/activeSeasonLeague.test.ts tests/unit/ActiveSeasonLeagueProvider.test.tsx tests/unit/SeasonToolIndexPage.test.tsx
```

- [ ] **Step 4: Commit**

```powershell
git commit -m @"
feat(season): sync active league from workspace routes

Keep the global selector aligned when opening a deep-linked season tool.
"@
```

---

## Spec coverage checklist

| Spec | Task |
|------|------|
| Storage key helpers | 1 |
| Provider + SiteNav select + hrefs | 2 |
| Index redirect M/T/W | 3 |
| Roster no redirect + shortcut | 3 |
| Detail sync | 4 |
| Stale id clear | 2 |
| Draft untouched | all |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-19-active-season-league.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)**  
2. **Inline Execution**  

Which approach?
