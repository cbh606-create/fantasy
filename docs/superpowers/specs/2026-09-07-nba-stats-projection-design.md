# NBA Stats Projection System — Design Spec

**Date:** 2026-09-07  
**Status:** Approved for implementation (remaining allocation rules filled with defaults; revise after we run it)  
**Product:** Preseason per-game projection engine for the existing 9-cat H2H draft / season app  
**MVP focus:** Sequential pipeline from last-season box + roster vacancy. Aging is a researched stub, off until it beats the no-aging model.

---

## 1. Goal

Produce **preseason, season-long per-game** player projections that draft simulation and season roster can consume, using **our** model (not a public projection blend). Role is a team problem: minutes sum to 240, minutes-weighted usage sums to ~100%. Rookies sit on the **same scale** as veterans.

### Success criteria (ship / aging gates)

Holdout = project season `T+1` from season `T` boxes + `T+1` opening roster. Compare to actual `T+1` per-game stats for players with `GP >= 20` in the actual season.

| Gate | Metric | Bar |
|---|---|---|
| Ship v1 (aging off) | MAE of 9-cat per-game, MPG, USG vs **last-year per-game baseline** | Model MAE **lower** on MPG, USG, and at least 6 of 9 cats |
| Ship v1 | Spearman of this app’s 9-cat z (TO inverted, equal weights) vs actual end-of-year z | Higher than last-year baseline on the **top 150** by actual z |
| Turn aging **on** | Same two families of metrics | Aging-on model beats aging-off on **both** MAE (same 6/9 + MPG + USG rule) **and** Spearman |
| BBM Josh/Kyle | Same metrics | Reference only. Not a ship gate |

### Non-goals (v1)

- Rest-of-season or weekly/daily projections (hooks only: swap `mpg` / `gp`)
- Ingesting or redistributing Basketball Monster (or any paid projection) numbers
- Scraping BBM
- Joint team optimizer, live news, injury reports
- Applying aging coefficients before the research gate passes
- Draft UI, season UI, ESPN fantasy HTTP
- Points leagues, extra category ids

---

## 2. Relationship to the rest of the app

| Concern | This module | Draft / Season |
|---|---|---|
| Job | Create `PlayerProjection` | Consume 9-cat / shooting |
| Path | `src/lib/projections/` | Must not import each other’s UI/simulate |
| Shared | `CategoryId`, `ALL_CATEGORY_IDS` only | Same |

Draft reads `projections: Record<CategoryId, number>` only (rates as %).  
Season may also read `shooting` and volume-aggregate FG%/FT% (`sum(FGM)/sum(FGA)`).

`FGM` / `FGA` / `FTM` / `FTA` are **not** `CategoryId`s.

BBM files, if present locally for a developer, are a **benchmark loader** outside the engine. Never required to run projections.

---

## 3. Architecture

```
SeasonBox[] + RosterSnapshot[] + RookiePrior[]
        │
        ▼
   nbaBox adapter (fixture in CI; NBA Stats later)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  pipeline (pure)                                          │
│  rateFromBox → regress → minutes(240) → usage(~100%)      │
│       → gpPrior → compose                                 │
│  aging stub = identity until research gate                │
└───────────────────────────────────────────────────────────┘
        │
        ▼
  PlayerProjection[]   → draft / season
        │
        ▼
  backtest (MAE, Spearman) vs last-year baseline
  optional: compare to BBM benchmark fixture
```

Aging research (`fitAgingCurves`) is a **separate** script/module. It does not run in the v1 pipeline. The pipeline calls `applyAging(rates, age, position)` which returns `rates` unchanged while `AGING_ENABLED === false`.

---

## 4. Data contracts

### `CategoryId`

`FG_PCT` | `FT_PCT` | `TPM` | `REB` | `AST` | `STL` | `BLK` | `TO` | `PTS`

### `ShootingVolume`

`{ FGM, FGA, FTM, FTA }` — same unit as the parent record (per-game on output).

### `SeasonBox` (one player-season)

- `playerId`, `name`, `season`, `teamId` (`TOT` if multi-team row is the one we use)
- `age` (age on Feb 1 of that season)
- `positions: Array<"PG"|"SG"|"SF"|"PF"|"C">` (primary = `[0]`)
- `gp`, `mp` (season minutes total), `mpg`
- `usg` (0–100, e.g. 27.4)
- Counting **totals**: `pts`, `reb`, `ast`, `stl`, `blk`, `tov`, `tpm`
- Shooting **totals**: `fgm`, `fga`, `ftm`, `fta`
- `possessions` optional (on-court). If missing, derive per-36 from `mp`

Use the single-team or `TOT` row, not split-team duplicates.

### `RosterSnapshot` (target season, one team)

- `season`, `teamId`, `pace` optional (possessions per 48; default league 100)
- `players[]`: `{ playerId, positions }` currently on the team
- `departed[]`: `{ playerId, lastMpg, lastUsg, positions }` on this team last year, not on it now. `positions` is required so vacancy claim can match `G` / `wing` / `big`
- League average `usg` for weighting is **20** (standard definition)

### `RookiePrior`

- `playerId`, `name`, `positions`, `age`, `draftSlot` (`1..60` or `null` if undrafted)
- Optional translated college/overseas `rates` in the same per-36 shape as veterans
- No NBA `SeasonBox` required

### Intermediate `Rates`

Per-36 counting: `pts`, `reb`, `ast`, `stl`, `blk`, `tov`, `tpm`  
Per-36 shooting: `ShootingVolume`  
If `possessions` exist, convert to per-36 via `stat * 36 / (mp)` still — possessions feed **usage scaling**, not a second rate system in v1.

### `PlayerProjection` (output)

```ts
type PlayerProjection = {
  playerId: string
  name: string
  season: number
  teamId: string
  positions: Array<"PG" | "SG" | "SF" | "PF" | "C">
  mpg: number
  gp: number
  usg: number
  rates: Rates
  projections: Record<CategoryId, number>
  shooting: ShootingVolume
  source: "model" | "rookie_prior"
  agingApplied: boolean
}
```

`projections.FG_PCT` / `FT_PCT` are `FGM/FGA` and `FTM/FTA` from per-game `shooting` (0 if attempts are 0, after filling attempts from the position mean so this should be rare).

No uncertainty intervals in v1.

---

## 5. Pipeline rules

Position bucket for means and minutes claim:  
`PG`/`SG` → `G`; `SF` → `wing`; `PF`/`C` → `big`.

### 5.1 Rate from last season

```
per36(stat) = total_stat * 36 / max(mp, 1)
```

Thin sample (`gp < 10` or `mp < 150`): still compute per-36, then regression will dominate.

### 5.2 Regression to position mean

Position means come from the **same** last-season `SeasonBox` pool (all players with `gp >= 20`).

```
w = gp / (gp + k[family])
regressed = w * observed + (1 - w) * positionMean
```

| Family | Fields | `k` |
|---|---|---|
| shooting | FGM/FGA/FTM/FTA per-36 (and thus %) | 50 |
| creation | PTS, AST, TOV, TPM per-36 | 40 |
| athleticism | STL, BLK per-36 | 80 |
| size | REB per-36 | 40 |
| availability | used in GP/MPG priors, not here | 30 |

`usg` also regresses with `k = 40` toward the position-mean USG.

### 5.3 Minutes → team 240

For each team independently:

1. Prior MPG = last-season `mpg` if the player has a box; else rookie prior MPG (see §6).
2. Caps after every pass: `min(38, max(0, mpg))`. Players with prior MPG `< 8` start at that prior (they can receive vacancy).
3. Let `S = sum(prior mpg)` on the current roster.
4. If `|S - 240| <= 0.5`, stop (then snap-scale to exact 240).
5. If `S < 240` (vacancy): extra `240 - S` goes to players in proportion to **claim**  
   `claim = priorMpg * 0.5 + departedSameBucketMpg * 0.5`  
   `departedSameBucketMpg` = sum of `departed.lastMpg` whose position bucket matches the player, divided equally among current players in that bucket (0 if the bucket is empty — leftover goes league-wide by `priorMpg`).
6. If `S > 240`: cut the surplus in proportion to how far each player is **above** 20 MPG (true bench: if everyone is ≤ 20, cut by `priorMpg`).
7. Repeat at most 8 times; final multiply so `sum === 240` exactly (float).

Do not invent players. Only allocate to `RosterSnapshot.players`.

### 5.4 Usage → minutes-weighted 100

```
weighted = sum(usg_i * mpg_i) / 240
```

Target `weighted === 100`.

1. Prior USG = last-season `usg` or rookie prior USG, already regressed.
2. Cap each `usg` to `[8, 35]` after each pass (allow `< 8` only if prior was `< 8` and they received no vacancy minutes).
3. If `weighted < 100`, give the gap using the same **claim** idea as minutes, but with `departed.lastUsg` and current `priorUsg`.
4. If `weighted > 100`, scale all USG by `100 / weighted`.
5. Final scale so weighted usage is 100. If a cap blocks it, scale the uncapped players only; if still impossible, accept the closest feasible weighted value and record it on the team result (engine still returns projections).

### 5.5 Games played

```
w = gp / (gp + 30)
gpHat = w * lastGp + (1 - w) * positionMeanGp
gp = clamp(round(gpHat), 1, 82)
```

Rookies: use the draft-slot GP table, then the same clamp. No injury-news model.

### 5.6 Compose per-game 9-cat

```
usageScale = allocatedUsg / max(baselineUsg, 8)
// baselineUsg = regressed last-year (or rookie) usg, before team scale
count = per36 * (mpg / 36)
```

- Minutes-driven (no usageScale): `REB`, `STL`, `BLK`
- Usage-driven (`count * usageScale`): `PTS`, `AST`, `TO`, `TPM`, `FGM`, `FGA`, `FTM`, `FTA`

Optional pace: multiply **all counting per-game stats and shooting attempts/makes** by `teamPace / 100` when `RosterSnapshot.pace` is present. Default 100 → no change.

Then:

```
projections.PTS = PTS
projections.REB = REB
...
projections.TO = TO
projections.TPM = TPM
projections.FG_PCT = FGA > 0 ? FGM / FGA : positionMeanFg
projections.FT_PCT = FTA > 0 ? FTM / FTA : positionMeanFt
shooting = { FGM, FGA, FTM, FTA }  // per-game
```

`agingApplied` is `false` in v1.

---

## 6. Rookies and thin history

Same pipeline after a prior is built. **No caste haircut.** Low draft capital simply has a smaller MPG/USG prior, so they rank lower because the numbers are lower, not because we multiply by a rookie discount.

Draft-slot bins (constants, replace later with empirical table):

| `draftSlot` | MPG | USG | GP |
|---|---|---|---|
| 1–4 | 30 | 24 | 70 |
| 5–14 | 24 | 20 | 65 |
| 15–30 | 18 | 18 | 58 |
| 31–60 | 14 | 16 | 50 |
| `null` | 10 | 14 | 40 |

Per-36 rate prior = **position mean** of last-season veterans (`gp >= 20`).  
If translated college/overseas rates exist, mix `0.5 * translated + 0.5 * positionMean` before regression.  
Treat as `gp = 0` for regression weight so `w = 0` unless translated rates are present (`gp` equivalent 15 for the mix).

Veterans with `gp < 10` or `mp < 150` stay in the veteran path (their own noisy per-36 + heavy regression). They are not relabeled rookies.

---

## 7. Aging research gate

Category families (for **future** curves, not applied in v1):

| Family | Affects |
|---|---|
| shooting | FG/FT percentages and 3P skill (per-36 TPM milder than STL) |
| creation | PTS, AST, USG |
| athleticism | STL, BLK |
| size | REB |
| availability | MPG, GP |

Rules when (later) applying:

- Young-player “growth” is **not** an aging bump. Role (minutes/usage vacancy) already does that.
- Do not apply a league-mean decline to every star at full strength. Any future curve is a **weak prior**, shrunk toward zero delta as last-season `gp` rises.
- Survivor bias: estimate curves on a research sample that includes players who left the league (treat missing next season as data, not drop them only when they survive).

v1: `applyAging` is identity. `fitAgingCurves` may exist as an uncalled module or be deferred until a follow-up plan. Do not block v1 ship on fitting curves.

---

## 8. Data sources

| Source | Role |
|---|---|
| Fixture JSON in-repo | CI and default `nbaBox` adapter |
| NBA Stats (unofficial HTTP) | Later live ingest; same adapter interface |
| Basketball-Reference | Optional research dump, same `SeasonBox` shape |
| Basketball Monster | Developer-only **benchmark** comparison. Never an engine input. No scrape |

Adapter interface:

```ts
loadSeasonBoxes(season: number): Promise<SeasonBox[]>
loadRosters(season: number): Promise<RosterSnapshot[]>
loadRookiePriors(season: number): Promise<RookiePrior[]>
```

CI sets no network. Fixtures cover at least: one 15-man team with a departed star, one rookie, one thin-sample veteran.

---

## 9. Errors

Pure pipeline: no throw on messy basketball data.

| Case | Behavior |
|---|---|
| Missing possessions | Per-36 from `mp` |
| Missing pace | `100` |
| `mp === 0` or `gp === 0` | Rates = position mean; source stays `model` if they have a box row |
| Empty team roster | Skip team; omit those players |
| `FGA === 0` after compose | `FG_PCT` = position mean FG |
| Usage cannot hit 100 after caps | Closest feasible; still emit projections |
| Unknown player on roster without box or rookie prior | Position-mean rates + bin `null` minutes table, `source: "rookie_prior"` |

No HTTP in the pure module. A future NBA Stats adapter maps timeouts to empty arrays + a typed error at the adapter boundary only (`NBA_STATS_UNAVAILABLE`). v1 fixture adapter does not fail that way.

---

## 10. Testing

- **Unit:** per-36; regression weight; one-team minutes sum 240; weighted usage 100 (or documented closest); compose usageScale vs minutes-driven split; rookie uses same `PlayerProjection` shape; `applyAging` identity; FG% from shooting.
- **Fixture pipeline:** 15-man team, departed 36-mpg star → remaining same-bucket players gain minutes; rookie 1st-overall MPG above undrafted on the same team; no player MPG > 38.
- **Backtest harness:** given two fixture seasons, compute MAE + Spearman vs last-year baseline. Fixture numbers are constructed so the model **beats** baseline (proves the harness), not so we claim real NBA accuracy in CI.
- **No** live NBA HTTP in CI. **No** BBM in CI.

---

## 11. Implementation sequencing

1. Shared `CategoryId` + projection types.  
2. Rate, regress, minutes, usage, GP, compose as separate pure functions + tests.  
3. Rookie prior + pipeline `projectSeason`.  
4. Fixture adapter + 240/usage invariant tests.  
5. Backtest harness (MAE, Spearman, last-year baseline).  
6. Aging identity stub. Adapter HTTP later.

---

## 12. Decisions (brainstorming 2026-09-07)

| Topic | Decision |
|---|---|
| Horizon | Preseason season-long first; ROS/weekly hook = swap mpg/gp |
| Base | Last-season box; we own minutes, usage, aging-later |
| Rookies | Slot + optional translated rates; same units; no caste discount |
| Output | mpg, gp, usg, rates, 9-cat, shooting |
| Role | Vacancy allocation, not independent scale |
| Conservation | 240 minutes; minutes-weighted USG = 100 |
| Aging | Family curves after research; identity until both gates pass |
| BBM | Benchmark only |
| Engine shape | Sequential pipeline (not joint solver) |
| Success | MAE + Spearman vs last-year; BBM not a gate |

---

## 13. Approval

- Horizon, base, rookie alignment, output, 240+usage, aging research gate, BBM-as-benchmark, sequential pipeline, success C — chosen in session.  
- Allocation constants (`k`, caps, draft-slot table, usageScale split) are **defaults to revise after first real run**.  
- Next: implementation plan, then build.
