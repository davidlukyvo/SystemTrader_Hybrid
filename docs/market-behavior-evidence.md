# Market Behavior Evidence Layer

## Phase 1 — Observe Only

This document describes the Market Behavior Evidence Layer added in Phase 1.

> **This layer is observe-only.** It does NOT replace Alpha Guard and does NOT change any trading decisions.

---

## Purpose

Move beyond simple TA/structure labels by quantifying measurable market behavior around
entry, stop, and TP zones using existing OHLCV-derived data. Enriches persisted signals
for future analytics and retrospective study.

---

## Authority Contract (Invariant)

Phase 1 **does NOT change**:

- `displayStatus`, `finalAuthorityStatus`, `authorityDecision`
- `deployableTop3`, `executionBreakdown`, `executionGatePassed`
- `executionActionable`, `executionConfidence`
- Capital sizing, cooldowns, portfolio vetoes
- Telegram alert eligibility or content
- Learning pool assignment

---

## Pipeline Position

```
Alpha Guard authority run
  → mergeAuthorityCoins
    → deriveDeployableTop3          ← FROZEN HERE
      → market-behavior-engine.js   ← MBE enrichment (receives klineCache from scanner-refinement)
        → scanner-persistence.js    ← persists enrichedCoins
```

`deployableTop3` is derived **before** MBE runs. MBE cannot affect its membership,
order, or eligibility. Behavior fields are guaranteed on **persisted signals**, not
necessarily on `deployableTop3` snapshot entries.

---

## Volume Approximation Policy

Phase 1 has no access to real order book or volume profile data.
All volume-zone metrics are **approximations** from OHLCV candles.

The system uses a **multi-timeframe klineCache** populated during the main scan loop
to provide high-fidelity OHLCV inputs when available.

Each signal carries:
- `behaviorInputQuality`: `'full_ohlcv'` (standard) | `'partial'` | `'derived_only'`
- `behaviorApproximationNotes`: string[] describing which fields were approximated
- `behaviorEngineVersion`: `'v1.0-ohlcv-approx'` — signals the approximation tier

---

## Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `behaviorEvidence` | object | 9 boolean behavior flags (see below) |
| `priceZoneQuality` | 0–100 | Entry/stop/TP zone cleanliness (approx) |
| `volumeSupportScore` | 0–100 | Volume support near entry (OHLCV approx) |
| `volumeResistanceRisk` | 0–100 | TP path blockage risk (OHLCV approx) |
| `pathToTPQuality` | 0–100 | Entry → TP1 route quality |
| `failureModeCandidate` | string[] | Likely failure modes (see enum) |
| `behaviorInputQuality` | string | Data quality tier for this signal |
| `behaviorApproximationNotes` | string[] | Per-field approximation disclosures |
| `behaviorEngineVersion` | string | `'v1.0-ohlcv-approx'` |
| `behaviorComputedAt` | number | Unix timestamp of enrichment |

### behaviorEvidence flags

| Flag | Meaning |
|------|---------|
| `absorptionEvidence` | VSA absorption or high-vol bullish close near entry |
| `reclaimEvidence` | Price reclaimed key level (reclaimBreak / LPS signal) |
| `breakoutAcceptance` | Breakout setup with volume follow-through |
| `failedBreakdownEvidence` | Price swept below support but recovered (spring) |
| `sellingExhaustion` | Shrinking spread + declining volume near stop zone |
| `volumeExpansion` | relVol spike ≥ 1.5 on recent candles |
| `lateEntryRisk` | Entry is late (chartEntryQuality or momentum signal) |
| `stopTooTightRisk` | Stop distance < 0.7% of entry price |
| `noFollowThroughRisk` | Breakout setup but volume not confirming |

### failureModeCandidate enum

`entryTooLate` | `stopTooTight` | `volumeWallRejected` | `noFollowThrough` |
`fakeBreakoutRisk` | `liquidityTrap` | `btcRegimeRisk` | `unknown`

---

## Persistence

Behavior fields are stored in IndexedDB alongside the signal record via the normal
`addScanWithSignalsAtomic` path. No schema version bump is required — IndexedDB stores
arbitrary objects. Old signals without behavior fields load normally (fields are `undefined`).

Export JSON (`DB.exportAll()`) includes behavior fields automatically.

---

## UI Display

Scan History signal table shows a `🔬` button per signal row when `behaviorEvidence`
is present. Clicking toggles an inline evidence panel showing:
- Scores (zone quality, vol support, TP risk, path quality)
- Boolean flags
- Failure modes
- Input quality tier and approximation notes

The panel is **labeled "observe-only"** and includes the note "not used in trade decisions".

---

## Future Phases

Phase 2+ may use accumulated outcome data to evaluate whether any behavior evidence
should become a soft gate preference in signal ranking. This requires:

1. Sufficient accumulated outcome data (minimum sample size TBD)
2. Explicit approval per `GOVERNANCE.md` before implementation
3. Regression testing against the authority decision baseline
4. No change to hard authority thresholds without a full audit

Phase 2 changes must be reviewed as a separate spec — this document covers Phase 1 only.
