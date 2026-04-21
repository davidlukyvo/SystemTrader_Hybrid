# AI_CONTEXT.md - SystemTrader Hot Cache

This is the short current-branch memory file. Keep it tactical. For deep architecture and hardening history, use `ARCHITECTURE.md`. For a quick visual map, use `docs/system-map.md`.

## Project Status

- Runtime branch: `v10.6.9.56-ModerateTelegram` label, with additional `.56+` and `.56++` logic already present in source.
- Current phase: soak-test / observation / low-risk docs and UI parity fixes.
- Primary rule: code is the source of truth when docs conflict.
- Design posture: fail-loud, fail-closed, capital-preserving.

## Active Priorities

- Keep authority, UI, persistence, learning, and Telegram terminology aligned.
- Avoid reopening gate floors unless repeated live audits show a specific clean near-miss population.
- Prefer docs/runtime parity fixes over new tuning.
- Preserve `READY` / `PLAYABLE` / `PROBE` semantics:
  - `READY`: strongest approved tier
  - `PLAYABLE`: approved execution tier with moderate conviction
  - `PROBE`: monitoring-grade early signal

## Short Glossary

- `displayStatus`: UI action truth
- `finalAuthorityStatus`: final technical authority tier
- `authorityDecision`: `ALLOW`, `WAIT`, or `REJECT`
- `authorityTrace`: final trace object
- `technicalTop3`: technical shortlist only
- `deployableTop3`: authority-approved shortlist
- `authoritativeTop3`: legacy mirror of `deployableTop3`
- `learningPool`: `execution`, `near_approved`, or `excluded`
- Alpha Guard: `alpha-guard-core-v51-auth.js`, the final execution authority

## Current Runtime Notes

- Final authority: `alpha-guard-core-v51-auth.js`
- UI/action truth resolver: `state-v51-auth.js`
- Scanner shell: `live-scanner.js`
- Deployable shortlist: `deployableTop3`
- Runtime audit helper: `RUNTIME_AUDIT.summarizeLatest()`
- Detailed module map belongs in `README.md` and `ARCHITECTURE.md`

## Telegram Truth

- `WATCH` is not sent.
- `READY` and `PLAYABLE` may show `Entry / Stop / TP1` when final authority truth allows it.
- `PROBE` remains monitoring-style only.
- If a coin is promoted after adaptive unlock, reason wording should preserve the chain, for example:
  `adaptive_unlock:playable -> ready_promote_eligible`
