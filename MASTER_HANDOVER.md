# 🏰 SystemTrader v10.6.9 — Master Handover & Architecture Reference

**Code Name:** Command Center Elite · Institutional Hardening Phase  
**Current Version:** v10.6.9.56-ModerateTelegram (April 2026)  
**App Type:** Single-Page Application (HTML + Vanilla JS) — runs entirely in the browser, no backend server  
**Storage:** IndexedDB (primary) + localStorage (legacy migration)

> [!IMPORTANT]
> **To every AI assistant or developer receiving this document:**  
> Read this file IN FULL before suggesting any logic changes. The system is highly interconnected — a change in one engine can silently break another. Always maintain **Fail-Loud / Fail-Closed** integrity. Never reduce Alpha Guard strictness without explicit CEO approval from **Sang VT**.

---

## 👥 Stakeholders

| Name | Role |
|------|------|
| **Sang VT** | CEO & Founder — sole decision maker on execution logic |
| **Antigravity (AI)** | Audit Lead — executes hardening under Persona Hubs |

---

## 🎯 System Identity & Philosophy

SystemTrader is an **Institutional-Grade Execution Planning Engine** for cryptocurrency trading.  

**Core Philosophy:** *"Protect Capital First."* The system is designed to **REJECT** low-quality setups and **explain every veto** in a traceable audit trail. A system that says "no" more than "yes" is working correctly.

**NOT** an automated trading bot. It does NOT place orders. It generates signals, scores them through multiple strict gates, and surfaces only high-conviction setups for the trader to act on manually.

---

## 🧱 Hardening Program Summary (Tasks 1–11)

This branch has gone through an explicit hardening sequence. The most important outcomes are:

### Task 1 — Authority Persistence Cleanup
- Old problem: authority truth was fragmented across `status`, `finalAuthorityStatus`, `displayStatus`, and legacy `authTrace` fields.
- Patch outcome: persistence and UI resolution now treat the authority contract as canonical in this order:
  - `displayStatus`
  - `finalAuthorityStatus`
  - legacy `status` fallback only
- Canonical rule:
  - `authorityTrace` is the runtime audit field
  - `authTrace` is legacy only and should not be used as UI/runtime truth
- Primary files:
  - `state-v51-auth.js`
  - `db.js`
  - `pages/scanner.js`
  - `pages/dashboard.js`

### Task 2 — Setup Taxonomy Cleanup
- Old problem: structural setup and trigger/timing labels could drift or be mixed together.
- Patch outcome: structural setup now comes from a canonical vocabulary and is normalized before persistence / authority validation.
- Canonical rule:
  - structural truth: `setup` / `structureTag` normalized through `normalizeStructuralSetupValue()`
  - trigger truth: `entrySignal` / `entryTiming`
  - trigger-like labels must never pollute structural setup
- Primary files:
  - `state-v51-auth.js`
  - `scanner-analysis.js`
  - `alpha-guard-core-v51-auth.js`
  - `live-scanner.js`

### Task 3 — Analytics Truth Cleanup
- Old problem: analytics / learning truth was too close to strict execution-only truth and starved useful near-approved populations.
- Patch outcome: learning eligibility is now separated into explicit pools.
- Canonical rule:
  - `learningEligible`
  - `learningPool`: `execution` | `near_approved` | `excluded`
  - `learningClassification`: execution tier label or `near_approved` / reject-style exclusion
- Primary files:
  - `db.js`
  - `learning-engine.js`
  - `outcome-linker.js`

### Task 4 — Score Calibration Support
- Old problem: score meanings were easy to blur between scanner, analytics, ranking, and execution contexts.
- Patch outcome: normalized records now carry score semantics explicitly.
- Canonical rule:
  - scanner score -> `rawScannerScore`
  - analytics score -> `riskAdjustedScore`
  - ranking score -> `rankScore`
  - execution quality score -> `executionQualityScore`
- Primary files:
  - `db.js`
  - `analytics-engine.js`
  - `scanner-refinement.js`

### Task 5 — Alert Semantics Cleanup
- Old problem: Telegram could drift into mixed truth, where technical optimism and execution rejection were presented together.
- Patch outcome: Telegram now follows display/action truth first, then technical context second.
- Canonical rule:
  - alerts must lead with execution truth
  - trade details are exposure-controlled
  - `technicalTop3` must never be mistaken for deploy permission
- Primary files:
  - `alert-engine.js`
  - `telegram.js`
  - `scanner-refinement.js`

### Task 6 — Validation Harness
- Added lightweight regression harness to lock setup/trigger separation, authority truth, alert truth, learning separation, and position-bound semantics.
- Primary files:
  - `validation/validation-harness.js`
  - `validation/run-regression-harness.js`

### Task 7 — Taxonomy + Learning Finalization
- `early-watch` was confirmed as a canonical structural setup.
- `near_approved` learning population became first-class and no longer depends on pure execution-approved truth.

### Task 8 — Narrow Defensive Tuning Audit
- Added a very narrow `loss_streak_guard_2` carve-out for clean `PROBE` candidates in `sideway + CHOP`.

### Task 9 — Narrow PROBE Lane Audit
- Added a tiny sideway/CHOP soft-PROBE bridge:
  - `rr >= 0.95`, `score >= 18`, `conf >= 0.50`

### Task 10 — Narrow PROBE Score/Conf Audit
- Added a second tiny bridge for semantically clean candidates:
  - `rr >= 1.10`, `score >= 17`, `conf >= 0.50`, `setup !== 'unclear'`

### Task 11 — Runtime Population Audit Only
- Final conclusion of the current cycle:
  - stop tuning for now
  - current `sideway / CHOP` starvation looks more like weak live population than a clear threshold bug

---

## 🧠 Methodology: Wyckoff-VSA Hybrid

The signal detection layer uses a combination of two institutional frameworks:

### Wyckoff (Structural Context)
Determines **WHERE** the market is in its cycle using the Law of Cause & Effect:
- Compression (`calcCompression`): short-range / base-range ratio → measures price tightening
- Phase Detection: `phase c candidate`, `early phase d`, `accumulation`, `breakout`, `trend-continuation`
- The system only considers signals from **valid setups** (hard-coded whitelist in `VALID_SETUPS`)

### VSA — Volume Spread Analysis (Behavioral Confirmation)
Determines **HOW** smart money is acting:
- Spread vs Volume relationship on individual bars
- Absorption: high-volume, narrow-spread bars
- Exhaustion / "Late Trap" detection: upper wicks > 35%, EMA extension > 10%

---

## 🏗️ Script Load Order (from `index.html`)

Scripts are loaded synchronously in dependency order. **Do not reorder without understanding dependencies.**

```
db.js               → IndexedDB layer (must load first)
strategic-engine.js → Macro overlay (Bitcoin Rainbow, F&G, Dominance)
state-v51-auth.js   → Global ST object, config, init()
clean-universe.js   → Symbol exclusion lists
coingecko.js        → Price data fetcher (CoinGecko API)
symbol-mapper.js    → BINANCE symbol ↔ CoinGecko ID mapping
category-engine.js  → Sector classification (AI, L1, DeFi, etc.)
analytics-engine.js → Historical win/loss stats cache
feedback-engine.js  → Edge decay detector (win-rate based veto)
risk-engine.js      → Time-stop and risk sizing
portfolio-engine.js → Capital veto pipeline (6 hard vetos)
binance-market-data.js → Kline/Ticker fetcher with NET_GUARD
native-momentum.js  → Behavioral telemetry (vol acceleration, z-score)
scanner-universe.js → Scanner Phase 2A: universe discovery / hygiene split
scanner-analysis.js → Scanner Phase 2B: deep scan / scoring / structure analysis
scanner-refinement.js → Scanner Phase 2C: authority merge, Top3 derivation, shortlist semantics
scanner-persistence.js → Scanner Phase 2D: finalized scan persistence + cache/session sync
live-scanner.js     → Scanner orchestration shell (coordinates modular scanner stages)
runtime-audit.js    → Runtime blocker distribution + short-summary utility for live scan review
outcome-evaluator.js → D1-D30 outcome checkpoints
learning-engine.js  → Bayesian edge blending
outcome-linker.js   → Links scan signals to trade outcomes
edge-adapter.js     → Bridges learning → pro-edge
pro-edge.js         → Quantitative ranking engine
capital-flow.js     → Capital availability tracker
capital-engine.js   → Sizing calculator
market-insight.js   → Market health / regime signals
regime-engine.js    → BTC context classifier (bull/sideway/bear)
outcome-engine.js   → Post-trade analytics
promotion-engine.js → Signal upgrade logic (WATCH → PROBE → PLAYABLE)
alpha-guard-core-v51-auth.js → THE EXECUTION GATE (single source of authority)
execution-sync.js   → Display adapter ONLY (read-only)
telegram.js         → Notification dedup & send
alert-engine.js     → Alert formatting + anti-spam logic (fail-closed authority alerts)
pages/dashboard.js  → Command Center UI
pages/scanner.js    → Coin Scanner UI
pages/scorer.js     → Manual coin deep-dive
... (other UI pages)
app.js              → Router, scheduler, init orchestration
```

---

## 🔄 Full Signal Lifecycle (The Pipeline)

```
CoinGecko Universe (1000+ coins)
       │
       ▼
[1] DISCOVERY & HYGIENE  (`scanner-universe.js` + `clean-universe.js`)
   • API fetch: 24h ticker data via CoinGecko
   • Hard exclusions: stable / USD bases, leveraged tokens, wrapped-staked assets, commodity-backed assets
   • Soft exclusions: major / benchmark assets may re-enter when regime is compatible
   • Meme assets are stricter than majors and should not soft-enter `sideway + CHOP`
   • Liquidity gate: min $3M-6M 24h volume (regime-dependent)
   • Min trade count: 2,600-7,500 (regime-dependent)
   • Max 24h pump: 28-35% (prevents chasing)
   • Output: ~20-30 "live universe" candidates
       │
       ▼
[2] DEEP SCAN  (`scanner-analysis.js` → Binance Kline fetch)
   • Fetches 4H + 15M candles from Binance for each candidate
   • Technical scoring: compression, fib zone, EMA position, relVol
   • VSA signatures: absorption, stopping volume, exhaustion wick
   • Wyckoff phase detection
   • Fake pump detection (pump7d vs wick ratio)
   • Output: scored coin objects with 30+ signal fields
       │
       ▼
[3] BEHAVIORAL TELEMETRY  (native-momentum.js)
   • Non-bias behavioral detector (never overrides Alpha Guard)
   • Weighted scoring: Vol Acceleration (15%), Z-Score (25%),
     Impulse Velocity (15%), Relative Strength vs BTC (20%)
   • Exhaustion detection: "Late Trap" penalties
   • Output: momentumPhase (NONE/EARLY/MID/LATE), momentumScore
       │
       ▼
[4] PRO-EDGE RANKING  (pro-edge.js + edge-adapter.js)
   • Quantitative re-ranking using historical win-rate data
   • Blends scanner score with learned expectancy (feedback-engine)
   • Output: riskAdjustedScore, edgeScore, final ranked list
       │
       ▼
[5] EXECUTION GATE — Alpha Guard  (alpha-guard-core-v51-auth.js)
   THIS IS THE SINGLE SOURCE OF CAPITAL AUTHORITY.
   
   Step A: Signal Classification (classifySignalState)
   • WATCH: score < 18, conf < 0.50, rr < 0.80, invalid setup, fake pump
   • STALE: signal age > 6 hours
   • CANDIDATE: passes all pre-conditions → enters the gate
   
   Step B: runExecutionGate (for CANDIDATE signals only)
   • Loops through [READY → PLAYABLE → PROBE] tiers
   • Each tier: checks RR, score, conf against TIER_FLOORS
   • READY requires explicit trigger (VALID_TRIGGERS whitelist)
   • PLAYABLE uses OR-gate logic (checkPlayablePath)
   • Records rejections per-tier in authorityTrace.rejectionsByTier
   • Expectancy penalty: getExpectancyPenalty() reduces conf if 
     the symbol/setup has negative historical edge
   
   Step C: Portfolio Veto (portfolio-engine.js → runPortfolioVeto)
   • Veto 1: Max concurrent positions (bull:6, sideway:4, bear:2)
   • Veto 2: Duplicate symbol already open
   • Veto 3: Total risk + new risk > strategic cap
   • Veto 4: Cooling period (same symbol closed recently)
   • Veto 5: Sector/category overexposure cap
   • Veto 6: Feedback decay (edge decay auto-downgrade)
   
   Step D: Result & authorityTrace
   • pass=true: creates AUTO_PAPER position record (ARMED state)
   • pass=false: records rejections in authorityTrace
   • ALL results include authorityTrace with:
     - entrySignal (the trigger matched or not)
     - triggerMatched (bool)
     - rejectionsByTier { READY:[], PLAYABLE:[], PROBE:[] }
     - expectancy { multiplier, reasons }
     - macro { btcContext, sidewayPlayableBlocked }
       │
       ▼
[6] MERGE & STATUS BINDING  (`scanner-refinement.js` → `mergeAuthorityCoins`)
   • Maps engine results back to scanner coin objects by symbol
   • Coins with no engine result → soft binding via portfolio positions
   • Final coin object: { status, authorityTrace, authorityBlockers,
     authorityDecision, executionTier, allocationPct, ... }
   • Writes to ST.coins (in-memory) and persists to IndexedDB
       │
       ▼
[7] STRATEGIC MACRO CAP  (strategic-engine.js)
   • Reads: Bitcoin Rainbow band (valuation), Fear & Greed Index,
     BTC Dominance
   • Computes: riskMultiplier (0.5x to 1.5x)
   • Effect: multiplies PORTFOLIO_LIMITS.maxTotalRiskPct
   • UI Labels: CAP-LIMIT (mult < 0.6), RESTRICT (mult < 0.5)
       │
       ▼
[8] TELEGRAM ALERTS  (alert-engine.js + telegram.js)
   • Filters: only authority-valid READY/PLAYABLE/PROBE coins alert
   • Hard fail-closed: `authorityDecision` must be `ALLOW` or `WAIT`
   • Hard fail-closed: `executionGatePassed === true`
   • Hard fail-closed: `executionActionable === true`
   • Hard fail-closed: reject reasons `dedup:*`, `capital_guard:*`,
     `pre_gate_blocked:*`, `all_tiers_rejected`, `no_execution_result`
     must never surface as Telegram alert candidates
   • READY: always alerts if not duplicate
   • PLAYABLE: requires rr ≥ 1.6 AND conf ≥ 0.60
   • PROBE: requires rr ≥ 1.9 AND conf ≥ 0.68 (higher bar)
   • Anti-spam: global cooldown (15-60 min, regime-dependent)
   • Per-symbol dedup via telegram.hasSent()
   • Send triggers: regime_change, top1_changed, authority_upgrade,
     new_high_quality_signal
   • Trade details (Entry/Stop/TP1) shown ONLY if conf ≥ 0.80 AND rr ≥ 2.0
       │
       ▼
[9] OUTCOME EVALUATION  (outcome-evaluator.js + learning-engine.js)
   • Checkpoints: D1, D3, D7, D14, D30
   • Throughput: 150 evaluations per session
   • Outcome linked to original signal via outcome-linker.js
   • Historical repair: `db.js -> repairHistoricalSignalsLearning()` runs
     one-time at boot to recompute dirty legacy signal rows
   • Learning: Prior + Observed blending (blendLearning)
   • Learning eligibility now uses explicit pools:
     - `execution`: fully execution-approved learning population
     - `near_approved`: semantically clean near-approved population
     - `excluded`: blocked / carry / polluted / rejected population
   • Strict execution-quality learning still requires:
     - `authorityDecision !== REJECT`
     - `executionGatePassed === true`
     - `executionActionable === true`
     - display tier must be `READY` / `PLAYABLE` / `PROBE`
     - blocked reasons (`dedup`, `capital_guard`, `pre_gate_blocked`,
       `all_tiers_rejected`, `no_execution_result`) are ineligible
   • Near-approved learning exists specifically to avoid analytics starvation
     while preserving execution truth separation.
   • Result: updates symbol/setup win-rate → feeds back to Veto 6
```

---

## 🛡️ Alpha Guard Tier Floors (TIER_FLOORS)

The execution gate enforces these MINIMUM thresholds. All are AND conditions:

| Tier | Min RR | Min Score | Min Conf | Requires Trigger |
|------|--------|-----------|----------|-----------------|
| **READY** | 2.20 | 50 | 0.70 | ✅ Yes (strict whitelist) |
| **PLAYABLE** | OR-gate | 24 | 0.60 | ❌ No |
| **PROBE** | 1.20 | 18 | 0.58 | ❌ No |

**PLAYABLE OR-Gate (checkPlayablePath):**
- Path A: rr ≥ 2.0 AND conf ≥ 0.68
- Path B: rr ≥ 1.6 AND (momentum confirm OR structure confirm) AND conf ≥ 0.68
- High-RR downgrade: rr ≥ 3.0 BUT conf < 0.68 → forced to PROBE

**READY Trigger Whitelist (VALID_TRIGGERS):**
`reclaimbreak`, `minispring`, `lps15m`, `lps4h`, `springconfirm`, `volumesurge`, `absorbtest`, `sweepreverse`

---

## 🧩 Data Parity Contract (Scanner ↔ Alpha Guard)

To preserve absolute parity between what the Scanner analyzes and what Alpha Guard enforces, there is a strict data boundary between **Structural Setups** and **Technical Triggers**.

> [!CAUTION]
> **Never merge these fields.** A coin's structural phase must NEVER be overwritten by its entry trigger name. If this happens, the engine will fail-closed and reject via `invalid_setup`.

### 1. Setup Field (`setup` / `structureTag`)
- **Owner:** `scoreStructure()` in Scanner.
- **Purpose:** Maps the Wyckoff phase to determine base qualification tier.
- **Expected Values:** Must normalize into the canonical structural setup vocabulary:
  - `accumulation`
  - `phase-candidate`
  - `early-phase-d`
  - `breakout`
  - `trend-continuation`
  - `unclear`
  - `early-watch`

### 2. Trigger Field (`entrySignal` / `entryTiming`)
- **Owner:** `inferInstitutionalEntrySignal()` in Scanner.
- **Purpose:** The immediate technical signal that unlocks the `READY` execution path.
- **Expected Values:** Must exactly match the engine `VALID_TRIGGERS` whitelist (`reclaimbreak`, `minispring`, `breakoutretest15m`, etc.).

### 3. Setup Normalization Guard
Implemented in `getPersistedSetupLabel()` (`live-scanner.js`). It surgically intercepts noise. If `coin.setup` evaluates to something matching a `VALID_TRIGGERS` array value, the guard explicitly strips it and forces a fallback to `coin.structureTag`.

---

## 📊 Portfolio Limits by Regime

| Limit | BULL | SIDEWAY | BEAR |
|-------|------|---------|------|
| Max Concurrent | 6 | 4 | 2 |
| Max Total Risk | 8% | 5% | 3% |
| Max Per Category | 2 | 1 | 1 |
| Cooling Period | 2h | 4h | 8h |

*(All risk limits are further multiplied by strategic riskMultiplier)*

---

## 🔭 Market Insight Engine (`market-insight.js`)

A **READ-ONLY** batch analyzer that detects structural market toxicity BEFORE the gate runs. Called every scan cycle. Output flows into `runExecutionGate` via `marketInsight` context.

**Three detectors:**

| Detector | Triggers When | Effect |
|----------|--------------|--------|
| **Chop Zone** | avgConf < 0.62 AND RR dispersion > 0.80 AND < 50% setup agreement | `blockPlayable = true` |
| **Fake Breakout** | > 20% signals `fakePumpRisk='high'` OR > 40% marginal score (< 25) | Raises `fakeBreakoutProbability` |
| **Low-Vol Trap** | avgRelVol < 0.85 in sideway AND ≤ 8 candidates | `isLowVolTrap = true` |

**Output: `regimeQuality` score (0–1)**
```
regimeQuality = 1 - (chopProb × 0.45) - (fakeBreakoutProb × 0.35) - (isLowVolTrap ? 0.20 : 0)
```
- `regimeQuality < 0.40` → `blockPlayable = true` (PLAYABLE blocked for this scan cycle)
- `regimeQuality < 0.65 AND warnings > 0` → `caution = true`

**Gate impact:** In `runExecutionGate`, when `marketInsight.blockPlayable = true` and regime is SIDEWAY, PLAYABLE tier is demoted to PROBE (unless HQ override applies).

---

## 🌊 Regime Engine (`regime-engine.js`)

Classifies the current market micro-regime based on the full signal batch. Outputs `regimeType` which drives alert cooldown timers and macro capital regime.

**Regime Types and their triggers:**

| Type | Trigger Condition | Trading Allowed |
|------|------------------|----------------|
| `FAKE_PUMP` | fakeBreakoutProb ≥ 0.6 OR fakePumpHigh ≥ 18% of batch | ❌ Blocked |
| `CHOP` | Low vol + chopProb ≥ 0.62 OR sideway + relVol < 0.9 + conf < 0.65 | ⚠️ Probe-only |
| `BREAKOUT` | breakoutFrac ≥ 0.4 AND avgRR ≥ 1.8 AND relVol ≥ 1.05 | ✅ READY allowed |
| `TRENDING` | Bull BTC AND phaseDFrac ≥ 0.35 AND avgConf ≥ 0.66 | ✅ PROBE+READY |
| `ACCUMULATION` | phaseCFrac ≥ 0.35 AND relVol ≤ 1.1 AND avgConf ≥ 0.60 | ⚠️ Probe-only |
| `DISTRIBUTION` | Bear BTC context | ❌ Capital preservation |

**Alert Engine impact:** `regimeType` determines the global Telegram cooldown:
- BREAKOUT/TRENDING → 15 min cooldown
- ACCUMULATION → 30 min cooldown  
- CHOP/FAKE_PUMP/DISTRIBUTION → 60 min cooldown

---

## 📐 Pro-Edge Engine (`pro-edge.js`)

The **quantitative meta-layer** that integrates scan results, learning data, and capital flow to produce a consolidated trade gate decision and risk multiplier.

**Runs AFTER Alpha Guard** via `PRO_EDGE.rebuildAfterScan()` and stores result in `ST.scanMeta.proEdge`.

**Gate Modes:**

| Mode | Meaning | Size |
|------|---------|------|
| `ENABLED` | Full signal quality, deploy normal size | 100% |
| `REDUCED` | Signal quality reduced, probe capital only | ~50% |
| `SOFT` | Sideway adaptive unlock for PLAYABLE/PROBE | ~35% |
| `DISABLED` | No trade, hard block | 0% |

**Inputs to `deriveTradeGate()`:**
- `btc` context (bull/sideway/bear)
- `marketHealthScore` from `MARKET_INSIGHT`
- `qualifiedCount` / `playableCount` / `probeCount` from `EXECUTION_SYNC`
- `bestSetup` (highest edge setup from learning dataset)
- `outcomeStats` (last 20 trade outcomes: winRate, avgR, verdict)

**Learning Integration (Bayesian Edge):**
```
edgeBoost = clamp(0.84 + (winRate × 0.44) + clamp(avgR × 0.10, -0.12, 0.18), 0.75, 1.25)
blendedEdge = priorEdge × (1 - sampleWeight) + (priorEdge × edgeBoost × sampleWeight)
```
- Half-life: 21 days (recent trades weighted more)
- Min samples for qualification: 6 trades per setup
- Prior win rate: 50%, prior avgR: 0.08R

**Output stored in `ST.scanMeta.proEdge`:**
- `gateMode`: ENABLED / REDUCED / SOFT / DISABLED
- `dynamicRiskMultiplier`: 0.25x – 1.35x (multiplied with portfolio limits)
- `suggestedSymbol`: best trade candidate from current scan
- `capitalRegime`: PROBE_ACTIVE / PLAYABLE_ACTIVE / etc.
- `noTrade` flag → propagated to `ST.scanMeta.regime.noTrade` → blocks Dashboard


### The `authorityTrace` Object
Every coin in ST.coins carries this object. It is the **audit trail** for the Alpha Guard decision:

```javascript
authorityTrace: {
  entrySignal: 'none' | 'reclaimbreak' | ...,  // raw trigger value
  triggerMatched: true | false,
  expectancy: { multiplier: 1.0, reasons: [] }, // from getExpectancyPenalty()
  macro: { btcContext: 'sideway', sidewayPlayableBlocked: false },
  rejectionsByTier: {
    READY:    ['rr_1.82_lt_2.20', 'trigger_required_not_found:none'],
    PLAYABLE: ['playable_path_failed:rr_1.82_no_momentum'],
    PROBE:    [],  // empty = PASSED
  }
}
```

**Special cases in rejectionsByTier:**
- `pre_gate:watch:score_8_conf_0.40` → coin was WATCH (too low quality to enter gate)
- `pre_gate:stale` → signal older than 6h
- `dedup:signal_already_open` → same signal ID has open position
- `dedup:symbol_already_in_portfolio` → same symbol already in this batch
- `position_bound:PROBE` → coin status from portfolio (prior scan approval)

### The `authorityDecision` Values
- `ALLOW` → authority-approved for deployment (READY/PLAYABLE)
- `WAIT` → authority-approved but cautious (PROBE)
- `REJECT` → blocked by gate

### Signal Status Hierarchy
```
READY     → Highest conviction, trigger confirmed, capital authorized
PLAYABLE  → Strong setup, RR/conf path met, capital authorized
PROBE     → Entry-eligible with higher caution, 1% portfolio risk
EARLY     → Technical Watch — good structure but not gate-ready
WATCH     → Low conviction, scanner metric issues
AVOID     → Hard-blocked (sizing fail, fake pump, capital gate)
FETCH_FAIL → Data retrieval failed for this symbol
```

---

## 🗄️ Persistence Layer (`db.js`)

**Primary:** IndexedDB via custom `DB` wrapper  
**Stores:**
- `settings` — sessionState, Telegram config, watchlist, journal
- `scans` — scan records with metadata (regime, breakdown, top3)
- `signals` — persisted signal truth after fail-closed learning repair
- `signals` — individual coin signal records per scan
- `positions` — paper trade positions (ARMED → PENDING → ACTIVE → CLOSED)
- `outcomes` — trade outcome evaluations
- `checkpoints` — D1/D3/D7 price checkpoints

**Session State:** `ST.save()` persists the entire ST object snapshot to `DB.setSetting('sessionState')`. On page reload, `ST.init()` restores from DB.

**Legacy:** `DB.migrateFromLocalStorage()` runs once to migrate old localStorage data.

### Signal normalization contract

Normalized signal rows now carry explicit score and learning semantics.

Score semantics:

- `rawScannerScore` = raw scanner signal quality
- `riskAdjustedScore` = analytics / learning adjusted quality
- `rankScore` = ranking shortlist score
- `executionQualityScore` = execution-facing quality interpretation

`scoreSemantics` should map these domains explicitly:

```javascript
{
  scanner: 'rawScannerScore',
  analytics: 'riskAdjustedScore',
  ranking: 'rankScore',
  execution: 'executionQualityScore',
}
```

Learning semantics:

- `learningEligible`
- `learningPool`
- `learningClassification`

These fields are part of the normalized persisted signal contract and should be preferred over older inferred analytics heuristics.

---

## 🖥️ UI Pages

| Page | File | Purpose |
|------|------|---------|
| Dashboard | pages/dashboard.js | Command Center: regime, top3 setups, Alpha Guard trace |
| Coin Scanner | pages/scanner.js | Full universe grid, per-coin Alpha Guard trace tooltip |
| Coin Scorer | pages/scorer.js | Manual deep-dive into a single coin |
| Positions | (embedded) | Paper trade tracker |
| Trade History | pages/signals.js | Historical signal log |
| Analytics | pages/analytics.js | Win rate, expectancy, performance stats |
| Scan History | pages/scan-history.js | Historical scan log with regime context |
| Settings | pages/settings.js | Telegram config, scheduler, thresholds |

---

## 🔍 Alpha Guard Trace UI (The Magnifying Glass Icon 🔍)

Every coin card in Scanner and Dashboard shows a 🔍 icon. Hovering reveals:

**For WATCH/EARLY/AVOID coins:**
- All 3 tiers show ❌ with the specific rejection label (e.g. `pre_gate:watch:score_8_conf_0.40`)

**For READY/PLAYABLE/PROBE coins (authority-approved in the current scan):**
- Passing tier: ✅ Passed
- Non-passing tiers: ❌ specific rejection reason

**For Portfolio-Bound coins (authority-approved in a prior scan, signal diverged in the current scan):**
- Shows: ✅ Position Bound (PROBE/PLAYABLE/READY)
- Note: "Approved in prior scan — position maintained. Current scan signal diverged."

**Important runtime distinction:**
- Existing paper positions may still be `ARMED` / `PENDING` / `ACTIVE`, and may still be activated or promoted, even when the current scan has `0 gate-passed`.
- Position lifecycle truth is separate from new scan authority-approved setup truth.

**Contradiction Guard:** If a coin is PROBE/PLAYABLE/READY (from portfolio) but current scan marks it as pre_gate blocked → UI overrides to show the Position Bound view. This prevents misleading "all blocked" display for maintained positions.

---

## ⏰ Scan Scheduler

Auto-scan runs at configurable hours (default: 06:00, 07:00, 08:00, 09:00, 10:30, 12:00, 16:00, 17:00, 21:00, 23:00, 00:00). Managed in `app.js` via `checkAutoScan()`. State stored in `ST.scanMeta.scheduler`.

Manual scan triggered via "Run Scan" button in Scanner → `runAISmartScanner()`.

---

## 🌐 External Dependencies

| Service | File | Usage | Rate Limit |
|---------|------|-------|-----------|
| CoinGecko API | coingecko.js | Universe discovery, price data | Public tier |
| Binance REST API | binance-market-data.js | Kline (OHLCV) data | No key needed |
| Telegram Bot API | telegram.js | Alert notifications | Bot token required |

---

## 📐 Global State (`window.ST`)

The entire runtime state lives in `window.ST` (defined in `state-v51-auth.js`):

```javascript
ST = {
  btc: 'bull' | 'sideway' | 'bear',  // current BTC regime
  coins: [],          // latest scan result (full coin objects)
  scanMeta: {
    lastScan: timestamp,
    top3: [],               // legacy compatibility field
    technicalTop3: [],      // raw technical shortlist only
    authoritativeTop3: [],  // [LEGACY] backward-compatible mirror only
    deployableTop3: [],     // authority-approved shortlist for the current scan
    regime: {},       // gate mode, no-trade status
    insight: {},      // market health metrics
    portfolio: { positions: [] },
    scheduler: { enabled, hours, lastAutoRunAt }
  },
  strategic: {        // macro overlay
    rainbow: { label, color, offset },
    fng: { value, label },
    dominance: { value, change24h },
    riskMultiplier: 1.0
  },
  config: {
    execution: { READY_SCORE: 50, READY_CONF: 0.70, PROBE_CONF: 0.58 },
    expectancy: { minCautionSamples: 3, minHardPenaltySamples: 8, penaltyMultiplier: 0.85 }
  }
}
```

---

## 🧭 Authority Contract Resolution Order

This branch must follow a **single authority chain** for all user-facing status rendering:

1. **`displayStatus`** → UI truth (what the user should see)
2. **`finalAuthorityStatus`** → engine output before display reconciliation
3. **`status`** → legacy fallback only for older persisted data

**Important interpretation:**
- `displayStatus` is allowed to be more conservative than `finalAuthorityStatus`
- Example: `finalAuthorityStatus = PLAYABLE` but `displayStatus = WATCH`
- In that case, **UI, alerts, logs, and badges must all show WATCH**

**Never derive user-facing status directly from score, confidence, or setup names after the engine has already emitted the authority contract.**

---

## 📨 Telegram Truth Priority

Telegram alerts must speak with **one voice** and must not mix technical optimism with execution rejection.

**Priority order for alerts:**
1. **Display / action truth** (`displayStatus`)
2. **Execution decision** (`authorityDecision`)
3. **Technical context** (`finalAuthorityStatus`, RR, confidence, setup)
4. **Reason / blocker** (`authorityTrace`, `authorityBlockers`, reject reason)

### Recommended alert wording
- If a signal is user-actionable: lead with `READY` or `PLAYABLE`
- If a signal is blocked or downgraded: lead with `WATCH`, `HOLD`, or `AVOID`
- Technical tier should appear only as **secondary context**, never as the headline truth when execution is blocked

### Trade detail exposure policy
Show `Entry / Stop / TP1` **only** when all conditions are true:
- `displayStatus` is `READY` or `PLAYABLE`
- `authorityDecision` is not `REJECT`
- confidence is high (institutional threshold; currently branch target ≥ 0.85)
- RR is sufficiently strong (branch target ≥ 2.0)
- entry / stop / tp1 values are valid

If a signal is `WATCH`, `AVOID`, `REJECT`, or `PROBE`, Telegram should not present a full trade block.

### Telegram Delivery Profile (Current practical runtime)
- `WATCH` is never sent to Telegram
- `READY` is always eligible if not rejected
- `PLAYABLE` is eligible at moderate quality floors (current branch target: rr >= 1.4, conf >= 0.58)
- `PROBE` is eligible as a monitoring-grade early signal (current branch target: rr >= 1.2, conf >= 0.50)
- `PROBE` should be phrased as a watch / monitor alert, not as a full execution-ready trade block
- Per alert, Telegram should prefer at most the top 2 symbols to reduce phone noise

### Top3 Semantics

- `technicalTop3` is the scanner's technical shortlist only
- `deployableTop3` is the authority-approved shortlist for the current scan only
- legacy `authoritativeTop3` is a backward-compatible field only and should not be preferred terminology in new UI/docs
- `WATCH` must never appear in `deployableTop3`
- if no new authority-approved setup exists, scanner UI must explicitly render:
  `No authority-approved setup`
- any message or panel that implies tradability must read from
  `deployableTop3`, not `technicalTop3`

### Telegram formatting intent by tier
- `READY` -> strongest visual emphasis; full trade block allowed
- `PLAYABLE` -> distinct but lighter styling than `READY`; full trade block allowed when quality is sufficient
- `PROBE` -> watch-style formatting only (`Watch For`, `Price`, RR snapshot, confidence); no full `Entry / Stop / TP1` block

### Telegram anti-spam intent
- Global cooldown remains regime-aware (trend shorter, chop/distribution longer)
- Per-symbol dedup remains active
- Status upgrades may bypass cooldown (`WATCH -> PROBE`, `PROBE -> PLAYABLE`, `PLAYABLE -> READY`)
- `PLAYABLE` should resend slower than `READY`, but faster than generic watch-grade traffic

---

## 🧪 Reject Mapping Semantics (WATCH vs AVOID)

Not every `REJECT` should collapse to the same visible meaning.

### Soft Reject → `WATCH`
Use when the structure is still interesting but not currently authorized:
- `pre_gate_blocked`
- `requires_trigger`
- `await_confirmation`
- `macro_downgrade`
- `sideway_playable_blocked`
- `timing_not_ready`
- `cap_limit_hold`
- `probe_only`

### Hard Reject → `AVOID`
Use when the setup is structurally or risk-wise bad:
- `fake_pump_high`
- `risk_blocked_high`
- `hard_reject_rr`
- `invalid_stop`
- `structure_risk`
- `late_trap`
- `liquidity_guard_fail`
- `spread_too_wide`
- `chart_structure_risk`

**Principle:**
- `WATCH` = technically interesting, but not authorized yet
- `AVOID` = should not be treated as a near-term opportunity

---

## 📌 Current Runtime Snapshot (Authority Branch)

This handover describes the current active authority branch:

- **Active gate core:** `alpha-guard-core-v51-auth.js`
- **Active resolver:** `state-v51-auth.js`
- **Display adapter:** `execution-sync.js`
- **Alert formatter:** `alert-engine.js`
- **Primary scanner orchestrator:** `live-scanner.js`
- **Primary persistence layer:** `db.js`
- **Current cache/query versioning target:** `v10.6.9.56-ModerateTelegram`

### Runtime ownership rules
- `alpha-guard-core-v51-auth.js` owns **capital authority**
- `execution-sync.js` owns **display shaping only**
- `state-v51-auth.js` owns **status resolution order**
- `alert-engine.js` owns **message wording**, but must not invent authority
- `live-scanner.js` must not re-promote user-facing status from raw score heuristics once authority fields exist
- `technicalTop3` must never be mistaken for trade permission
- `deployableTop3` must never fall back to `WATCH` / `AVOID` / stale portfolio rows

### Additional runtime notes (April 2026 hardening delta)
- Phase 2 scanner modularization is now explicit:
  - `scanner-universe.js` owns discovery / hygiene
  - `scanner-analysis.js` owns deep scan / scoring / structure analysis
  - `scanner-refinement.js` owns authority merge, Top3 derivation, and shortlist semantics
  - `scanner-persistence.js` owns final persistence + cache/session sync
  - `live-scanner.js` is now an orchestration shell, not the old monolithic scanner implementation
- `setup` shown in UI must be treated as a display label, not blindly trusted as structural truth
- Structural truth should prefer `structureTag`; trigger / timing truth should prefer `entryTiming` / `entrySignal`
- UI layers should sanitize trigger-like strings such as `setup_ready`, `probe_detection`, `scalp_trigger`, `reclaimbreak` if they leak into `setup`
- Position-bound rendering must only activate when there is evidence of a live bound position (e.g. `ARMED` / `PENDING` / `ACTIVE` / `PARTIAL_EXIT`, or explicit portfolio-binding source)
- Runtime now supports a **moderate soft-unlock path** in both `bull + CHOP` and `sideway + CHOP` so Alpha Guard can surface selective `PROBE` / `PLAYABLE` setups without reopening `WATCH` spam
- In `sideway + CHOP`, current soft pre-gate floors are `rr >= 0.65`, `score >= 12`, `conf >= 0.46`
- In `sideway + CHOP`, adaptive soft PROBE unlock currently includes:
  - soft bridge: `rr >= 0.95`, `score >= 18`, `conf >= 0.50`
  - narrow score/conf bridge: `rr >= 1.10`, `score >= 17`, `conf >= 0.50`, and `setup !== 'unclear'`
- Current sideway capital profile in `capital-engine.js` is `cooldownMs = 90m`, `maxTradesPerDay = 3`, `hardExposureCapPct = 5%`
- `capital-engine.js` also contains a narrow `loss_streak_guard_2` relaxation for clean `PROBE` candidates in `sideway + CHOP`:
  - only exactly 2 consecutive losses
  - no open positions
  - `rr >= 1.0`, `score >= 16`, `conf >= 0.50`
  - `fakePumpRisk !== 'high'`
- `clean-universe.js` now uses a hard-exclude + soft-exclude split: majors may re-enter when regime is compatible, while meme assets are tighter and should stay blocked in `sideway + CHOP`
- `totalEquity` boot fallback must never resolve to `missing`; runtime should prefer persisted account/session equity and only then fall back to a paper-equity default
- Strategic Fear & Greed fetch is now browser-safe: direct `alternative.me` browser calls are disabled by default, and runtime should rely on cached/default sentiment unless a proxy URL is configured
- Learning/runtime wording note: logs may say `Historical dataset snapshot rebuilt (all-time persisted samples, not current scan)`; this refers to the persisted all-time learning dataset, not current-scan-only samples
- Verified runtime outcome on `v10.6.9.56-ModerateTelegram`: `sideway + CHOP` batch produced `1 gate-passed | new-paper:1 persisted:1` and Telegram successfully delivered a `PLAYABLE` alert (`reason: top1_changed`)

### April 19, 2026 runtime audit conclusion

Recent narrow tuning tasks were completed and kept intentionally small:

- Task 8: narrow `loss_streak_guard_2` carve-out for clean `PROBE` in `sideway + CHOP`
- Task 9: tiny sideway/CHOP soft-PROBE RR bridge
- Task 10: tiny sideway/CHOP score/conf bridge for semantically clean candidates
- Task 11: audit-only conclusion, no further patch recommended

Observed runtime population after those patches remained dominated by:

- `capital_blocked` via `loss_streak_guard_2`
- `pre_gate_blocked:WATCH`
- weak batch characteristics such as `conf = 0.50`, `trigger = wait`, `rr < 1.20`, and a meaningful share of `setup = unclear`

Current operating conclusion:

- **Do not continue loosening the engine by default**
- repeated `0 gate-passed` in current `sideway / CHOP` batches now looks more like **weak live population** than a clear threshold bug
- future tuning should reopen only if repeated runtime audits show a sufficiently large **clean almost-PROBE** subgroup that misses just one narrow threshold

### Runtime Audit utility (April 19, 2026)

The Scanner now includes a live runtime audit helper so future review does not require manual raw-log reading.

- script: `runtime-audit.js`
- UI surface: `pages/scanner.js`
- script tag included in `index.html`
- latest summary snapshot is stored in `window.__LAST_RUNTIME_AUDIT__`

Console helpers:

```javascript
RUNTIME_AUDIT.summarizeLatest()
RUNTIME_AUDIT.printLatest()
window.__LAST_RUNTIME_AUDIT__
```

Scanner panel actions:

- `Copy Short Summary`
- `Copy JSON`
- `Export JSON`

`Copy Short Summary` is the preferred handoff artifact for quick audit reviews. It includes:

- blocker group counts
- key population metrics
- top blockers
- latest execution trace summary
- a final `Decision:` line indicating whether to keep the engine unchanged or inspect further

---

## ⚠️ Known Design Constraints & Gotchas

### 1. `VALID_SETUPS` — Hard-coded Whitelist
Only these setup names pass `classifySignalState()`:
```
'phase c candidate', 'early phase d', 'phase-candidate', 'early-phase-d',
'breakout', 'trend-continuation', 'unclear', 'accumulation',
'early watch', 'early-watch'
```
If scanner produces a different setup name (e.g. `probe_detection`), the coin will be **WATCH** regardless of score. This is intentional strictness but can cause Portfolio-Bound contradictions.

### 2. Position-Bound Contradiction
A coin can show PROBE status (from an active portfolio position) while the current scan flags it as WATCH (because its setup changed). This is handled by the UI's contradiction guard in `renderAuthorityTrace()`. The underlying data is correct — the position was authority-approved in a prior scan under different conditions.

**Important hardening update:**  
Do not render `Position Bound` from trace shape alone.  
The UI must require bound-position evidence (live position state or explicit portfolio-binding metadata), otherwise a rejected coin with stale actionable fields can be mislabeled as portfolio-bound.

### 3. `evaluateExpectancyHardening` → `getExpectancyPenalty`
The function is named `getExpectancyPenalty` in code. Never introduce a function called `evaluateExpectancyHardening` — it was a naming bug that caused the entire engine to crash silently (v10.6.9.52 hotfix).

### 4. `execution-sync.js` is READ-ONLY
`EXECUTION_SYNC` is a **display adapter only**. It has zero capital authority. All tier decisions come exclusively from `EXECUTION_ENGINE_V9` (`alpha-guard-core-v51-auth.js`).

### 5. Fail-Closed Principle
If `PORTFOLIO_ENGINE` is missing → veto returns `_fatalSystemError: true` → entire engine halts.  
If portfolio context is null → veto rejects with `context_missing_fail_closed`.  
Never add OR-fallbacks that bypass null context.

### 6. `authorityTrace` Write-Back
Inside `evaluate()`, `rawSignal.authorityTrace = auth.authorityTrace` mutates the coin object directly. This means after the engine runs, the original coin references in the scanner array already carry the trace. The `mergeAuthorityCoins()` function then uses `res.authorityTrace` which is the same value.

### 7. Authority Resolver Rule
`getExecutionDisplayStatus()` must resolve status in this order:
1. `displayStatus`
2. `finalAuthorityStatus`
3. legacy fallbacks

Do not allow legacy helpers to re-promote `WATCH` back into `PROBE` / `PLAYABLE` based only on score.

### 8. Telegram Mixed-Truth Trap
A message like `ZEC — PLAYABLE` plus `Decision: REJECT` plus `Reason: WATCH` is architecturally confusing. The alert layer must present one primary truth first (`WATCH` / `HOLD` / `AVOID`) and place technical tier second.

### 9. Legacy Score Leakage
Any helper logic equivalent to `if (score >= 22) return 'PROBE';` is considered a parity leak once authority fields are available. This must remain removed or disabled.

### 10. Setup / Trigger Hygiene
Scanner runtime now treats these as separate concerns:
- `structureTag` = structural setup truth (`breakout`, `accumulation`, `trend-continuation`, etc.)
- `entryTiming` / `entrySignal` = trigger or timing truth (`setup_ready`, `probe_detection`, `scalp_trigger`, etc.)

Never present trigger-like values under a `Setup` label in UI or Telegram if a valid `structureTag` exists.

### 11. Non-Passing Merge Guard
`mergeAuthorityCoins()` must not preserve actionable user-facing status for a non-passing engine result unless there is real live-position evidence.  
Reject path + stale scanner status must collapse back toward `WATCH`, not remain pseudo-actionable.

### 12. Cache Busting
All script tags should align to the active cache tag `?v=10.6.9.56-ModerateTelegram`. When modifying any `.js` file, bump this version in `index.html` to force browser cache invalidation. Run a hard refresh (`Ctrl+Shift+R`) after deployment.

---

## 📈 Version History (Key Milestones)

| Version | Codename | Change |
|---------|----------|--------|
| v10.6.9.9 | Capital Hardening | Strategic multiplier applied to portfolio risk cap |
| v10.6.9.12 | Elite | statusColor ReferenceError fix, dashboard placeholder |
| v10.6.9.25 | Expectancy | `getExpectancyPenalty` added (symbol/setup/hour penalization) |
| v10.6.9.48 | Absolute Diagnostic Parity | Outcome linker fixed, full trace transparency |
| v10.6.9.50 | Absolute Logic Parity | Telegram labels synced with Dashboard macro-downgrade |
| v10.6.9.51 | Absolute Parity Sync | `authorityTrace` naming typos fixed (`authTrace` → `authorityTrace`) |
| v10.6.9.52 | TraceHotfix | **3-layer Alpha Guard trace bug fixed** (see below) |
| v10.6.9.53 | Alert Guard | Initial Telegram downgrade / parity shaping hardening |
| v10.6.9.54 | AuthorityParity | Resolver and Telegram wording hardened to prioritize display truth over technical truth |
| v10.6.9.55 | Setup Hygiene | Setup label sanitization, bound-position evidence guard, position record setup fallback |
| v10.6.9.56 | Moderate Telegram | Senior moderate-risk Telegram profile: `READY` + `PLAYABLE` + monitoring-grade `PROBE`, no `WATCH` alerts |
| v10.6.9.56+ | Fail-Closed Repair Pass | Historical signal repair, fail-closed learning, fail-closed alerts, and split `technicalTop3` vs `deployableTop3` (aka authoritativeTop3) |
| v10.6.9.56++ | Sideway CHOP Tuning | Softer sideway CHOP gate floors, sideway capital tuned to `90m / 3 trades / 5% cap`, and clean-universe split into hard vs soft exclusions |

### v10.6.9.52 — TraceHotfix Detail
Three compounding bugs in `alpha-guard-core-v51-auth.js` caused the Alpha Guard Trace tooltip to show identical/misleading data for all coins:

1. **`evaluateExpectancyHardening` undefined** → `ReferenceError` → engine crashed silently every scan → all coins got stale trace
2. **`auth.authTrace` typo** → `auth.authorityTrace` not written to coin objects → UI fell back to empty defaults
3. **Pre-gate coins showed "all Passed"** → added `buildPreGateTrace()` helper to populate rejection reasons for WATCH/STALE/dedup blocked coins

Also added **Contradiction Guard** in `renderAuthorityTrace()` (both scanner.js and dashboard.js) to handle Portfolio-Bound coins whose current scan diverges from their prior approval.

---

## 🔒 Immutable Laws (Non-Negotiable)

1. **Scanner has zero capital authority.** Status badges come ONLY from `EXECUTION_ENGINE_V9`.
2. **One gate. ALL conditions AND.** No OR-fallbacks in the core gate logic.
3. **Portfolio veto fails CLOSED** if context is absent — never open-default.
4. **Size = riskBudget / stopDistancePct** — real stop distance only, never arbitrary.
5. **Every gate-passed signal that opens a new paper trade → AUTO_PAPER position**, state = ARMED.
6. **Every position has hard expiry.** STALE → EXPIRED, never promoted.
7. **NO_TRADE regime blocks ALL new approvals** unconditionally.
8. **Fail-Loud.** Errors are logged and surfaced, never swallowed silently.
