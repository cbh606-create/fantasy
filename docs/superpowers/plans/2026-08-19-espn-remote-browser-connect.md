# ESPN Remote Browser Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users connect private ESPN leagues by logging into ESPN in a short-lived Playwright browser session, storing `espn_s2`/`SWID` via existing credentials helpers—without DevTools paste or a browser extension.

**Architecture:** New connect session store + `start`/`status` APIs. A pluggable worker (mock in tests; headed Playwright in local/dev) waits for ESPN cookies, then `upsertUserEspnCredentials`. Roster UI primary CTA opens an in-app waiting page and polls status; cookie paste stays as collapsed fallback.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma/SQLite, Vitest, Playwright (already in repo), Clerk via `requireUserId`. Worktree: `.worktrees/feat-season-roster` on `feat/matchup-advisor`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-espn-remote-browser-connect-design.md`
- Never return cookie values from connect/credentials APIs after save
- Never store ESPN passwords
- Do not overwrite existing `EspnCredential` on `timed_out` / `failed`
- One active connect session per Clerk user
- Session TTL: **10 minutes**
- CI: mock worker only — no live ESPN login in Vitest
- Live worker gated by `ESPN_CONNECT_LIVE=true` (and Playwright available)
- Phase 1 viewer: **local headed browser window** on the machine running Next (not Browserbase/noVNC). In-app page only shows instructions + poll
- Keep paste-cookies fallback
- No semicolons; `handle*` handlers; Tailwind; conventional commits
- Tests: `npx.cmd vitest run --maxWorkers=1 <paths>` (Windows)

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/espn/connectTypes.ts` | Session status union + public DTO types |
| `src/lib/espn/connectSession.ts` | Create/get/update/expire sessions; one-active-per-user; TTL |
| `src/lib/espn/connectWorker.ts` | Worker interface + `getConnectWorker()` (mock vs live) |
| `src/lib/espn/connectWorkerLive.ts` | Headed Playwright: open ESPN, poll cookies, upsert, finish |
| `src/app/api/espn/connect/start/route.ts` | `POST` start session + kick worker |
| `src/app/api/espn/connect/status/route.ts` | `GET` status by `sessionId` |
| `src/app/roster/espn-connect/page.tsx` | Waiting UI: instructions + poll until terminal |
| `src/app/roster/page.tsx` | Primary “Log in with ESPN”; collapse paste; expired → reconnect |
| `src/components/season/SeasonRosterWorkspace.tsx` | `ESPN_AUTH` / expired CTA → `/roster` connect (or deep-link start) |
| `prisma/schema.prisma` + migration | `EspnConnectSession` model |
| `tests/unit/espnConnectSession.test.ts` | TTL, one-active, no overwrite rules via store helpers |
| `tests/api/espnConnect.test.ts` | start/status auth, 409, mock success path |

---

### Task 1: Prisma session model + connect types/store

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/espn/connectTypes.ts`
- Create: `src/lib/espn/connectSession.ts`
- Create: `tests/unit/espnConnectSession.test.ts`

**Interfaces:**
- Produces:
  - `export type EspnConnectStatus = "pending" | "awaiting_login" | "succeeded" | "timed_out" | "failed" | "cancelled"`
  - `export type EspnConnectSessionRecord = { id: string; clerkUserId: string; status: EspnConnectStatus; errorCode: string | null; expiresAt: Date; createdAt: Date; updatedAt: Date }`
  - `CONNECT_SESSION_TTL_MS = 10 * 60 * 1000`
  - `createConnectSession(clerkUserId: string): Promise<EspnConnectSessionRecord>` — if another non-terminal session exists for user → throw `ConnectSessionConflictError`
  - `getConnectSessionForUser(sessionId: string, clerkUserId: string): Promise<EspnConnectSessionRecord | null>`
  - `updateConnectSessionStatus(sessionId: string, status: EspnConnectStatus, errorCode?: string | null): Promise<EspnConnectSessionRecord>`
  - `expireConnectSessionIfNeeded(session: EspnConnectSessionRecord): Promise<EspnConnectSessionRecord>` — if past `expiresAt` and status in `pending|awaiting_login` → set `timed_out`
  - `isTerminalConnectStatus(status: EspnConnectStatus): boolean`

- [ ] **Step 1: Add Prisma model**

Append to `prisma/schema.prisma`:

```prisma
model EspnConnectSession {
  id          String   @id @default(cuid())
  clerkUserId String
  status      String
  errorCode   String?
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([clerkUserId])
}
```

Run:

```bash
npx.cmd prisma migrate dev --name espn_connect_session
```

Expected: migration applied; client generated.

- [ ] **Step 2: Write failing unit tests**

```ts
// tests/unit/espnConnectSession.test.ts
import { afterEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import {
  CONNECT_SESSION_TTL_MS,
  ConnectSessionConflictError,
  createConnectSession,
  expireConnectSessionIfNeeded,
  getConnectSessionForUser,
  isTerminalConnectStatus,
  updateConnectSessionStatus,
} from "@/lib/espn/connectSession"

const prefix = `espn-connect-unit-${crypto.randomUUID()}`

afterEach(async () => {
  await db.espnConnectSession.deleteMany({
    where: { clerkUserId: { startsWith: prefix } },
  })
})

describe("espn connect sessions", () => {
  it("creates a pending session with ~10m TTL", async () => {
    const userId = `${prefix}-a`
    const before = Date.now()
    const session = await createConnectSession(userId)
    expect(session.status).toBe("pending")
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + CONNECT_SESSION_TTL_MS - 1000,
    )
    expect(isTerminalConnectStatus("pending")).toBe(false)
    expect(isTerminalConnectStatus("succeeded")).toBe(true)
  })

  it("rejects a second active session for the same user", async () => {
    const userId = `${prefix}-b`
    await createConnectSession(userId)
    await expect(createConnectSession(userId)).rejects.toBeInstanceOf(
      ConnectSessionConflictError,
    )
  })

  it("allows a new session after the previous succeeded", async () => {
    const userId = `${prefix}-c`
    const first = await createConnectSession(userId)
    await updateConnectSessionStatus(first.id, "succeeded")
    const second = await createConnectSession(userId)
    expect(second.id).not.toBe(first.id)
  })

  it("marks awaiting_login as timed_out when past expiresAt", async () => {
    const userId = `${prefix}-d`
    const session = await createConnectSession(userId)
    await db.espnConnectSession.update({
      where: { id: session.id },
      data: {
        status: "awaiting_login",
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    const loaded = await getConnectSessionForUser(session.id, userId)
    expect(loaded).not.toBeNull()
    const expired = await expireConnectSessionIfNeeded(loaded!)
    expect(expired.status).toBe("timed_out")
  })

  it("does not expose other users sessions", async () => {
    const owner = `${prefix}-owner`
    const other = `${prefix}-other`
    const session = await createConnectSession(owner)
    expect(await getConnectSessionForUser(session.id, other)).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/espnConnectSession.test.ts
```

Expected: FAIL (module / model missing).

- [ ] **Step 4: Implement types + store**

`src/lib/espn/connectTypes.ts`:

```ts
export type EspnConnectStatus =
  | "pending"
  | "awaiting_login"
  | "succeeded"
  | "timed_out"
  | "failed"
  | "cancelled"

export const CONNECT_SESSION_TTL_MS = 10 * 60 * 1000

export const isTerminalConnectStatus = (
  status: EspnConnectStatus,
): boolean =>
  status === "succeeded" ||
  status === "timed_out" ||
  status === "failed" ||
  status === "cancelled"
```

`src/lib/espn/connectSession.ts`: implement using `db.espnConnectSession`, map row → record, `ConnectSessionConflictError` class with `name = "ConnectSessionConflictError"`. Active = status not terminal. On create set `status: "pending"`, `expiresAt: new Date(Date.now() + CONNECT_SESSION_TTL_MS)`.

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/espnConnectSession.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add prisma src/lib/espn/connectTypes.ts src/lib/espn/connectSession.ts tests/unit/espnConnectSession.test.ts
git commit -m "feat(espn): add connect session store and TTL rules"
```

---

### Task 2: Mock worker + connect start/status API

**Files:**
- Create: `src/lib/espn/connectWorker.ts`
- Create: `src/app/api/espn/connect/start/route.ts`
- Create: `src/app/api/espn/connect/status/route.ts`
- Create: `tests/api/espnConnect.test.ts`

**Interfaces:**
- Consumes: `createConnectSession`, `getConnectSessionForUser`, `expireConnectSessionIfNeeded`, `updateConnectSessionStatus`, `upsertUserEspnCredentials`, `requireUserId`
- Produces:
  - `export type ConnectWorker = { start(sessionId: string, clerkUserId: string): void }`
  - `export const setConnectWorkerForTests(worker: ConnectWorker | null): void`
  - `export const getConnectWorker(): ConnectWorker`
  - Default test/dev without `ESPN_CONNECT_LIVE`: mock no-op (tests inject worker)
  - `POST /api/espn/connect/start` → `200 { sessionId, statusPagePath, expiresAt }` or `401` / `409`
  - `GET /api/espn/connect/status?sessionId=` → `200 { status, errorCode }` (never cookies) or `401` / `404`

- [ ] **Step 1: Write failing API tests**

```ts
// tests/api/espnConnect.test.ts
import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as startPost } from "@/app/api/espn/connect/start/route"
import { GET as statusGet } from "@/app/api/espn/connect/status/route"
import { db } from "@/lib/db"
import { setConnectWorkerForTests } from "@/lib/espn/connectWorker"
import { upsertUserEspnCredentials } from "@/lib/espn/credentials"
import { updateConnectSessionStatus } from "@/lib/espn/connectSession"

vi.mock("next/headers", () => ({ headers: vi.fn() }))

const prefix = `espn-connect-api-${crypto.randomUUID()}`
let userId: string

const authenticateAs = (id?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(id ? { "x-test-user-id": id } : {}) as never,
  )
}

beforeEach(() => {
  userId = `${prefix}-${crypto.randomUUID()}`
  authenticateAs(userId)
  setConnectWorkerForTests({
    start: (sessionId, clerkUserId) => {
      void (async () => {
        await upsertUserEspnCredentials(clerkUserId, {
          espnS2: "mock-s2",
          swid: "{11111111-2222-3333-4444-555555555555}",
        })
        await updateConnectSessionStatus(sessionId, "succeeded")
      })()
    },
  })
})

afterEach(async () => {
  setConnectWorkerForTests(null)
  await db.espnConnectSession.deleteMany({
    where: { clerkUserId: { startsWith: prefix } },
  })
  await db.espnCredential.deleteMany({
    where: { clerkUserId: { startsWith: prefix } },
  })
})

describe("ESPN connect API", () => {
  it("returns 401 when unauthenticated", async () => {
    authenticateAs(undefined)
    const response = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    expect(response.status).toBe(401)
  })

  it("starts a session and reaches succeeded without returning cookies", async () => {
    const startResponse = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    const startBody = await startResponse.json()
    expect(startResponse.status).toBe(200)
    expect(startBody.sessionId).toBeTruthy()
    expect(startBody.statusPagePath).toBe(
      `/roster/espn-connect?sessionId=${startBody.sessionId}`,
    )
    expect(JSON.stringify(startBody)).not.toContain("mock-s2")

    let status = "pending"
    for (let i = 0; i < 20 && status !== "succeeded"; i += 1) {
      await new Promise((r) => setTimeout(r, 25))
      const statusResponse = await statusGet(
        new Request(
          `http://localhost/api/espn/connect/status?sessionId=${startBody.sessionId}`,
        ),
      )
      const body = await statusResponse.json()
      expect(JSON.stringify(body)).not.toContain("mock-s2")
      status = body.status
    }
    expect(status).toBe("succeeded")

    const cred = await db.espnCredential.findUnique({ where: { clerkUserId: userId } })
    expect(cred?.espnS2).toBe("mock-s2")
  })

  it("returns 409 when an active session already exists", async () => {
    setConnectWorkerForTests({ start: () => {} })
    const first = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    expect(first.status).toBe(200)
    const second = await startPost(
      new Request("http://localhost/api/espn/connect/start", { method: "POST" }),
    )
    expect(second.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx.cmd vitest run --maxWorkers=1 tests/api/espnConnect.test.ts
```

- [ ] **Step 3: Implement worker registry + routes**

`connectWorker.ts`: hold `testWorker` override; `getConnectWorker()` returns test worker or live stub that throws/`failed` if `ESPN_CONNECT_LIVE` not set (Task 3 fills live).

`start/route.ts`:
1. `requireUserId` → 401
2. `createConnectSession` → catch conflict → 409 `{ error: "conflict" }`
3. `updateConnectSessionStatus(id, "awaiting_login")`
4. `getConnectWorker().start(session.id, userId)` (fire-and-forget; catch → `failed`)
5. Return `{ sessionId, statusPagePath: `/roster/espn-connect?sessionId=${id}`, expiresAt: session.expiresAt.toISOString() }`

`status/route.ts`:
1. Auth
2. Read `sessionId` from query; missing → 400
3. `getConnectSessionForUser` → null → 404
4. `expireConnectSessionIfNeeded`
5. Return `{ status, errorCode }` only

- [ ] **Step 4: Run — expect PASS**

```bash
npx.cmd vitest run --maxWorkers=1 tests/api/espnConnect.test.ts tests/unit/espnConnectSession.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/espn/connectWorker.ts src/app/api/espn/connect tests/api/espnConnect.test.ts
git commit -m "feat(espn): add connect start and status APIs"
```

---

### Task 3: Live Playwright connect worker

**Files:**
- Create: `src/lib/espn/connectWorkerLive.ts`
- Modify: `src/lib/espn/connectWorker.ts`
- Create: `tests/unit/espnConnectWorkerLive.test.ts` (cookie parse helper only — no browser in CI)

**Interfaces:**
- Consumes: Playwright `chromium`, `normalizeEspnCookies`, `upsertUserEspnCredentials`, `updateConnectSessionStatus`, `getConnectSessionForUser`, `expireConnectSessionIfNeeded`
- Produces:
  - `extractEspnCookiesFromPlaywrightCookies(cookies: Array<{ name: string; value: string; domain: string }>): EspnCookies | null`
  - `runLiveConnectWorker(sessionId: string, clerkUserId: string): Promise<void>`
  - When `ESPN_CONNECT_LIVE=true`, `getConnectWorker()` uses live starter that voids `runLiveConnectWorker`

- [ ] **Step 1: Failing test for cookie extraction helper**

```ts
// tests/unit/espnConnectWorkerLive.test.ts
import { describe, expect, it } from "vitest"
import { extractEspnCookiesFromPlaywrightCookies } from "@/lib/espn/connectWorkerLive"

describe("extractEspnCookiesFromPlaywrightCookies", () => {
  it("reads espn_s2 and SWID from espn domains", () => {
    const cookies = extractEspnCookiesFromPlaywrightCookies([
      { name: "espn_s2", value: "AEB%2Fabc", domain: ".espn.com" },
      { name: "SWID", value: "{AAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}", domain: ".espn.com" },
      { name: "other", value: "x", domain: ".espn.com" },
    ])
    expect(cookies?.espnS2).toBeTruthy()
    expect(cookies?.swid.startsWith("{")).toBe(true)
  })

  it("returns null when incomplete", () => {
    expect(
      extractEspnCookiesFromPlaywrightCookies([
        { name: "espn_s2", value: "only", domain: ".espn.com" },
      ]),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/espnConnectWorkerLive.test.ts
```

- [ ] **Step 3: Implement live worker**

Behavior of `runLiveConnectWorker`:
1. Load session; if missing or wrong user → return
2. Launch `chromium.launch({ headless: false })` (headed)
3. New context/page → `goto("https://www.espn.com/login")` or `https://fantasy.espn.com`
4. Poll every 2s until terminal, TTL expiry, or cookies found via `context.cookies()`
5. On cookies: `normalizeEspnCookies` → if ok, `upsertUserEspnCredentials` → `succeeded` → close browser
6. On expiry: `timed_out`, close browser, **do not** upsert
7. On thrown error: `failed` + `errorCode: "CONNECT_WORKER"`, close browser, no upsert
8. Wrap in try/finally to always close browser

Wire `getConnectWorker()`:
- if `setConnectWorkerForTests` set → that
- else if `process.env.ESPN_CONNECT_LIVE === "true"` → live
- else → worker that immediately `updateConnectSessionStatus(sessionId, "failed", "CONNECT_LIVE_DISABLED")`

Document in `.env.example`:

```
# Headed Playwright ESPN login connect (local only)
ESPN_CONNECT_LIVE=false
```

- [ ] **Step 4: Run unit tests PASS**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/espnConnectWorkerLive.test.ts tests/api/espnConnect.test.ts
```

- [ ] **Step 5: Manual smoke (not CI)**

```bash
# .env: ESPN_CONNECT_LIVE=true
npm.cmd run dev
# Click Log in with ESPN after Task 4 UI exists, or call POST /api/espn/connect/start while authenticated
```

Expected: Chromium window opens; after ESPN login, status becomes `succeeded` and credentials row exists.

- [ ] **Step 6: Commit**

```bash
git add src/lib/espn/connectWorkerLive.ts src/lib/espn/connectWorker.ts tests/unit/espnConnectWorkerLive.test.ts .env.example
git commit -m "feat(espn): add headed Playwright connect worker"
```

---

### Task 4: Waiting page + Roster Connect UI

**Files:**
- Create: `src/app/roster/espn-connect/page.tsx`
- Modify: `src/app/roster/page.tsx` (Connect aside)
- Modify: `src/components/season/SeasonRosterWorkspace.tsx` (expired / `ESPN_AUTH` copy → reconnect)

**Interfaces:**
- Consumes: `POST /api/espn/connect/start`, `GET /api/espn/connect/status`
- Produces: primary CTA navigates to `statusPagePath`; paste form in `<details>`

- [ ] **Step 1: Add `/roster/espn-connect` client page**

Client component page that:
1. Reads `sessionId` from `useSearchParams`
2. Polls `/api/espn/connect/status?sessionId=` every 2s
3. Shows: “A browser window should have opened. Log into ESPN there. This page updates automatically.”
4. On `succeeded`: message + link back to `/roster`
5. On `timed_out` / `failed`: error + button `handleRetry` → POST start → `router.replace` new status path
6. `aria-live="polite"` for status text

- [ ] **Step 2: Update Roster Connect panel**

In `src/app/roster/page.tsx`:
- Change supporting copy away from “ESPN blocks password login…” primary story to remote-login explanation (match spec §6)
- Add button `handleStartEspnConnect`:
  - POST `/api/espn/connect/start`
  - on 409: show “Already connecting — open the waiting page or wait for timeout”
  - on 200: `router.push(statusPagePath)` or `window.location.assign`
- Wrap existing espn_s2 / SWID inputs + Save in `<details>` summary “Paste cookies instead”
- Expired alert: primary action label “Reconnect with ESPN” calling same `handleStartEspnConnect`

- [ ] **Step 3: Workspace banners**

Where `SeasonRosterWorkspace` tells user to paste fresh cookies on `ESPN_AUTH` / expired, add link/button to `/roster` (Connect) preferring remote login wording. Keep paste mention as secondary.

- [ ] **Step 4: Manual UI check**

With `ESPN_CONNECT_LIVE=false`, start connect → waiting page → status `failed` / `CONNECT_LIVE_DISABLED` quickly — confirms poll UI.  
With `ESPN_CONNECT_LIVE=true`, full login smoke.

- [ ] **Step 5: Commit**

```bash
git add src/app/roster/espn-connect/page.tsx src/app/roster/page.tsx src/components/season/SeasonRosterWorkspace.tsx
git commit -m "feat(espn): add remote connect UI and waiting page"
```

---

### Task 5: Regression sweep + docs pointer

**Files:**
- Modify: `docs/superpowers/specs/2026-08-19-espn-remote-browser-connect-design.md` — set Status to `Approved` / `Implemented (phase 1 local headed)` when done
- Optional: one line in `README.md` under ESPN connect if README already documents cookies

- [ ] **Step 1: Run focused + related ESPN tests**

```bash
npx.cmd vitest run --maxWorkers=1 tests/unit/espnConnectSession.test.ts tests/unit/espnConnectWorkerLive.test.ts tests/api/espnConnect.test.ts tests/api/espnCredentials.test.ts tests/unit/espnCookies.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Update spec status line**

Change `**Status:** Draft…` → `**Status:** Approved — phase 1 implemented (local headed Playwright)`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-19-espn-remote-browser-connect-design.md README.md
git commit -m "docs(espn): mark remote connect phase 1 implemented"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Primary Log in with ESPN (remote) | 4 |
| Cookies → existing `espnCredential` | 2 (mock), 3 (live) |
| No paste on happy path; paste fallback | 4 |
| Expiry → same Connect flow | 4 |
| No passwords in DB; no cookies in API responses | 2, 3 |
| CI without live ESPN | 2, 3 (helper-only unit) |
| TTL 10m, one session, status machine | 1, 2 |
| Non-goals (extension, auto re-login, writeback) | omitted |

## Placeholder / consistency review

- Worker env flag name fixed: `ESPN_CONNECT_LIVE`
- Status union matches spec (+ `cancelled` reserved; cancel route deferred)
- Phase 1 viewer = headed local window + in-app waiting page (spec default for SaaS viewer deferred explicitly)
