---
name: draft-simulation
description: Use when implementing draft prep or live snake recs, pick-path simulations, next-pick rankings, forcePick/greedy user policy, or opponent ADP sampling in this app.
---

# Draft Simulation

Prep and Live share one engine: **N snake sims → next picks + top paths**. Scoring is **h2h-categories**. Which build to run (punt/focus chips, round roles) is **draft-strategy**. Weekly streams are **matchup-analysis**.

## When to use

- Draft workspace, `POST /api/draft/simulate`, pick combinations, live board recs
- Punt/focus chips **after** a build is locked (who to take now under those weights)
- Opponent “who goes next” behavior

**Not this skill:** choosing balanced vs punt (use **draft-strategy**), season rank matrix, weekly add/drop, ESPN HTTP/cookies.

## Engine (do not relax)

| Rule | Value |
|---|---|
| Format | Snake, 12 teams, 13 rounds (14th slot is FA/IL, not a 14th draft pick) |
| Objective | Maximize weighted expected category wins (not championship %, not points) |
| User pick | `forcePick` candidate, then **greedy** remaining user picks. No multi-ply |
| Opponents | `score = (1/adp)*100 + positionNeed(0\|25\|50) + categoryNeed` |
| `simCount` | Default 40, cap 100; timeout retry `floor(n/2)` |
| Rank `nextPicks` | Mean end-of-draft EV, then sim frequency. ADP shortlists (top ~12 remaining), it does not score the user |

Slot 1 is **not** automatic max EV. The snake wait after 1.01 is ~23 picks. Construction tables, punt caps, and lock-by-R5 live in **draft-strategy**. This skill only simulates under the locked `effectiveWeights`.

## Common mistakes

| Failure | Correct |
|---|---|
| 1.01 = championship favorite | Slot is input; EV is category-win expectancy after the full snake |
| Copy last year’s board | Re-rank live pool each pick; archetypes not names |
| BPA = ADP | ADP shortlists; EV under `effectiveWeights` ranks |
| Win all 9 after three usage stars | Declare 1–2 punts or take anti-leak complements |
| 3+ punts / silent TO leak | Max 2 declared; no half-punt |
| Multi-ply or 500 sims | Greedy + 40 (cap 100) |
| Opponent picks like the user | ADP + position + category need sampler |
