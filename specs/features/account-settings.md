# Feature: Account settings

## Overview

- **Status:** In Progress
- **Created:** 2026-09-23
- **Affected subsystems:** HTTP adapter, household repo, Login/Home session UI — see [auth-accounts.md](auth-accounts.md), [specs/ui-ux.md](../ui-ux.md)

## Problem Statement

A signed-in user can sign out, but cannot rename themselves, change their password, or delete their own account. Display name is collected only at register. Password lives only in Firebase Auth. The moderator can delete other members, and that path already refuses to delete the moderator.

## Current Behavior

`GET /api/me` returns the profile JSON from `mePayload` (`id`, `email`, `displayName`, `canUseFromText`, `createdAt`, `isModerator`). There is no `PATCH /api/me` or `DELETE /api/me`. `POST /api/register` trims `displayName` and rejects empty or whitespace with `400` `{"error":"Display name is required."}`. `canUseFromText` is changed only by the moderator via `PATCH /api/admin/users/:id`.

`deleteHouseholdUser` in `src/repo.ts` requires a moderator actor, refuses the moderator’s own id (and a profile whose email matches `MODERATOR_EMAIL`), then removes budgets that profile owns, strips that `userId` from other budgets’ `grants`, removes the profile, and calls Admin `deleteUser` once. `DELETE /api/admin/users/:id` is that path. A non-moderator calling it gets `403` `{"error":"Not allowed."}`.

The session bar in `src/App.tsx` shows `displayName`, `email`, and `Sign out`. Password changes are not in `src/authClient.ts`. Firebase Auth sign-in, register, and sign-out go through `trackBusy`.

## Proposed Change

Identity stays split: the password lives only in Firebase Auth; `displayName` lives only on the Firestore profile. Email is the Auth token email and is not editable here.

1. **Account** in the session bar opens an Account view over Home or the open budget. **Back** returns to that same place without clearing the open budget id.
2. **Display name.** `PATCH /api/me` with `{ "displayName": string }`. Trim. Empty or whitespace is `400` `{"error":"Display name is required."}` and the stored profile is unchanged. Success is `200` with the same JSON shape as `GET /api/me`. `id`, `email`, stored `canUseFromText`, and `createdAt` stay unchanged. Any other body fields are ignored, so this route cannot flip `canUseFromText`, change `email`, change `id`, or set `isModerator`. The session bar updates from that JSON, and the client reloads `GET /api/budgets` so `ownerDisplayName` on the caller’s budgets matches the trimmed name.
3. **Password.** Client only. Fields `Current password`, `New password`, `Confirm new password`. Passwords are not trimmed. If the new and confirm values differ, show `New password does not match.` and do not call Auth. Otherwise, if the new password’s length is under 6, show `Password must be at least 6 characters.` and do not call Auth. Otherwise `reauthenticateWithCredential` with the current password, then `updatePassword`. Wrong current password (`auth/wrong-password`, `auth/invalid-credential`, or `auth/invalid-login-credentials`) shows `Current password is wrong.` and does not call `updatePassword`. Success clears the three fields, shows `Password updated.`, and leaves the user signed in. The moderator uses the same form.
4. **Delete account.** `DELETE /api/me` deletes the caller only, reusing the same cascade as `deleteHouseholdUser` (owned budgets, grants, profile, then Admin `deleteUser` once). The user enters their current password, reauthenticates, and must confirm `Delete your account? Your budgets will also be deleted.` After `200` `{"ok":true}`, the UI shows the Sign in heading even if client `signOut` rejects because the Auth user is already gone.
5. **Moderator cannot self-delete.** The Delete section is absent when `me.isModerator` is true. `DELETE /api/me` as the moderator is `403` `{"error":"Not allowed."}` and deletes nothing. `DELETE /api/admin/users/:id` stays as specified in [auth-accounts.md](auth-accounts.md).

`PATCH` and `DELETE` `/api/me` are matched in the same early `/api/me` branch as `GET /api/me`, before `requireProfile` and before any later `/api/*` handler.

## Acceptance Criteria

### AC1: Account opens over Home and Back returns there
**Given** a signed-in non-moderator on Home (heading text `Budgets`, session bar visible)
**When** the user clicks `Account`
**Then** the heading is `Account`, the text `Budgets` is absent, and `Sign out` is still present
**When** the user clicks `Back`
**Then** the heading text `Budgets` is present and the heading `Account` is absent

### AC2: Account opens over a budget and Back returns to that budget
**Given** a signed-in user with budget `Summer` open (`Back to budgets` visible)
**When** the user clicks `Account`, then clicks `Back`
**Then** after `Account`, the heading is `Account` and `Back to budgets` is absent
**Then** after `Back`, `Back to budgets` is visible and the heading `Account` is absent

### AC3: Rename trims and returns the me payload
**Given** Alice’s profile is `{ "id": "uid-alice", "email": "alice@example.com", "displayName": "Alice", "canUseFromText": false, "createdAt": "2026-01-01T00:00:00.000Z" }` and she is not the moderator
**When** `PATCH /api/me` with body `{ "displayName": "  Ada  " }` and `Authorization: Bearer alice`
**Then** status `200` and the body is exactly:

```json
{
  "id": "uid-alice",
  "email": "alice@example.com",
  "displayName": "Ada",
  "canUseFromText": false,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "isModerator": false
}
```

**Then** the stored profile’s `displayName` is `Ada`, and `id`, `email`, `canUseFromText`, and `createdAt` are unchanged

### AC4: Blank display name is rejected
**Given** Alice’s stored `displayName` is `Alice`
**When** `PATCH /api/me` with body `{ "displayName": "   " }`
**Then** status `400`, body exactly `{"error":"Display name is required."}`, and the stored `displayName` is still `Alice`
**When** the body is `{}` or `{ "displayName": 1 }`
**Then** status `400`, body exactly `{"error":"Display name is required."}`, and the stored `displayName` is still `Alice`

### AC5: Extra profile fields in the body do not stick
**Given** Alice’s stored `canUseFromText` is `false`, `email` is `alice@example.com`, and `id` is `uid-alice`
**When** `PATCH /api/me` with body `{ "displayName": "Ada", "canUseFromText": true, "email": "evil@example.com", "id": "uid-other", "isModerator": true }`
**Then** status `200`, response `displayName` is `Ada`, `canUseFromText` is `false`, `email` is `alice@example.com`, `id` is `uid-alice`, and `isModerator` is `false`
**Then** the stored profile’s `canUseFromText` is `false`, `email` is `alice@example.com`, and `id` is `uid-alice`

### AC6: Session bar and owner display name refresh after rename
**Given** Alice is signed in, her session bar shows `Alice`, and `GET /api/budgets` lists a budget she owns with `ownerDisplayName` `Alice`
**When** she saves display name `Ada` and `PATCH /api/me` returns `200` with `displayName` `Ada`
**Then** the session bar text is `Ada`
**Then** the client issues `GET /api/budgets` again and the listed `ownerDisplayName` for that budget is `Ada`

### AC7: Password mismatch does not call updatePassword
**Given** the Account view is open and `updatePassword` is mocked
**When** Current password is `secret12`, New password is `short`, and Confirm new password is `other`
**Then** a `.field-error` has text exactly `New password does not match.`
**Then** `updatePassword` is not called and `reauthenticateWithCredential` is not called

### AC8: Short password does not call updatePassword
**Given** the Account view is open and `updatePassword` is mocked
**When** Current password is `secret12`, New password is `short`, and Confirm new password is `short`
**Then** a `.field-error` has text exactly `Password must be at least 6 characters.`
**Then** `updatePassword` is not called and `reauthenticateWithCredential` is not called

### AC9: Wrong current password does not call updatePassword
**Given** `reauthenticateWithCredential` rejects with Firebase error code `auth/invalid-credential`
**When** Current password is `wrong`, New password is `secret12`, and Confirm new password is `secret12`, and the user clicks `Update password`
**Then** a `.field-error` has text exactly `Current password is wrong.`
**Then** `updatePassword` is not called
**Then** the same string is shown when the code is `auth/wrong-password` or `auth/invalid-login-credentials`

### AC10: Successful password change stays signed in
**Given** `reauthenticateWithCredential` and `updatePassword` resolve, including when `me.isModerator` is `true`
**When** Current password is `secret12`, New password is `secret99`, and Confirm new password is `secret99`, and the user clicks `Update password`
**Then** `reauthenticateWithCredential` is called once with the current password and `updatePassword` is called once with `secret99`
**Then** the three password inputs are empty
**Then** the text `Password updated.` is present
**Then** the heading `Sign in` is absent and the heading `Account` is still present

### AC11: Self-delete removes owned budgets, strips grants, and deletes the Auth user
**Given** Alice owns budgets `b1` and `b2`, Bob owns `b3` with `grants` `[{ "userId": "uid-alice", "role": "edit" }]`, and Alice is not the moderator
**When** `DELETE /api/me` with `Authorization: Bearer alice`
**Then** status `200`, body exactly `{"ok":true}`
**Then** Alice’s profile is gone, `b1` and `b2` are gone, `b3` remains, and `b3.grants` is `[]`
**Then** `deleteUser` is called once with `uid-alice`

### AC12: Successful delete returns to Sign in even if signOut fails
**Given** the delete confirm returns `true`, reauthentication resolves, and `DELETE /api/me` returns `200` `{"ok":true}`
**When** `signOut` rejects
**Then** the heading is `Sign in`
**Then** the heading `Account` is absent

### AC13: Cancelled delete confirm does nothing
**Given** the Account delete section is visible and `window.confirm` returns `false`
**When** the user clicks `Delete account`
**Then** `window.confirm` is called once with exactly `Delete your account? Your budgets will also be deleted.`
**Then** `reauthenticateWithCredential` is not called and `DELETE /api/me` is not sent

### AC14: Wrong password blocks delete
**Given** `window.confirm` returns `true` and `reauthenticateWithCredential` rejects with code `auth/invalid-credential`
**When** the user clicks `Delete account` after entering a current password
**Then** a `.field-error` has text exactly `Current password is wrong.`
**Then** `DELETE /api/me` is not sent

### AC15: Moderator cannot self-delete
**Given** the signed-in profile has `isModerator` `true`
**When** the Account view renders
**Then** no button named `Delete account` is in the document and the heading `Delete account` is absent
**Given** the moderator’s profile exists and they own budget `b1`
**When** `DELETE /api/me` with the moderator’s Bearer token
**Then** status `403`, body exactly `{"error":"Not allowed."}`
**Then** the moderator profile is still stored, `b1` is still stored, and `deleteUser` is not called

### AC16: Unauthenticated profile routes reject
**Given** no `Authorization` header
**When** `PATCH /api/me` with body `{ "displayName": "Ada" }`
**Then** status `401`, body exactly `{"error":"Sign in required."}`
**When** `DELETE /api/me`
**Then** status `401`, body exactly `{"error":"Sign in required."}`

### AC17: Moderator delete of someone else is unchanged
**Given** the moderator is signed in and Alice owns budget `b1`
**When** `DELETE /api/admin/users/uid-alice`
**Then** status `200`, body exactly `{"ok":true}`, Alice’s profile is gone, `b1` is gone, and `deleteUser` is called once with `uid-alice`
**When** `DELETE /api/admin/users/<moderator id>`
**Then** status `403`, body exactly `{"error":"Not allowed."}`, and the moderator profile remains

## Files to Modify

| File | Change |
|------|--------|
| `specs/features/account-settings.md` | This spec |
| `specs/ui-ux.md` | Session bar gains `Account`; Account view fields, errors, confirm string, and the moderator exception |
| `src/repo.ts` | Share the removal cascade used by `deleteHouseholdUser` and self-delete. Self-delete refuses when `actor.isModerator` is true, before any budget, grant, profile, or Auth delete |
| `src/httpDispatch.ts` | `PATCH /api/me` and `DELETE /api/me` in the early `/api/me` branch, before `requireProfile` |
| `src/authClient.ts` | `reauthenticateWithCredential` then `updatePassword`, inside `trackBusy`. Map `auth/wrong-password`, `auth/invalid-credential`, and `auth/invalid-login-credentials` to `Current password is wrong.` |
| `src/ui/AccountScreen.tsx` | New view. Same form classes as `src/ui/LoginScreen.tsx`: `field`, `field-error`, `button--danger` |
| `src/App.tsx` | `Account` button beside `Sign out`. Account view state that keeps the open budget id. After a successful delete, show Sign in even when `signOut` rejects |
| `src/httpDispatch.test.ts` | AC3, AC4, AC5, AC11, AC15 HTTP, AC16, AC17 |
| `src/repo.test.ts` | Self-delete cascade and moderator refusal; moderator delete of another user still uses the shared cascade |
| `src/ui/AccountScreen.test.tsx` | AC7, AC8, AC9, AC10, AC13, AC14, AC15 UI |
| `src/App.test.tsx` | AC1, AC2, AC6, AC12 |

## Risk

- What could break: `DELETE /api/admin/users/:id` if the shared cascade drops the moderator checks; a later `/api/*` handler if `PATCH` or `DELETE` `/api/me` is not matched in the early `/api/me` branch; spreading the PATCH body onto the profile would let the client set `canUseFromText`; `signOut` after Admin `deleteUser` can reject and leave the Account view up.
- Rollback: revert the files in the table above. No data migration. Existing `GET /api/me` and `DELETE /api/admin/users/:id` contracts in [auth-accounts.md](auth-accounts.md) stay the source of truth for those routes.
- Dependencies: Firebase Auth client SDK (`reauthenticateWithCredential`, `updatePassword`, `EmailAuthProvider`) and the existing Admin `deleteUser` hook on the HTTP dispatch input.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| `App` | AC1 Home and Back | Signed-in Home | Click `Account`, then `Back` | Heading `Account`, then heading text `Budgets` |
| `App` | AC2 Budget and Back | Budget `Summer` open | Click `Account`, then `Back` | `Back to budgets` hidden on Account, visible again after `Back` |
| `PATCH /api/me` | AC3 trim | Alice stored as `Alice` | Body `{ "displayName": "  Ada  " }` | `200` me payload with `displayName` `Ada`; stored email, id, flag, `createdAt` unchanged |
| `PATCH /api/me` | AC4 blank | Stored name `Alice` | Body `{ "displayName": "   " }`, then `{}` | Each response `400` `{"error":"Display name is required."}`; stored name `Alice` |
| `PATCH /api/me` | AC5 ignored fields | `canUseFromText` false | Body includes `canUseFromText: true` and a different email and id | `200`; stored flag, email, and id unchanged; response `isModerator` false |
| `App` | AC6 refresh | Session bar `Alice`; owned budget `ownerDisplayName` `Alice` | Save `Ada` | Session bar `Ada`; another `GET /api/budgets`; listed `ownerDisplayName` `Ada` |
| `AccountScreen` | AC7 mismatch | Auth mocks | New `short`, confirm `other` | `.field-error` `New password does not match.`; `updatePassword` not called |
| `AccountScreen` | AC8 short | Auth mocks | New and confirm `short` | `.field-error` `Password must be at least 6 characters.`; `updatePassword` not called |
| `changePassword` | AC9 wrong password | Reauth rejects `auth/invalid-credential` | Click `Update password` with matching 6+ character passwords | `.field-error` `Current password is wrong.`; `updatePassword` not called |
| `AccountScreen` | AC10 success | Reauth and `updatePassword` resolve; moderator `me` | Matching new password `secret99` | Fields empty; text `Password updated.`; heading still `Account` |
| `DELETE /api/me` | AC11 cascade | Alice owns `b1`/`b2`; Bob’s `b3` grants Alice `edit` | `DELETE /api/me` as Alice | `200` `{"ok":true}`; `b1`/`b2` gone; `b3.grants` `[]`; `deleteUser("uid-alice")` once |
| `App` | AC12 sign-out failure | Confirm true; `DELETE` `200`; `signOut` rejects | Delete finishes | Heading `Sign in` |
| `AccountScreen` | AC13 cancel confirm | `window.confirm` returns false | Click `Delete account` | Confirm message exactly `Delete your account? Your budgets will also be deleted.`; no reauth; no `DELETE` |
| `AccountScreen` | AC14 wrong delete password | Confirm true; reauth rejects `auth/invalid-credential` | Click `Delete account` | `.field-error` `Current password is wrong.`; no `DELETE` |
| `AccountScreen` / `DELETE /api/me` | AC15 moderator | `isModerator` true; moderator owns `b1` | Render Account; `DELETE /api/me` | No `Delete account` button or heading; `403` `{"error":"Not allowed."}`; profile and `b1` remain; `deleteUser` not called |
| `PATCH` and `DELETE /api/me` | AC16 no auth | No Authorization header | `PATCH` then `DELETE` | Each `401` `{"error":"Sign in required."}` |
| `DELETE /api/admin/users/:id` | AC17 unchanged | Moderator actor | Delete Alice; delete moderator id | Alice `200` and `deleteUser` once; moderator id `403` and profile remains |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
