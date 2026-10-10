# Active Season League (Global Selector) — Design Spec

**Date:** 2026-08-19  
**Status:** Approved for implementation planning  
**Product:** Persist one active season roster across Roster / Matchup / Trade / Waivers via a SiteNav selector  
**Related:** Season Roster, Matchup, Trade, Waivers workspaces (`/[tool]/[id]`)

---

## 1. Goal

Let the user pick a **season roster once** and keep working in that league across Matchup, Trade, Waivers, and Roster detail — without re-picking on every tool’s list page. **Draft leagues are out of scope.**

### Success criteria

- SiteNav shows a season-league `<select>` (name · season)
- Choosing a league persists `activeSeasonLeagueId` in `localStorage` and updates React context
- Nav links for Matchup / Trade / Waivers / Roster go to `/{tool}/{activeId}` when an active id is set; otherwise to the tool index
- `/matchup`, `/waivers`, `/trade` index pages **redirect** to `/{tool}/{activeId}` when the active id is still a valid league for the user
- Opening `/{tool}/{id}` sets that id as active (deep links / bookmarks)
- Zero leagues: selector disabled + path to create roster on `/roster`
- Stale active id (deleted): clear storage and show list / prompt to choose

### Decisions (locked)

- Global selector in SiteNav (Approach A)
- Season tools only — not Draft
- Persistence: `localStorage` + React context (Approach 1) — not DB preference
- Roster index `/roster` keeps import/list UX (**no** auto-redirect); nav “Roster” still deep-links to `/roster/{id}` when active

---

## 2. Non-goals

- Draft / `League` model in the same selector
- Server-side user preference column
- Cross-device sync
- Changing workspace internals beyond reading `leagueId` from the route (already the case)

---

## 3. Behavior

### Storage

- Key: `activeSeasonLeagueId` (string season league cuid/id)
- Read on provider mount; write on `setActiveId`; clear when invalid

### SiteNav

- Load league list via provider (shared `GET /api/season-leagues`)
- `<select>`: options from list; empty state disabled with helper text or option “No season rosters”
- `aria-label`: e.g. “Active season roster”
- On change: `setActiveId(value)`
- Nav `href`s:
  - Matchup → active ? `/matchup/{id}` : `/matchup`
  - Trade → active ? `/trade/{id}` : `/trade`
  - Waivers → active ? `/waivers/{id}` : `/waivers`
  - Roster → active ? `/roster/{id}` : `/roster`
  - Draft / Home unchanged

### Index pages

| Route | Behavior |
|-------|----------|
| `/matchup`, `/waivers`, `/trade` | If `activeId` present and in fetched leagues → `router.replace(/{tool}/{activeId})`. Else existing list UI. |
| `/roster` | No auto-redirect. Optional “Open {name}” link when active. Keep import + league list. |

### Detail pages

- Existing `/{tool}/[id]` workspaces unchanged structurally
- On mount (client): call `setActiveId(id)` so deep links update the global selection

### Invalid / deleted

- After leagues load, if `activeId` ∉ list → `clearActiveId()`, do not redirect

---

## 4. Implementation shape

| Path | Responsibility |
|------|----------------|
| `src/lib/season/activeSeasonLeague.ts` | storage key + `readActiveSeasonLeagueId` / `writeActiveSeasonLeagueId` / `clearActiveSeasonLeagueId` (SSR-safe: no `window` on server) |
| `src/components/season/ActiveSeasonLeagueProvider.tsx` | context + fetch leagues + active id state |
| `src/components/season/SeasonToolIndexRedirect.tsx` (or similar) | shared redirect-or-list wrapper for matchup/waivers/trade |
| `src/components/SiteNav.tsx` | selector + active-aware links |
| `src/app/layout.tsx` | wrap children with provider |
| Index pages under `matchup` / `waivers` / `trade` | use redirect helper |
| Detail workspaces or thin page wrappers | sync route id → active |

Accessibility: select has label; links keep focus-visible styles already used in nav.

---

## 5. Tests

- Storage helpers: set / get / clear (jsdom)
- Provider: selecting updates storage (RTL)
- Index redirect: when active id valid, `replace` called with `/{tool}/{id}`
- Detail sync: mounting with `leagueId` writes storage / context
- Stale id: cleared when not in league list

---

## 6. Implementation planning note

- Single plan: helpers → provider → SiteNav → index redirects → detail sync + tests
- Do not mix unrelated WIP
- No Draft coupling
