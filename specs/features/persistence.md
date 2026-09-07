# Feature: JSON persistence

Status: Done

## Problem Statement

The app runs on one home device. All budgets must survive restart in a single JSON file the app always uses, written after every change.

## Proposed Change

Load `budgets.json` from a fixed app-data directory (path injected for tests). If the file is missing, treat as `{ "version": 1, "budgets": [] }` and write that file. Every successful `createBudget`, `updateBudget`, `copyBudget`, `deleteBudget`, `addCategory`, `updateCategory`, `deleteCategory`, `addEntry`, `updateEntry`, `deleteEntry` writes the full store. No file picker.

## Acceptance Criteria

### AC1: File schema
**Given** one budget named `"Summer"` with empty collections and all optionals unset
**When** the store is serialized
**Then** JSON equals (ids may differ but must be strings; shown here as `"b1"`):

```json
{
  "version": 1,
  "budgets": [
    {
      "id": "b1",
      "name": "Summer",
      "description": "",
      "startDate": null,
      "endDate": null,
      "targetLeftoverCents": null,
      "incomeCategories": [],
      "expenseCategories": [],
      "incomeEntries": [],
      "expenseEntries": []
    }
  ]
}
```

### AC2: Missing file loads empty
**Given** the app-data path has no `budgets.json`
**When** `loadStore(path)`
**Then** the in-memory store is `{ version: 1, budgets: [] }` and `budgets.json` exists with exactly `{"version":1,"budgets":[]}` (no extra keys)

### AC3: Load round-trip
**Given** `budgets.json` containing the AC1 document
**When** `loadStore(path)` then `listBudgets()`
**Then** there is `1` budget with `name` `"Summer"`

### AC4: Save after create
**Given** an empty store already loaded
**When** `createBudget({ name: "Winter" })` succeeds
**Then** `budgets.json` on disk contains a budget with `"name": "Winter"`

### AC5: Save after delete
**Given** on-disk store with `"Summer"` and `"Winter"`
**When** `deleteBudget` of Summer succeeds
**Then** parsed `budgets.json` `budgets` has length `1` and that object’s `name` is `"Winter"`

### AC6: Save after copy
**Given** on-disk store with only `"Summer"`
**When** `copyBudget` of that budget succeeds
**Then** parsed `budgets.json` `budgets` has length `2` and the names are `"Summer"` and `"Summer (copy1)"` (any order)

### AC7: Corrupt file is not overwritten
**Given** `budgets.json` contents `NOT JSON`
**When** `loadStore(path)`
**Then** the return value is `{ ok: false, error: "Could not read budgets.json." }` and the file contents are still exactly `NOT JSON`

### AC8: App uses the same path every time
**Given** `APP_BUDGETS_FILE` is the configured absolute path ending in `budgets.json`
**When** load or save runs against a directory that contains only that file
**Then** `APP_BUDGETS_FILE` is absolute and ends with `budgets.json`, and that directory still contains only `budgets.json` (tests must use a temp directory, never the real app-data file)

### AC9: Invalid store JSON is not overwritten
**Given** `budgets.json` contents `{}`
**When** `loadStore(path)`
**Then** the return value is `{ ok: false, error: "Could not read budgets.json." }` and the file contents are still exactly `{}`

## Files to Modify

| File | Change |
|---|---|
| `src/store.ts` | `loadStore`, `saveStore`, `parseStoreJson`; serialize/deserialize; call save from mutating APIs. |
| `src/store.test.ts` | Tests for AC1–AC9 using a temp directory. |
| `src/paths.ts` | Export `APP_BUDGETS_FILE` (fixed app-data folder + `budgets.json`). |
| `vite.config.ts` | PUT `/api/store` uses `parseStoreJson`; reject invalid bodies without writing. |

## Risk

- What could break: a failed save after mutate would lose the last change; corrupt-file handling must not replace the file with empty data.
- Rollback: stop calling `saveStore`; in-memory app still runs for a session.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| serializeStore | AC1 schema | one empty Summer | serialize | version 1, fields as specified |
| loadStore | AC2 missing | no file | load | empty store + write `{"version":1,"budgets":[]}` |
| loadStore | AC3 round-trip | AC1 file | load | one budget Summer |
| createBudget | AC4 autosave | empty loaded | create Winter | disk has Winter |
| deleteBudget | AC5 autosave | Summer+Winter on disk | delete Summer | disk length 1 Winter |
| copyBudget | AC6 autosave | Summer on disk | copy | disk names Summer and Summer (copy1) |
| loadStore | AC7 corrupt | `NOT JSON` | load | error `Could not read budgets.json.`, file unchanged |
| loadStore/saveStore | AC8 path | temp dir + APP_BUDGETS_FILE | load/save | absolute `…/budgets.json`; dir has only that file |
| loadStore | AC9 invalid object | file `{}` | load | error `Could not read budgets.json.`, file unchanged |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
