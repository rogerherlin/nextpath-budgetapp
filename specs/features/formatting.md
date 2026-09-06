# Feature: Money and date formatting

Status: In Progress

## Problem Statement

The household uses Finnish numeric and date display. Amounts and dates must parse and format the same way everywhere (fields, report, JSON round-trip via cents).

## Proposed Change

Pure functions convert integer **cents** to/from display strings, and calendar dates to/from `dd.mm.yyyy`. Optional fields treat empty input as unset, not as zero.

## Acceptance Criteria

### AC1: Format amount with thousands space and two decimals
**Given** cents `123456`
**When** `formatMoney(123456)`
**Then** the return value is `"1 234,56"`

### AC2: Format zero
**Given** cents `0`
**When** `formatMoney(0)`
**Then** the return value is `"0,00"`

### AC3: Format cents only
**Given** cents `50`
**When** `formatMoney(50)`
**Then** the return value is `"0,50"`

### AC4: Format negative amount
**Given** cents `-1050`
**When** `formatMoney(-1050)`
**Then** the return value is `"-10,50"`

### AC5: Parse amount with thousands space
**Given** input `"1 234,56"`
**When** `parseMoney("1 234,56")`
**Then** the return value is `{ ok: true, cents: 123456 }`

### AC6: Parse amount without thousands space
**Given** input `"1234,56"`
**When** `parseMoney("1234,56")`
**Then** the return value is `{ ok: true, cents: 123456 }`

### AC7: Parse negative amount
**Given** input `"-10,50"`
**When** `parseMoney("-10,50")`
**Then** the return value is `{ ok: true, cents: -1050 }`

### AC8: Parse zero
**Given** input `"0,00"`
**When** `parseMoney("0,00")`
**Then** the return value is `{ ok: true, cents: 0 }`

### AC9: Reject empty required amount
**Given** input `""`
**When** `parseMoney("")`
**Then** the return value is `{ ok: false, error: "Enter a valid amount." }`

### AC10: Reject more than two decimal digits
**Given** input `"10,123"`
**When** `parseMoney("10,123")`
**Then** the return value is `{ ok: false, error: "Enter a valid amount." }`

### AC11: Reject non-numeric amount
**Given** input `"abc"`
**When** `parseMoney("abc")`
**Then** the return value is `{ ok: false, error: "Enter a valid amount." }`

### AC12: Optional money empty is unset
**Given** input `""`
**When** `parseOptionalMoney("")`
**Then** the return value is `{ ok: true, cents: null }`

### AC13: Optional money valid
**Given** input `"200,00"`
**When** `parseOptionalMoney("200,00")`
**Then** the return value is `{ ok: true, cents: 20000 }`

### AC14: Format date with leading zeros
**Given** date `{ year: 2026, month: 9, day: 5 }`
**When** `formatDate({ year: 2026, month: 9, day: 5 })`
**Then** the return value is `"05.09.2026"`

### AC15: Parse valid date
**Given** input `"05.09.2026"`
**When** `parseDate("05.09.2026")`
**Then** the return value is `{ ok: true, date: { year: 2026, month: 9, day: 5 } }`

### AC16: Parse empty date as unset
**Given** input `""`
**When** `parseDate("")`
**Then** the return value is `{ ok: true, date: null }`

### AC17: Reject non-padded date
**Given** input `"5.9.2026"`
**When** `parseDate("5.9.2026")`
**Then** the return value is `{ ok: false, error: "Enter a date as dd.mm.yyyy." }`

### AC18: Reject impossible calendar date
**Given** input `"32.01.2026"`
**When** `parseDate("32.01.2026")`
**Then** the return value is `{ ok: false, error: "Enter a date as dd.mm.yyyy." }`

## Files to Modify

| File | Change |
|---|---|
| `src/money.ts` | Add `formatMoney`, `parseMoney`, `parseOptionalMoney` (cents in/out). |
| `src/dates.ts` | Add `formatDate`, `parseDate`. |
| `src/money.test.ts` | Tests for AC1–AC13. |
| `src/dates.test.ts` | Tests for AC14–AC18. |

## Risk

- What could break: later UI if it formats with `.` or omits cents.
- Rollback: delete these modules; nothing else depends on them until other features land.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| formatMoney | AC1 thousands | 123456 | formatMoney | `"1 234,56"` |
| formatMoney | AC2 zero | 0 | formatMoney | `"0,00"` |
| formatMoney | AC3 cents | 50 | formatMoney | `"0,50"` |
| formatMoney | AC4 negative | -1050 | formatMoney | `"-10,50"` |
| parseMoney | AC5 thousands | `"1 234,56"` | parseMoney | `{ ok: true, cents: 123456 }` |
| parseMoney | AC6 no space | `"1234,56"` | parseMoney | `{ ok: true, cents: 123456 }` |
| parseMoney | AC7 negative | `"-10,50"` | parseMoney | `{ ok: true, cents: -1050 }` |
| parseMoney | AC8 zero | `"0,00"` | parseMoney | `{ ok: true, cents: 0 }` |
| parseMoney | AC9 empty | `""` | parseMoney | `{ ok: false, error: "Enter a valid amount." }` |
| parseMoney | AC10 extra decimals | `"10,123"` | parseMoney | `{ ok: false, error: "Enter a valid amount." }` |
| parseMoney | AC11 letters | `"abc"` | parseMoney | `{ ok: false, error: "Enter a valid amount." }` |
| parseOptionalMoney | AC12 empty | `""` | parseOptionalMoney | `{ ok: true, cents: null }` |
| parseOptionalMoney | AC13 value | `"200,00"` | parseOptionalMoney | `{ ok: true, cents: 20000 }` |
| formatDate | AC14 pad | 5 Sep 2026 | formatDate | `"05.09.2026"` |
| parseDate | AC15 valid | `"05.09.2026"` | parseDate | year 2026 month 9 day 5 |
| parseDate | AC16 empty | `""` | parseDate | `{ ok: true, date: null }` |
| parseDate | AC17 unpadded | `"5.9.2026"` | parseDate | `{ ok: false, error: "Enter a date as dd.mm.yyyy." }` |
| parseDate | AC18 invalid day | `"32.01.2026"` | parseDate | `{ ok: false, error: "Enter a date as dd.mm.yyyy." }` |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
