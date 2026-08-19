# Yahoo ADP via FantasyPros

Date: 2026-08-12  
Status: superseded  
Superseded by: `2026-08-20-yahoo-draft-analysis-adp-design.md` (`players:yahoo-adp` now uses Yahoo Draft Analysis overall rank)

## Goal

Use Yahoo fantasy basketball ADP for Mock/sim opponent ordering instead of ESPN-only ranks in `stats_2025_26.json`.

## Approach

1. Fetch [FantasyPros NBA ADP overall](https://www.fantasypros.com/nba/adp/overall.php).
2. Parse the **Yahoo** column per player name.
3. Match names onto `data/players/stats_2025_26.json` and overwrite `player.adp`.
4. Record `meta.adpSource = "fantasypros_yahoo"` plus match counts / timestamp.

## Commands

```bash
npm.cmd run players:yahoo-adp
```

Optional: refresh ESPN pool first, then overlay Yahoo ADP:

```bash
npm.cmd run players:refresh
npm.cmd run players:yahoo-adp
```

## Matching

- Normalize: lowercase, strip accents/punctuation, drop Jr/Sr/II/III/IV suffixes.
- Unmatched players keep prior ADP and are listed in the script log.

## Non-goals

- Live Yahoo API auth
- Runtime network fetch during draft (fixture-only refresh)
- Changing projection stats — ADP field only
