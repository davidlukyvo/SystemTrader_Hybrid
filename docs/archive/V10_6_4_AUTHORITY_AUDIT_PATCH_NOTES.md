# V10.6.4 Authority Audit Patch

## Purpose
Stabilize authority as a single source of truth before any v10.7 unlock work.

## Patched areas
- `execution-engine-v9.js`
  - added structured authority metadata: `authorityTier`, `authorityDecision`, `authorityReason`, `authorityBlockers`, `authoritySource`
  - rejects signals when `capitalPlan.totalEquity` is missing instead of silently sizing with a fake default
  - rethrows fatal gate errors so top-level fail-loud can catch them
  - logs authority runtime context per scan
- `live-scanner.js`
  - passes a real `priceMap` into `EXECUTION_ENGINE_V9.run(...)`
  - removes pre-authority dependency on `EXEC_GATE.isExecutable()` in hard-gate refinement
  - merges authority blockers / decisions back into scanner coins
- `pro-edge.js`
  - removes `EXEC_GATE.isExecutable()` dependency
  - uses authority-tier / authority-decision aware filtering
  - keeps production cold-start logic intact
- `pages/plan.js`
  - uses authority fields instead of `EXEC_GATE.isExecutable()` for trade-plan blocking
- `capital-engine.js`
  - canonicalizes `totalEquity` sourcing around explicit context first
  - warns and returns `totalEquity=0` when context is missing
- `state.js`
  - aligns learning baselines with additional setup names: `trend-continuation`, `accumulation`, `unclear`

## Intent
This patch does **not** unlock READY more aggressively.
It only makes the current gate explainable and auditable.
