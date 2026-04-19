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
    const top3 = cloneJson(Array.isArray(sessionContext?.top3) ? sessionContext.top3 : []);
    const deployableTop3 = cloneJson(Array.isArray(sessionContext?.deployableTop3) ? sessionContext.deployableTop3 : []);
    const finalizedCoins = cloneJson(Array.isArray(results) ? results : []);
    const durationMs = Number(sessionContext?.durationMs || 0);
    const cache = buildScanCache(finalizedCoins, deployableTop3, window.ST?.scanMeta?.cache, { ...sessionContext, finalizedAt, scanId });
    
    try {
      // 1. Save to Database (Atomic Scan + signals)
      await DB.addScanWithSignalsAtomic({ 
        id: scanId, 
        timestamp: finalizedAt, 
        insight, 
        top3,
        deployableTop3,
        durationMs
      }, finalizedCoins);
      console.log('[SCANNER_PERSISTENCE] Scan & Signals saved to DB:', scanId);
      
      // 2. Synchronize window.ST State (Authority Truth)
      if (window.ST?.setCoins) {
        window.ST.setCoins(finalizedCoins);
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
          technicalTop3: top3,
          deployableTop3,
          authoritativeTop3: deployableTop3,
          authoritativeTop3Legacy: true,
          cache,
          durationMs,
          lastScanSource: source,
          lastScanTrigger: trigger,
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
