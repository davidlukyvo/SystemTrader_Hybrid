# SystemTrader v10.6.9 - Master Handover

Deep architecture, hardening, and truth-contract reference for the current SystemTrader Hybrid source snapshot.

## Operating Rule

The current code snapshot is the source of truth. If this document conflicts with runtime code, update this document.

Runtime labels may still use `v10.6.9.56-ModerateTelegram`, while the source already includes later `.56+` and `.56++` hardening/tuning layers. Treat version strings as cache/runtime labels, not complete architectural boundaries.

## Active Runtime Architecture

Runtime entry:

- `index.html`: script entry point
- `app.js`: bootloader, IndexedDB state load, router, scheduler startup

State and UI truth:

- `state-v51-auth.js`: global `ST`, authority display resolver, trade-level exposure helper
- `pages/dashboard.js`: command center UI
- `pages/scanner.js`: scanner UI
- `pages/models.js`: entry model reference UI

Scanner pipeline:

- `live-scanner.js`: orchestration shell
- `scanner-universe.js`: Binance discovery, liquidity gates, hygiene application
- `clean-universe.js`: symbol taxonomy, hard/soft exclusions
- `scanner-analysis.js`: kline fetch, technical features, scoring, RR, confidence, levels, volume/pump fields
- `scanner-refinement.js`: post-scan refinement, technical shortlist, authority merge, deployable shortlist
- `market-behavior-engine.js`: observe-only behavior enrichment — runs after `deployableTop3` is frozen, before persistence (Phase 1; see `docs/market-behavior-evidence.md`)
- `scanner-persistence.js`: finalized scan persistence and `ST.scanMeta` sync

Execution authority:

- `alpha-guard-core-v51-auth.js`: final execution gate and authority write-back
- `capital-engine.js`: sizing, cooldown, daily limit, exposure, strategic cap checks
- `portfolio-engine.js`: portfolio veto context and lifecycle constraints
- `execution-sync.js`: display adapter only; not an authority source

Persistence and learning:

- `db.js`: IndexedDB persistence and signal truth normalization
- `analytics-engine.js`: historical analytics truth
- `learning-engine.js`: learning dataset builder
- `outcome-evaluator.js`, `outcome-linker.js`, `outcome-engine.js`: outcome evaluation and linkage
- `edge-adapter.js`, `pro-edge.js`: edge/ranking adaptation

Alerts and audit:

- `alert-engine.js`: alert filtering, formatting, fail-closed alert truth
- `telegram.js`: Telegram config, dedup, anti-spam, send layer
- `runtime-audit.js`: live scan blocker distribution and short summary utility

Self-hosted operations:

- `ops/bootstrap-vps.sh`: Ubuntu/Debian bootstrap for nginx, Chrome runtime, relay, timers, and optional runner units
- `ops/telegram-relay.js`: server-side Telegram relay backed by `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- `ops/health-check.js`: Chrome DevTools Protocol health/staleness check
- `ops/export-backup.js`: sanitized `DB.exportAll()` backup writer
- `ops/scanner-runner.js`: optional Phase 2 systemd one-shot scan runner over Chrome DevTools Protocol

## Script Load Order

Scripts load synchronously from `index.html`. Do not reorder without checking dependencies.

High-level order:

1. persistence/config: `db.js`, `strategic-engine.js`, `state-v51-auth.js`
2. taxonomy/data: `clean-universe.js`, `coingecko.js`, `symbol-mapper.js`, `category-engine.js`
3. analytics/risk: `analytics-engine.js`, `feedback-engine.js`, `risk-engine.js`, `portfolio-engine.js`
4. market/scanner modules: `binance-market-data.js`, `native-momentum.js`, `scanner-universe.js`, `scanner-analysis.js`, `scanner-refinement.js`, `scanner-persistence.js`, `live-scanner.js`
5. outcome/learning/ranking: `outcome-evaluator.js`, `learning-engine.js`, `outcome-linker.js`, `edge-adapter.js`, `pro-edge.js`
6. capital/regime/authority: `capital-flow.js`, `capital-engine.js`, `market-insight.js`, `regime-engine.js`, `outcome-engine.js`, `promotion-engine.js`, `alpha-guard-core-v51-auth.js`
7. observe-only enrichment: `market-behavior-engine.js`
8. display/alerts/audit: `execution-sync.js`, `telegram.js`, `alert-engine.js`, `runtime-audit.js`
9. UI pages: `pages/dashboard.js`, `pages/scanner.js`, `pages/scorer.js`, `pages/models.js`, `pages/analytics.js`, and other page modules
10. boot: `app.js`

Runtime note: `scanner-persistence.js` loads before `market-behavior-engine.js`, but MBE is called only inside `live-scanner.js` after Alpha Guard authority merge and after `deployableTop3` is frozen. `runtime-audit.js` loads after `alert-engine.js` and before main page consumers.

## Signal Lifecycle

```text
Binance exchangeInfo + ticker/24hr
  -> scanner-universe.js
  -> clean-universe.js
  -> preFilterCandidates
  -> scanner-analysis.js
  -> scanner-refinement.js
  -> alpha-guard-core-v51-auth.js
  -> capital-engine.js / portfolio-engine.js
  -> scanner-refinement.js mergeAuthorityCoins
  -> derive deployableTop3
  -> market-behavior-engine.js observe-only enrichment
  -> scanner-persistence.js
  -> ST.scanMeta + DB
  -> dashboard/scanner UI + runtime-audit + learning + Telegram
```

### Discovery And Hygiene

`scanner-universe.js` uses Binance `exchangeInfo` and `ticker/24hr`.

`clean-universe.js` provides taxonomy:

- hard excludes: stable/USD bases, leveraged tokens, wrapped/staked assets, commodity-backed assets, and other permanently invalid instruments
- soft excludes: assets that may be undesirable in some regimes but are not always invalid

Current code behavior:

- `scanner-universe.js` skips hard-excluded symbols.
- In `sideway` context, it also blocks symbols whose `clean-universe.js` reason is `meme_soft_excluded` or `soft_excluded`.
- Current soft meme examples include `SHIB`, `PEPE`, `BONK`, `WIF`, `FLOKI`, and `PENGU`.
- This is code-based behavior, not a broad claim that every future meme-like listing is covered.

### Deep Scan

`scanner-analysis.js`:

- fetches `15m`, `1h`, `4h`, and `1d` Binance klines
- computes structure, volume, fib, EMA, entry quality, fake-pump risk, RR, confidence, levels
- materializes `volume24h` from Binance `quoteVolume`
- derives `pump7d` and `pump30d` from daily klines when upstream fields are absent

### Refinement

`scanner-refinement.js`:

- builds scanner-side `proposedStatus`
- computes technical/ranking context
- derives `technicalTop3`
- merges final authority fields back into coins
- derives `deployableTop3`

`proposedStatus` is not authority. It is scanner-side context only.

## Authority Contract

Canonical fields:

- `displayStatus`: UI action truth
- `finalAuthorityStatus`: final technical authority tier
- `authorityDecision`: `ALLOW`, `WAIT`, or `REJECT`
- `authorityReason`: concise final reason string
- `authorityBlockers`: structured blocker strings
- `authorityTrace`: final trace object
- `executionGatePassed`: true only when final gate passes
- `executionActionable`: true only for authority-approved actionable tiers

Legacy fields:

- `status`: backward-compatible display/status fallback
- `authTrace`: legacy only; do not use as runtime truth
- `authoritativeTop3`: compatibility mirror of `deployableTop3`

### Tier Semantics

- `READY`: strongest approved execution tier
- `PLAYABLE`: approved execution tier with moderate conviction
- `PROBE`: monitoring-grade early signal; authority-valid but cautious
- `WATCH`: not execution-approved
- `AVOID` / `REJECT`: blocked or invalid

### Top3 Semantics

- `top3`: legacy READY-only shortlist kept for compatibility
- `technicalTop3`: scanner technical shortlist only; fully meaningful when explicitly passed
- `deployableTop3`: runtime authority-approved shortlist for the current scan
- `authoritativeTop3`: legacy mirror / compatibility alias of `deployableTop3`

Do not use `top3` or `technicalTop3` as deploy permission.

## Execution Gate Summary

`alpha-guard-core-v51-auth.js` is the single final execution authority.

Core behavior:

- evaluate pre-gate
- reject duplicates and open-position conflicts
- run tier checks for `READY`, `PLAYABLE`, `PROBE`
- apply adaptive soft unlocks where code allows
- apply final promotion logic such as `ready_promote_eligible`
- compute capital plan and sizing
- reject fail-closed on missing context, invalid sizing, or capital veto
- write final authority fields back to the signal

Important promotion wording:

- A candidate can pass through `adaptive_unlock:playable` and later be promoted to `READY`.
- In that case, final reason should preserve the chain, for example:
  `adaptive_unlock:playable -> ready_promote_eligible`

## Capital And Portfolio Vetoes

Capital and portfolio checks are hard vetoes.

Relevant modules:

- `capital-engine.js`
- `portfolio-engine.js`
- `alpha-guard-core-v51-auth.js`

Common blockers:

- `capital_guard:*`
- `cooldown_active_*`
- `cooling_period_active_*`
- `daily_trade_limit_*`
- `max_concurrent_*`
- `total_risk_*_exceeds_strategic_cap_*`
- `category_cap_reached_*`
- `dedup:symbol_in_batch_or_portfolio`

Cooldown terminology:

- `capital-engine.js` uses `cooldownMs` for global trade cadence. In sideway, this is currently 90 minutes.
- `portfolio-engine.js` uses `coolingMs` for same-symbol post-close cooling. In sideway, this is currently 4 hours.
- These are intentionally separate veto semantics unless runtime tuning explicitly changes policy.

If capital context is missing or invalid, the system must reject.

## Telegram Truth

Relevant modules:

- `alert-engine.js`
- `telegram.js`
- `state-v51-auth.js`

Rules:

- Alerts must lead with execution truth, not scanner optimism.
- `WATCH` must not be sent.
- Blocked reasons such as `dedup:*`, `capital_guard:*`, `pre_gate_blocked:*`, and `all_tiers_rejected` must not leak into alert candidates.
- `READY` and `PLAYABLE` may show full `Entry / Stop / TP1` when final authority truth allows it.
- `PROBE` remains monitoring-grade only and should use watch-style formatting.

Trade block exposure requires:

- `displayStatus` is `READY` or `PLAYABLE`
- `authorityDecision` is not `REJECT`
- `executionActionable === true` or `executionGatePassed === true`
- signal is not maintained / position-bound
- `entry`, `stop`, and `tp1` are valid

## Learning And Persistence

`db.js` normalizes signal truth for persistence and historical repair.

Learning pools:

- `execution`: final execution-approved population
- `near_approved`: clean near-approved population, often blocked by capital or similar final veto
- `excluded`: rejected/noisy/unsafe population

Fail-closed learning rule:

- execution learning must not include rejected technical candidates
- near-approved learning can remain useful without being execution-approved
- position-bound and legacy records must not reintroduce action truth unless final authority supports it

## Runtime Audit

`runtime-audit.js` summarizes the latest scan.

Console helpers:

```javascript
RUNTIME_AUDIT.summarizeLatest()
RUNTIME_AUDIT.printLatest()
window.__LAST_RUNTIME_AUDIT__
```

Fields to inspect:

- `meta.sessionStats`
- `counts`
- `blockerRanking`
- `primaryBlockers`
- `rawBlockers`
- `populationMetrics`
- `filteredCandidates`
- `executionTrace`
- `signalCountSource`

`blockerRanking` intentionally mirrors `primaryBlockers` so the main view reads as deduplicated root causes. Use `rawBlockers` when you need full low-level blocker evidence, including duplicated-looking cooldown/capital guard reasons.

Use runtime audit to distinguish:

- code-based assessment: what the code is designed to do
- verified live runtime fact: what the latest scan actually did

## Hardening History

The current branch includes these hardening outcomes:

- authority persistence cleanup
- setup/trigger taxonomy separation
- analytics and learning pool separation
- score semantics split
- fail-closed alert semantics
- validation harness coverage for authority/alert/learning contracts
- `technicalTop3` vs `deployableTop3` split
- runtime blocker audit tooling
- sideway/CHOP soft pre-gate and narrow PROBE bridge tuning
- Telegram moderate profile for `READY`, `PLAYABLE`, and monitoring-grade `PROBE`
- scanner/UI wording parity for scanned vs approved counts
- Binance `quoteVolume` to `volume24h` materialization
- kline-derived `pump7d` / `pump30d` fallback

## Future Direction: Market Data Provider Layer

Current runtime reads Binance spot market data directly from scanner modules. A future hardening direction is to introduce a narrow market-data provider layer so scanner logic asks for normalized market data without caring which upstream source produced it.

Preferred provider direction:

- primary: Binance official/public API
- secondary: BingX official/public API, if added
- fallback: cached data and metadata sources such as CoinGecko where appropriate
- experimental: TradingView-style adapter only for manual research, disabled by default

The provider contract should normalize at least:

- `symbol`
- `interval`
- OHLCV candles
- `ticker.price`
- `ticker.volume24h`
- `source`
- `fetchedAt`
- `quality`

Important boundary: do not copy unofficial TradingView socket behavior into core execution logic. The useful lesson is the adapter/session/cache pattern, not depending on private or unofficial endpoints for authority decisions.

## Known Constraints And Gotchas

- Version labels may be compressed; trust code over labels.
- `proposedStatus` can look optimistic. It is not authority.
- Existing portfolio positions can remain active even if the current scan produces zero new approved setups.
- `PROBE` is alert-eligible in specific cases, but it is not full trade-block formatting.
- `technicalTop3` can be non-empty while `deployableTop3` is empty.
- Runtime starvation in `sideway / CHOP` can be real market-quality starvation, not necessarily a bug.
- Avoid tuning thresholds based on one scan. Use repeated runtime-audit patterns.
- `scanMeta.portfolio.active` counts active capital allocation slots from `CAPITAL_FLOW`, not open DB positions. When `capitalRegime` is `OBSERVE` and `allocations` is empty, this value is `0` even if real positions are open in the DB. Use `DB.getPositions()` filtered by `OPEN_STATES` (`ARMED`, `PENDING`, `ACTIVE`, `PARTIAL_EXIT`) for the true open position count. The execution gate always reads from this DB path and is not affected by this display value.

## Scan Truth Fields Contract

Four fields on persisted scan records describe qualification counts. They have **intentionally different scopes** — do not treat them as equivalent.

| Field | Exact Meaning | Scope | Source |
|---|---|---|---|
| `top3` | Legacy scanner-side shortlist filtered to `status === 'READY'`. Kept for compatibility only. | READY only | `scanner-refinement.js` |
| `technicalTop3` | Technical shortlist before final authority / capital suppression when explicitly passed. If not passed, it currently falls back to legacy `top3`, which can be misleading on actionable-no-ready scans. | Intended technical shortlist | `scanner-persistence.js` |
| `deployableTop3` | **Deployable shortlist across READY / PLAYABLE / PROBE** (up to 3 coins) | READY + PLAYABLE + PROBE | `scanner-refinement.js → isFinalDeployableCoin` |
| `behaviorEvidence` | Observe-only evidence fields on persisted signal records. Never an authority source and never used for Telegram eligibility. | Persisted signals only | `market-behavior-engine.js` |
| `executionQualifiedCount` | **READY-tier qualified count only** — how many coins reached the strictest authority tier | READY only | `scanner-persistence.js (eb_ready)` |
| `qualifiedCount` | Deprecated alias for `executionQualifiedCount`. Always identical. Do not read separately. | READY only | `db.js normalizeScanRecord` |
| `qualifiedCoins` | Array of READY-tier coin symbols (strings, not objects) | READY only | `scanner-persistence.js (eb_ready filter)` |
| `executionBreakdown.ready` | READY-tier count — same value as `executionQualifiedCount` | READY only | `scanner-persistence.js` |
| `executionBreakdown.actionable` | **Gate-passed actionable count across READY + PLAYABLE + PROBE lanes** = eb.ready + eb.playable + eb.probe | READY + PLAYABLE + PROBE | `scanner-persistence.js` |
| `scanTruthBasis` | Debug / explanatory label for the scan state. **Not an authority source.** Values: `execution_qualified` / `actionable_no_ready` / `technical_qualified_capital_suppressed` / `no_actionable` | — | `scanner-persistence.js` |

### Invariant

```
eb.actionable >= executionQualifiedCount (always)
eb.actionable == len(deployableTop3 candidates before .slice(0,3))
```

A scan with `deployableTop3=[SEI(PLAYABLE), AVAX(PROBE)]` and `executionQualifiedCount=0` is **not a mismatch**:
- `eb.actionable = 2` — gate-passed actionable count across READY/PLAYABLE/PROBE lanes
- `executionQualifiedCount = 0` — READY-tier qualified count (neither coin reached READY)
- `scanTruthBasis = 'actionable_no_ready'` documents this state (debug only, not authority)
- `top3 = []` in the same scan only means the legacy READY-only shortlist is empty

`executionQualifiedCount` is tracked as a future rename candidate to `readyTierCount` for colloquial clarity — out of scope for current patches.


## Validation Harness

Regression harness files:

- `validation/validation-harness.js`
- `validation/run-regression-harness.js`

The harness is intended to guard:

- setup/trigger separation
- rejected technical candidate behavior
- approved actionable signal behavior
- near-approved learning pool behavior
- position-bound display/trade-block behavior
- capital relax constraints
- adaptive soft PROBE bridge constraints

## Documentation Map

- `README.md`: project entry and runtime summary
- `ARCHITECTURE.md`: this deep architecture and contract reference
- `AI_CONTEXT.md`: short hot-cache / current branch memory for AI agents
- `docs/system-map.md`: quick visual architecture and debug map
- `docs/archive/`: historical patch notes only; do not treat as current runtime truth
