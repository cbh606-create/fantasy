# Mock Pool Realism + Player Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter mock/CPU pools to Primary-ADP-matched players within draft depth, and show team abbr + headshot in pool, recommendations, and latest pick.

**Architecture:** Add `filterDraftEligible` after `withProjectedAdp` in mock (and prep/live) load paths. Enrich pool JSON with `teamAbbr` / `imageUrl` offline. Shared `PlayerAvatar` renders headshot with initials fallback.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Node ESM scripts, Tailwind

## Global Constraints

- Eligible = Primary `adpBySource[primary]` finite `> 0` AND `adp ≤ teams × rounds × 1.5`
- Depth multiplier fixed at **1.5** (no UI control in v1)
- Identity on Pool + RecPanel + latest pick only — **not** BoardGrid
- Headshots from ESPN CDN via `espnId`; no live image API during draft
- No hand-maintained retired blacklist; no semicolons; `handle*` handlers; Tailwind
- Worktree: `C:\Users\cbh60\fantasy-dev`; use `npm.cmd` on Windows
- Spec: `docs/superpowers/specs/2026-08-24-mock-pool-realism-identity-design.md`

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/players/draftEligible.ts` | `DEFAULT_DEPTH_MULT`, `filterDraftEligible` |
| `src/lib/players/playerIdentity.ts` | `espnHeadshotUrl(espnId)`, initials helper |
| `src/components/draft/PlayerAvatar.tsx` | Circular avatar + fallback |
| `src/lib/domain/types.ts` | `teamAbbr?`, `imageUrl?` |
| Zod player schemas | optional identity fields |
| `scripts/enrich-player-identity.mjs` | Write `imageUrl` + `teamAbbr` onto pool |
| `package.json` | `players:enrich-identity` |
| `DraftWorkspace.tsx` | Apply filter after project |
| `PlayerPool.tsx` / `RecPanel.tsx` / `MockDraftView.tsx` | Show avatar + team |
| `tests/unit/draftEligible.test.ts` | Filter unit tests |
| `tests/unit/playerIdentity.test.ts` | URL builder tests |

---

### Task 1: `filterDraftEligible` helper

**Files:**
- Create: `src/lib/players/draftEligible.ts`
- Test: `tests/unit/draftEligible.test.ts`

**Interfaces:**
- Produces: `DEFAULT_DEPTH_MULT = 1.5`, `filterDraftEligible(players, { primary, teams, rounds, depthMult? })`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest"
import { filterDraftEligible } from "@/lib/players/draftEligible"
import type { Player } from "@/lib/domain/types"

const base = (over: Partial<Player> & Pick<Player, "id" | "name" | "adp">): Player => ({
  positions: ["PG"],
  projections: {
    FG_PCT: 0, FT_PCT: 0, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0,
  },
  ...over,
})

describe("filterDraftEligible", () => {
  it("drops players missing primary adpBySource", () => {
    const players = [
      base({
        id: "1",
        name: "Keep",
        adp: 10,
        adpBySource: { yahoo_draft_analysis_rank: 10 },
      }),
      base({ id: "2", name: "Chris Paul", adp: 137 }),
    ]
    const next = filterDraftEligible(players, {
      primary: "yahoo_draft_analysis_rank",
      teams: 12,
      rounds: 13,
    })
    expect(next.map((p) => p.name)).toEqual(["Keep"])
  })

  it("drops players deeper than teams*rounds*1.5", () => {
    const depth = 12 * 13 * 1.5 // 234
    const players = [
      base({
        id: "1",
        name: "In",
        adp: 200,
        adpBySource: { yahoo_draft_analysis_rank: 200 },
      }),
      base({
        id: "2",
        name: "Out",
        adp: depth + 1,
        adpBySource: { yahoo_draft_analysis_rank: depth + 1 },
      }),
    ]
    const next = filterDraftEligible(players, {
      primary: "yahoo_draft_analysis_rank",
      teams: 12,
      rounds: 13,
    })
    expect(next.map((p) => p.name)).toEqual(["In"])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

`npm.cmd run test -- tests/unit/draftEligible.test.ts`

- [ ] **Step 3: Implement**

```ts
import type { Player } from "@/lib/domain/types"
import type { AdpSourceId } from "@/lib/players/adpSources"

export const DEFAULT_DEPTH_MULT = 1.5

export type DraftEligibleOptions = {
  primary: AdpSourceId
  teams: number
  rounds: number
  depthMult?: number
}

export const filterDraftEligible = (
  players: Player[],
  options: DraftEligibleOptions,
): Player[] => {
  const depthMult = options.depthMult ?? DEFAULT_DEPTH_MULT
  const maxAdp = options.teams * options.rounds * depthMult

  return players.filter((player) => {
    const primaryAdp = player.adpBySource?.[options.primary]
    if (
      typeof primaryAdp !== "number" ||
      !Number.isFinite(primaryAdp) ||
      primaryAdp <= 0
    ) {
      return false
    }
    return player.adp <= maxAdp
  })
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/players/draftEligible.ts tests/unit/draftEligible.test.ts
git commit -m "feat(draft): filter mock pool by primary ADP and depth"
```

---

### Task 2: Wire filter into DraftWorkspace (and Prep/Live if same load)

**Files:**
- Modify: `src/components/draft/DraftWorkspace.tsx`

**Interfaces:**
- Consumes: `filterDraftEligible`, `withProjectedAdp`
- After `withProjectedAdp(...)`, call `filterDraftEligible(projected, { primary: source, teams, rounds: DEFAULT_DRAFT_ROUNDS or state.settings.rounds })`

- [ ] **Step 1: Locate** `startMockDraft` where `withProjectedAdp` runs; apply filter before `setMockPlayers` / CPU.

Use `mockTeams` / `teams` and `baseState.settings.rounds` (fallback `DEFAULT_DRAFT_ROUNDS`).

- [ ] **Step 2: Also filter** any prep/live path that loads the full pool for recommendations if it shares the same helper path in this file (do not change BoardGrid).

- [ ] **Step 3: Manual sanity** (optional): unit-style — if `DraftWorkspace` has existing tests, extend to assert filtered players exclude id without primary ADP when possible; otherwise skip and rely on Task 1 + Task 6 smoke.

- [ ] **Step 4: Commit**

```bash
git add src/components/draft/DraftWorkspace.tsx
git commit -m "feat(draft): apply draft-eligible filter on mock player load"
```

---

### Task 3: Identity types + URL helper + Avatar

**Files:**
- Modify: `src/lib/domain/types.ts` — add `teamAbbr?: string`, `imageUrl?: string`
- Modify: zod player schemas in `src/lib/adapters/types.ts` and `src/lib/validation/simulate.ts`
- Create: `src/lib/players/playerIdentity.ts`
- Create: `src/components/draft/PlayerAvatar.tsx`
- Test: `tests/unit/playerIdentity.test.ts`

**Interfaces:**
- `espnHeadshotUrl(espnId: string): string` → `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`
- `playerInitials(name: string): string`
- `PlayerAvatar({ player, size?: "sm" | "md" })`

- [ ] **Step 1: Failing test for URL**

```ts
import { describe, expect, it } from "vitest"
import { espnHeadshotUrl, playerInitials } from "@/lib/players/playerIdentity"

describe("playerIdentity", () => {
  it("builds ESPN headshot URL", () => {
    expect(espnHeadshotUrl("5104157")).toBe(
      "https://a.espncdn.com/i/headshots/nba/players/full/5104157.png",
    )
  })

  it("builds initials", () => {
    expect(playerInitials("Victor Wembanyama")).toBe("VW")
  })
})
```

- [ ] **Step 2: Implement helpers + PlayerAvatar**

`PlayerAvatar`: `img` with `onError` → show initials circle; `alt=""` when sibling text has name, else `alt={player.name}`. Prefer `player.imageUrl` then `espnHeadshotUrl(player.espnId)` if id present.

- [ ] **Step 3: Tests PASS; commit**

```bash
git add src/lib/domain/types.ts src/lib/adapters/types.ts src/lib/validation/simulate.ts src/lib/players/playerIdentity.ts src/components/draft/PlayerAvatar.tsx tests/unit/playerIdentity.test.ts
git commit -m "feat(draft): add player team/photo identity helpers and avatar"
```

---

### Task 4: Enrich pool script + run

**Files:**
- Create: `scripts/enrich-player-identity.mjs`
- Modify: `package.json` — `"players:enrich-identity": "node scripts/enrich-player-identity.mjs"`
- Update: `data/players/proj_2026_27.json` (after run)

**Behavior:**

1. Read `--in` default `data/players/proj_2026_27.json`
2. For each player with `espnId`, set `imageUrl` via ESPN CDN pattern
3. For `teamAbbr`: fetch ESPN FBA player list (reuse filter/URL pattern from `scripts/refresh-players.mjs` for season 2027) OR match by id from a single kona request; map `proTeamId` with the same `PRO_TEAM_ABBR` table as `espnSeasonMap.ts`
4. Preserve all other fields / `adpBySource`
5. Write file; log how many got imageUrl / teamAbbr

- [ ] **Step 1: Implement script**
- [ ] **Step 2: Run** `npm.cmd run players:enrich-identity`
- [ ] **Step 3: Verify** Wembanyama has `teamAbbr` + `imageUrl`
- [ ] **Step 4: Commit**

```bash
git add scripts/enrich-player-identity.mjs package.json data/players/proj_2026_27.json
git commit -m "feat(players): enrich pool with team abbr and headshot URLs"
```

---

### Task 5: UI — Pool, RecPanel, latest pick

**Files:**
- Modify: `src/components/draft/PlayerPool.tsx`
- Modify: `src/components/draft/RecPanel.tsx`
- Modify: `src/components/draft/MockDraftView.tsx`

- [ ] **Step 1: PlayerPool** — beside name, render `<PlayerAvatar player={player} size="sm" />` and team abbr (`player.teamAbbr ?? "—"`) in compact + list layouts.

- [ ] **Step 2: RecPanel** — resolve full `Player` from `players` by id (not just name); show avatar + team in next-pick rows.

- [ ] **Step 3: MockDraftView latest pick** — avatar + team next to name.

- [ ] **Step 4: Commit**

```bash
git add src/components/draft/PlayerPool.tsx src/components/draft/RecPanel.tsx src/components/draft/MockDraftView.tsx
git commit -m "feat(draft): show player headshot and team in pool and recs"
```

---

### Task 6: Spec status + smoke

- [ ] **Step 1:** `npm.cmd run test -- tests/unit/draftEligible.test.ts tests/unit/playerIdentity.test.ts tests/unit/adpSources.test.ts`
- [ ] **Step 2:** Mark spec status `Approved / implemented`
- [ ] **Step 3:** Commit docs

```bash
git add docs/superpowers/specs/2026-08-24-mock-pool-realism-identity-design.md
git commit -m "docs(draft): mark pool realism and identity spec implemented"
```

---

## Spec coverage

| Requirement | Task |
|---|---|
| Primary ADP required | 1–2 |
| Depth cut 1.5 | 1–2 |
| teamAbbr + imageUrl | 3–4 |
| Pool / Rec / latest pick UI | 5 |
| Not board cells | 5 (no BoardGrid edits) |
| Tests | 1, 3, 6 |

## Type consistency

- `filterDraftEligible` uses `AdpSourceId` from `adpSources.ts`
- `PlayerAvatar` reads `imageUrl` | `espnId` | `name`
- Enrich script writes the same field names as domain `Player`
