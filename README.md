# SystemTrader Hybrid

SystemTrader Hybrid is a browser-based crypto execution planning system. It scans live Binance spot markets, scores technical setups, runs them through a strict execution authority, persists the scan truth, and surfaces only authority-valid candidates to the UI and Telegram.

It is not an automated trading bot. It does not place orders. The system is designed to reject weak setups, explain every veto, and protect capital first.

## What This System Is Not

- Not an exchange connector that places orders.
- Not a signal pump that promotes every technical candidate.
- Not a replacement for trader discretion.
- Not governed by scanner score alone.

## Where Final Authority Lives

Final execution authority lives in `alpha-guard-core-v51-auth.js`.

Capital and portfolio vetoes are enforced through `capital-engine.js` and `portfolio-engine.js`. UI, Telegram, learning, and persistence must consume final authority truth; they must not re-promote scanner-only candidates.

## Current Runtime Architecture

The active application is a vanilla JavaScript single-page app loaded from `index.html`.

Primary runtime modules:

- `index.html`: script entry point and browser shell
- `app.js`: bootloader, IndexedDB state load, router, scheduler startup
- `state-v51-auth.js`: global `ST` state, UI truth resolver, authority display contract
- `live-scanner.js`: scanner orchestration shell
- `scanner-universe.js`: Binance universe discovery, liquidity gates, discovery hygiene
- `clean-universe.js`: hard and soft symbol exclusion taxonomy
- `scanner-analysis.js`: kline fetch, technical feature extraction, scoring, RR, confidence, levels
- `scanner-refinement.js`: post-scan refinement, authority merge, Top3 shaping
- `scanner-persistence.js`: final scan persistence and `ST.scanMeta` sync
- `alpha-guard-core-v51-auth.js`: final execution authority
- `capital-engine.js`: sizing, cooldown, daily limit, risk-cap checks
- `portfolio-engine.js`: portfolio veto context and lifecycle constraints
- `db.js`: IndexedDB persistence and signal truth normalization
- `alert-engine.js`: fail-closed Telegram alert truth and formatting
- `telegram.js`: Telegram config, dedup, anti-spam, send layer
- `runtime-audit.js`: live blocker-distribution and scan audit utility
- `pages/dashboard.js`: command center UI
- `pages/scanner.js`: scanner UI

## Source-Of-Truth Contract

Use these fields consistently across code and docs:

- `displayStatus`: UI action truth
- `finalAuthorityStatus`: final technical authority tier
- `authorityDecision`: `ALLOW`, `WAIT`, or `REJECT`
- `authorityReason`: concise final reason string
- `authorityTrace`: final trace object
- `technicalTop3`: technical shortlist only
- `deployableTop3`: authority-approved shortlist for the current scan
- `authoritativeTop3`: legacy compatibility mirror of `deployableTop3`
- `learningPool`: `execution`, `near_approved`, or `excluded`

Do not infer tradability from scanner-only fields such as `proposedStatus`, `score`, or `technicalTop3`.

## Scan Pipeline

1. `app.js` boots the browser app and loads `ST` from IndexedDB.
2. `live-scanner.js` detects BTC context and coordinates the scan.
3. `scanner-universe.js` builds a Binance USDT spot universe and applies liquidity/hygiene filters.
4. `scanner-analysis.js` fetches klines and computes structure, trigger, RR, confidence, levels, volume, and pump fields.
5. `scanner-refinement.js` ranks candidates, builds technical shortlist context, and prepares authority input.
6. `alpha-guard-core-v51-auth.js` runs the final execution gate.
7. `capital-engine.js` and `portfolio-engine.js` apply capital, exposure, cooldown, dedup, and risk vetoes.
8. `scanner-refinement.js` merges authority truth back into each coin.
9. `scanner-persistence.js` saves the scan and patches `ST.scanMeta`.
10. `pages/dashboard.js`, `pages/scanner.js`, `alert-engine.js`, and `runtime-audit.js` consume final truth.

## Authority, Persistence, And Alerts

Authority:

- `alpha-guard-core-v51-auth.js` is the final execution authority.
- The gate evaluates `READY`, `PLAYABLE`, and `PROBE` tiers and rejects everything else fail-closed.
- Portfolio, capital, dedup, cooldown, and daily limit checks are vetoes, not suggestions.

Persistence:

- `scanner-persistence.js` writes finalized scan results.
- `db.js` normalizes historical records and preserves learning-pool separation.
- `authTrace` is legacy. Use `authorityTrace`.

Alerts:

- `alert-engine.js` must only alert authority-valid candidates.
- `WATCH` is not sent to Telegram.
- `READY` and `PLAYABLE` may show `Entry / Stop / TP1` when authority-approved, actionable, not maintained, and levels are valid.
- `PROBE` is monitoring-grade only and should use watch-style formatting.

## Quick Start

Requirements:

- Python 3.x
- A modern browser such as Chrome, Edge, or Brave

Run locally:

```powershell
cd SystemTrader_Hybrid
python -m http.server <port>
```

Example:

```powershell
python -m http.server 8022
```

Open the matching local URL:

```text
http://localhost:<port>
```

Notes:

- Run through a local server; do not open `index.html` directly.
- Any available local port can be used, such as `3000`, `5500`, `8022`, or `8080`.
- If browser cache looks stale after editing JS, hard refresh with `Ctrl+Shift+R`.
- Runtime cache labels may still show `v10.6.9.56-ModerateTelegram`; trust the current source snapshot over version strings.

## Runtime Audit Helpers

Use these in the browser console after a scan:

```javascript
RUNTIME_AUDIT.summarizeLatest()
RUNTIME_AUDIT.printLatest()
window.__LAST_RUNTIME_AUDIT__
```

Useful when a scan shows zero approved setups:

- check `counts`
- check `blockerRanking`
- check `filteredCandidates`
- check `executionTrace`
- compare `technicalTop3` against `deployableTop3`

## How To Read This Repo

Start here:

1. `README.md`: entry point and runtime summary
2. `docs/system-map.md`: quick visual architecture map
3. `AI_CONTEXT.md`: short current-branch hot cache for AI agents
4. `ARCHITECTURE.md`: deep architecture, hardening history, contracts, constraints

When debugging:

- start from `ST.scanMeta.coins`
- use `displayStatus` for UI/action truth
- use `authorityTrace.rejectionsByTier` for rejection reasons
- use `deployableTop3` for approved shortlist
- use `runtime-audit.js` for population-level blocker shape
