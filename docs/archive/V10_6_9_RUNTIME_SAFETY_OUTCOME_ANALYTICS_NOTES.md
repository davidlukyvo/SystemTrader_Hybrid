# v10.6.9 Runtime Safety + Outcome Analytics Notes

This note covers the Phase 1.7, Phase 1.8, Phase 2A, and Phase 2A.1 work completed after the scheduler and Agentic Review observe-only patches.

## Phase 1.7 Runtime Safety & Ops Security

- Added explicit `POS_STATE.EXPIRED` handling for stale pending positions.
- Added `EXPIRED` and `TIMED_OUT_EXIT` to closed lifecycle state handling.
- Added regression coverage for expired pending lifecycle behavior.
- Hardened the self-hosted Telegram relay with optional `TELEGRAM_RELAY_SECRET`.
- Browser relay calls can send `X-SystemTrader-Relay-Secret` when configured.
- Added an nginx rate-limit and relay-secret forwarding sample.
- Updated the self-hosted runbook and env example.

## Phase 1.8 Outcome Semantics Normalization

- Preserved `actualR` as raw checkpoint mark-to-market movement.
- Added planned trade outcome fields:
  - `rawCheckpointR`
  - `plannedTradeR`
  - `plannedTradeVerdict`
  - `outcomeRMode`
  - `plannedTradeCapApplied`
- Planned trade performance caps stop-hit outcomes at `-1R` and TP outcomes at planned RR / TP1 R.
- Analytics tables now clearly separate planned trade R from raw checkpoint follow-through where applicable.
- Legacy outcomes without planned fields fall back gracefully to `actualR`.

## Phase 2A Read-only Outcome Attribution Analytics

- Added `OUTCOME_EVAL.getOutcomeAttributionReport()` as a read-only analytics report.
- Added Attribution UI tab with planned trade performance as the primary metric and raw checkpoint follow-through as the secondary metric.
- Attribution coverage includes:
  - READY / PLAYABLE / PROBE performance
  - execution vs near-approved learning pools
  - MBE buckets: price zone, volume support, resistance risk, path-to-TP, failure modes
  - Agentic Review: bull/bear case counts, risk flags, final operator note category
  - btcContext, regime, scan hour, and session context
  - raw-vs-planned gap cases

## Phase 2A.1 QA + Guardrails

- Added sample-size confidence guardrails:
  - `<10` outcomes: very low confidence
  - `10-30`: low confidence
  - `30-100`: moderate observation
  - `>100`: stronger observation
- Attribution UI displays `Do not tune from low sample size.` for low-confidence buckets.
- Added read-only Top Insights panel.
- Added Data Quality panel for:
  - `plannedTradeR` coverage
  - `rawCheckpointR` coverage
  - Agentic Review coverage
  - MBE `full_ohlcv` coverage
  - legacy outcome count
- Added validation coverage for:
  - legacy outcome graceful fallback
  - planned/raw metric separation
  - low-sample warning guardrails
  - no authority / deployableTop3 / Telegram behavior drift

## Explicit Non-goals

- No Alpha Guard threshold changes.
- No authority, capital, or portfolio policy changes.
- No Telegram eligibility changes.
- No deployableTop3 changes.
- No MBE scoring changes.
- No Agentic Review decision-impact changes.
- No Phase 2B or tuning work started.

## Verification

Passed:

```text
node --check outcome-evaluator.js
node --check pages\analytics.js
node --check validation\validation-harness.js
node .\validation\run-regression-harness.js
node .\validation\run-phase15-verification.js
node .\validation\run-phase16-scheduler-verification.js
```
