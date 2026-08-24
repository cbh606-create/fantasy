# ESPN Season Live Data — Roadmap Design Spec

**Date:** 2026-08-19  
**Status:** Approved for implementation planning (Phase 1 first)  
**Product:** Make imported ESPN season leagues usable for Waivers, Matchup stream, and Injury pickups without silent fixture fallback  
**Related:** [Season Roster](./2026-08-11-season-roster-module-design.md), [Waivers](./2026-08-12-waivers-module-design.md), [Matchup Advisor](./2026-08-12-matchup-advisor-design.md), [Injury Replacement Pickup](./2026-08-18-injury-replacement-pickup-design.md)

---

## 1. Goal

ESPN으로 가져온 시즌 리그가 fixture에 의존하지 않고, Waivers / Matchup stream / Injury pickups가 **실제 available 풀·스케줄·부상**으로 동작하게 한다.

### Success criteria (roadmap)

| Phase | Success criteria |
|------|------------------|
| **1** | Stored cookies로 Refresh; `availablePlayerIds` 채움; live 실패 시 DB 미갱신 (last-good). Import한 리그 Refresh 후 Waivers 풀 ≠ 빈 배열; 쿠키 만료 시 기존 state 유지 + `ESPN_AUTH` / `ESPN_NO_CREDENTIALS` |
| **2** | Live schedule / scoring period. Matchup·stream 주간 일수가 fixture가 아닌 현재 period |
| **3** | Injury Phase A (ESPN OUT/GTD). fixture 데모 대신 실 ESPN 상태 기반 추천 (depth chart는 fixture 유지 가능) |

### Decisions (locked)

- **On ESPN failure:** keep last-good season state; **never** overwrite with fixture
- **FA pool:** ESPN free-agent API first → universe-minus-rostered fallback → still no fixture FA
- **Draft Live sync:** roadmap “later” only; **out of scope** for this implementation cycle
- **Architecture:** thin adapter patches (not a new SeasonDataProvider abstraction, not background sync jobs)

---

## 2. Non-goals

- ESPN writeback (add/drop/claim to ESPN)
- Draft Live ESPN sync implementation (`ESPN_UNAVAILABLE` when `ESPN_LIVE=true`)
- Large `SeasonDataProvider` refactor or background sync worker
- FAAB, push notifications, multi-platform (Yahoo etc.)
- Replacing fixture depth chart in Phase 3

### Document shape

- **This spec** = full roadmap + **Phase 1 detailed design**
- Phase 2 and Phase 3 get **short sketches here**; write dedicated detail specs immediately before each phase’s implementation plan

---

## 3. Phases

```text
Phase 1: Refresh cookies + FA pool
    ↓
Phase 2: Live schedule / scoring period
    ↓
Phase 3: Injury Phase A (ESPN status)
    ··· later ···
Draft Live ESPN sync (out of this cycle)
```

**Implementation approach:** patch existing `espnSeason` / `espnSeasonLive` / `espnSeasonMap` / Refresh API. Fixture remains only for explicit demo / non-credential local paths — never for Refresh of an ESPN-sourced league.

---

## 4. Phase 1 — Cookies, Refresh, FA pool

### 4.1 Cookie source of truth

- Use existing `getUserEspnCookies(userId)` (Roster “Save” credentials)
- Shared priority for Refresh, season-import, and FA fetch:
  1. User-stored cookies
  2. Optional env `ESPN_S2` / `ESPN_SWID` when `ESPN_LIVE=true`
- Client does **not** send cookies in the Refresh request body (same pattern as season-import)

### 4.2 Refresh today vs target

**Today (bug):** `POST /api/season-leagues/[id]/refresh` calls `espnImportToSeasonLeagueState` **without cookies**. When live is not selected, the adapter returns the **fixture** league and can overwrite a real import.

**Target flow:**

1. Load user cookies (and env fallback as above)
2. If no cookies → **do not update DB**; return `ESPN_NO_CREDENTIALS` (or equivalent) with reconnect guidance
3. Live fetch success → map roster + fill FA → lineup conflict check → persist
4. Live fetch failure → **do not update DB**; return `errorCode` (last-good preserved)
5. **Fixture path banned** for Refresh of ESPN-sourced leagues. Fixture only for demo / seed when there are no credentials and the caller is not refreshing a live ESPN league

### 4.3 FA population

After (or as part of) live league fetch / map:

1. **Primary:** ESPN free-agent view/filter (extra `view` on league fetch or separate call)
2. Merge players into `players`; set `availablePlayerIds` to FA ids; set `availability: "fa" | "waiver"` when ESPN distinguishes them
3. **Fallback:** player universe minus rostered owners (when primary fails, empty, or unsupported)
4. If both yield empty: may still save roster state with `availablePlayerIds: []` and optional `faSource: "empty"` warning — **never** fill from fixture FA ids
5. **Import** must use the **same FA rules** as Refresh so the first import is not an empty pool

### 4.4 Lineup conflict

- Existing conflict modal / resolve flow unchanged
- FA + roster snapshot apply together from `incomingState` on resolve

### 4.5 Error codes (Phase 1)

| Code | When | DB |
|------|------|-----|
| `ESPN_NO_CREDENTIALS` | No user/env cookies | unchanged |
| `ESPN_AUTH` | 401 / rejected cookies | unchanged |
| `ESPN_PARTIAL` | Incomplete teamId / map | unchanged |
| `ESPN_UNAVAILABLE` / network | ESPN down / transport | unchanged |
| Success + empty FA | Primary and fallback both empty | roster saved; `availablePlayerIds: []` |

**UI:** On Refresh failure, keep showing current roster; surface reconnect (paste fresh `espn_s2` / `SWID`) as today.

### 4.6 Tests (Phase 1)

- Refresh with cookies mock → live mapper path; fixture **not** used
- No cookies / AUTH → 4xx/502; `stateJson` unchanged
- FA primary success → non-empty `availablePlayerIds`
- FA primary fail → inverse-ownership fallback ids
- Both empty → `[]`, not fixture FA ids
- Import smoke: same FA rules

---

## 5. Phase 2 — Live schedule / scoring period (sketch)

**Depends on:** Phase 1 (stable cookies + live season)

- Map ESPN scoring / matchup period into existing `ScheduleResponse`
- Matchup advisor, matchup-stream, and Roster schedule tab share one schedule loader
- On failure: last-good schedule **or** explicit error — **no silent fixture fallback** (fixture only on explicit demo path)
- Write a dedicated Phase 2 design spec before implementation planning

---

## 6. Phase 3 — Injury Phase A (sketch)

**Depends on:** Phase 1 FA pool (recommendations only from available)

- Implement `InjuryEventProvider` from ESPN player status (OUT / GTD / etc.)
- Depth chart: **keep fixture** for now (aligned with prior injury design)
- On failure: disable / error the injury panel; leave FA + roster intact
- Write a dedicated Phase 3 design spec before implementation planning

---

## 7. Later (roadmap only)

- Draft Live ESPN sync (fix `ESPN_UNAVAILABLE` when `ESPN_LIVE=true`)
- Background sync / cache jobs
- Provider abstraction if multiple platforms appear
- ESPN writeback

---

## 8. Implementation planning note

- First implementation plan covers **Phase 1 only**
- Phase 2 / 3: detail spec → plan → implement, in order
- Do not mix unrelated local WIP (e.g. league-size 4–20 unstaged work) into Phase 1 commits unless explicitly requested
