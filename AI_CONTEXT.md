# AI_CONTEXT.md - SystemTrader Hot Cache

This is the short current-branch memory file for AI agents. Keep it tactical. For deep architecture and hardening history, use `ARCHITECTURE.md`. For a quick visual map, use `docs/system-map.md`.

There is no separate `project-brain` doc set by design. This file is the AI memory layer to avoid documentation sprawl.

## Reading Order

1. `README.md`: repo entry and runtime summary
2. `docs/system-map.md`: fast visual map
3. `AI_CONTEXT.md`: current AI hot cache
4. `ARCHITECTURE.md`: deep reference when changing architecture or contracts
5. `GOVERNANCE.md`: operating and contribution rules
6. `validation/README.md`: validation harness only
7. `docs/archive/*`: historical context only

## Read First

- Current source code is the source of truth.
- Trust active runtime paths before old markdown, old chat history, or stale version labels.
- Do not infer active behavior from names alone.
- Do not retune thresholds from one snapshot.
- Separate hard contracts, policy notes, assessments, and legacy notes.
- When unsure, inspect the active call path first.

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

## Alpha Guard Caution

- `alpha-guard-core-v51-auth.js` is a policy-dense execution authority layer with narrow adaptive and regime-specific branches.
- Do not retune, simplify, merge, or remove adaptive unlock lanes, ready-promotion chains, regime RR/score/conf floors, or small exception carve-outs without tracing the active runtime call path first.
- Treat small policy branches as intentional by default until a code-path audit plus runtime evidence shows they are stale, unreachable, or harmful.
- When auditing a signal, include `btcContext`, `regimeType`, authority tier checks, capital / portfolio vetoes, `authorityTrace`, and `authorityTrace.rejectionsByTier`.
- Do not infer active behavior from constant names or local helper fragments alone; verify the final executed lane.

## Short Glossary

- `top3`: legacy READY-only shortlist kept for compatibility
- `displayStatus`: UI action truth
- `finalAuthorityStatus`: final technical authority tier
- `authorityDecision`: `ALLOW`, `WAIT`, or `REJECT`
- `authorityTrace`: final trace object
- `technicalTop3`: technical shortlist only; fully meaningful when an explicit technical shortlist is passed
- `deployableTop3`: runtime authority-approved shortlist
- `authoritativeTop3`: legacy mirror of `deployableTop3`
- `learningPool`: `execution`, `near_approved`, or `excluded`
- `behaviorEvidence`: observe-only object on enriched signals — does not affect authority (Phase 1)
- Alpha Guard: `alpha-guard-core-v51-auth.js`, the final execution authority

## Current Runtime Notes

- Final authority: `alpha-guard-core-v51-auth.js`
- UI/action truth resolver: `state-v51-auth.js`
- Scanner shell: `live-scanner.js`
- Deployable shortlist: `deployableTop3`
- `top3` should be treated as legacy READY-only scanner context, not as alert or actionable truth.
- `technicalTop3` falls back to legacy `top3` if no explicit technical shortlist is passed; this fallback can be misleading on actionable-no-ready scans.
- Runtime audit helper: `RUNTIME_AUDIT.summarizeLatest()`
- Detailed module map belongs in `README.md` and `ARCHITECTURE.md`
- `capital-engine.js` `cooldownMs` = global trade cadence guard.
- `portfolio-engine.js` `coolingMs` = same-symbol post-close cooling guard.
- Future market-data work should learn provider/session/cache patterns, not make unofficial TradingView sockets part of core authority.
- `docs/archive/` is historical patch context only, not active runtime truth.
- **Market Behavior Evidence (Phase 1)**: `market-behavior-engine.js` added as observe-only enrichment. Runs after `deployableTop3` is frozen, before persistence. Does NOT affect authority decisions, deployableTop3, Telegram, or capital/portfolio policy. Volume metrics are OHLCV approximations labeled `v1.0-ohlcv-approx`. See `docs/market-behavior-evidence.md`.
- **Self-hosted Ubuntu/Debian ops**: `docs/SELF_HOSTED_UBUNTU_DEBIAN_RUNBOOK.md` plus `ops/` define nginx static serving, supervised browser runtime, env-backed Telegram relay, health/backup timers, sanitized exports, and optional Phase 2 `systemtrader-runner.timer`. Local `python -m http.server` remains supported.
- **Runtime audit blocker contract**: `blockerRanking` mirrors `primaryBlockers`; use `rawBlockers` for full low-level detail when investigating duplicated-looking reasons such as cooldown/capital guard.

## Telegram Truth

- `WATCH` is not sent.
- `READY` and `PLAYABLE` may show `Entry / Stop / TP1` when final authority truth allows it.
- `PROBE` remains monitoring-style only.
- If a coin is promoted after adaptive unlock, reason wording should preserve the chain, for example:
  `adaptive_unlock:playable -> ready_promote_eligible`
