# v9.6 Authority Unified

Core change:
- Execution Engine v9 is now the final authority for actionable state.
- Scanner Top-Gate, Dashboard counters, and Scan History persistence now read from the same post-engine authority set.

What changed:
- `live-scanner.js`
  - calls `EXECUTION_ENGINE_V9.run(sorted, btcContext, 0, null)` after post-scan refinement
  - merges engine verdicts back into the scanner coin set
  - derives Top-Gate from authority-approved coins only
  - persists unified final coins, not pre-authority snapshots
- `execution-sync.js`
  - fixed READY / PLAYABLE / PROBE counting to use `executionTier`, not CSS class mismatch
- `state.js`
  - normalized display status mapping to one authority vocabulary: READY / PLAYABLE / PROBE / WATCH / AVOID
- `pages/dashboard.js`
  - removed legacy EXECUTION/ACTIVE mixed counting for summary badges
- `pages/scan-history.js`
  - aligned actionable breakdown and row sort/badge logic to unified status mapping
- `pages/scanner.js`
  - Top-Gate/UI actionable badges aligned to READY / PLAYABLE / PROBE only

Expected result after one fresh scan:
- Scanner Top-Gate = authority-approved setups only
- Dashboard badges = same authority-approved counts
- Scan History actionable count = same authority-approved counts

Known note:
- Existing old IndexedDB data may still reflect legacy statuses until a fresh scan writes new authority-unified records.
