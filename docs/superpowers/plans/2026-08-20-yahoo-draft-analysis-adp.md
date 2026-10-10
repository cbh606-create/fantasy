# Yahoo Draft Analysis Rank Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay Yahoo Draft Analysis overall rank onto `proj_2026_27.json` via `npm run players:yahoo-adp`.

**Architecture:** Paginate Yahoo public Fantasy API (`478.l.public` players sorted by `average_pick`, `ranks=o-rank`). Map `player_ranks` OR value onto pool `adp` by normalized name. On live failure, use checked-in fixture.

**Tech Stack:** Node ESM script, `fetch`, existing pool JSON shape.

## Global Constraints

- Default pool: `data/players/proj_2026_27.json`
- `adpSource`: `yahoo_draft_analysis_rank`
- Unmatched keep prior ADP; sort ascending by ADP
- No semicolons in JS; no Yahoo OAuth / Plus ADP

---

### Task 1: Rewrite refresh script + fixture path

**Files:**
- Modify: `scripts/refresh-yahoo-adp.mjs`
- Create: `data/players/yahoo_draft_analysis_rank_2026_27.json` (from live fetch)

- [ ] Implement live pagination + name normalize + overlay + meta
- [ ] Fixture fallback when live fetch fails or `--fixture`
- [ ] Run once to write fixture and update pool
- [ ] Verify top ranks match Yahoo (Wemby=1, Jokic=2, …)

### Task 2: Spec already amended

- [x] `docs/superpowers/specs/2026-08-20-yahoo-draft-analysis-adp-design.md` documents Rank proxy
