# Minutes: protect starters + last-year team rotation

**Date:** 2026-09-07  
**Status:** Approved for implementation  
**Product:** Preseason projection engine (`src/lib/projections/`)  
**Replaces:** original spec §5.3 surplus rule (cut above 20 MPG / scale the whole roster)

---

## 1. Goal

Keep star minutes close to last season (the first live run) while still summing each full roster to 240. Depth follows **that franchise’s last-year rotation**, not a fixed 13-man scale.

A team that last year gave 10+ MPG to 10 players still runs about 10 this year. Players at 3–5 MPG last year were garbage time and do not count as rotation.

### Success criteria

On a 13-man live roster, let `N` be last-year 10+ MPG count on that `teamId`, then `clamp(N, 8, 13)`:

- Rank 1–5 MPG equals that player’s own last-year MPG, capped at 38 (no team-wide scale)
- Ranks `N+1`…13 are exactly 0
- `sum(mpg) === 240` when caps do not bind
- Same-bucket vacancy extra goes to ranks 6…N only, never to the protected 5
- No player above 38 MPG

### Non-goals

- Injury-year correction (a team that ran 14 guys at 10+ MPG because of injuries stays deep)
- Copying last year’s exact 1st–13th MPG ladder onto this year’s names
- Coach or scheme features beyond last-year 10+ MPG count
- Changing rates, regression, usage 100, GP, or compose
- BBM scrape or blend

---

## 2. Why this replaces the old rule

13-man ESPN rosters often have last-year MPG summing to 280–320. Scaling everyone to 240 drops stars from ~34–36 to ~28–31. Cutting from the bottom zeroed 80 vets. Both failed the eye test.

Five starters at last-year minutes use ~170 of 240. The other ~70 belong only to the team’s real rotation, not to the last three roster spots.

Five players cannot fill 240 even at the 38 cap (5 × 38 = 190). So rotation width `N` is clamped to **at least 8** on an 8+ man roster. Starter *protection* stays at 5; the extra 3–(N−5) slots are the leftover pool.

---

## 3. Inputs

`allocateMinutes` already receives current-roster priors and `RosterSnapshot`. Pipeline also has last-season `SeasonBox[]`.

Pipeline counts last-year boxes for `roster.teamId` and passes `rotationN` into `allocateMinutes`. The allocator does not scan all boxes.

```
rotationN = clamp(qualifiedCount, 8, roster.players.length)
```

when `roster.players.length >= 8`. If the roster is shorter than 8, `rotationN = roster.players.length` and the team may sum under 240 (existing short-roster behavior, cap 38).

`qualifiedCount` = number of last-season boxes with:

- `box.teamId === roster.teamId`
- `box.mpg >= 10`
- `box.teamId !== "TOT"` (`TOT` is a player season aggregate, not a franchise rotation)

If that set is empty (missing history, team-code mismatch), `qualifiedCount = 10`.

Do not invent players. Only allocate to `RosterSnapshot.players`.

---

## 4. Allocation

Sort the current roster by each player’s **own** `priorMpg` descending (last-year box MPG, or rookie prior). Ties: stable by `playerId`.

1. **Protected starters (ranks 1–5)**  
   `mpg = min(priorMpg, 38)`. Do not scale these down to fit benches. Do not add vacancy minutes.

2. **Leftover**  
   `leftover = 240 − sum(protected)`.  
   If `leftover <= 0` (only possible if we ever widen the protected set past 5): scale the protected five so they sum to 240; everyone else is 0. With a 5-man cap of 38 this path does not run.

3. **Rotation bench (ranks 6…N)**  
   Split `leftover` by claim among this set only:

   `claim = priorMpg * 0.5 + departedSameBucketMpg * 0.5`

   `departedSameBucketMpg` is unchanged from the original spec: departed `lastMpg` in that bucket, split equally among **current ranks 6…N** in the bucket (not among the protected 5). If the bucket has no bench receiver, leftover claim for that departed bucket is split by `priorMpg` among all ranks 6…N.

   If every claim in 6…N is 0, split leftover equally among 6…N.

4. **Outside the rotation (ranks N+1…end)**  
   `mpg = 0`.

5. **Caps**  
   After assignment, `mpg = min(38, max(0, mpg))`. If a bench player hits 38 and leftover remains, redistribute the remainder among other ranks 6…N still under 38. If none remain, stop; sum may be under 240 (same as today’s short-roster cap behavior).

6. **Exact 240**  
   If the roster has 8+ players and leftover receivers exist, snap only the **6…N** group so `protected + bench === 240`. Never snap-scale the protected five.

---

## 5. Data flow

```
boxes + roster.teamId
        → qualifiedCount (mpg >= 10, exclude TOT)
        → rotationN
priors (own last-year / rookie mpg)
        → rank 1…roster
        → allocateMinutes(..., rotationN)
        → existing usage → GP → compose
```

Rates, usage conservation, and GP stay as they are. Changing minutes changes counting stats through compose only.

---

## 6. Tests

Replace the current “stars lose a little, benches stay above 7” surplus test.

| Case | Expect |
|---|---|
| 13-man, last-year team 10 players at 10+ MPG, priors `[36,34,32,30,28,24,22,20,18,16,14,12,10]` | Rank 1 MPG is 36; ranks 11–13 are 0; sum is 240; ranks 6–10 share leftover and each is > 0 |
| 13-man, last-year team 8 players at 10+ MPG | Ranks 9–13 are 0; ranks 6–8 share leftover; rank 1 unchanged from prior |
| Departed 36-mpg PG, current PG backup is rank 7 | Backup gains more leftover than a wing at the same rank band |
| Protected star at 36, departed same bucket | Star stays 36 |
| 6-man roster, all priors ≤ 30 | Sum < 240; no one above 38 |
| Empty last-year team boxes | `rotationN = 10` on a 13-man roster |

---

## 7. Live export

After the engine change, regenerate `data/live/projections-2026-27.json` and the Excel workbook. The workbook already has a **2026-27** sheet (projection-only) and a **vs 25-26** compare sheet. No new sheet in this change.

---

## 8. Out of scope

- Re-tuning regression `k` or usage caps
- Minimum garbage-time floor for ranks N+1 (they stay 0)
- Widening protection from 5 to 6
- Manual team rotation overrides
