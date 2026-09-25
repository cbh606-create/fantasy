# Matchup Winner Stream Prior — Design Spec

**Date:** 2026-09-01  
**Status:** Accepted  
**Product:** Matchup streaming uses this ESPN league’s **winning teams’ add/drop recipes** as a soft prior  
**Builds on:** [Streaming board-delta](./2026-08-28-matchup-streaming-board-delta-design.md), [ESPN live import](./2026-08-12-espn-live-season-import-design.md), [streaming strategy modes](./2026-08-25-matchup-streaming-starts-max-protected-drops-design.md)  
**Branch context:** `feat/published-nba-schedule`

Today Aggressive / Balanced / Conservative only look at **your** H2H board (share of L/T cats). Adds do not look at how **this league’s winners** actually streamed.

---

## 1. Goal

When this league has ESPN cookies, learn: **teams that won a scoring period**, while **behind or tied** in some cats, **added / dropped what kinds of players**. Use that as a **small ranking bonus** on Matchup streaming FAs (and a one-line hint). Board-delta still decides whether an add happens.

### Success criteria

- ESPN-imported leagues with cookies fetch transactions + period scoreboards (fixture/manual leagues skip; current planner unchanged).
- A week’s **winner** is the team with more category wins that scoring period (ties: both excluded from “winner” recipes).
- **Behind / close** cats for that winner = that period’s `L` or `T` vs their opponent (end-of-week scores, not the live board at click time).
- Added player **kind** = their top 1–2 enabled **counting** cats (TPM, REB, AST, STL, BLK, PTS; TO inverted) from our projections, plus a coarse slot group `G` / `F` / `C`.
- When **your** live board is L/T in a cat that appears in a winner recipe, FAs whose kind matches that recipe get a **tie-break bonus** among FAs that already have `projectedCatWins` delta `> 0`.
- Streaming strategy row shows one mute line when a prior exists, e.g. `Winners here streamed STL/BLK when trailing those cats`.
- ESPN failure / empty history → no bonus, no blocking error (optional mute “League stream history unavailable”).
- Unit tests on join + recipe + bonus with a tiny fixture (no live HTTP in CI).

### Non-goals

- Reconstructing the H2H board **at the second they clicked add**
- Replacing Aggressive / Balanced / Conservative
- Overriding board-delta (no add with `delta ≤ 0` just because winners did it)
- Yahoo / other platforms
- UI charts of full transaction history
- ESPN writeback
- Training a model / storing recipes in Prisma (v1: memory cache)

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Who | This league’s ESPN add/drop only |
| Winning team | More category W than opponent that **scoring period** |
| Behind / close | That winner’s cats with outcome `L` or `T` (final box) |
| Player kind | Top counting-cat(s) + `G`/`F`/`C` |
| Apply | Soft bonus **after** schedule gates and `delta > 0` |
| UI | One hint line under Streaming strategy chips |
| Time join | Transaction date → ESPN `scoringPeriodId` for that league season |
| Missing ESPN | Skip prior; planner as today |

Rejected: display-only insights; swapping strategy mode for a “winners” mode; using season standings instead of week winners.

---

## 3. Data (ESPN)

Reuse cookies from `src/lib/adapters/espnSeasonLive.ts` (`espn_s2` + `SWID`). Same timeout / login-page → `ESPN_AUTH` handling.

| Fetch | Purpose |
| --- | --- |
| League `view=mTransactions` (and/or `/transactions?scoringPeriodId=`) | Add / drop / waiver items: team id, player id, type, timestamp |
| Per completed `scoringPeriodId`: `view=mMatchup` / `mScoreboard` | Each team’s category totals vs opponent that week |

Keep only `ADD` / `WAIVER` (player in) and paired `DROP` when present. Ignore trades and keeper moves.

Join: transaction timestamp (or ESPN scoringPeriod on the item) → that week’s matchup row for **the acting team**.

**Winner filter:** acting team won the period (more cat W). If the period is incomplete (current week), skip it for recipes (don’t train on live unfinished scores).

**Cache:** in-memory keyed by `espnLeagueId + season`, TTL ~6 hours. Refresh on Matchup load if cache miss.

---

## 4. Recipes

For each qualifying **winner add**:

1. `situationCats` = that team’s L/T cats that period (enabled cats only).
2. `addKind` = top counting cat of the added player (break ties: STL, BLK, AST, REB, TPM, PTS). If second cat is within 15% of the top contribution, keep both.
3. `addGroup` = `G` if any PG/SG/G; else `F` if SF/PF/F; else `C`.
4. Optional `dropKind` from the paired drop the same day (same rules); used only in the hint, not required for the bonus.

Aggregate counts: `(situationCat, addKind)` pairs. Keep pairs with **count ≥ 2** (or ≥ 1 if the league has fewer than 8 completed periods). Cap to top 6 pairs by count.

Example recipe: `{ situationCat: "STL", addKind: "STL", addGroup: "G", count: 5 }`.

---

## 5. Apply on Matchup

`adviseMatchup` / `buildStreamingPlan` / `pickBestStreamerMove`:

1. Existing schedule + strategy filters.
2. Existing **board-delta > 0** gate (board-delta spec).
3. Among remaining FAs, add `winnerPriorBonus`:
   - For each of **your** current L/T cats, if a recipe maps that cat → this FA’s `addKind` (or `addGroup` if we only have group), add a small constant (e.g. `0.02` projectedCatWins-equivalent **only as a sort key**, not mixed into displayed delta).
   - Prefer: sort key = `delta + ε * recipeHits` with `ε` small enough that it never overtakes a strictly larger real delta (e.g. `ε = 1e-4` per hit).

So a +0.15 STL specialist beats a +0.15 volume scorer when you trail STL; a +0.20 scorer still beats both.

`suggestStreamers` (waiver deep-links) may use the same bonus on its existing weak-cat score; do not change the streamer list size.

**Hint copy** (English, mute): if any recipe hits your L/T cats, one sentence listing those cats. Else if recipes exist but none match: omit the line. No line when prior was skipped.

---

## 6. Files

| File | Role |
| --- | --- |
| `src/lib/espn/winnerStreamHistory.ts` (or under `adapters/`) | Fetch + map ESPN payloads |
| `src/lib/matchup/winnerStreamPrior.ts` | Build recipes; bonus + hint from board + FA |
| `src/lib/matchup/streamingPlans.ts` / `streamerMove.ts` | Sort key after delta |
| `src/components/matchup/StreamingPlansPanel.tsx` | Hint under Strategy |
| `data/fixtures/espn-winner-stream-sample.json` | Tiny 2-period, 2-team, few adds |
| `tests/unit/winnerStreamPrior.test.ts` | Join, winner filter, bonus order |

---

## 7. Tests

1. Winner with L in STL who added a STL-heavy G → recipe `(STL, STL)`.
2. Losing team’s STL add is **ignored**.
3. Current week (incomplete) excluded.
4. Two FAs, deltas `0.12` vs `0.10` → higher delta still first even if only the 0.10 matches a recipe.
5. Two FAs, **equal** delta, one matches recipe → matching FA first.
6. No cookies / empty transactions → bonus 0, no throw.
7. Panel: hint present when recipes match; absent when prior skipped.

---

## 8. Out of scope

Sit/Start greedy swaps, Daily lineup seating, waiver claim API, and strategy chip defaults stay as they are. This prior only ranks streaming FAs that already pass the board-delta gate.
