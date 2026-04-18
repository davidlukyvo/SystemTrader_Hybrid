/* ══════════════════════════════════════════════════════════════════════════
   EXECUTION SYNC — Display Layer ONLY (v9.2.1)
   ──────────────────────────────────────────────────────────────────────────
   CAPITAL AUTHORITY: ZERO. This is a READ-ONLY display adapter.
   ExecutionTier is set exclusively by EXECUTION_ENGINE_V9. Never here.

   FIX #3 (v9.2.1): EXECUTION tier renamed to READY — all display mappings updated.
                     tierToDisplayClass EXECUTION → 'active' removed.
                     tierToDisplayClass READY → 'ready'.

   FIX #4 (v9.2.1): positionState (ARMED|PENDING|ACTIVE) is NEVER used as a
                     signal timing indicator. Added positionStateToDisplayClass()
                     as a separate display helper for lifecycle badges.
                     signalEntryTiming = scanner metadata stored on position.
                     'active' as a timing string is NEVER written to positionState.

   Role:
     - Format coin executionTier for display (badge colors, labels, sort order)
     - Build the tradePanel string from engine-classified signals
     - Compute portfolio display metrics from existing DB positions
     - NOT a gate. NOT a classifier. NOT a capital allocator.
   ══════════════════════════════════════════════════════════════════════════ */

window.EXECUTION_SYNC = (() => {
  'use strict';

  /* ── Helpers ────────────────────────────────────────────────────────── */

  function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
  function upper(v)    { return String(v || '').toUpperCase(); }

  /* ── Tier Display (executionTier only) ──────────────────────────────── */

  /**
   * Map executionTier (set by EXECUTION_ENGINE_V9) to a CSS display class.
   * FIX #3: EXECUTION removed. READY → 'ready'.
   * These classes represent CAPITAL TIER — not lifecycle state.
   */
  function tierToDisplayClass(tier) {
    switch (upper(tier)) {
      case 'READY':    return 'ready';     // FIX #3: was EXECUTION → 'active'
      case 'PLAYABLE': return 'playable';
      case 'PROBE':    return 'probe';
      case 'OBSERVE':  return 'observe';
      default:         return 'watch';
    }
  }

  function tierToRank(tier) {
    switch (upper(tier)) {
      case 'READY':    return 4;           // FIX #3: was EXECUTION
      case 'PLAYABLE': return 3;
      case 'PROBE':    return 2;
      case 'OBSERVE':  return 1;
      default:         return 0;
    }
  }

  /* ── Position State Display (positionState only) ────────────────────── */

  /**
   * FIX #4: Lifecycle state → CSS class — completely separate from tierToDisplayClass.
   * Use this for the position lifecycle badge (ARMED / PENDING / ACTIVE / ...).
   * NEVER use positionState as a timing indicator.
   */
  function positionStateToDisplayClass(state) {
    switch (upper(state)) {
      case 'ARMED':        return 'state-armed';
      case 'PENDING':      return 'state-pending';
      case 'ACTIVE':       return 'state-active';
      case 'PARTIAL_EXIT': return 'state-partial';
      case 'CLOSED_WIN':   return 'state-win';
      case 'CLOSED_LOSS':  return 'state-loss';
      case 'EXPIRED':      return 'state-expired';
      case 'INVALIDATED':  return 'state-invalidated';
      case 'REJECTED_STATE': return 'state-error';
      default:             return 'state-unknown';
    }
  }

  /* ── Coin Enrichment ────────────────────────────────────────────────── */

  /**
   * Enrich a coin for UI display.
   * Reads executionTier and positionState — never sets them.
   * FIX #3: _displayActionable checks for READY (not EXECUTION).
   * FIX #4: _displayStateClass added for lifecycle badge — separate from _displayClass.
   */
  function toDisplayCoin(coin) {
    if (!coin || typeof coin !== 'object') return coin;
    // v10.6.9.51: Absolute Authority Sync (Priority: displayStatus -> finalAuthority -> tier)
    const tier = upper(coin.displayStatus || coin.finalAuthorityStatus || coin.executionTier || coin.status || '');
    const pState = upper(coin.positionState || '');
    return {
      ...coin,
      // Tier display (capital authority tier — from engine only)
      _displayClass:      tierToDisplayClass(tier),
      _displayRank:       tierToRank(tier),
      _displayActionable: ['READY', 'PLAYABLE', 'PROBE'].includes(tier),  // FIX #3
      _displayLabel:      tier || 'WATCH',
      
      // Phase 3 Authority Metadata (Audit Trace)
      _authorityDecision: upper(coin.authorityDecision || coin.decision || 'REJECT'),
      _authorityReason:   coin.authorityReason || coin.reason || null,
      _authorityBlockers: Array.isArray(coin.authorityBlockers) ? coin.authorityBlockers : (Array.isArray(coin.rejections) ? coin.rejections : []),
      _gatePassed:        coin.executionGatePassed === true,

      // FIX #4: Lifecycle state display (separate from tier class)
      _displayStateClass: positionStateToDisplayClass(pState),
      _displayStateLabel: pState || 'UNKNOWN',
      // Pass-through — never overwritten here
      executionTier:      coin.executionTier,
      positionState:      coin.positionState,
    };
  }

  /* ── Portfolio Summary ──────────────────────────────────────────────── */

  /**
   * Build portfolio summary for dashboard display.
   * Feature #3: execution panel shows ONLY actionable tiers (PROBE/PLAYABLE/READY).
   *             WATCH coins are excluded from panel rows — no allocation, no display.
   * Feature #5: scanSummary passed through for dashboard count alignment.
   */
  function summarizeForDisplay(coins, scanSummary) {
    const allRows   = (Array.isArray(coins) ? coins : []).map(toDisplayCoin);
    // Feature #3: panel = actionable only; WATCH excluded from execution display
    const panelRows = allRows.filter(c => c._displayActionable);
    const ready     = panelRows.filter(c => upper(c.executionTier) === 'READY');
    const playable  = panelRows.filter(c => upper(c.executionTier) === 'PLAYABLE');
    const probe     = panelRows.filter(c => upper(c.executionTier) === 'PROBE');
    const actionable = panelRows;

    const avgConf = actionable.length
      ? actionable.reduce((s, c) => s + n(c.executionConfidence), 0) / actionable.length
      : 0;

    const best = [...actionable].sort((a, b) =>
      (tierToRank(b.executionTier) * 10 + n(b.rr)) -
      (tierToRank(a.executionTier) * 10 + n(a.rr))
    )[0] || null;

    const tradePanel = actionable.length
      ? `${best?.symbol || '—'} · ${upper(best?.executionTier || 'READY')} · R ${ready.length} / P ${playable.length} / Pr ${probe.length} · conf ${Math.round(avgConf * 100)}%`
      : 'WATCH / NO_ACTIONABLE';

    const capitalRegimeHint = ready.length    ? 'READY_DEPLOYED'
                            : playable.length ? 'PLAYABLE_ACTIVE'
                            : probe.length    ? 'PROBE_ACTIVE'
                            : 'OBSERVE';

    const watchCount = allRows.length - panelRows.length;

    return {
      version:                'v9.6.0-authority-unified',
      generatedAt:            Date.now(),
      coins:                  panelRows,   // Feature #3: execution panel — WATCH excluded
      allCoins:               allRows,     // full scanner output (for watchlist/debug)
      counts:                 { ready: ready.length, playable: playable.length, probe: probe.length, watch: watchCount },
      actionableCount:        actionable.length,
      avgExecutionConfidence: Number(avgConf.toFixed(4)),
      bestCoin:               best,
      tradePanel,
      capitalRegimeHint,
      executionBucketsLabel:  `R ${ready.length} / P ${playable.length} / Pr ${probe.length}`,
      scanSummary:            scanSummary || null,  // Feature #5: scan vs dashboard alignment
    };
  }

  /* ── Ingest & SyncRuntime ───────────────────────────────────────────── */

  function ingest(targetST, explicitCoins = [], scanSummary) {
    const safeST = targetST || window.ST;
    const coins  = Array.isArray(explicitCoins) && explicitCoins.length
      ? explicitCoins
      : (Array.isArray(safeST?.coins) ? safeST.coins : []);

    const display = summarizeForDisplay(coins, scanSummary);

    if (safeST) {
      safeST.executionDisplay       = display;
      safeST.tradePanel             = safeST.tradePanel || {};
      safeST.tradePanel.current     = display.tradePanel;
      safeST.tradePanel.bestSymbol  = display.bestCoin?.symbol || null;
      safeST.tradePanel.regime      = display.capitalRegimeHint;
      if (safeST.scanMeta) {
        safeST.scanMeta.cache                  = safeST.scanMeta.cache || {};
        safeST.scanMeta.cache.executionBuckets = display.executionBucketsLabel;
        safeST.scanMeta.cache.tradePanel       = display.tradePanel;
        safeST.scanMeta.cache.scanSummary      = display.scanSummary;  // Feature #5
      }
    }
    return display;
  }

  function syncRuntime(targetST, explicitCoins = []) {
    const safeST  = targetST || window.ST;
    const display = ingest(safeST, explicitCoins);

    const capitalFlow = window.CAPITAL_FLOW?.build
      ? window.CAPITAL_FLOW.build({ coins: display.coins, marketHealthScore: n(safeST?.scanMeta?.insight?.marketHealthScore, 5) })
      : null;

    if (capitalFlow && safeST) {
      safeST.capitalFlow = capitalFlow;
      if (safeST.scanMeta) safeST.scanMeta.capitalFlow = capitalFlow;
    }
    return display;
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  return {
    // Tier display (executionTier only)
    toDisplayCoin,
    tierToDisplayClass,
    tierToRank,

    // FIX #4: Lifecycle state display (positionState only — never mixed with tier)
    positionStateToDisplayClass,

    // Portfolio summary
    summarizeForDisplay,

    // Integration helpers (display only — no capital authority)
    ingest,
    syncRuntime,

    // Legacy compat shims (no-ops for existing call sites)
    normalizeCoin: coin => toDisplayCoin(coin),
    getOrBuild:    (st, coins) => syncRuntime(st, coins),
    extractCoins:  (st, explicit) => Array.isArray(explicit) && explicit.length ? explicit : (st?.coins || []),
  };
})();
