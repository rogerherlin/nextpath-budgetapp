# Feature: <name>

## Problem Statement
What problem this solves and why it is needed.

## Proposed Change
What the system should do after implementation.

## Acceptance Criteria
One AC per observable behaviour. This is what "done" means.

### AC1: <descriptive name>
**Given** <precondition — system state before>
**When** <action — what the user or system does>
**Then** <observable outcome, with the precise expected value>

### AC2: … (error cases too: empty input, invalid value, missing id)

## Files to Modify
| File | Change |
|---|---|
| src/<path> | <what and why> |

## Risk
- What could break: …
- Rollback: …

## Testing Strategy (MANDATORY)
One row per test. Expect more rows than ACs: one AC usually needs a
happy path and at least one error case. If a row contradicts its AC,
the AC is the one that is wrong.

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| <fn> | happy path | … | … | … |
| <fn> | error case | … | … | … |

## Spec Readiness checklist
- [ ] Every AC has a precise expected value — no "works correctly"
- [ ] Another person could write a test from each AC without asking
- [ ] Every AC can fail — one that cannot fail proves nothing
- [ ] Error and edge cases have ACs of their own
- [ ] Every AC appears in the testing strategy table