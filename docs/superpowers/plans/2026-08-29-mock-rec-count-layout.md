# Mock Rec Count and One-Row Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mock Next picks show 6 compact cells on one row, from 48 sims.

**Architecture:** Shared `MOCK_SIM_COUNT` / `FAST_NEXT_PICK_COUNT`. Engine fast slice and ADP fallback use 6. Mock RecPanel row is `grid-cols-6` without avatars.

**Tech Stack:** TypeScript, React, Tailwind, Vitest.

## Global Constraints

- Mock recs: 6
- Mock sims: 48
- Row: one line, `grid-cols-6`, no wrap
- Row chrome: no avatar, no team abbr, truncate name, rank + frequency stay
- Live RecPanel and Live simCount unchanged
- Simulate API max stays 100; slow-sim half-count fallback stays

---

## File map

| File | Role |
| --- | --- |
| `src/lib/sim/constants.ts` | `MOCK_SIM_COUNT`, `FAST_NEXT_PICK_COUNT` |
| `src/lib/sim/engine.ts` | Fast next-pick slice |
| `src/components/draft/DraftWorkspace.tsx` | Mock sim count + quick fallback slice |
| `src/components/draft/MockDraftView.tsx` | `maxNextPicks` |
| `src/components/draft/RecPanel.tsx` | Compact 6-col row |
| `tests/unit/engine.test.ts` | Fast path cap |
| `tests/unit/RecPanel.test.tsx` | Six names, row grid, no avatar |
| `tests/unit/DraftWorkspace.test.tsx` | Request `simCount: 48` |

---

### Task 1: Raise Mock rec count and sim count

**Files:**
- Create: `src/lib/sim/constants.ts`
- Modify: `src/lib/sim/engine.ts`, `src/components/draft/DraftWorkspace.tsx`, `src/components/draft/MockDraftView.tsx`
- Test: `tests/unit/engine.test.ts`, `tests/unit/DraftWorkspace.test.tsx`

- [ ] **Step 1: Write failing tests**

```ts
expect(result.nextPicks.length).toBeLessThanOrEqual(6)
expect(mockSimulateBody.simCount).toBe(48)
```

- [ ] **Step 2: Run tests — expect fail**
- [ ] **Step 3: Add constants and wire slice / request / `maxNextPicks`**
- [ ] **Step 4: Run tests — expect pass**

---

### Task 2: Compact one-row RecPanel

**Files:**
- Modify: `src/components/draft/RecPanel.tsx`
- Test: `tests/unit/RecPanel.test.tsx`

- [ ] **Step 1: Write failing tests** — `maxNextPicks={6}` shows 6 names; row list has `grid-cols-6`; row has no avatar
- [ ] **Step 2: Run tests — expect fail**
- [ ] **Step 3: `grid-cols-6`, hide avatar/abbr in row, shrink padding, truncate name**
- [ ] **Step 4: Run tests — expect pass**
