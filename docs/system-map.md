# SystemTrader System Map

Quick visual map of the current runtime. Use this when the code feels too large to hold in memory.

This is a quick architecture map, not the final specification. If there is a conflict, trust current code first, then `ARCHITECTURE.md`.

## Architecture Map

```mermaid
flowchart TD
    A[index.html] --> B[app.js]
    B --> C[state-v51-auth.js]
    B --> D[live-scanner.js]

    D --> E[scanner-universe.js]
    E --> F[clean-universe.js]
    D --> G[scanner-analysis.js]
    D --> H[scanner-refinement.js]
    D --> I[alpha-guard-core-v51-auth.js]
    D --> J[scanner-persistence.js]

    I --> K[capital-engine.js]
    I --> L[portfolio-engine.js]

    J --> M[db.js]
    J --> C
    J --> N[runtime-audit.js]

    C --> O[pages/dashboard.js]
    C --> P[pages/scanner.js]

    J --> Q[learning-engine.js]
    J --> R[alert-engine.js]
    R --> S[telegram.js]
```

## Runtime Flow

```mermaid
flowchart TD
    A[Manual scan or scheduler] --> B[live-scanner.run]
    B --> C[Detect BTC context]
    C --> D[Build Binance universe]
    D --> E[Apply hygiene and liquidity filters]
    E --> F[Pre-filter candidates]
    F --> G[Deep scan and scoring]
    G --> H[Refinement and technical shortlist]
    H --> I[Alpha Guard authority run]
    I --> J[Capital global cooldown and portfolio same-symbol cooling]
    J --> K[Merge authority truth]
    K --> L[Derive deployableTop3]
    L --> M[Persist scan and patch scanMeta]
    M --> N[Dashboard / Scanner UI]
    M --> O[Runtime audit]
    M --> P[Learning / Telegram]
```

## Decision Brain

```mermaid
flowchart TD
    A[Candidate after deep scan] --> B{Pre-gate pass?}
    B -- No --> B1[WATCH / pre_gate_blocked]
    B -- Yes --> C{Dedup or portfolio block?}
    C -- Yes --> C1[REJECT / dedup]
    C -- No --> D{Tier gate pass?}
    D -- READY --> E[READY]
    D -- PLAYABLE --> F[PLAYABLE]
    D -- PROBE --> G[PROBE]
    D -- None --> D1[REJECT / all_tiers_rejected]
    E --> H{Capital allowed?}
    F --> H
    G --> H
    H -- No --> H1[REJECT / capital_guard]
    H -- Yes --> I[executionGatePassed]
    I --> J[deployableTop3 eligible]
```

## Truth Map

```mermaid
flowchart LR
    A[scanner proposedStatus] --> B[authority run]
    B --> C[authorityDecision]
    B --> D[finalAuthorityStatus]
    C --> E[displayStatus]
    D --> E
    E --> F[UI action truth]
    F --> G[deployableTop3 if approved]
```

## Quick Debug Checklist

For one coin:

1. Read `displayStatus`.
2. Read `finalAuthorityStatus`.
3. Read `authorityDecision`.
4. Read `authorityReason`.
5. Inspect `authorityTrace.rejectionsByTier`.
6. Check `executionGatePassed` and `executionActionable`.
7. Check whether it appears in `deployableTop3`.
8. Distinguish `cooldown_active_*` from capital cadence and `cooling_period_active_*` from same-symbol portfolio cooling.

For a whole scan:

1. Run `RUNTIME_AUDIT.summarizeLatest()`.
2. Check `counts.total`, `counts.*_blocked`, and `filteredCandidates`.
3. Use `blockerRanking` to find the dominant choke point.
4. Compare `technicalTop3` with `deployableTop3`.
