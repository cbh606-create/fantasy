---
name: espn-adapter
description: Use when implementing ESPN Fantasy import or sync, SWID/espn_s2 cookies, ESPN_LIVE fixtures, unofficial fba league HTTP, draft vs season adapters, scoringPeriodId rosters, or ESPN error codes in this app.
---

# ESPN Adapter

Unofficial ESPN Fantasy basketball HTTP. It will break. **ManualAdapter must work with ESPN off.** ESPN is import/sync only — never write lineups or adds back.

Scoring ids: **h2h-categories**. Weekly who-plays: **matchup-analysis**. Draft vs season domains stay split.

## When to use

- `EspnAdapter`, `EspnSeasonAdapter`, `/api/espn/*`, board/roster refresh
- Cookies, `ESPN_LIVE`, fixtures, 401 from ESPN
- Reconstructing in-season moves

**Not this skill:** sim engine, punt chips, stream recs, client UI chrome.

## Live vs fixture

`ESPN_LIVE === "true"` is the only live path. Any other value (unset, `false`, CI, `npm test`): load `data/fixtures/espn-league.json` or `espn-season-league.json`. Never call ESPN from CI.

When live is not implemented yet, live mode throws `ESPN_UNAVAILABLE` (same codes as HTTP failure). `forceFail` in tests throws those codes without HTTP.

## Credentials

| Rule | |
|---|---|
| Names | `ESPN_S2`, `ESPN_SWID` (plus league/season/team ids as non-secrets) |
| Where | Server `.env.local` only (gitignored) |
| Never | Client bundle, API JSON, logs, fixtures, git, chat, `API Keys.txt` |
| Cookie | URL-decode `espn_s2` before the Cookie header. Keep `{…}` on `SWID` |
| Ask the user | “Put cookies in `.env.local`.” Do not ask them to paste `espn_s2` into chat |

Private leagues return **401** without cookies → `ESPN_AUTH`. Keep last persisted state. Do not wipe.

## Two adapters, one fetch helper

| Adapter | Output | Views |
|---|---|---|
| Draft `espnImportToLeagueState` | `LeagueState` | `mSettings`, `mDraftDetail`, board/picks |
| Season `espnImportToSeasonLeagueState` | `SeasonLeagueState` | `mSettings`, `mTeam`, `mRoster` |

Shared: cookies, `espnFetch`, `EspnAdapterError`, fixture loader. Draft modules must not import season domain (and reverse).

Host: `lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/{year}/segments/0/leagues/{leagueId}`.

## History (calibrated)

Do not trust `recent_activity` / `kona_league_communication` / `mTransactions2` as the move log. Those views are often 400 or empty even when the league loads.

In-season adds/drops: diff `mRoster&scoringPeriodId=N` across periods (plus draft for period 0). If diffs cannot be built: `moves=[]`, still return the period snapshot.

**Current roster ≠ week 8.** Offseason/`mRoster` without a period is “now.” Matchup week W needs that week’s `scoringPeriodId` (and box `mMatchup` for cats). FGM/FTA in boxes with `result: null` are not scored cats.

## Map ESPN → domain

- `CategoryId` is still `FG_PCT`…`PTS`. Map `statId` / labels; never keep `"FG%"` as an id.
- `scoringItems[].isReverseItem` on TO: store **raw** TO; invert only at z/who-won (h2h-categories).
- Lineup slots: ESPN `0–6` = PG SG SF PF C G F, `11` = UTIL (×3), `12` = BE (×3), `13` = IL.

## Sync, errors, rate limit

`EspnErrorCode`: `ESPN_AUTH` | `ESPN_TIMEOUT` | `ESPN_UNAVAILABLE` | `ESPN_PARTIAL` | `NOT_FOUND` | `CONFLICT` | `VALIDATION`.

Board merge: apply ESPN picks where `playerId` is set; if local has a different non-null player at the same overall, keep local, record conflict, `source: "mixed"`.

Rate limit: 5 ESPN syncs / user / minute. UI: Retry / Continue manually. Repeated failure → pin Manual. `source`: `espn` | `manual` | `mixed`.

No ESPN writeback. Do not commit raw captured league dumps; commit **redacted** ESPN-shaped fixtures only.

```ts
const live = process.env.ESPN_LIVE === "true"

const espnImportToLeagueState = async (p: {
  leagueId: string
  season: number
  forceFail?: EspnErrorCode
}): Promise<LeagueState> => {
  if (p.forceFail) throw new EspnAdapterError(p.forceFail)
  if (!live) return loadFixture("espn-league.json")
  return mapDraft(await espnFetch("draft", p))
}
```

## Common mistakes

| Failure | Correct |
|---|---|
| Live HTTP in Vitest/CI | Fixtures unless `ESPN_LIVE === "true"` |
| Cookies on the client / in chat | `.env.local`, decode `espn_s2` |
| One adapter for draft + season | Two mappers, shared fetch |
| Activity feed = waiver log | `scoringPeriodId` roster diffs |
| Current roster for a past week | Period snapshot + box |
| `"FG%"` as `CategoryId` | Map to `FG_PCT` |
| Write lineup to ESPN | Never |
| Commit 30MB raw JSON | Redacted fixture |
