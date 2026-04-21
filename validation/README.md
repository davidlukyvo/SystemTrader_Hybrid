# Validation Harness

Lightweight regression harness for selected SystemTrader authority, alert, learning, and capital contracts.

This file is scoped only to validation. It is not full-system documentation and is not the source of truth for trading logic.

## Run

From the project root:

```powershell
node .\validation\run-regression-harness.js
```

Run the intentionally bad fixture to confirm the harness catches regressions:

```powershell
node .\validation\run-regression-harness.js --with-bad-fixture --expect-failure
```

If `node` is not on `PATH`, use the full Node executable path.

## What It Protects

- authority truth contract
- setup vs trigger separation
- persistence truth normalization
- analytics population separation
- alert action truth
- maintained / position-bound semantics
- capital-first behavior
- sideway/CHOP loss-streak relaxation remaining narrow
- soft PROBE bridge behavior remaining narrow

## Terms Used By The Harness

- `displayStatus`: UI action truth
- `finalAuthorityStatus`: final technical authority tier
- `authorityDecision`: `ALLOW`, `WAIT`, or `REJECT`
- `authorityTrace`: final trace object
- `technicalTop3`: technical shortlist only
- `deployableTop3`: authority-approved shortlist
- `authoritativeTop3`: legacy mirror / compatibility alias
- `learningPool`: `execution`, `near_approved`, or `excluded`

## Expected Healthy Result

- normal run passes all scenarios
- bad fixture fails with `setup_pollution_regression`

## Scope

The harness is intentionally small. It should catch contract regressions, not replace live runtime audits.

Use `RUNTIME_AUDIT.summarizeLatest()` after real scans to inspect live blocker distribution and population shape.
