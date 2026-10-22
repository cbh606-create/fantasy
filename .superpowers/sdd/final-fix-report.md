# RotoWire cache final fix report

## Summary

Addressed the three Important review findings in `src/lib/injuries/rotowireCache.ts` and added unit coverage in `tests/unit/rotowireCache.test.ts`.

### 1. Game day uses Eastern time

- Replaced UTC `sameUtcDate` with `easternCalendarDate` / `sameEasternDate` using `Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" })`.
- Invalid dates are skipped before formatting (no `toISOString()` on bad values).
- Lineup fast TTL also treats a future tip on the same Eastern calendar day as within the 5-minute refresh window (so a 7pm ET tip is “game day” at 2pm ET).

### 2. Bad DateTime must not 500 the route

- `parseGameStartTimes` stores only strings that `new Date` parses successfully (`parseableStartTime`).
- Game-day detection ignores invalid cached tip strings.

### 3. Per-input refresh on failure

- Removed the single outer `try/catch`.
- Each of injuries, depth, lineups (+ `gameStartTimes`), and players has its own `try/catch`; success updates that stamp, failure keeps the previous stamp for that input only.
- `memory` is always assigned to the merged `next` snapshot after refresh attempts.
- Missing/blank `ROTOWIRE_API_KEY` still returns prior snapshot or empty cache without fetching.

## Commit

- **SHA:** `9ab5ad5`
- **Subject:** `fix(injuries): refresh each RotoWire input on Eastern game days`

## Tests

Command:

```bash
npx vitest run tests/unit/rotowireCache.test.ts
```

Output:

```
npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.

 RUN  v4.1.10 C:/dev/fantasy


 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  08:47:29
   Duration  209ms (transform 42ms, setup 0ms, import 56ms, tests 37ms, environment 0ms)
```

New cases:

- Eastern game day at 2pm ET with a 7pm ET projected tip: second load at +6 minutes refetches injuries and lineups, not depth.
- Malformed lineup `DateTime` `"not-a-date"` does not break subsequent loads.
- Depth endpoint 500 after stale depth with changed injuries: injuries update, depth chart unchanged.
