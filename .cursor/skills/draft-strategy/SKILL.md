---
name: draft-strategy
description: Use when choosing or locking a snake draft build, setting punt/focus chips from slot and picks so far, naming balanced vs punt-AST vs punt-FT vs punt-TO, or writing a rest-of-draft plan before later rounds.
---

# Draft Strategy

Pick **one** legal build and lock `puntCategoryIds` / `focusCategoryIds` by **round 5**. Sims and next-pick ranking are **draft-simulation**. Category math is **h2h-categories**.

Do not output a menu. Commit.

## When to use

- “What strategy should I draft?”
- League setup punt/focus chips, prep-mode build picker, live “you just stacked two usage stars”
- Rest-of-draft roles after 1.01 / the turn

**Not this skill:** simulate API internals, weekly streams, ESPN HTTP.

## Legal builds (max 2 punts)

| `id` | `puntCategoryIds` | `focusCategoryIds` | When |
|---|---|---|---|
| `balanced_9cat` | `[]` | 1–2 cats you will actually hunt (often `STL`+`PTS` or `FG_PCT`) | Default. Late 9–12 if a steal/FG% cluster is on the board. Early only if R2–R5 are **anti-leak** complements |
| `punt_ast` | `["AST"]` | `["TPM","FT_PCT","TO"]` | Slots 10–12, or the board is wings/bigs and elite PGs are gone. Never take a pass-first star PG |
| `punt_ft_ast` | `["FT_PCT","AST"]` | `["FG_PCT","BLK"]` | Mid slots when poor-FT, high-FG%/BLK bigs are the value. Do not later “fix” FT% |
| `punt_to` | `["TO"]` | `["STL","FG_PCT"]` | Early slot after a usage big **and** a second high-usage guard/big. AST/PTS come from the stack — do not focus those |

Illegal: 3+ punts; `punt_blk` as the plan; empty plan; **false balanced** (`weight.TO === 1` while rostering two+ usage TO dumpers).

## Decision (run in order, stop at first hit)

1. Already two high-usage pieces that dump the same cat → that cat must be a declared punt (`punt_to` and/or a %). Not 9-cat.
2. Slot 9–12 and no primary PG on the roster after R2 → `punt_ast` unless a steal/FG% core is clearly available → then `balanced_9cat`.
3. Roster already includes two poor-FT, high-FG%/BLK bigs → `punt_ft_ast`.
4. Else `balanced_9cat`. Complements, not clones.

If the user is slot 1 and R2’s best is another usage guard: take them only as `punt_to`. If they pass that guard, stay `balanced_9cat` and take a low-TO/FT%/stocks complement instead.

## Lock

- **Lock round: 5.** After R5, do not switch `id` except: add a **second** punt if the same leak is still structural (still ≤2). Never un-punt. Never a third punt.
- R2–R5 buy the shape. R8–R13 fill holes; disposable in-season.
- Roles not names. Re-rank the live pool.

## Required output

```ts
type DraftStrategy = {
  id: "balanced_9cat" | "punt_ast" | "punt_ft_ast" | "punt_to"
  puntCategoryIds: CategoryId[]   // length 0–2
  focusCategoryIds: CategoryId[]  // 1–2, disjoint from punts, not already-covered stack cats
  lockRound: 5
  roundRoles: { from: number; to: number; take: string; avoid: string }[]
}
```

Focus = cats remaining picks must **win**, not cats the first two stars already guarantee.

## Common mistakes

| Failure | Correct |
|---|---|
| Offer four options | One `id` |
| Focus AST/PTS on `punt_to` | Those are the stack; focus `STL`+`FG_PCT` |
| Stay 9-cat after two usage stars | `punt_to` (or pass the second star) |
| Punt 4 cats around one elite AST | Illegal |
| Copy last year’s board | Roles + live pool |
| Change shape in R9 to “fix” a punt | Fill the plan’s hole; do not un-punt |
