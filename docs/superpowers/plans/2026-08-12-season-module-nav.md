# Season Module Cross-Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement inline for this small plan.

**Goal:** Shared in-workspace module nav for the same season league.

**Architecture:** One `SeasonModuleNav` component; wire into four season workspaces; remove Open roster header links.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-season-module-nav-design.md`
- Draft href = `/leagues/new` (not season league id)
- No semicolons; `handle*` if any handlers; conventional commits

---

### Task 1: SeasonModuleNav + wire-up

**Files:**
- Create: `src/components/SeasonModuleNav.tsx`
- Modify: `src/components/matchup/MatchupWorkspace.tsx`
- Modify: `src/components/season/SeasonRosterWorkspace.tsx`
- Modify: `src/components/trade/TradeWorkspace.tsx`
- Modify: `src/components/waivers/WaiversWorkspace.tsx`
- Test: `tests/unit/SeasonModuleNav.test.tsx`

- [ ] **Step 1: Write failing test** for five links + aria-current + roster href
- [ ] **Step 2: Implement component**
- [ ] **Step 3: Wire into four workspaces; remove Open roster**
- [ ] **Step 4: Run tests + lint touchpoints**
- [ ] **Step 5: Commit** `feat(season): add cross-module workspace nav`
