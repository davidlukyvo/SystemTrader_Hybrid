# Elite Branch Rules

Operational guardrails for modifying the SystemTrader Hybrid elite branch.

These rules are process policy, not architecture documentation. For runtime architecture, use `README.md`, `ARCHITECTURE.md`, and `docs/system-map.md`.

## Allowed Without Approval

Safe changes:

- documentation cleanup
- typo / wording fixes
- UI wording and visual clarity that do not change decision logic
- trace, audit, and logging improvements
- bug fixes that preserve existing authority semantics
- persistence integrity fixes
- validation harness coverage
- refactors that do not change runtime behavior

## Approval Required

Ask for explicit approval before changing:

- authority promotion / demotion logic
- `READY`, `PLAYABLE`, or `PROBE` thresholds
- pre-gate, tier-gate, or adaptive-unlock floors
- momentum or telemetry influence on decision quality
- capital sizing, exposure caps, cooldowns, daily limits, or portfolio vetoes
- Telegram alert eligibility policy
- learning population policy
- anything that makes execution easier or less restrictive

## Decision-Quality Change Protocol

For any proposed change that affects score floors, confidence floors, RR floors, expectancy penalties, setup demotion, symbol penalties, or capital authority, provide:

- before/after tier counts
- affected symbols or setups
- exact config/constants changed
- whether the change tightens, loosens, or only explains behavior
- expected risk of false positives

## Sample Safety

- hard penalties require a meaningful sample size
- small samples should produce caution/trace visibility before reducing authority
- learning should stay separated by `learningPool`: `execution`, `near_approved`, `excluded`

## Current Priority

Stability -> evidence collection -> expectancy hardening -> false-positive reduction.

Feature expansion remains frozen unless explicitly approved.
