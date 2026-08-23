# Final Fix Report — Mock Simulation Error Clear

## Finding
`runMockSimulation` set shared `error` on failure but never cleared it on start (unlike `runSimulation`).

## Fix
Added `setError("")` at the start of `runMockSimulation` alongside `setIsMockSimulating(true)`.

**File:** `src/components/draft/DraftWorkspace.tsx`

## Tests
```
npx.cmd vitest run tests/unit/DraftWorkspace.test.tsx --maxWorkers=1
```
- Result: **PASS** — 1 file, 6 tests passed (12.87s)

## Commit
`fix(draft): clear error when starting mock simulation`

---

# Final Fix Report — ESPN Remote Browser Connect

## Fixes
- Lazy-loaded Playwright and the live worker, with Playwright configured as a server external package.
- Stopped waiting-page polling on unauthenticated, missing-session, and not-found terminal errors and exposed retry UI.
- Added explicit consent copy describing the short-lived login browser, espn_s2 / SWID capture, server storage, league-sync-only use, and read-access trust.
- Added regressions for terminal worker outcomes preserving credentials, status-route authorization and validation, disabled live mode, and build-safe Playwright loading.

## Tests
```
npx.cmd vitest run --maxWorkers=1 tests/unit/espnConnectSession.test.ts tests/unit/espnConnectWorkerLive.test.ts tests/api/espnConnect.test.ts tests/api/espnCredentials.test.ts tests/unit/espnCookies.test.ts
```
- Result: **PASS** — 5 files, 23 tests passed (9.96s)

```
npx.cmd eslint next.config.ts src/app/roster/espn-connect/page.tsx src/app/roster/page.tsx src/lib/espn/connectWorker.ts src/lib/espn/connectWorkerLive.ts tests/api/espnConnect.test.ts tests/unit/espnConnectWorkerLive.test.ts
```
- Result: **PASS**

```
npm.cmd run build
```
- Result: **BLOCKED by an unrelated existing Turbopack error** — `@libsql/hrana-client/LICENSE` was parsed as ECMAScript.

## Manual smoke
Manual private-league smoke still required by user with ESPN_CONNECT_LIVE=true.
