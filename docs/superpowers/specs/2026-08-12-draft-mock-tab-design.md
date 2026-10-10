# Draft Prep / Mock / Live tab roles

Date: 2026-08-12  
Status: approved

## Product model

| Tab | Role |
|-----|------|
| **Prep** | Strategy + Monte Carlo `Run simulation` only (recommendations). No interactive board picks. |
| **Mock** | Practice draft. User picks on their turns; CPU fills opponents. Reset allowed. |
| **Live** | Real draft board only (ESPN sync and/or manual recording of real picks). **No CPU auto-picks.** |

## Why

Live reflecting a real draft does not need simulated opponent picks. Practice belongs in Mock. Prep simulation remains a separate statistical tool for combinations / next-pick odds.

## Mock state

- Client-only mock board in `DraftWorkspace` (does **not** overwrite `LeagueState.board` used by Live).
- Start / Reset: empty board for `settings.teams` × `settings.rounds`, then CPU-advance until the user's turn.
- After user marks a pick: apply pick, then CPU-advance until next user turn (or draft end).
- No server persist for mock board (refresh clears mock). OK for v1.

## Opponent pick policies

| Path | Policy |
|------|--------|
| Mock CPU + `simulateDraft` opponents | `pickSimOpponent`: ADP top-8 window, `(1/adp)*100 + positionNeedBonus`, weighted random. No category need. |
| Live | No CPU advance. |
| (unused for Live) | Pure ADP helper may still exist for tests / utilities but must not run on Live enter or Live mark-picked. |

## UI

- `DraftWorkspace` mode switch: `prep` \| `mock` \| `live`
- Mock view: reuse `BoardGrid` + `PlayerPool` (+ optional thin `RecPanel` later — not required for v1)
- Controls: `Reset mock draft`
- Disable `Picked` when it is not the perspective team's turn (defense in depth; CPU should leave turn on user)

## Live cleanup

- Remove `withCpuAdvanced` / `applyCpuAdvance` / Live-enter CPU from `DraftWorkspace`
- Live `handleMarkPicked` persists only the human-recorded pick and advances `currentOverall` to the next open slot (no CPU fill)
- `Continue manually` only flips manual mode — no CPU

## Non-goals

- Persisting mock boards to DB
- Changing `greedyUserPick`
- Category-need opponent scoring
- Mock-specific ESPN sync
