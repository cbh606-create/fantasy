# NBA Stats Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a pure preseason projection pipeline that turns last-season boxes + opening rosters into 9-cat `PlayerProjection`s with team minutes = 240 and minutes-weighted usage = 100.

**Architecture:** Sequential pure functions in `src/lib/projections/` (`rateFromBox` → `regress` → `allocateMinutes` → `allocateUsage` → `gamesPrior` → `compose`). Fixture adapter only in v1. Aging is identity. Backtest compares the model to a last-year-per-game baseline.

**Tech Stack:** TypeScript, Vitest, Node. No Next.js, ESPN, or UI in this plan. Repo currently has no `package.json` — Task 1 adds the test runner.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-07-nba-stats-projection-design.md`
- Category ids only: `FG_PCT` `FT_PCT` `TPM` `REB` `AST` `STL` `BLK` `TO` `PTS`
- `FGM`/`FGA`/`FTM`/`FTA` live on `shooting`, never as `CategoryId`
- Team `sum(mpg) === 240`; minutes-weighted `sum(usg * mpg) / 240 === 100` (or closest after caps)
- Rookies use the same `PlayerProjection` shape; no rookie discount multiplier
- `applyAging` is identity; `AGING_ENABLED` stays `false`
- No BBM ingest, no NBA HTTP in CI, no semicolons in TS
- Conventional commits: `feat(projections): ...` / `test(projections): ...` / `chore: ...`

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json` | scripts, vitest, typescript |
| `tsconfig.json` | `paths`: `@/*` → `src/*` |
| `vitest.config.ts` | node env + alias |
| `src/lib/domain/categories.ts` | `CategoryId`, `ALL_CATEGORY_IDS` |
| `src/lib/projections/types.ts` | box, roster, rates, `PlayerProjection` |
| `src/lib/projections/position.ts` | `G` / `wing` / `big` bucket |
| `src/lib/projections/rates.ts` | last-season → per-36 `Rates` |
| `src/lib/projections/regress.ts` | sample-size regression + position means |
| `src/lib/projections/minutes.ts` | vacancy allocation to 240 |
| `src/lib/projections/usage.ts` | vacancy allocation to weighted 100 |
| `src/lib/projections/games.ts` | GP prior |
| `src/lib/projections/compose.ts` | per-game 9-cat + shooting |
| `src/lib/projections/rookies.ts` | draft-slot prior table |
| `src/lib/projections/aging.ts` | identity stub |
| `src/lib/projections/pipeline.ts` | `projectSeason` |
| `src/lib/projections/baseline.ts` | last-year per-game baseline |
| `src/lib/projections/backtest.ts` | MAE + Spearman |
| `src/lib/projections/adapter.ts` | load fixture JSON |
| `data/fixtures/projection-season-t.json` | season T boxes + departed |
| `data/fixtures/projection-season-t1.json` | T+1 roster, rookies, actuals |
| `tests/unit/*.test.ts` | one file per module |

---

### Task 1: TypeScript + Vitest scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Test: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` runs Vitest; import alias `@/` resolves to `src/`

- [ ] **Step 1: Write a failing smoke test**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest"

describe("scaffold", () => {
  it("resolves the @ alias", async () => {
    const { ALL_CATEGORY_IDS } = await import("@/lib/domain/categories")
    expect(ALL_CATEGORY_IDS).toHaveLength(9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/smoke.test.ts`

Expected: FAIL (no `package.json` / cannot resolve `@/lib/domain/categories`)

- [ ] **Step 3: Write scaffold + category ids**

`package.json`:

```json
{
  "name": "fantasy",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.8.2",
    "vitest": "^3.0.8",
    "@types/node": "^22.13.10"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(root, "src")
    }
  },
  test: {
    environment: "node"
  }
})
```

`src/lib/domain/categories.ts`:

```ts
export const ALL_CATEGORY_IDS = [
  "FG_PCT",
  "FT_PCT",
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "TO",
  "PTS"
] as const

export type CategoryId = (typeof ALL_CATEGORY_IDS)[number]
```

Then `npm install`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/smoke.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/lib/domain/categories.ts tests/unit/smoke.test.ts
git commit -m "chore: add vitest scaffold and category ids"
```

---

### Task 2: Projection types and position buckets

**Files:**
- Create: `src/lib/projections/types.ts`
- Create: `src/lib/projections/position.ts`
- Test: `tests/unit/position.test.ts`

**Interfaces:**
- Consumes: `CategoryId` from `@/lib/domain/categories`
- Produces:
  - `NbaPosition = "PG" | "SG" | "SF" | "PF" | "C"`
  - `PositionBucket = "G" | "wing" | "big"`
  - `positionBucket(pos: NbaPosition): PositionBucket`
  - `primaryBucket(positions: NbaPosition[]): PositionBucket`
  - types: `ShootingVolume`, `Rates`, `SeasonBox`, `RosterPlayer`, `DepartedPlayer`, `RosterSnapshot`, `RookiePrior`, `PlayerProjection`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { positionBucket, primaryBucket } from "@/lib/projections/position"

describe("positionBucket", () => {
  it("maps guards wings and bigs", () => {
    expect(positionBucket("PG")).toBe("G")
    expect(positionBucket("SG")).toBe("G")
    expect(positionBucket("SF")).toBe("wing")
    expect(positionBucket("PF")).toBe("big")
    expect(positionBucket("C")).toBe("big")
  })

  it("uses the primary listed position", () => {
    expect(primaryBucket(["SF", "PF"])).toBe("wing")
    expect(primaryBucket([])).toBe("wing")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/position.test.ts`

Expected: FAIL cannot find module

- [ ] **Step 3: Write types + position helpers**

`src/lib/projections/position.ts`:

```ts
import type { NbaPosition, PositionBucket } from "@/lib/projections/types"

export const positionBucket = (pos: NbaPosition): PositionBucket => {
  if (pos === "PG" || pos === "SG") return "G"
  if (pos === "SF") return "wing"
  return "big"
}

export const primaryBucket = (positions: NbaPosition[]): PositionBucket => {
  if (positions.length === 0) return "wing"
  return positionBucket(positions[0])
}
```

`src/lib/projections/types.ts` — export exactly:

```ts
import type { CategoryId } from "@/lib/domain/categories"

export type NbaPosition = "PG" | "SG" | "SF" | "PF" | "C"
export type PositionBucket = "G" | "wing" | "big"

export type ShootingVolume = {
  FGM: number
  FGA: number
  FTM: number
  FTA: number
}

export type Rates = {
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  tpm: number
  shooting: ShootingVolume
}

export type SeasonBox = {
  playerId: string
  name: string
  season: number
  teamId: string
  age: number
  positions: NbaPosition[]
  gp: number
  mp: number
  mpg: number
  usg: number
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  tpm: number
  fgm: number
  fga: number
  ftm: number
  fta: number
  possessions?: number
}

export type RosterPlayer = {
  playerId: string
  positions: NbaPosition[]
}

export type DepartedPlayer = {
  playerId: string
  lastMpg: number
  lastUsg: number
  positions: NbaPosition[]
}

export type RosterSnapshot = {
  season: number
  teamId: string
  pace?: number
  players: RosterPlayer[]
  departed: DepartedPlayer[]
}

export type RookiePrior = {
  playerId: string
  name: string
  positions: NbaPosition[]
  age: number
  draftSlot: number | null
  rates?: Rates
}

export type PlayerProjection = {
  playerId: string
  name: string
  season: number
  teamId: string
  positions: NbaPosition[]
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

`DepartedPlayer.positions` is required so minutes claim can match buckets (spec: departed same-bucket MPG).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/position.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/projections/types.ts src/lib/projections/position.ts tests/unit/position.test.ts
git commit -m "feat(projections): add domain types and position buckets"
```

---

### Task 3: Per-36 rates and regression

**Files:**
- Create: `src/lib/projections/rates.ts`
- Create: `src/lib/projections/regress.ts`
- Test: `tests/unit/rates.test.ts`
- Test: `tests/unit/regress.test.ts`

**Interfaces:**
- Consumes: `SeasonBox`, `Rates`, `NbaPosition`, `primaryBucket`
- Produces:
  - `emptyRates(): Rates`
  - `rateFromBox(box: SeasonBox): Rates`
  - `REGRESSION_K` map
  - `positionMeans(boxes: SeasonBox[]): Record<PositionBucket, { rates: Rates; usg: number; gp: number; n: number }>`
  - `regressRates(observed: Rates, mean: Rates, gp: number): Rates`
  - `regressUsg(observed: number, mean: number, gp: number): number`

- [ ] **Step 1: Write failing tests**

`tests/unit/rates.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { rateFromBox } from "@/lib/projections/rates"
import type { SeasonBox } from "@/lib/projections/types"

const box = (over: Partial<SeasonBox> = {}): SeasonBox => ({
  playerId: "p1",
  name: "Test",
  season: 2025,
  teamId: "AAA",
  age: 26,
  positions: ["PG"],
  gp: 70,
  mp: 2520,
  mpg: 36,
  usg: 28,
  pts: 1764,
  reb: 280,
  ast: 420,
  stl: 70,
  blk: 21,
  tov: 210,
  tpm: 140,
  fgm: 630,
  fga: 1400,
  ftm: 350,
  fta: 400,
  ...over
})

describe("rateFromBox", () => {
  it("converts totals to per-36", () => {
    const r = rateFromBox(box())
    expect(r.pts).toBeCloseTo(25.2, 5)
    expect(r.shooting.FGA).toBeCloseTo(20, 5)
  })

  it("uses position-safe 1 minute when mp is 0", () => {
    const r = rateFromBox(box({ mp: 0, pts: 0 }))
    expect(r.pts).toBe(0)
  })
})
```

`tests/unit/regress.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { emptyRates } from "@/lib/projections/rates"
import { regressRates, regressUsg } from "@/lib/projections/regress"

describe("regressRates", () => {
  it("returns the mean when gp is 0", () => {
    const mean = { ...emptyRates(), pts: 18 }
    const observed = { ...emptyRates(), pts: 40 }
    expect(regressRates(observed, mean, 0).pts).toBe(18)
  })

  it("pulls noisy counting stats toward the mean", () => {
    const mean = { ...emptyRates(), pts: 18 }
    const observed = { ...emptyRates(), pts: 40 }
    const out = regressRates(observed, mean, 20)
    expect(out.pts).toBeGreaterThan(18)
    expect(out.pts).toBeLessThan(40)
  })
})

describe("regressUsg", () => {
  it("uses k=40", () => {
    expect(regressUsg(30, 20, 40)).toBe(25)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/rates.test.ts tests/unit/regress.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement rates + regress**

`src/lib/projections/rates.ts`:

```ts
import type { Rates, SeasonBox, ShootingVolume } from "@/lib/projections/types"

export const emptyShooting = (): ShootingVolume => ({
  FGM: 0,
  FGA: 0,
  FTM: 0,
  FTA: 0
})

export const emptyRates = (): Rates => ({
  pts: 0,
  reb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  tpm: 0,
  shooting: emptyShooting()
})

const per36 = (total: number, mp: number) => (total * 36) / Math.max(mp, 1)

export const rateFromBox = (box: SeasonBox): Rates => ({
  pts: per36(box.pts, box.mp),
  reb: per36(box.reb, box.mp),
  ast: per36(box.ast, box.mp),
  stl: per36(box.stl, box.mp),
  blk: per36(box.blk, box.mp),
  tov: per36(box.tov, box.mp),
  tpm: per36(box.tpm, box.mp),
  shooting: {
    FGM: per36(box.fgm, box.mp),
    FGA: per36(box.fga, box.mp),
    FTM: per36(box.ftm, box.mp),
    FTA: per36(box.fta, box.mp)
  }
})
```

`src/lib/projections/regress.ts`:

```ts
import { primaryBucket } from "@/lib/projections/position"
import { emptyRates } from "@/lib/projections/rates"
import type { PositionBucket, Rates, SeasonBox } from "@/lib/projections/types"

export const REGRESSION_K = {
  shooting: 50,
  creation: 40,
  athleticism: 80,
  size: 40,
  usg: 40
} as const

const blend = (observed: number, mean: number, gp: number, k: number) => {
  const w = gp / (gp + k)
  return w * observed + (1 - w) * mean
}

export const regressRates = (observed: Rates, mean: Rates, gp: number): Rates => ({
  pts: blend(observed.pts, mean.pts, gp, REGRESSION_K.creation),
  reb: blend(observed.reb, mean.reb, gp, REGRESSION_K.size),
  ast: blend(observed.ast, mean.ast, gp, REGRESSION_K.creation),
  stl: blend(observed.stl, mean.stl, gp, REGRESSION_K.athleticism),
  blk: blend(observed.blk, mean.blk, gp, REGRESSION_K.athleticism),
  tov: blend(observed.tov, mean.tov, gp, REGRESSION_K.creation),
  tpm: blend(observed.tpm, mean.tpm, gp, REGRESSION_K.creation),
  shooting: {
    FGM: blend(observed.shooting.FGM, mean.shooting.FGM, gp, REGRESSION_K.shooting),
    FGA: blend(observed.shooting.FGA, mean.shooting.FGA, gp, REGRESSION_K.shooting),
    FTM: blend(observed.shooting.FTM, mean.shooting.FTM, gp, REGRESSION_K.shooting),
    FTA: blend(observed.shooting.FTA, mean.shooting.FTA, gp, REGRESSION_K.shooting)
  }
})

export const regressUsg = (observed: number, mean: number, gp: number) =>
  blend(observed, mean, gp, REGRESSION_K.usg)

export type PositionMean = {
  rates: Rates
  usg: number
  gp: number
  n: number
}

const MEAN_GP_MIN = 20

export const positionMeans = (
  boxes: SeasonBox[]
): Record<PositionBucket, PositionMean> => {
  const acc: Record<PositionBucket, { rates: Rates; usg: number; gp: number; n: number }> = {
    G: { rates: emptyRates(), usg: 0, gp: 0, n: 0 },
    wing: { rates: emptyRates(), usg: 0, gp: 0, n: 0 },
    big: { rates: emptyRates(), usg: 0, gp: 0, n: 0 }
  }

  for (const box of boxes) {
    if (box.gp < MEAN_GP_MIN) continue
    const b = primaryBucket(box.positions)
    const r = rateFromBoxForMean(box)
    const slot = acc[b]
    slot.n += 1
    slot.usg += box.usg
    slot.gp += box.gp
    slot.rates.pts += r.pts
    slot.rates.reb += r.reb
    slot.rates.ast += r.ast
    slot.rates.stl += r.stl
    slot.rates.blk += r.blk
    slot.rates.tov += r.tov
    slot.rates.tpm += r.tpm
    slot.rates.shooting.FGM += r.shooting.FGM
    slot.rates.shooting.FGA += r.shooting.FGA
    slot.rates.shooting.FTM += r.shooting.FTM
    slot.rates.shooting.FTA += r.shooting.FTA
  }

  const out = {} as Record<PositionBucket, PositionMean>
  for (const key of ["G", "wing", "big"] as PositionBucket[]) {
    const slot = acc[key]
    const n = Math.max(slot.n, 1)
    out[key] = {
      n: slot.n,
      usg: slot.usg / n,
      gp: slot.gp / n,
      rates: {
        pts: slot.rates.pts / n,
        reb: slot.rates.reb / n,
        ast: slot.rates.ast / n,
        stl: slot.rates.stl / n,
        blk: slot.rates.blk / n,
        tov: slot.rates.tov / n,
        tpm: slot.rates.tpm / n,
        shooting: {
          FGM: slot.rates.shooting.FGM / n,
          FGA: slot.rates.shooting.FGA / n,
          FTM: slot.rates.shooting.FTM / n,
          FTA: slot.rates.shooting.FTA / n
        }
      }
    }
  }
  return out
}

import { rateFromBox } from "@/lib/projections/rates"

const rateFromBoxForMean = (box: SeasonBox) => rateFromBox(box)
```

Move the `rateFromBox` import to the top of `regress.ts` (no mid-file import). The implementer should put `import { rateFromBox, emptyRates } from "@/lib/projections/rates"` at the top and delete `rateFromBoxForMean` — call `rateFromBox` directly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/rates.test.ts tests/unit/regress.test.ts`

Expected: PASS (`regressUsg(30, 20, 40)` is exactly 25)

- [ ] **Step 5: Commit**

```bash
git add src/lib/projections/rates.ts src/lib/projections/regress.ts tests/unit/rates.test.ts tests/unit/regress.test.ts
git commit -m "feat(projections): add per-36 rates and regression"
```

---

### Task 4: Minutes 240 and usage 100

**Files:**
- Create: `src/lib/projections/minutes.ts`
- Create: `src/lib/projections/usage.ts`
- Test: `tests/unit/minutes.test.ts`
- Test: `tests/unit/usage.test.ts`

**Interfaces:**
- Consumes: `RosterSnapshot`, `primaryBucket`, `DepartedPlayer`
- Produces:
  - `allocateMinutes(input: MinutesInput[]): Map<string, number>` summing to 240
  - `allocateUsage(input: UsageInput[]): Map<string, number>` with weighted usage 100
  - `MinutesInput = { playerId, positions, priorMpg }`
  - `UsageInput = { playerId, positions, mpg, priorUsg }`

```ts
export type MinutesInput = {
  playerId: string
  positions: import("@/lib/projections/types").NbaPosition[]
  priorMpg: number
}

export type UsageInput = {
  playerId: string
  positions: import("@/lib/projections/types").NbaPosition[]
  mpg: number
  priorUsg: number
}
```

- [ ] **Step 1: Write failing tests**

`tests/unit/minutes.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { allocateMinutes } from "@/lib/projections/minutes"
import type { RosterSnapshot } from "@/lib/projections/types"

const roster: RosterSnapshot = {
  season: 2026,
  teamId: "AAA",
  players: [
    { playerId: "star", positions: ["PG"] },
    { playerId: "backup", positions: ["PG"] },
    { playerId: "wing", positions: ["SF"] }
  ],
  departed: [{ playerId: "gone", lastMpg: 36, lastUsg: 28, positions: ["PG"] }]
}

describe("allocateMinutes", () => {
  it("sums to 240", () => {
    const mpg = allocateMinutes(
      [
        { playerId: "star", positions: ["PG"], priorMpg: 34 },
        { playerId: "backup", positions: ["PG"], priorMpg: 16 },
        { playerId: "wing", positions: ["SF"], priorMpg: 30 }
      ],
      roster
    )
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(240, 5)
  })

  it("gives leftover minutes to the same bucket as the departed star", () => {
    const mpg = allocateMinutes(
      [
        { playerId: "star", positions: ["PG"], priorMpg: 34 },
        { playerId: "backup", positions: ["PG"], priorMpg: 16 },
        { playerId: "wing", positions: ["SF"], priorMpg: 30 }
      ],
      roster
    )
    expect(mpg.get("backup")!).toBeGreaterThan(16)
    expect(mpg.get("backup")!).toBeGreaterThan(mpg.get("wing")! - 30)
    expect(Math.max(...mpg.values())).toBeLessThanOrEqual(38)
  })
})
```

`tests/unit/usage.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { allocateUsage, weightedUsage } from "@/lib/projections/usage"

describe("allocateUsage", () => {
  it("hits minutes-weighted 100", () => {
    const usg = allocateUsage(
      [
        { playerId: "a", positions: ["PG"], mpg: 36, priorUsg: 28 },
        { playerId: "b", positions: ["PG"], mpg: 24, priorUsg: 18 },
        { playerId: "c", positions: ["SF"], mpg: 180, priorUsg: 16 }
      ],
      {
        season: 2026,
        teamId: "AAA",
        players: [
          { playerId: "a", positions: ["PG"] },
          { playerId: "b", positions: ["PG"] },
          { playerId: "c", positions: ["SF"] }
        ],
        departed: [{ playerId: "gone", lastMpg: 36, lastUsg: 30, positions: ["PG"] }]
      }
    )
    const mpg = new Map([
      ["a", 36],
      ["b", 24],
      ["c", 180]
    ])
    expect(weightedUsage(usg, mpg)).toBeCloseTo(100, 3)
    for (const v of usg.values()) {
      expect(v).toBeGreaterThanOrEqual(8)
      expect(v).toBeLessThanOrEqual(35)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/minutes.test.ts tests/unit/usage.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement allocation**

Follow spec §5.3–5.4 exactly:

- Minutes: vacancy `240 - sum(prior)` distributed by `claim = priorMpg * 0.5 + departedSameBucketMpg * 0.5`. `departedSameBucketMpg` = sum of departed `lastMpg` in that bucket, split equally among current players in the bucket (if the bucket is empty, distribute leftover by `priorMpg` league-wide). Surplus cut from players above 20 MPG. Cap `[0, 38]`. Max 8 loops, then scale to exact 240.
- Usage: `weighted = sum(usg * mpg) / 240`. Vacancy toward 100 by same claim using `lastUsg`. Surplus: scale all by `100 / weighted`. Cap `[8, 35]` except keep `< 8` if prior `< 8` and they got no extra minutes. If caps block 100, scale uncapped only; return closest.

Export `weightedUsage(usg: Map<string, number>, mpg: Map<string, number>): number`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/minutes.test.ts tests/unit/usage.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/projections/minutes.ts src/lib/projections/usage.ts tests/unit/minutes.test.ts tests/unit/usage.test.ts
git commit -m "feat(projections): allocate team minutes and usage"
```

---

### Task 5: Games prior and compose

**Files:**
- Create: `src/lib/projections/games.ts`
- Create: `src/lib/projections/compose.ts`
- Test: `tests/unit/games.test.ts`
- Test: `tests/unit/compose.test.ts`

**Interfaces:**
- Consumes: `Rates`, `CategoryId`, position mean FG/FT
- Produces:
  - `gamesPrior(lastGp: number, positionMeanGp: number): number` — `clamp(round(w * last + (1-w) * mean), 1, 82)` with `w = lastGp / (lastGp + 30)`
  - `compose(args: ComposeInput): { projections, shooting }`
  - `ComposeInput = { rates, mpg, allocatedUsg, baselineUsg, pace, positionMeanFg, positionMeanFt }`

Usage-driven: PTS AST TO TPM FGM FGA FTM FTA × `allocatedUsg / max(baselineUsg, 8)`  
Minutes-driven: REB STL BLK  
Then × `pace / 100`.  
`count = per36 * (mpg / 36)`.

- [ ] **Step 1: Write failing tests**

`tests/unit/games.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { gamesPrior } from "@/lib/projections/games"

describe("gamesPrior", () => {
  it("returns the mean when last gp is 0", () => {
    expect(gamesPrior(0, 64)).toBe(64)
  })

  it("clamps to 1..82", () => {
    expect(gamesPrior(82, 82)).toBe(82)
    expect(gamesPrior(0, 0)).toBe(1)
  })
})
```

`tests/unit/compose.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { emptyRates } from "@/lib/projections/rates"
import { compose } from "@/lib/projections/compose"

describe("compose", () => {
  it("scales usage cats and leaves stocks on minutes", () => {
    const rates = {
      ...emptyRates(),
      pts: 36,
      reb: 12,
      ast: 12,
      stl: 3,
      blk: 0,
      tov: 6,
      tpm: 6,
      shooting: { FGM: 12, FGA: 24, FTM: 6, FTA: 6 }
    }
    const out = compose({
      rates,
      mpg: 36,
      allocatedUsg: 30,
      baselineUsg: 20,
      pace: 100,
      positionMeanFg: 0.45,
      positionMeanFt: 0.75
    })
    expect(out.projections.PTS).toBeCloseTo(54, 5)
    expect(out.projections.REB).toBeCloseTo(12, 5)
    expect(out.projections.STL).toBeCloseTo(3, 5)
    expect(out.projections.FG_PCT).toBeCloseTo(0.5, 5)
    expect(out.shooting.FGA).toBeCloseTo(36, 5)
  })

  it("applies pace to counting stats", () => {
    const rates = { ...emptyRates(), pts: 36, reb: 12 }
    const out = compose({
      rates,
      mpg: 36,
      allocatedUsg: 20,
      baselineUsg: 20,
      pace: 110,
      positionMeanFg: 0.45,
      positionMeanFt: 0.75
    })
    expect(out.projections.PTS).toBeCloseTo(39.6, 5)
    expect(out.projections.REB).toBeCloseTo(13.2, 5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/games.test.ts tests/unit/compose.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement games + compose**

`gamesPrior`: `w = lastGp / (lastGp + 30)`, `clamp(Math.round(w * lastGp + (1 - w) * positionMeanGp), 1, 82)`. When `lastGp === 0`, `w === 0` so result is `clamp(round(mean), 1, 82)`.

`compose`: implement the formulas in the Interfaces block. If `FGA === 0`, `FG_PCT = positionMeanFg`. Same for FT.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/games.test.ts tests/unit/compose.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/projections/games.ts src/lib/projections/compose.ts tests/unit/games.test.ts tests/unit/compose.test.ts
git commit -m "feat(projections): add games prior and 9-cat compose"
```

---

### Task 6: Rookie prior, aging stub, pipeline

**Files:**
- Create: `src/lib/projections/rookies.ts`
- Create: `src/lib/projections/aging.ts`
- Create: `src/lib/projections/pipeline.ts`
- Test: `tests/unit/rookies.test.ts`
- Test: `tests/unit/aging.test.ts`
- Test: `tests/unit/pipeline.test.ts`

**Interfaces:**
- Consumes: all prior modules, `SeasonBox[]`, `RosterSnapshot[]`, `RookiePrior[]`
- Produces:
  - `DRAFT_SLOT_TABLE` as spec §6
  - `rookiePlayingTime(draftSlot: number | null): { mpg: number; usg: number; gp: number }`
  - `rookieRates(prior: RookiePrior, positionMean: Rates): Rates`
  - `AGING_ENABLED = false`
  - `applyAging(rates: Rates, age: number, bucket: PositionBucket): Rates` — returns `rates` unchanged
  - `projectSeason(boxes, rosters, rookies): PlayerProjection[]`

Pipeline per target-season roster player:

1. Find last-season box by `playerId` (prefer `teamId === TOT` if several).
2. If box: `source = "model"`, rates = `rateFromBox` then `regressRates` vs bucket mean, usg = `regressUsg`, priorMpg = `box.mpg`, lastGp = `box.gp`.
3. Else: find `RookiePrior` or synthesize slot `null`. `source = "rookie_prior"`. Rates from `rookieRates`. Playing time from table. Regression: `gp = prior.rates ? 15 : 0`.
4. `applyAging` on rates.
5. After every player on a team has priors, `allocateMinutes` then `allocateUsage` then `gamesPrior` then `compose`.
6. Skip teams with `players.length === 0`.

- [ ] **Step 1: Write failing tests**

`tests/unit/aging.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { applyAging, AGING_ENABLED } from "@/lib/projections/aging"
import { emptyRates } from "@/lib/projections/rates"

describe("applyAging", () => {
  it("is off and identity", () => {
    expect(AGING_ENABLED).toBe(false)
    const rates = { ...emptyRates(), pts: 22 }
    expect(applyAging(rates, 35, "G")).toEqual(rates)
  })
})
```

`tests/unit/rookies.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { rookiePlayingTime, rookieRates } from "@/lib/projections/rookies"
import { emptyRates } from "@/lib/projections/rates"

describe("rookiePlayingTime", () => {
  it("gives 1-4 more minutes than undrafted", () => {
    expect(rookiePlayingTime(1).mpg).toBeGreaterThan(rookiePlayingTime(null).mpg)
    expect(rookiePlayingTime(1).usg).toBe(24)
  })
})

describe("rookieRates", () => {
  it("uses position mean when no translation", () => {
    const mean = { ...emptyRates(), pts: 16 }
    const out = rookieRates(
      { playerId: "r", name: "R", positions: ["PG"], age: 19, draftSlot: 1 },
      mean
    )
    expect(out.pts).toBe(16)
  })

  it("mixes translated rates 50/50", () => {
    const mean = { ...emptyRates(), pts: 10 }
    const translated = { ...emptyRates(), pts: 20 }
    const out = rookieRates(
      {
        playerId: "r",
        name: "R",
        positions: ["PG"],
        age: 19,
        draftSlot: 1,
        rates: translated
      },
      mean
    )
    expect(out.pts).toBe(15)
  })
})
```

`tests/unit/pipeline.test.ts` — build 3 veterans on one team (enough `gp >= 20` boxes in the same buckets to form means), plus one rookie without a box. Assert: every projection has 9 category keys; team mpg sum 240; `agingApplied === false`; rookie `source === "rookie_prior"`; veteran `source === "model"`.

Include at least 3 `G` and 3 `big` and 3 `wing` boxes with `gp >= 20` in the pool so `positionMeans` is defined (can be extra players not on this roster).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/aging.test.ts tests/unit/rookies.test.ts tests/unit/pipeline.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement rookies, aging, pipeline**

Draft-slot table (exact):

```
1-4 → { mpg: 30, usg: 24, gp: 70 }
5-14 → { mpg: 24, usg: 20, gp: 65 }
15-30 → { mpg: 18, usg: 18, gp: 58 }
31-60 → { mpg: 14, usg: 16, gp: 50 }
null → { mpg: 10, usg: 14, gp: 40 }
```

`rookieRates`: if `prior.rates` then each numeric field `0.5 * translated + 0.5 * mean` (including shooting); else mean.

`projectSeason` as Interfaces. Players on a roster with neither box nor rookie prior: treat as `draftSlot: null`, `source: "rookie_prior"`, name = `playerId`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/aging.test.ts tests/unit/rookies.test.ts tests/unit/pipeline.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/projections/rookies.ts src/lib/projections/aging.ts src/lib/projections/pipeline.ts tests/unit/aging.test.ts tests/unit/rookies.test.ts tests/unit/pipeline.test.ts
git commit -m "feat(projections): run sequential season pipeline"
```

---

### Task 7: Fixture adapter and constructed holdout

**Files:**
- Create: `src/lib/projections/adapter.ts`
- Create: `data/fixtures/projection-season-t.json`
- Create: `data/fixtures/projection-season-t1.json`
- Test: `tests/unit/adapter.test.ts`
- Test: `tests/unit/fixturePipeline.test.ts`

**Interfaces:**
- Consumes: `projectSeason`
- Produces:
  - `loadFixtureSeason(path: string): { boxes: SeasonBox[]; rosters: RosterSnapshot[]; rookies: RookiePrior[]; actuals?: SeasonBox[] }`
  - `loadSeasonBoxes` / `loadRosters` / `loadRookiePriors` reading the two fixture files for seasons `2025` and `2026`

Fixture story (must hold):

- Team `AAA` last year: star PG `gone` 36 mpg / 28 usg, backup PG `backup` 16 mpg, wing `wing` 30 mpg, and enough filler to make basketball-looking totals. Other teams supply position-mean fodder (`gp >= 20`).
- T+1 roster: `gone` departed; `backup`, `wing`, fillers stay; rookie `pick1` draft slot 1 is added.
- T+1 **actuals**: `backup` plays ~28 mpg (vacancy filled), `pick1` ~30 mpg. Last-year baseline for `backup` stays 16 mpg — this is how the model beats baseline in Task 8.

- [ ] **Step 1: Write failing tests**

`tests/unit/adapter.test.ts` loads `projection-season-t.json` and expects at least one departed star and `boxes.length >= 20`.

`tests/unit/fixturePipeline.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { loadFixtureSeason } from "@/lib/projections/adapter"
import { projectSeason } from "@/lib/projections/pipeline"

describe("fixture pipeline", () => {
  it("keeps team minutes at 240 and caps mpg", async () => {
    const t = await loadFixtureSeason("data/fixtures/projection-season-t.json")
    const t1 = await loadFixtureSeason("data/fixtures/projection-season-t1.json")
    const out = projectSeason(t.boxes, t1.rosters, t1.rookies)
    const aaa = out.filter((p) => p.teamId === "AAA")
    const mpgSum = aaa.reduce((s, p) => s + p.mpg, 0)
    expect(mpgSum).toBeCloseTo(240, 3)
    expect(Math.max(...aaa.map((p) => p.mpg))).toBeLessThanOrEqual(38)
    const backup = aaa.find((p) => p.playerId === "backup")
    const pick1 = aaa.find((p) => p.playerId === "pick1")
    expect(backup?.mpg).toBeGreaterThan(16)
    expect(pick1?.source).toBe("rookie_prior")
    expect(pick1?.mpg).toBeGreaterThan(10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/adapter.test.ts tests/unit/fixturePipeline.test.ts`

Expected: FAIL missing files

- [ ] **Step 3: Write JSON fixtures + fs adapter**

Adapter reads JSON with `readFile` + `JSON.parse`. Paths are repo-relative (`process.cwd()`). Do not fetch HTTP.

Build 20+ veteran boxes so means exist. Keep numbers internally consistent enough for per-36 (mp ≈ mpg * gp).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/adapter.test.ts tests/unit/fixturePipeline.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/projections/adapter.ts data/fixtures/projection-season-t.json data/fixtures/projection-season-t1.json tests/unit/adapter.test.ts tests/unit/fixturePipeline.test.ts
git commit -m "feat(projections): add fixture adapter and vacancy story"
```

---

### Task 8: Last-year baseline and backtest harness

**Files:**
- Create: `src/lib/projections/baseline.ts`
- Create: `src/lib/projections/backtest.ts`
- Test: `tests/unit/backtest.test.ts`

**Interfaces:**
- Consumes: `SeasonBox`, `PlayerProjection`, `ALL_CATEGORY_IDS`
- Produces:
  - `lastYearBaseline(boxes: SeasonBox[], targetSeason: number): PlayerProjection[]` — per-game from last season totals/`gp`, `mpg`/`usg` copied, `source: "model"`, `agingApplied: false`, rates via `rateFromBox`. Only players who exist in `boxes`. Missing cats shooting from totals/`gp`.
  - `categoryZ(projections: Record<CategoryId, number>, pool: Record<CategoryId, number>[]): Record<CategoryId, number>` — TO inverted: `(mean - x) / stdev`, others `(x - mean) / stdev`. `stdev === 0` → 0.
  - `meanAbsoluteError(pred: number, actual: number): number`
  - `spearman(ranksA: number[], ranksB: number[]): number`
  - `backtest(args: { predicted: PlayerProjection[]; baseline: PlayerProjection[]; actuals: SeasonBox[] }): BacktestReport`

`BacktestReport`:

```ts
export type BacktestReport = {
  eligibleIds: string[]
  mae: Record<"MPG" | "USG" | CategoryId, { model: number; baseline: number }>
  spearman: { model: number; baseline: number }
  beatsMae: boolean
  beatsSpearman: boolean
}
```

Eligible: actual `gp >= 20` and the player exists in both predicted and baseline.  
MAE: mean of `|pred - actualPerGame|` (actual per-game = totals / gp; MPG/USG from actual box).  
`beatsMae`: model MAE lower on MPG, USG, and ≥ 6 of 9 cats.  
Spearman: rank by sum of category z vs actual z (equal weights). Use all eligible (fixture will not have 150). Higher is better.  
`lastYearBaseline` must **not** reallocate 240 — it is the naive copy the spec compares against.

- [ ] **Step 1: Write failing tests**

`tests/unit/backtest.test.ts`:

1. `spearman` of identical ranks is 1; reversed is -1.
2. `categoryZ` inverts TO.
3. Load fixtures, `projectSeason`, `lastYearBaseline(t.boxes, 2026)`, `backtest` against `t1.actuals`. Expect `beatsMae === true` and `beatsSpearman === true` on this constructed set (backup minutes + rookie).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/backtest.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement baseline + backtest**

Spearman: convert values to ranks (average ties), then Pearson of the two rank vectors.

```
pearson = cov / (sx * sy)
```

If a vector has 0 variance, return 0.

Actual per-game from `SeasonBox`: `pts/gp`, etc. `FG_PCT = fga > 0 ? fgm/fga : 0`.

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: all PASS, including constructed holdout beating baseline

- [ ] **Step 5: Commit**

```bash
git add src/lib/projections/baseline.ts src/lib/projections/backtest.ts tests/unit/backtest.test.ts
git commit -m "feat(projections): add last-year baseline and backtest harness"
```

---

## Self-review (plan vs spec)

| Spec section | Task |
|---|---|
| Category ids / shooting not cats | 1, 2, 5 |
| SeasonBox / Roster / Rookie / PlayerProjection | 2 |
| rateFromBox per-36 | 3 |
| Regression k by family | 3 |
| Minutes 240 + vacancy claim | 4, 7 |
| Weighted usage 100 + caps | 4 |
| GP prior k=30 | 5 |
| Compose usage vs minutes + pace | 5 |
| Rookie table, same shape, 50/50 mix | 6 |
| Aging identity | 6 |
| projectSeason | 6 |
| Fixture adapter, no HTTP | 7 |
| MAE + Spearman vs last-year; BBM not in CI | 8 |
| Empty team skip / missing box → null slot | 6 |
| ROS hooks (store mpg/gp/rates) | 2 output fields; no extra task |

No `fitAgingCurves` task — spec allows deferring the research fitter. No BBM loader — spec says not required.
