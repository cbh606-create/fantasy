# ESPN Remote Browser Connect — Design Spec

**Date:** 2026-08-19  
**Status:** Draft (awaiting user review)  
**Product:** Replace DevTools cookie paste as the primary ESPN private-league auth path  
**Related:** [ESPN Live Season Import](./2026-08-12-espn-live-season-import-design.md), [ESPN Season Live Data Roadmap](./2026-08-19-espn-season-live-data-roadmap-design.md)

---

## 1. Goal

Let a signed-in manager connect a **private** ESPN fantasy league without copying `espn_s2` / `SWID` from DevTools and without installing a browser extension.

**Ideal UX the product cannot offer officially:** “Log in with ESPN email/password into our form.” ESPN Fantasy has no public OAuth; private league APIs authenticate only via session cookies. Programmatic Disney OneID login is blocked by reCAPTCHA and is not a supported path.

**Chosen approach:** User completes ESPN’s own login inside a **short-lived remote browser session** we host. After login, the server extracts cookies, stores them like today, and tears the session down.

### Success criteria

- Primary Connect CTA is “Log in with ESPN” (remote browser), not cookie paste
- On success, cookies land in existing per-user `espnCredential` storage; import / verify / refresh keep working unchanged
- User never pastes cookies for the happy path; paste remains fallback only
- On expiry (`ESPN_AUTH`), UI points back to the same Connect flow
- Passwords are never stored in our DB; cookies are never returned to the client after save
- CI does not run live ESPN login; worker behavior is mockable

### Non-goals (phase 1)

- Background auto re-login
- Browser extension or bookmarklet
- ESPN writeback (moves, waivers, lineups)
- Accepting ESPN username/password in our own form
- Multi-vendor browser-farm abstraction (one Playwright-based path first)
- Public-league-only mode as a substitute for private auth

---

## 2. Why this shape

| Option | Verdict |
|---|---|
| Official ESPN OAuth / ID login in-app | Unavailable for unofficial fantasy API |
| Cookie paste (current) | Works; too much friction |
| Browser extension | Best technical fit for cookie read; user rejected install burden |
| Bookmarklet | Cannot read HttpOnly `espn_s2` |
| Public league (no cookies) | Does not cover private leagues |
| Remote browser login | Only remaining path that matches “no paste, no extension, private league” |

Tradeoffs accepted: hosting cost, fragility to ESPN UI/anti-bot changes, ToS gray area, and user trust (“I type my ESPN password into a browser you control”). Mitigations: short TTL, no password persistence, clear UI copy, existing paste fallback.

---

## 3. Architecture

```
[Roster UI] --start--> [POST /api/espn/connect/start]
                            |
                            v
                     [Connect session store]
                            |
                            v
                     [Browser worker / Playwright]
                            |
                     user logs into fantasy.espn.com
                            |
                            v
                     extract espn_s2 + SWID
                            |
                            v
                     upsertUserEspnCredentials(clerkUserId)
                            |
[Roster UI] <--poll-- [GET /api/espn/connect/status?sessionId=…]
                            |
                     succeeded → existing verify / import / refresh
```

### Components

1. **App (existing)**  
   Clerk auth, `EspnCredential` via `src/lib/espn/credentials.ts`, season import/refresh/verify. Unchanged contract: server holds cookies.

2. **Connect API (new)**  
   - `POST /api/espn/connect/start` → `{ sessionId, loginUrl | embedUrl, expiresAt }`  
   - `GET /api/espn/connect/status?sessionId=` → `{ status, errorCode? }`  
   - Optional later: `POST /api/espn/connect/cancel`

3. **Browser worker (new)**  
   Launches a headed or remotely viewable Playwright session, navigates to ESPN fantasy login, waits for authenticated cookies on `fantasy.espn.com` (or `.espn.com` as needed), normalizes via `normalizeEspnCookies`, upserts credentials, closes browser.

4. **UI (Roster Connect panel)**  
   Primary: “Log in with ESPN” opens popup/new tab to `loginUrl` (or embeds stream if we use a streaming provider). Polls status until terminal state. Collapse cookie paste under “Advanced / paste cookies instead.”

### Constraints

- Clerk required on all connect endpoints
- One active connect session per user (additional `start` → 409 or replaces previous after cancel)
- Session TTL 5–10 minutes
- Session IDs unguessable; status only for owning user
- Never log cookies or passwords

---

## 4. Data flow

### Happy path

1. Signed-in user clicks **Log in with ESPN**
2. `POST /api/espn/connect/start` creates session + worker job
3. UI opens remote login surface
4. User completes ESPN login (and any captcha/2FA ESPN shows)
5. Worker detects usable `espn_s2` + `SWID`
6. `upsertUserEspnCredentials` (same as today’s PUT credentials)
7. Optional: if leagueId/teamId/season already filled, run existing verify
8. Status → `succeeded`; UI shows Verified; browser + session destroyed

### Status machine

`pending` → `awaiting_login` → `succeeded` | `timed_out` | `failed` | `cancelled`

### Error handling

| Situation | Behavior |
|---|---|
| TTL exceeded without cookies | `timed_out`; do not overwrite existing credentials |
| Cookie extract fails after login | `failed`; keep prior credentials |
| Concurrent second session | `409` with clear message |
| Unauthenticated Clerk | `401` |
| Later refresh gets login HTML / 401 | Existing `ESPN_AUTH` + CTA to Connect again |
| Worker infra down | `failed` / `503`; paste fallback still available |

---

## 5. Security & trust

- Passwords only typed into ESPN’s pages inside the remote browser; we do not add a password field to our app
- We do not persist ESPN passwords
- Stored secrets remain `espn_s2` / `SWID` server-side only (same as today)
- Connect status responses never include raw cookie values
- UI copy must state clearly: connection opens an ESPN login session hosted for cookie capture; treat like granting read access to the league
- Prefer destroying the browser immediately after capture

---

## 6. UI copy / UX notes

- Headline stays “Connect your account”
- Replace “ESPN blocks password login for apps…” primary story with: connect by signing into ESPN in a secure session; we save session cookies for league sync only
- Expired state: “Reconnect with ESPN” (same flow), not only “paste fresh cookies”
- Paste path: details/summary “Use cookie paste instead”

---

## 7. Testing

- Unit: auth gates, TTL, one-session rule, upsert-on-success, no overwrite on timeout/failure
- API: status transitions with mocked worker
- No live ESPN login in CI
- Manual smoke: one real private-league connect on a dev machine / staging worker

---

## 8. Implementation sketch (not a plan)

Order of work once planned:

1. Session model + connect start/status API (mock worker that can inject cookies in dev)
2. Playwright worker + cookie extract + upsert
3. Roster UI primary CTA + polling + fallback paste
4. Wire expired / `ESPN_AUTH` banners to Connect
5. Ops: how worker runs in deploy (same Node process vs separate service) — decide in implementation plan

---

## 9. Open decisions for the plan (defaults)

| Topic | Default for phase 1 |
|---|---|
| How user sees the remote browser | New tab/window to a hosted viewer URL (simplest); iframe only if same-site allows |
| Worker hosting | Same deployment initially if feasible; extract to worker service if Playwright is too heavy for the web app process |
| Session store | DB or Redis; must survive web process restart for the TTL window |
| TTL | 10 minutes |

These defaults can change in the implementation plan without changing the product goal.
