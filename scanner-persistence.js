/* ══════════════════════════════════════════════════════════
   SCANNER MODULE: PERSISTENCE
   Handles database writes and session state finalization.
   Uses ST helper setters from Phase 1.
   ══════════════════════════════════════════════════════════ */

window.SCANNER_PERSISTENCE = (() => {
  'use strict';

  function cloneJson(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function buildScanCache(results = [], deployableTop3 = [], priorCache = {}, sessionContext = {}) {
    const rows = Array.isArray(results) ? results : [];
    const displayStatusOf = (coin) => String(
      coin?.displayStatus ||
      coin?.finalAuthorityStatus ||
      coin?.status ||
      'WATCH'
    ).toUpperCase();
    const ready = rows.filter(c => displayStatusOf(c) === 'READY').length;
    const playable = rows.filter(c => displayStatusOf(c) === 'PLAYABLE').length;
    const probe = rows.filter(c => displayStatusOf(c) === 'PROBE').length;
    const actionable = ready + playable + probe;
    const finalizedAt = Number(sessionContext?.finalizedAt || Date.now());

    return {
      ...((priorCache && typeof priorCache === 'object' && !Array.isArray(priorCache)) ? priorCache : {}),
      executionBuckets: `R ${ready} / P ${playable} / Pr ${probe}`,
      tradePanel: actionable > 0 ? 'ACTIONABLE / REVIEW' : 'WATCH / NO_ACTIONABLE',
      qualifiedCount: ready,
      playableCount: playable,
      actionableCount: actionable,
      portfolioActive: actionable,
      allocationHint: actionable > 0 ? `${Math.max(ready, playable, probe)} setups` : '0%',
      cacheScanId: String(sessionContext?.scanId || ''),
      cacheScanTs: finalizedAt,
      cacheBuiltAt: finalizedAt,
      latestDeployableSymbols: Array.isArray(deployableTop3) ? deployableTop3.map(c => c?.symbol).filter(Boolean) : [],
    };
  }

  async function persistScanData(results, sessionContext) {
    if (!window.DB || !results) return;
    const finalizedAt = Number(sessionContext?.finalizedAt || Date.now());
    const scanId = String(sessionContext?.scanId || `scan-${finalizedAt}`);
    const source = String(sessionContext?.opts?.scanSource || sessionContext?.source || 'SYSTEM_TRADER_V9_3_1');
    const trigger = String(sessionContext?.opts?.scanTrigger || sessionContext?.trigger || source);
    const insight = cloneJson(sessionContext?.insight || {});
    // `top3` is a legacy READY-only shortlist kept for compatibility.
    // Do not treat it as the runtime actionable or alert shortlist.
    const top3 = cloneJson(Array.isArray(sessionContext?.top3) ? sessionContext.top3 : []);
    const deployableTop3 = cloneJson(Array.isArray(sessionContext?.deployableTop3) ? sessionContext.deployableTop3 : []);
    // P2-B: Separate technicalTop3 from deployableTop3 — they are different truth bases.
    // technicalTop3 = explicit technical shortlist before capital/regime suppression.
    // deployableTop3 = runtime authority-approved shortlist for alerts and actionable UI.
    const technicalTop3 = cloneJson(Array.isArray(sessionContext?.technicalTop3)
      ? sessionContext.technicalTop3
      : top3  // fallback to legacy READY-only top3 if no explicit technical shortlist is passed
    );
    const finalizedCoins = cloneJson(Array.isArray(results) ? results : []);
    const durationMs = Number(sessionContext?.durationMs || 0);

    // P2-A + Patch B: Pre-compute executionBreakdown from finalizedCoins at write time.
    // This fixes eb.ready=0 when qualifiedCoins has items — a write-order artifact
    // caused by scanRecord not having executionBreakdown before normalizeScanRecord runs.
    //
    // ── SEMANTIC CONTRACT: three constructs, two scopes ──────────────────────────
    //
    //  deployableTop3
    //    = deployable shortlist across READY / PLAYABLE / PROBE (up to 3 coins)
    //    built by: deriveDeployableTop3(isFinalDeployableCoin) in scanner-refinement.js
    //    criterion: displayStatus IN [READY,PLAYABLE,PROBE] + authorityDecision IN [ALLOW,WAIT]
    //               + executionGatePassed === true
    //
    //  executionQualifiedCount                          ← READY-tier qualified count only
    //  qualifiedCount   (deprecated alias, always ===)  ← READY-tier qualified count only
    //  qualifiedCoins                                   ← READY-tier symbols only
    //  eb.ready                                         ← READY-tier count only
    //    = count / symbols of coins that reached the READY (strictest) authority tier
    //    does NOT include PLAYABLE or PROBE gate-passed coins
    //
    //  eb.actionable
    //    = gate-passed actionable count across READY + PLAYABLE + PROBE lanes
    //    = eb_ready + eb_playable + eb_probe
    //    = same scope as len(deployableTop3) (before .slice(0,3))
    //
    // INVARIANT: eb.actionable >= executionQualifiedCount always
    //   A scan with deployableTop3=[SEI(PLAYABLE),AVAX(PROBE)] and executionQualifiedCount=0
    //   is NOT a mismatch. eb.actionable=2, executionQualifiedCount=0 is correct:
    //   2 coins passed all gates across READY/PLAYABLE/PROBE lanes, but 0 reached READY tier.
    //   scanTruthBasis='actionable_no_ready' documents this state explicitly (debug only).
    // ────────────────────────────────────────────────────────────────────────────
    const displayStatusOf = (coin) => String(
      coin?.displayStatus || coin?.finalAuthorityStatus || coin?.status || 'WATCH'
    ).toUpperCase();
    const eb_ready    = finalizedCoins.filter(c => displayStatusOf(c) === 'READY').length;    // executionQualifiedCount scope
    const eb_playable = finalizedCoins.filter(c => displayStatusOf(c) === 'PLAYABLE').length; // part of eb.actionable
    const eb_probe    = finalizedCoins.filter(c => displayStatusOf(c) === 'PROBE').length;    // part of eb.actionable
    const eb_actionable = eb_ready + eb_playable + eb_probe; // gate-passed actionable count across READY+PLAYABLE+PROBE lanes

    const qualifiedCoinSymbols = finalizedCoins
      .filter(c => displayStatusOf(c) === 'READY')
      .map(c => c.symbol).filter(Boolean);


    // P2-C: Label scan truth basis so noTrade+eqc>0 ambiguity is self-documenting.
    const hasCapitalSuppression = !!(sessionContext?.regime?.noTrade
      || sessionContext?.proEdge?.disableTrading
      || sessionContext?.capitalSuppressed);
    const scanTruthBasis = (hasCapitalSuppression && eb_ready > 0)
      ? 'technical_qualified_capital_suppressed'
      : eb_ready > 0
        ? 'execution_qualified'
        : eb_actionable > 0
          ? 'actionable_no_ready'
          : 'no_actionable';

    const cache = buildScanCache(finalizedCoins, deployableTop3, window.ST?.scanMeta?.cache, { ...sessionContext, finalizedAt, scanId });
    
    try {
      // 1. Save to Database (Atomic Scan + signals) — P2-A: include pre-computed counts
      await DB.addScanWithSignalsAtomic({ 
        id: scanId, 
        timestamp: finalizedAt, 
        insight, 
        top3,
        deployableTop3,
        durationMs,
        // P2-A: executionBreakdown computed from finalizedCoins before DB write
        executionQualifiedCount: eb_ready,
        qualifiedCount: eb_ready,
        executionBreakdown: {
          ready: eb_ready,
          execution: eb_ready,
          playable: eb_playable,
          probe: eb_probe,
          actionable: eb_actionable,
          rejected: 0,
        },
        qualifiedCoins: qualifiedCoinSymbols,
        // P2-C: scanTruthBasis for noTrade+eqc disambiguation
        scanTruthBasis,
      }, finalizedCoins);
      console.log('[SCANNER_PERSISTENCE] Scan & Signals saved to DB:', scanId, '| truthBasis:', scanTruthBasis);
      
      // 2. Synchronize window.ST State (Authority Truth)
      if (window.ST?.setCoins) {
        window.ST.setCoins(finalizedCoins);
        if (typeof window.syncWatchlistFromCoins === 'function') {
          window.syncWatchlistFromCoins();
        }
      }
      
      if (window.ST?.patchScanMeta) {
        window.ST.patchScanMeta({
          lastScan: finalizedAt,
          lastScanId: scanId,
          lastScanTs: finalizedAt,
          source,
          status: 'idle',
          coins: finalizedCoins,
          insight,
          top3,
          // P2-B: technicalTop3 is the scanner shortlist (before capital suppression),
          // deployableTop3 is the authority-approved capital-eligible shortlist.
          // Do NOT alias technicalTop3 = top3 blindly — use explicit sessionContext field.
          technicalTop3,
          deployableTop3,
          authoritativeTop3: deployableTop3,
          authoritativeTop3Legacy: deployableTop3.length === 0,
          cache,
          durationMs,
          lastScanSource: source,
          lastScanTrigger: trigger,
          // P2-A: thread counts through to ST state for dashboard consistency
          executionBreakdown: {
            ready: eb_ready,
            execution: eb_ready,
            playable: eb_playable,
            probe: eb_probe,
            actionable: eb_actionable,
          },
          executionQualifiedCount: eb_ready,
          // P2-C: expose truth basis on ST state for debugging
          scanTruthBasis,
        });
        console.log('[SCANNER_PERSISTENCE] ST.scanMeta patched with authority data.');
      }

      // 3. Removed local buildDataset(results) to prevent duplicate learning build. Pro Edge handles system-wide DB build.

      console.log('[SCANNER_PERSISTENCE] Global state sync complete.');
    } catch (err) {
      console.error('[SCANNER_PERSISTENCE] Sync chain failed:', err);
    }
  }


  function shouldPersistSignal(coin) {
    if (!coin) return false;
    const status = String(coin.status || '').toLowerCase();
    return ['ready', 'playable', 'probe'].includes(status);
  }

  async function finalizeScanSession(results, fetchFailedSymbols, sessionContext) {
    const duration = sessionContext?.durationMs || 0;
    console.log('[SCANNER_PERSISTENCE] Finalizing session... Duration:', duration, 'ms');
    
    // Core Fix: Trigger the persistence and sync chain
    await persistScanData(results, sessionContext);
    
    // Final UI refresh notification
    if (typeof window.renderScanner === 'function') {
      console.log('[SCANNER_PERSISTENCE] Triggering UI refresh...');
      window.renderScanner();
    }
  }

  return { persistScanData, finalizeScanSession, shouldPersistSignal };
})();
