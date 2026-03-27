# AGENTS.md — SystemTrader Hybrid

## Project identity
This repository is a browser-based crypto trading workstation and research engine.
It is NOT a toy demo.
It combines:
- live market scanning
- setup classification
- signal persistence
- checkpoint outcome evaluation
- adaptive edge scoring
- trade gating / risk control

Main objective:
Build a disciplined trading operating system that only allows trade plans when setup quality, RR, confidence, and market regime are aligned.

---

## Non-negotiable product rules

### 1. Signal != Trade
A signal is market intelligence.
A trade is a validated executable opportunity.
Never merge those concepts.

### 2. Save broad learning data
Do not only save playable signals.
The system must preserve market distribution for learning:
- playable
- probe
- near_miss
- watch
- reject
- fetch_fail
Low-quality or rejected signals are still valuable learning records.

### 3. Trade gating is sacred
Never weaken trade gating for convenience.
If there is no playable setup, the system must say:
- no trade
- risk multiplier = 0x
- allocation = 0%
Trade Plan must remain blocked.

### 4. No fake edge
Do not suggest a coin merely because it has the highest score.
A suggested coin must satisfy:
- valid setup
- minimum RR threshold
- acceptable confidence
- acceptable market regime
- no hard reject condition

### 5. Learning must be evidence-driven
Adaptive edge must be updated from:
- persisted signals
- checkpoint outcomes
- journal results
Do not invent expectancy or dynamic risk from thin air.

### 6. Outcome evaluation framing
Checkpoint evaluation is allowed.
It must be clearly labeled as:
- snapshot / checkpoint evaluation
- not full price-path replay
Do not misrepresent it as full backtesting.

### 7. Preserve UI behavior unless explicitly requested
Avoid breaking:
- scanner page
- dashboard
- watchlist
- trade plan
- risk calc
- checklist
- journal
Additions are preferred over destructive rewrites.

---

## Architecture expectations

### Core files
- `live-scanner.js`
  Scans market, builds candidate list, computes structure/score/setup, and prepares signals.

- `state.js`
  Global state, local working state, legacy compatibility.

- `db.js`
  IndexedDB persistence layer.
  Source of truth for scans, signals, trades, outcomes, settings.

- `outcome-evaluator.js`
  Computes checkpoint outcomes for D1/D3/D7/D14/D30.

- `pro-edge.js` or equivalent
  Adaptive edge engine and trade gating logic.

- `pages/*`
  UI pages. Preserve current routing and layout style.

### Data stores expected
- scans
- signals
- trades
- outcomes
- settings
- optional: coreState mirror

---

## Data model expectations

### Signals must support:
- symbol
- timestamp
- setupType
- classification
  - playable
  - probe
  - near_miss
  - watch
  - reject
  - fetch_fail
- score
- confidence
- RR
- market regime
- entry / stop / tp
- rejectReason
- rejectSeverity
- learningEligible

### Outcomes must support:
- signalId
- horizon
- evaluationType = checkpoint
- result metrics
- max favorable excursion if available
- max adverse excursion if available
- checkpoint return
- verdict

---

## Coding rules

### Preserve safety and auditability
- prefer explicit logic over clever hidden behavior
- keep business rules readable
- avoid magic numbers without naming them
- add comments only when they clarify real intent

### Avoid harmful simplifications
Do NOT:
- remove persistence just to simplify
- collapse signal classes into one
- auto-enable trading without gate checks
- suppress rejected signals from learning
- hardcode fake expectancy values

### Be careful with async flows
- do not block the scanner unnecessarily
- do not silently swallow persistence failures
- log meaningful debug messages for save/evaluate/gate decisions

### Backwards compatibility
- preserve legacy localStorage migration where possible
- do not delete legacy data before IndexedDB write is confirmed

---

## QA expectations

For any meaningful change, inspect:
1. scanner still runs
2. signal history still records data
3. dashboard still renders
4. trade plan still blocks bad trades
5. no-trade regime still disables execution
6. analytics still loads with empty and non-empty datasets

If you cannot fully test in browser, state what was verified statically and what remains for manual QA.

---

## Preferred task style
When assigned a task:
1. inspect relevant files first
2. summarize current behavior
3. identify exact gap
4. propose minimal safe change
5. implement
6. report changed files and residual risks

---

## Current strategic direction
Near-term priority:
- strengthen learning loop
- improve signal coverage
- tighten adaptive edge quality
- keep strict real-trader gating

Do not prioritize cosmetic work over architecture, learning integrity, or risk control.