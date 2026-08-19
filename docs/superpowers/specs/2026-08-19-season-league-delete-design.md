# Season League Delete — Design Spec

**Date:** 2026-08-19  
**Status:** Approved  
**Product:** Delete user-owned season leagues from the `/roster` list

---

## Goal

Let a signed-in user permanently delete a season league they registered (manual or ESPN import) from the Rosters index.

### Success criteria

- Each row on `/roster` has a Delete control that does not navigate into the league
- Confirm once before delete
- `DELETE /api/season-leagues/[id]` removes only leagues owned by the current Clerk user
- List updates without full-page reload; active league cleared if the deleted id was active

### Non-goals

- Soft delete / undo
- Bulk delete
- Deleting anything on ESPN
- Delete from detail page only (detail may add later)

---

## API

`DELETE /api/season-leagues/[id]`

- Auth: `requireUserId`
- Find `SeasonLeague` where `id` + `clerkUserId` match → else 404
- `db.seasonLeague.delete`
- Response: `{ ok: true }` (200)

---

## UI

- `/roster` list: row layout = link to league + Delete button (`handleDeleteLeague`)
- `window.confirm` with league name
- On success: remove from local `leagues` state; if `activeId === id`, clear via active-league provider/storage helpers already used by the app

---

## Testing

- API: unauthorized 401; other user’s id 404; owner delete 200 and row gone
- No live ESPN required
