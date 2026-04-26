/* ══════════════════════════════════════════════════════════
   LIVE MARKET SCANNER v10.6.9.56 - MODULAR ORCHESTRATION
   Orchestration Coordinator Shell (Phase 2 Hardening)
   ══════════════════════════════════════════════════════════ */

window.LIVE_SCANNER = (() => {
  let _lastFatalAlertTime = 0;

  // --- Utility Helpers ---
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0; }
  function safeNum(v, d=0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function sanitizeSetupTaxonomy(coin) {
    if (!coin || typeof coin !== 'object') return coin;
    const structureLabel = typeof window.getStructuralSetupLabel === 'function'
      ? window.getStructuralSetupLabel(coin)
      : String(coin.setup || coin.structureTag || 'Unknown');
    const triggerLabel = typeof window.getEntryTriggerLabel === 'function'
      ? window.getEntryTriggerLabel(coin)
      : String(coin.entrySignal || coin.entryTiming || 'wait');
    return {
      ...coin,
      setup: structureLabel || 'Unknown',
      structureTag: structureLabel || coin.structureTag || 'Unknown',
      entrySignal: triggerLabel || 'wait',
      entryTiming: String(coin.entryTiming || triggerLabel || 'wait')
    };
  }

  /**
   * Main Scan Orchestration Loop
   */
  async function run(progressCb = null, opts = {}) {
    const startedAt = Date.now();
    const timings = { total: 0 };
    const mark = (key) => { timings[key] = Date.now() - (timings._last || startedAt); timings._last = Date.now(); };

    try {
      // 1. Discovery Phase (Universe)
      progressCb?.('Đang phát hiện bối cảnh thị trường...', 5);
      const btcContext = await window.SCANNER_UNIVERSE.detectBTCContext();
      mark('context_detection');

      progressCb?.('Đang build live universe từ Binance...', 10);
      const cfg = window.SCANNER_UNIVERSE.regimeConfig(btcContext);
      const liveUniverse = await window.SCANNER_UNIVERSE.buildLiveUniverse({
        btcContext,
        minQuoteVolume: opts.minQuoteVolume || cfg.minQuoteVolume,
        maxQuoteVolume: opts.maxQuoteVolume || cfg.maxQuoteVolume,
        minTrades: opts.minTrades || cfg.minTrades,
        maxAbs24hPump: opts.maxAbs24hPump || cfg.maxAbs24hPump,
      });
      mark('universe');

      // 2. Shortlist Phase
      const candidates = window.SCANNER_UNIVERSE.preFilterCandidates(liveUniverse, {
        minPreScore: opts.minPreScore || 4,
        maxCandidates: opts.maxCandidates || cfg.maxCandidates,
      });
      progressCb?.(`Shortlist: ${candidates.length} coin`, 35);
      mark('shortlist');

      // 3. Deep Analysis Phase
      // klineCache: external map passed into performScanLoop.
      // SCANNER_REFINEMENT.performScanLoop will populate it if it accepts the 4th argument.
      // MBE will reuse it to avoid extra API calls.
      const klineCache = {};
      const { results, fetchFailedSymbols, symbolTimings } = await window.SCANNER_REFINEMENT.performScanLoop(
        candidates, btcContext, progressCb, klineCache
      );
      mark('deep_scan');

      // 4. Refinement & Alpha Guard Phase
      const stabilityState = window.SCANNER_REFINEMENT.getStabilitySnapshot();
      const { sorted, insight, top3, portfolio } = window.SCANNER_REFINEMENT.applyPostScanRefinement(results, btcContext, stabilityState);
      mark('refinement');

      // 5. Authority Engine Sync
      let authorityCoins = sorted;
      if (window.EXECUTION_ENGINE_V9?.run) {
        progressCb?.('Đang đồng bộ Authority Engine...', 90);
        const authorityPriceMap = {};
        const authorityInput = (Array.isArray(sorted) ? sorted : []).map(sanitizeSetupTaxonomy);
        authorityInput.forEach(c => { if (c.symbol && c.price > 0) authorityPriceMap[c.symbol.toUpperCase()] = c.price; });
        const authorityRun = await window.EXECUTION_ENGINE_V9.run(authorityInput, btcContext, 0, authorityPriceMap);
        authorityCoins = window.SCANNER_REFINEMENT.mergeAuthorityCoins(authorityInput, authorityRun);
      }
      mark('authority_run');

      // 6. Persistence & Finalization
      progressCb?.('Đang lưu trữ dữ liệu phiên quét...', 95);
      const contractSummary = runContractAudit(authorityCoins);
      window.__LAST_SCAN_CONTRACT_SUMMARY__ = contractSummary;

      const technicalTop3 = (Array.isArray(sorted) ? sorted : []).slice(0, 3);

      // ── FREEZE deployableTop3 BEFORE Market Behavior Evidence ────────────
      // deployableTop3 is derived HERE as a snapshot of authority-approved coins.
      // MBE runs AFTER this line — it cannot affect membership, order, or eligibility.
      // This snapshot is passed into sessionContext and persisted unchanged.
      // Refinement: per approval, behavior fields are guaranteed on persisted signals,
      // NOT necessarily on deployableTop3 snapshot entries.
      const deployableTop3 = window.SCANNER_REFINEMENT.deriveDeployableTop3(authorityCoins);
      // ─────────────────────────────────────────────────────────────────────

      // ── Market Behavior Evidence — observe-only (Phase 1) ────────────────
      // Enriches authorityCoins with behavior fields AFTER deployableTop3 is frozen.
      // AUTHORITY CONTRACT: MBE must NOT change:
      //   displayStatus, finalAuthorityStatus, authorityDecision,
      //   executionGatePassed, executionBreakdown, or any authority field.
      // deployableTop3 snapshot above is fully unaffected.
      // Fail-safe: if MBE errors, enrichedCoins = authorityCoins (original, unchanged).
      let enrichedCoins = authorityCoins;
      if (window.MARKET_BEHAVIOR_ENGINE?.enrich) {
        try {
          enrichedCoins = authorityCoins.map(coin => {
            const klines = (klineCache && klineCache[coin.symbol]) || null;
            return window.MARKET_BEHAVIOR_ENGINE.enrich(coin, klines, btcContext);
          });
          console.log('[MBE] Behavior evidence enriched for', enrichedCoins.length, 'coins',
            '| inputQuality sample:', enrichedCoins[0]?.behaviorInputQuality || 'n/a');
        } catch (mbeErr) {
          console.warn('[MBE] Enrichment batch failed — using un-enriched coins', mbeErr?.message);
          enrichedCoins = authorityCoins; // fail-safe: revert to original
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      const finalizedAt = Date.now();

      const sessionContext = {
        btcContext, insight, top3, technicalTop3, deployableTop3, portfolio,
        startedAt,
        finalizedAt,
        durationMs: finalizedAt - startedAt,
        opts,
        candidatesCount: candidates.length,
        liveUniverseCount: liveUniverse.length,
        regime: window.ST?.scanMeta?.regime || {}
      };

      // Persist enrichedCoins (with behavior fields).
      // deployableTop3 in sessionContext is the pre-MBE authority snapshot.
      await window.SCANNER_PERSISTENCE.finalizeScanSession(enrichedCoins, fetchFailedSymbols, sessionContext);

      const totalDuration = Date.now() - startedAt;
      timings.total = totalDuration;
      window.__LAST_SCAN_STAGE_TIMINGS__ = timings;

      // Performance Budget Calculation (Target: 30s)
      const BUDGET_MS = 30000;
      window.__LAST_SCAN_PERF_BUDGET__ = {
        budgetMs: BUDGET_MS,
        consumedMs: totalDuration,
        usagePct: Math.round((totalDuration / BUDGET_MS) * 100),
        status: totalDuration > BUDGET_MS ? 'OVER_BUDGET' : 'HEALTHY'
      };

      // Slow Symbols Identification
      window.__LAST_SCAN_SLOW_SYMBOLS__ = (symbolTimings || [])
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5);

      // Quality Summary
      const qualitySummary = {
        ready:     enrichedCoins.filter(c => String(c.status).toUpperCase() === 'READY').length,
        playable:  enrichedCoins.filter(c => String(c.status).toUpperCase() === 'PLAYABLE').length,
        probe:     enrichedCoins.filter(c => String(c.status).toUpperCase() === 'PROBE').length,
        watch:     enrichedCoins.filter(c => String(c.status).toUpperCase() === 'WATCH').length,
        avoid:     enrichedCoins.filter(c => String(c.status).toUpperCase() === 'AVOID').length,
        fetch_fail: fetchFailedSymbols.length
      };
      window.__LAST_SCAN_QUALITY_SUMMARY__ = qualitySummary;

      window.__LAST_SCAN_COORDINATOR_SUMMARY__ = {
        scanId: window.ST?.scanMeta?.lastScanId,
        symbols: enrichedCoins.length,
        violations: contractSummary.violationCount,
        duration: totalDuration,
        durationMs: totalDuration
      };

      progressCb?.('✅ Alpha Guard orchestration complete', 100);
      return { coins: enrichedCoins, top3: deployableTop3, timings, durationMs: totalDuration };

    } catch (err) {
      console.error('[LIVE_SCANNER] Orchestration Error:', err);
      handleFatalError(err);
      throw err;
    }
  }

  function runContractAudit(coins) {
    const summary = { valid: 0, violationCount: 0, breakdown: { READY: 0, PLAYABLE: 0, PROBE: 0, WATCH: 0 } };
    coins.forEach(c => {
      const v = ST.validateAuthorityContract ? ST.validateAuthorityContract(c) : { ok: true };
      if (!v.ok) summary.violationCount++; else summary.valid++;
      const status = String(c.status || 'WATCH').toUpperCase();
      if (summary.breakdown[status] !== undefined) summary.breakdown[status]++;
    });
    return summary;
  }

  function handleFatalError(err) {
    const msg = String(err?.message || err || 'fatal');
    if (msg.includes('FATAL_GATE_ERROR') || msg.includes('PORTFOLIO_ENGINE_DOWN')) {
      const banner = document.getElementById('system-fatal-banner') || (() => {
        const b = document.createElement('div'); b.id = 'system-fatal-banner'; b.className = 'fatal-banner';
        document.body.appendChild(b); return b;
      })();
      banner.innerHTML = '🚨 PORTFOLIO ENGINE DOWN – TRADING HALTED';
    }
  }

  return { run };
})();

// Global Helper
window.buildTradePlan = function(coin) {
  const entry = Number(coin?.entry || coin?.price || 0);
  const stop = Number(coin?.stop || 0);
  const tp1 = Number(coin?.tp1 || entry * 1.08);
  const rr = (entry - stop) > 0 ? (tp1 - entry) / (entry - stop) : 0;
  return {
    entry, stop, tp1, rr,
    reason: `${coin?.setup || 'Setup'} · Trigger ${coin?.entrySignal || 'wait'} · RR ${rr.toFixed(1)}x`
  };
};
