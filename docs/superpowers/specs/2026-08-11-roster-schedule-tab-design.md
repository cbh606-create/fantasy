# Roster Schedule Tab — Design Spec

**Date:** 2026-08-11  
**Status:** Approved for implementation planning  
**Product:** Season Roster workspace addition (Stats | Schedule)  
**Parent:** [Season Roster Module](./2026-08-11-season-roster-module-design.md)

---

## 1. Goal

Let a manager switch between **Stats** and **Schedule** on the same season roster page. Schedule shows **YOU’s 14 rostered players** for the current **fantasy matchup (ESPN scoring period)**: total games (left) and a day-by-day opponent calendar (right).

### Success criteria (MVP)

- Roster workspace has **Stats | Schedule** tabs (same interaction pattern as Draft Prep | Live).
- Default tab is **Stats**; existing analysis UI is unchanged when that tab is active.
- **Schedule** lists YOU’s 14 slots in slot order (PG → IL).
- Leftmost metric column: **Games** = number of days in the matchup with at least one NBA game for that player’s NBA team.
- Right columns: one per matchup day; cell shows opponent (`@BOS` / `vs LAL`) or `—`.
- Matchup date range is labeled above the table (scoring period start–end).
- Fixture-backed schedule works without live ESPN; CI does not require live schedule E2E.

### Non-goals (MVP)

- Other teams’ schedules (league-wide matrix).
- Fantasy H2H opponent matchup board / projected category wins.
- Writing anything to ESPN.
- Injury / B2B / rest prediction beyond raw schedule presence.
- Live ESPN schedule E2E in CI.
- Coupling to draft simulation or mock draft.

---

## 2. Product decisions

| Decision | Choice |
|---|---|
| Tab placement | Under roster header, above Stats or Schedule content |
| Default tab | Stats |
| Whose players | YOU only, all 14 slots (starters + BE + IL) |
| Week definition | Fantasy matchup / ESPN **scoring period** (typically Mon–Sun) |
| Games count | Count of **days with ≥1 game** (doubleheader = 1 game-day) |
| Opponent label | Away: `@OPP`; Home: `vs OPP` |
| Empty slot | Show row; Games `—`; day cells `—` |
| Missing `teamAbbr` | Show row; Games `0`; day cells `—`; “team unknown” cue on player |
| Lineup edit / save | Stats tab only (controls can stay in header but only affect Stats content) |
| Refresh ESPN | Remains in header; does not clear Schedule tab selection |

---

## 3. UI

### 3.1 Tabs

Mirror `DraftWorkspace` Prep/Live:

- `role="tablist"` with **Stats** and **Schedule**
- Active tab uses existing ink/soft-cloud pill styles
- Only one panel mounted content-wise is fine; prefer keeping Stats state alive across tab switches so lineup draft edits are not lost

### 3.2 Schedule table

Columns (left → right):

1. **Player** — slot + name (empty slot labeled Empty)
2. **Games** — matchup game-day total
3. **Day columns** — one per date in `matchup.days`, header = weekday short + date (e.g. `Mon 3/10`)

Above table:

- `Matchup · {start} – {end}` (and optional scoringPeriodId for debug only if useful; not required in UI)

Doubleheader on one day: still **one** game-day toward Games; cell may show both opponents stacked or a compact `2` + primary opponent — MVP chooses **stacked opponents in the cell** if two games exist that day.

### 3.3 Loading / error

- Switching to Schedule shows a loading status until schedule fetch completes.
- Fetch failure: error alert **inside Schedule panel only**; Stats unaffected.
- Partial data (some players missing team): table still renders.

---

## 4. Data model

### 4.1 Season player enrichment

Extend `SeasonPlayer`:

```ts
type SeasonPlayer = {
  id: string
  name: string
  teamAbbr?: string // e.g. "BOS"; optional for backward compatibility
  projections: Record<CategoryId, number>
  shooting: { FGM: number; FGA: number; FTM: number; FTA: number }
}
```

- Manual / ESPN season fixtures must populate `teamAbbr` for demonstrable schedule rows.
- Adapters map team abbr when available; omit when unknown.

### 4.2 Schedule API

`GET /api/schedule?seasonLeagueId={id}`

Auth: same Clerk user must own the season league (or return 401/404 consistent with other season routes).

Response shape:

```ts
type ScheduleResponse = {
  matchup: {
    scoringPeriodId: number
    startDate: string // YYYY-MM-DD
    endDate: string   // YYYY-MM-DD
    days: string[]    // inclusive list of YYYY-MM-DD in the period
  }
  games: Array<{
    date: string      // YYYY-MM-DD
    homeAbbr: string
    awayAbbr: string
  }>
}
```

**Source strategy (MVP = fixture only):**

1. Always serve `data/fixtures/nba-matchup-schedule.json` for MVP.
2. Response may include `source: "fixture"`.
3. Live ESPN scoring-period pull is **post-MVP** (see §8). Do not invent games when live fails later — return an explicit error or keep serving fixture with `source` labeled.

CI and local: fixture only.

### 4.3 Client join

Pure helper (unit-tested), e.g. `buildPlayerMatchupSchedule`:

Inputs: YOU entries + players + `ScheduleResponse`  
Outputs per row: `{ slot, playerId, name, teamAbbr | null, games, cells: Record<date, OpponentLabel[]> }`

Rules:

- Match player `teamAbbr` to `homeAbbr` / `awayAbbr` on each date.
- `games` = number of dates with `cells[date].length > 0`.
- Empty `playerId` → no team join; Games `—` (null) in UI.

---

## 5. Architecture boundaries

| Layer | Responsibility |
|---|---|
| `src/lib/season/*` | Types (`teamAbbr`), schedule join helper |
| `src/app/api/schedule` | Auth + fixture/live schedule payload |
| `src/components/season/PlayerSchedulePanel.tsx` | Schedule table UI |
| `SeasonRosterWorkspace` | Tab state; Stats vs Schedule panel switch |
| Draft modules | **No** imports from schedule UI; schedule must not import draft sim/board/mock |

Shared allowed: category constants, auth, db season league ownership checks.

---

## 6. Testing

| Layer | Coverage |
|---|---|
| Unit | Join helper: home/away labels, Games count, doubleheader = 1 day, missing teamAbbr |
| Unit / component | Stats \| Schedule tab switch; Schedule renders Games + day headers |
| API | Authenticated fixture schedule response shape; unauthorized rejected |
| E2E | Out of MVP |

---

## 7. Implementation notes

- Keep visual language aligned with existing roster (no new card-heavy layout); table in the same soft border treatment as the rank matrix is fine.
- Do not darken heatmap/schedule cells into low-contrast mixes; schedule cells are text-first (`@OPP` / `—`).
- Update season fixture players with plausible `teamAbbr` values so Schedule is demoable immediately after create.

---

## 8. Open follow-ups (post-MVP)

- Live ESPN scoring-period / scoreboard pull gated by `ESPN_LIVE`, tied to the user’s league settings.
- Week picker (prev/next matchup).
- Highlight today / B2B.
- Filter starters vs bench for quick lineup decisions.
