# ESPN Live Season Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Live private-league ESPN season import via env cookies into SeasonLeague for Matchup.

**Architecture:** Pure mapper from ESPN JSON → `SeasonLeagueState`; fetch only when `ESPN_LIVE=true`; UI form on `/roster`; extend season-import API with `teamId`.

**Tech Stack:** Next.js 15, TypeScript, Vitest. Branch `feat/matchup-advisor`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-espn-live-season-import-design.md`
- Cookies server-only; no draft/`@/lib/sim` imports
- No semicolons; tests via `npx.cmd vitest run --maxWorkers=1`

---

### Task 1: Mapper + fixture tests

- Create: `src/lib/adapters/espnSeasonMap.ts`
- Create: `data/fixtures/espn-api-season-league-sample.json`
- Create: `tests/unit/espnSeasonMap.test.ts`
- Commit: `feat(season): map ESPN league JSON to SeasonLeagueState`

### Task 2: Live fetch + adapter + API + UI

- Modify: `espnSeason.ts`, `season-import/route.ts`, `roster/page.tsx`, `.env.example`, `types.ts` (`espnTeamId?`)
- Commit: `feat(season): import private ESPN leagues with live cookies`
