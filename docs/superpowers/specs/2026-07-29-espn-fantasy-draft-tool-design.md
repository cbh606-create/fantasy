# ESPN Fantasy Basketball Draft Tool — Design Spec

**Date:** 2026-07-29  
**Status:** Approved for implementation planning  
**Product:** Public web app (Next.js) for ESPN Fantasy Basketball draft analysis  
**MVP focus:** Draft tool only (Waiver and Trade deferred)

---

## 1. Goal

Help category-league managers prepare for and execute a snake draft by recommending **optimal pick combinations** and **next picks**, driven by **dozens of draft simulations** conditioned on the user’s draft slot, league category settings, and optional punt/focus goals.

### Success criteria (MVP)

- User can configure a snake 12-team H2H categories league (9-cat default with per-cat on/off and weights).
- User can run N simulations (default ~30–50) and see top pick paths plus a next-pick ranking for their slot.
- Prep and Live modes share one workspace; Live prefers ESPN board sync with manual fallback.
- Core simulate flow works without ESPN (manual league/board path).
- Engine, adapter, and simulate API tests pass; 2–3 UI smoke flows pass.

### Non-goals (MVP)

- Waiver wire and trade tools (planned expansions).
- Points leagues.
- Non-snake formats or team counts other than 12 (extension hooks only).
- Full weekly H2H schedule / championship-probability simulation.
- Real ESPN end-to-end tests in CI (fixtures/mocks only).
- Native apps or browser extensions.

---

## 2. Users and product shape

| Decision | Choice |
|---|---|
| Audience | Public / mass-market launch |
| MVP surface | Draft tool only; Waiver → Trade later |
| Draft modes | Prep + Live |
| Core value | Simulation-based optimal pick combinations for the user’s pick slot |
| Format (MVP) | Snake, 12 teams |
| Scoring | H2H Categories; standard 9-cat default + per-league on/off and weights |
| Optimization default | Maximize expected category wins |
| User goals | Optional punt / focus category targets |
| Other teams in sim | ADP + position needs + category needs |
| Data | ESPN import/sync preferred; **manual fallback required in MVP** |
| Live board | Hybrid: ESPN auto-sync first, manual mark-picked on failure |
| Delivery | Next.js web app (desktop + mobile browsers) |
| Architecture | Server-side sync simulate API; pure simulation module (Approach 2) |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js Web UI (Nike-inspired chrome)                  │
│  Home · Auth · League setup · DraftWorkspace (Prep/Live)│
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  API Route Handlers                                     │
│  leagues · espn/import · espn/sync-board · draft/simulate│
└───────┬─────────────────────┬───────────────────────────┘
        │                     │
┌───────▼────────┐   ┌────────▼───────────────────────────┐
│  Persistence   │   │  Simulation Engine (pure module)   │
│  users, leagues │   │  N× draft sims → SimulationResult  │
└────────────────┘   └────────────────────────────────────┘
        ▲
┌───────┴─────────────────────────────────────────────────┐
│  Adapters → LeagueState                                 │
│  EspnAdapter (unofficial) · ManualAdapter               │
└─────────────────────────────────────────────────────────┘
```

### Layers

1. **Web UI** — league setup, draft board, recommendation panel, simulation results.
2. **API** — league CRUD, ESPN import/sync, `POST` simulate.
3. **Domain** — `LeagueSettings`, `DraftBoard`, `PlayerPool`, `CategoryProfile`, `LeagueState`.
4. **Simulation engine** — pure functions, server-executed; movable to a worker later without changing contracts.
5. **Data adapters** — ESPN and Manual normalize to the same `LeagueState`.
6. **Persistence** — users, league settings, saved boards, last simulation metadata.

### Fixed MVP assumptions

- Format: snake, 12 teams only (keep typed extension points for later).
- Opponent AI: ADP-weighted sampling + roster position gaps + category need scores.
- Scoring objective: weighted expected category wins; punt/focus adjusts category weights.

### Future extensions (out of MVP build, in design hooks)

- Waiver pickup tool and trade tool sharing `LeagueState` + player projections.
- Points leagues; custom team counts / auction.
- Job queue for heavier sim counts (Approach 3) behind the same API shape.

---

## 4. Visual system and core screens

UI follows the attached Nike design analysis (`DESIGN-nike.md`) adapted for this product—not Nike branding, but the same chrome rules.

### Tokens (adapted)

- Surfaces: canvas `#ffffff`, soft-cloud `#f5f5f5`, ink `#111111`.
- Text: ink / charcoal / mute / stone as in the design doc.
- Semantic only when signaling: success, sale (danger/mismatch), info — never decorative chrome.
- CTAs: pill primary (ink) and secondary (soft-cloud); one primary per viewport.
- Cards/rows: flat, no drop shadow, radius 0 for player/result containers.
- Chips: filter-chip / filter-chip-active (invert to ink when selected).
- Spacing: 8px base; section rhythm ~48px desktop.
- Fonts: condensed uppercase display for hero only (e.g. Bebas Neue/Anton substitute); UI Inter 400/500.

### Screens

1. **Marketing / Home** — Single editorial hero (brand-level name + one line + one primary CTA `Start draft prep`). No stat strips or card grids in the first viewport.
2. **Auth** — Minimal sign-up / sign-in; soft-cloud fields + ink pill.
3. **League setup** — Snake/12 shown as fixed; pick slot; 9-cat on/off + weights; punt/focus chips; primary `Import from ESPN`, secondary `Enter manually`.
4. **Draft Prep** — PLP-like layout: left rail (goals, sim count, `Run simulation`), center (ranked pick combinations / round paths), sticky next-pick shortlist + category outlook. Mobile: rail becomes a drawer.
5. **Live Draft** — Snake board (12 teams); utility sync bar (`ESPN synced` / `Manual mode`); recommendation panel emphasized on the user’s turn; search-pill + mark picked; sync/refresh actions.
6. **Player pool** — Search pill + position chips; flat list rows.

Prep and Live are one **`DraftWorkspace`** with a mode switch (same chrome, different content).

### Primary flows

1. Sign up → League setup (ESPN or manual) → Prep simulate → save board/results.
2. Draft day → Live sync (or manual) → on each relevant board change, debounced server simulate → refresh recommendations.
3. Draft end → roster + category outlook summary. Waiver/Trade entry points deferred.

---

## 5. Data model

### `LeagueSettings`

- `teams`: 12 (MVP)
- `draftType`: snake
- `rosterSlots`: position slot configuration
- `categories`: list of `{ id, enabled, weight }` (default 9-cat: FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS)
- `userPickSlot`: 1–12
- `puntCategoryIds` / `focusCategoryIds`

### `Player`

- `id`, `name`, `positions[]`
- `projections`: per-category numbers
- `adp`, optional injury/status flags
- External ids as available (e.g. ESPN player id)

### `DraftBoard`

- Picks by round and team (or ordered pick list)
- Remaining player pool
- Current turn (team + round)

### `LeagueState`

- `settings` + `board` + `players`
- `source`: `espn` | `manual` | `mixed`

Adapters expose `toLeagueState()` only. UI never branches on adapter internals.

---

## 6. Simulation engine

### Input

- `LeagueState`
- `simCount` (default 30–50; may auto-reduce under load)
- `perspectiveTeamId` (user’s team)
- Optional `forcePick` for what-if

### Per-simulation loop

1. Clone board; advance through snake order.
2. **Other teams:** sample from remaining pool with scores from ADP + missing positions + category needs (respecting enabled cats/weights).
3. **User team:** For the current decision, evaluate each plausible candidate with `forcePick`, then fill the user’s **remaining** picks greedily by one-step EV (no multi-ply search in MVP). Score = weighted expected category wins; apply punt (downweight) and focus (upweight).
4. Record the user’s pick sequence and end-of-draft category outlook.

### Aggregation → `SimulationResult`

- `nextPicks[]` — players ranked by EV / selection frequency for the current turn
- `topCombinations[]` — frequent or high-scoring full pick paths
- `categoryOutlook` — expected strength by category
- `meta`: `simCount`, `seed`, `generatedAt`, `latencyMs`, `source`

### Category scoring (MVP)

Aggregate roster projections by category (invert TO). Approximate win expectancy vs league (e.g. pairwise vs league mean or simple distributional model). Multiply by category weights after punt/focus adjustments.

### API

- `POST /api/draft/simulate` — snapshot or `leagueId` + server board → `SimulationResult`
- `POST /api/espn/import`
- `POST /api/espn/sync-board`
- `GET|PATCH /api/leagues/:id`

Live: debounce board changes (~300–500ms), cancel in-flight simulate when a newer request starts.

---

## 7. ESPN integration and fallback

ESPN Fantasy has no official public API. MVP uses unofficial endpoints where viable, with the explicit assumption they can break.

**Policy:** Simulation and recommendations must work via **ManualAdapter** without ESPN. ESPN is a convenience layer for settings/board import and live sync.

| Failure | Behavior |
|---|---|
| Import/sync error/timeout | Banner + `Retry` / `Continue manually`; keep existing `LeagueState` |
| Auth/session expired | Re-auth prompt; do not wipe local league |
| Partial board sync | Apply safe subset; highlight conflicts for manual fix |
| Repeated sync failure | Pin session to Manual mode; demote sync CTA |

Results always carry `source` and freshness cues. Mixed ESPN + manual edits → `mixed` and a short “Board may differ from ESPN” caption.

---

## 8. Error handling, security, reliability

- Auth required for simulate, import, and league writes.
- Rate limit per user/IP on simulate and ESPN sync.
- ESPN credentials/secrets only on server; never expose upstream URLs or stacks to the client.
- Simulate timeout → one retry with reduced `simCount`; on failure keep last good result with stale badge.
- Invalid input → 400 with field-level errors; do not call the engine.
- UX signals use Nike semantic colors sparingly (success / sale / mute), not colored chrome backgrounds.

---

## 9. Testing strategy

### Priority 1 — Simulation engine unit tests

- Snake-12 pick order and user slot rounds
- Opponent AI respects position needs (no pathological stacking in fixtures)
- Punt/focus and weights change rankings in the expected direction
- Fixed seed → reproducible aggregates
- Mid-draft boards only simulate remaining picks
- Guards for empty pool / not user’s turn where applicable

### Priority 2 — Adapter contract tests

- Fixture JSON → valid `LeagueState`
- ESPN error shapes → stable error codes shared with UI
- Partial sync merge rules

### Priority 3 — API integration

- Simulate 200 + schema; bad body 400; unauthenticated 401; rate limit 429
- ESPN import mocked failure still allows manual continuation state

### Priority 4 — UI smoke (few)

- Setup → Prep simulate → next picks render (mock API)
- Live manual mark picked → recommendations refresh
- Sync failure banner + Manual CTA

### Out of CI MVP

- Live ESPN E2E
- Large visual regression suites
- Full load tests (optional light latency assert only)

---

## 10. Tech stack (MVP)

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- Server Route Handlers for API
- DB for users/leagues/boards (concrete provider chosen in implementation plan)
- Auth suitable for public launch (concrete provider chosen in implementation plan)

---

## 11. Roadmap after MVP

1. Deepen ESPN live sync reliability and coverage.
2. Waiver pickup tool (shared player pool + category outlook).
3. Trade tool (multi-player swap EV under same category model).
4. Optional heavier sims via background jobs (same simulate contract).
5. Additional formats (team count, auction, points).

---

## 12. Open decisions for implementation plan (not blockers)

These are deliberately deferred to the writing-plans / build phase; the product design does not depend on a single choice:

- Concrete DB and auth vendors
- Exact ESPN endpoint set and auth mechanism (cookie/SWID vs other)
- Default `simCount` and hard caps under rate limits
- Precise mathematical form of category win expectancy (mean-compare vs fuller distribution)

---

## Approval record

- Architecture — approved
- Screens / flows (Nike-adapted) — approved
- Data + simulation engine — approved
- Errors / ESPN fallback — approved
- Testing — approved
- Full design — approved 2026-07-29
