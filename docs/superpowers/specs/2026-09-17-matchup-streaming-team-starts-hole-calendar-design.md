# Matchup Streaming — Team Starts + Hole Calendar — Design Spec

**Date:** 2026-09-17  
**Status:** Approved for implementation planning (expect iteration after first playtest)  
**Product:** Matchup streaming plans + Daily lineup preview overlay  
**Branch context:** `feat/published-nba-schedule` / `feat-season-roster` worktree  
**Supersedes (planner scoring only):** [2026-08-24 streaming plans](./2026-08-24-matchup-streaming-plans-design.md) §3 algorithm and “maximize streamer NBA game-starts”; [2026-08-25 starts-max](./2026-08-25-matchup-streaming-starts-max-protected-drops-design.md) `expectedStarts` = remaining NBA games; [2026-08-25 schedule sophistication](./2026-08-25-matchup-streaming-schedule-sophistication-design.md) density/B2B as a primary score.  
**Does not replace:** Daily grid display specs (ESPN roster rows, starts-only seats, off-night fill). Overlay rules below amend how a plan is applied onto those seats.

The same volume/crowd bugs keep returning (DaSilva held through a packed night, Bagley Sit with a dead Start toggle, Jaquez locked after a starter cut) because the planner scores **streamer NBA games**, not **team-wide actual starts**. This spec changes the objective and the day model. UI chrome stays; the builder and preview seating change.

---

## 1. Goal

Maximize **team-wide Start count** for the matchup week: roster players who actually sit in an active slot, plus free agents who sit in a leftover hole. A streamer who is on the plan but not seated that day is **0**.

### Success criteria

- Plan `gameStarts` equals starts after the plan overlay, not raw FA games.
- A night that is full after seating roster games never adds or holds a streamer.
- A hole exists only after roster games (minus the user’s own Sits) are seated, and only if the FA is eligible for a leftover active slot.
- 1/2/3-spot is the max **concurrent** streamers that day, and never more than that day’s hole count.
- Packed-night drops are free. Re-adding later costs one add, inside the existing weekly add limit.
- Automatic roster cuts never remove a player who would Start that day.
- Manual Sit stays Sit; that slot may become a hole; the user can Start them again.
- Opponent plans use the same hole calendar on the opponent roster.
- Tests in §7 pass.

### Non-goals

- Week-wide DP / search for a globally optimal add sequence
- Executing waivers or ESPN roster writes from the plan
- Binding a spot to a season roster index (BE/UTIL)
- Redesigning Aggressive / Balanced / Conservative as a product
- New Matchup pages or a new plan board layout
- Auto-sitting a healthy rostered starter (including Austin Reaves) to make room for a streamer

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Objective | Maximize team-wide Starts |
| Packed night | After seating roster games (and honoring manual Sits), **0** leftover active slots → no streamer add or hold |
| Hole | Leftover active slot the FA is eligible for |
| FA rank | Remaining **hole** Starts → B2B that falls on those hole nights → weak cats |
| B2B (e.g. 10/20–10/21) | Counts only if each night is actually a hole for that player |
| 1/2/3-spot | Concurrent streamer cap that day; `min(spotCount, holeCount)` |
| Packed-night occupants | Drop all held streamers (drop does not spend an add) |
| Re-add after drop | Allowed; costs 1 add |
| Add budget | Existing weekly limit (default 7; `streamingAddLimitForSchedule` unchanged) |
| Auto roster cut | Only a player who is **not** Starting tonight (no game, or already Sit). If several, fewest remaining week game days |
| Manual Sit | Persist; do not force-Start; the empty slot may be a hole |
| Plan cut Start lock | Only players the plan cut; lock from the cut date inclusive |
| Preview streamer seating | Holes only; specific empty first, then UTIL/G/F |
| Start toggle with no seat | No-op (`full`) + hint to Sit someone first |
| Opponent | Same hole-calendar planner |
| You-spot Rec | Highest team Starts, then fewer adds |
| Forced drop dropdown | Keep; auto candidates exclude tonight’s starters; a manual pick is honored |
| Strategy modes | Stay in the UI; they must not override packed-night / hole / no-starter-cut rules |

Austin Reaves is not a special-case Sit. The planner does not Sit him. He only sits if the user sat him, or (today’s bug) a held streamer stole a packed-night seat — which this spec forbids.

---

## 3. Approach (locked)

Two-pass builder inside the existing `buildStreamingPlan` + `applyStreamingPlanPreview` split. No week-wide optimizer.

### Pass 1 — Hole calendar

Build (and rebuild) the calendar from the current plan roster, not once at week start. After Pass 2 cuts someone, later days omit that id.

For each matchup day:

1. Take the perspective roster (you or opponent), minus cuts already decided on or before that day.
2. Seat every remaining rostered player who has a game that day, using the same eligibility packing as `buildDayLineupFromRoster` (exact slot, then G/F/UTIL).
3. Omit anyone the user already Sat in the **saved** daily lineup for that day. Do not put them back.
4. Leftover `playerId === null` active slots are the day’s **holes**.
5. If hole count is 0, the day is **packed**.

A candidate FA’s hole on that day is true only if they have an NBA game **and** at least one leftover slot they are eligible for.

Pass 1 does **not** consume future holes with other streamers when scoring “remaining hole Starts.” Same-day already-seated streamers **do** consume holes (the concurrent cap).

### Pass 2 — Fill in date order

For each day, for `spotCount ∈ {1, 2, 3}`:

**Packed (0 holes)**  
Drop every held streamer. The day’s cells are `action: "empty"` and `playerId: null`. Do not show a held name and do not keep them on the bench.

**Holes**  
Cap streamers at `min(spotCount, holeCount)`.

- If a held streamer can sit in a remaining hole → **Hold** (no add).
- If a held streamer cannot sit tonight → drop them. If a better FA can sit, **Drop→Add**.
- If a hole remains and adds remain → **Add** the best unused FA who can sit tonight.
- If held streamers outnumber tonight’s holes, drop from fewest remaining hole Starts first.

**Rank** (add or drop_add target):

1. Remaining hole Starts from this day through the end of the week (Pass 1 definition).
2. Among ties, prefer a B2B whose nights are both holes.
3. Then existing weak-cat / surplus help (current streamer scoring), as a tie-break only.

**Roster space**  
If the roster has no empty non-IL slot and a hole needs an add, auto-cut a **non-starter** (no game tonight, or already Sit). Never auto-cut a tonight starter. If several non-starters are legal, cut the one with the fewest remaining game days this week (0-game leftover first) so an off-night cut does not drop a later starter when a true leftover exists. If no legal cut exists, skip the add.

**Re-add**  
A dropped streamer returns to the FA pool. Picking them on a later hole night costs one add.

**Strategy modes**  
May still change how eager a same-score swap is, or how thin a tertiary cat tie-break is. They must not: add/hold on a packed night; count an unseatable game as volume; auto-cut a tonight starter.

---

## 4. Daily overlay

`applyStreamingPlanPreview` paints the plan onto a clone of the base daily. Base daily is unchanged until the user toggles a real roster cell.

| Actor | Overlay |
| --- | --- |
| Roster with a game, not plan-cut, not user-Sit | Seat first (keep current packing) |
| User Sit | Stay out; slot may be filled by a streamer; Start toggle still works |
| Plan-cut roster | Cleared from the cut date; Start locked from that date |
| Streamer on an add/hold/drop_add cell | Seat only if a hole remains; allow UTIL/G/F after specific empties |
| Streamer on a packed night | Not present in the overlay |
| Plan-cut id in `keepRosterSeats` | Ignore — do not reseat |
| Roster the plan did not cut and the user never started | Do not autofill empty actives (protects Sit) |

Streamer Sit/Start in preview is overlay-only (`omitSeats`). If seating fails, return `full` and do not claim the player started.

---

## 5. UI

No new page. `StreamingPlansPanel` 1/2/3 compare, add-budget control, strategy radios, and Daily preview toggle stay.

- Header `starts` = team Starts after overlay (`gameStarts` meaning in §1).
- Packed-night cells show empty / Drop, not a held name who cannot start.
- Opponent week strip uses the opponent hole-calendar plan, not “FA remaining NBA games vs a packed opponent.”
- Forced-drop control stays. Suggested options omit tonight’s starters. A user-chosen starter drop is honored (override, not auto).
- You-spot Rec: max `gameStarts`, then fewer `addsUsed`.
- Product copy stays English.

---

## 6. Data shape

Existing `StreamingPlan` / day-cell actions (`hold` | `add` | `drop_add` | `empty`) stay. `gameStarts` is redefined as team Starts after overlay.

No new persisted schema. Saved daily + current preview flags (`omitSeats`, `keepRosterSeats`, forced drops) stay the inputs they are today.

Hole calendar is a planner implementation detail. It does not need its own API field for MVP. Tests may export a helper to assert packed vs hole days.

---

## 7. Testing

Keep existing plan / Daily / preview tests that still match these rules. Replace or drop tests that require holding a streamer on a packed night, counting unseatable NBA games as volume, or auto-cutting a tonight starter.

Required cases:

- Roster has 10 games: no streamer add or hold; team Starts = 10 roster.
- Add only on a hole night; `gameStarts` counts seated Starts only.
- Unseatable night (DaSilva 10/23 when the lineup is already full) is not a hole Start for that FA.
- 10/20–10/21 B2B is chosen only when both nights are holes for that player.
- 2-spot seats two streamers only when that day has two holes; one hole → one streamer.
- Drop on a packed night, re-add on a later hole → `addsUsed` +1.
- Auto-cut never selects a roster player who has a game and is not already Sit.
- Manual Sit persists, may become a hole, and can toggle back to Start.
- Plan-cut players lock Start from the cut date; manual Sit does not lock.
- Opponent packed night: no opponent streamer.
- Overlay seats a hold into UTIL/G/F when the specific slot is full and a hole remains (Bagley case).
- Start with no open hole returns `full` and does not flip the cell.

Run with `npx.cmd vitest run --maxWorkers=1 --testTimeout=30000` on the touched files.

---

## 8. Files (expected)

| Area | Touch |
| --- | --- |
| Hole calendar + Pass 2 | `src/lib/matchup/streamingPlans.ts` |
| Preview seating | `src/lib/matchup/applyStreamingPlanPreview.ts` |
| Flex-hole seat helper | `src/lib/matchup/streamerMove.ts` (keep `allowFlexSlots` for overlay; add-time still prefers specific empties) |
| Daily lock chrome | `src/components/matchup/DailyLineupPanel.tsx` (plan-cut lock only) |
| Start / full hint | `src/components/matchup/MatchupWorkspace.tsx` |
| Starts label / empty packed cells | `src/components/matchup/StreamingPlansPanel.tsx` |
| Types only if comments/docs on `gameStarts` | `src/lib/matchup/types.ts` |
| Tests | `tests/unit/streamingPlans.test.ts`, `applyStreamingPlanPreview.test.ts`, `DailyLineupPanel.test.tsx`, plus opponent plan cases already in streaming plan tests |

Do not rewrite Daily display-row builders unless a test proves the overlay and the grid disagree.

---

## 9. Error and thin-pool behavior

- FA pool too thin: fewer adds, empty spots, still never hold on a packed night.
- No legal cut and no open roster slot: skip the add; leave the hole empty rather than cut a starter.
- Add budget exhausted: hold only when tonight is a hole the occupant can sit; otherwise drop; do not add.
- Doubleheader: still one game-day. B2B flag is annotation / tie-break, not a fractional start.

---

## 10. Out of scope (explicit)

- Choosing streamers by category-win simulation beyond the existing weak-cat tie-break
- Changing waiver cooldown / add-limit calendar helpers
- Moving the repo off OneDrive
- Shipping this as a GitHub PR unless asked after implementation
