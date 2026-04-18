# Project Handoff: SystemTrader v9.5 "Alpha Guard"

This document summarizes the institutional-grade hardening of the SystemTrader v9.5 execution engine. Use this as a prompt/context for any AI assistant to continue development.

---

## 🎯 Current Objective
Transforming SystemTrader from a simple scanner into an **Institutional Execution Engine** focused on capital velocity, risk management, and narrative-based performance tracking.

## 🏗️ System Architecture (v9.5 Hardened)

The core logic has been modularized into separate "Alpha Guard" layers to reduce coupling:

1.  **`execution-engine-v9.js` (Orchestrator)**
    *   Handles the lifecycle: `ARMED → PENDING → ACTIVE`.
    *   Implements the **Alpha Guard Ranking** formula.
    *   Coordinates with Risk and Portfolio engines for final approval.

2.  **`risk-engine.js` (Safety Layer)**
    *   **Liquidity Gates**: Sizing scaled based on 24h quote volume.
    *   **Time-Stops**: Timeframe-aware patience windows (15m setups expire faster than 4H).
    *   **Momentum extension**: Automatic 100% time extension if Price > Entry.

3.  **`portfolio-engine.js` (Capital Authority)**
    *   **Category Caps**: Max 2 positions per sector (e.g., AI, MEME) in Bull; 1 in Sideway.
    *   **Regime Fit**: Scoring setups based on how well they fit the current BTC context.
    *   **Exposure Limits**: Hard caps on total risk % and concurrent positions.

4.  **`outcome-evaluator.js` (Intelligence Layer)**
    *   Tracks win/loss and R-expectancy by **Category/Narrative**.
    *   Retroactive categorization of historical signals.

---

## 🚀 Key Features Implemented

### 1. Alpha Guard Ranking & Sizing
*   **Formula**: `FinalScore = (ScanScore * 0.4) + (Confidence * 30) + (RegimeFit * 20) + (LiquidityScore * 10)`.
*   **Liquidity Scaling**: Automatic reduction of `clampedAlloc` for thin-liquidity assets.

### 2. Time-Stop Logic (Timeframe Scaling)
*   Integrated into the execution loop.
*   Momentum-based: Grants extra time only if the trade is in profit.

### 3. Narrative-Based Reporting
*   **Scan Logs**: Now tagged with categories (AI, L1, Layer2, etc.).
*   **Analytics UI**: Enhanced "Narrative Edge" dashboard identifying the best sector.

### 4. Dashboard 2.0
*   **Risk Capacity Bar**: Visual feedback on capital usage vs. regime limit.
*   **Alpha Guard Metadata**: Cards now show 💧 (Liquidity) and 🎯 (Regime Fit) scores.

---

## 📂 File Status Update

| File | Status | Key Changes in v9.5 |
| :--- | :--- | :--- |
| `execution-engine-v9.js` | **Hardened** | State machine, standardized ranking, Risk/Portfolio delegation. |
| `risk-engine.js` | **New/Refined** | Liquidity gates, Timeframe-aware time-stops, Momentum logic. |
| `portfolio-engine.js` | **New/Refined** | Category caps, Regime fit scoring, Exposure vetoes. |
| `outcome-evaluator.js` | **Enhanced** | Category performance tracking, historical fallback logic. |
| `pages/dashboard.js` | **Refactored** | Modular rendering, Risk Capacity bar, Alpha Guard badges. |
| `pages/analytics.js` | **Enhanced** | Narrative Edge statistics and sector reports. |
| `live-scanner.js` | **Updated** | Category tagging injected into scan records. |

---

## 🛠️ Data Infrastructure
*   **Source of Truth**: IndexedDB (`DB_V9`).
*   **Categorization**: Handled by `CATEGORY_ENGINE` (mapping symbols to narratives).
*   **Bootloader**: Sequential `SYSTEM_BOOT` pipeline ensures all engines load before execution.

---

## 🏁 Recommended Next Steps
1.  **Slippage Audit**: Monitor the effectiveness of volume-based sizing in live paper trading.
2.  **Backtest Alignment**: Sync the backtest engine with the new Alpha Guard ranking formula to verify edge.
3.  **Auto-Veto Tuning**: Refine category caps as more narrative data accumulates in the Outcomes database.

---
**Current State**: Production-hardened, execution-first, narrative-aware.
