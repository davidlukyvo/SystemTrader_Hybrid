/* ══════════════════════════════════════════════════════════
   SCANNER MODULE: REFINEMENT & RANKING
   Handles Alpha Guard gates, sizing, ranking, and portfolio planning.
   ══════════════════════════════════════════════════════════ */

window.SCANNER_REFINEMENT = (() => {
  'use strict';

  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const upper = (v) => String(v || '').toUpperCase().trim();

  function resistanceLevels(h4, d1, entry) {
    const highs4h = h4.slice(-48).map(x => x.high).sort((a,b) => a-b);
    const dailyHigh = Math.max(...d1.slice(-30).map(x => x.high));
    const candidates = highs4h.filter(v => v > entry * 1.02);
    const tp1 = candidates[0] || entry * 1.08;
    const tp2 = candidates[Math.floor(candidates.length * 0.45)] || Math.max(dailyHigh * 0.98, entry * 1.16);
    const tp3 = candidates[candidates.length - 1] || Math.max(dailyHigh * 1.02, entry * 1.28);
    return { tp1, tp2: Math.max(tp2, tp1 * 1.04), tp3: Math.max(tp3, tp2 * 1.06) };
  }

  function calcChartAware(h4, fib, ema4h, entry, levels) {
    const closes = h4.map(x => x.close);
    const last = h4[h4.length - 1] || {}; const prev = h4[h4.length - 2] || {};
    const e20 = (emaSeries(closes, 20).slice(-1)[0]) || entry;
    const distE20 = e20 > 0 ? ((entry - e20) / e20) * 100 : 0;
    const roomToTp1 = entry > 0 ? ((levels.tp1 - entry) / entry) * 100 : 0;
    const pullbackHeld = !!prev.close && entry >= prev.low * 0.998 && entry <= prev.high * 1.01;
    const reclaimHeld = entry >= e20; 
    const overextended = distE20 >= 4.2 || roomToTp1 <= 1.8;
    let entryQuality = 'neutral';
    if (!overextended && reclaimHeld && pullbackHeld && roomToTp1 >= 3) entryQuality = 'entry_good';
    else if (overextended) entryQuality = 'entry_late';
    else if (reclaimHeld && roomToTp1 >= 2.5) entryQuality = 'wait_retest';
    return { bonus: (fib.zone === '0.5-0.618' ? 3 : 1), penalty: (overextended ? 3 : 0), entryQuality, roomToTp1, distE20, chartAware: true };
  }

  // EMA series repeated for internal use in calcChartAware if needed, or rely on window
  function emaSeries(values, period) {
    const k = 2 / (period + 1);
    let prev = avg(values.slice(0, period));
    const out = new Array(values.length).fill(null); out[period - 1] = prev;
    for (let i = period; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out[i] = prev; }
    return out;
  }

  function computeSignalLevels(coin, klines, features, btcContext) {
    const { h4, d1 } = klines; const entry = h4[h4.length - 1]?.close || coin.lastPrice || 0;
    const adaptiveStopMeta = computeAdaptiveStop({ entry, h4, structureLabel: features.structure.label, fibZone: features.fib.zone, entrySignal: features.entrySignalMeta.label });
    const levels = resistanceLevels(h4, d1, entry);
    const rrInfo = rrPenalty(entry, adaptiveStopMeta.stop, levels.tp1, coin.base);
    return { entry, stop: rrInfo.stop, tp1: levels.tp1, tp2: levels.tp2, tp3: levels.tp3, rr: rrInfo.rr, rrInfo, chartAware: calcChartAware(h4, features.fib, features.ema4h, entry, levels) };
  }

  function computeAdaptiveStop({ entry = 0, h4 = [], structureLabel = '', fibZone = '', entrySignal = '' } = {}) {
    const atr = window.SCANNER_ANALYSIS.calcATR(h4, 14);
    const recentLow3 = Math.min(...h4.slice(-3).map(x => Number(x.low) || entry));
    const phaseC = structureLabel.includes('phase');
    const atrStop = entry - (atr * (phaseC ? 1.15 : 1.45));
    const stop = clamp(Math.max(recentLow3, atrStop), entry * 0.75, entry * 0.995);
    return { stop };
  }

  function rrPenalty(entry, stop, tp1, symbol = '') {
    const risk = Math.max(1e-9, entry - stop);
    const rr = clamp((tp1 - entry) / risk, 0, 5);
    let penalty = 0;
    if (stop >= entry || risk < entry * 0.003) penalty -= 20;
    else if (rr < 2) penalty -= 4;
    return { rr, penalty, stop, risk, invalidStop: (stop >= entry) };
  }

  function quantRiskLabel(score, edgeScore = 0) {
    if (score >= 76 || edgeScore >= 68) return 'Killer edge';
    if (score >= 60 || edgeScore >= 52) return 'High edge';
    if (score >= 44 || edgeScore >= 32) return 'Tradeable';
    if (score >= 30 || edgeScore >= 18) return 'Watch edge';
    return 'No edge';
  }

  function quantOverlay(coin, baseScore, rr, btcContext, setup) {
    const quant = computeQuantStats();
    const riskAdjustedScore = clamp(Math.round(baseScore * (btcContext === 'bull' ? 1.06 : 0.98)), 0, 100);
    return { riskAdjustedScore, edgeScore: 30, rareSignalReady: false, label: quantRiskLabel(riskAdjustedScore, 30) };
  }

  function deriveExecutionQualityScore(signal = {}) {
    const rawScannerScore = clamp(Number(signal.rawScannerScore ?? signal.score ?? 0), 0, 100);
    const riskAdjustedScore = clamp(Number(signal.riskAdjustedScore ?? signal.scoreBreakdown?.riskAdjusted ?? rawScannerScore), 0, 100);
    const executionConfidence = clamp(Number(signal.executionConfidence ?? signal.confScore ?? 0), 0, 1);
    const rr = clamp(Number(signal.rr ?? 0), 0, 5);
    const displayStatus = upper(signal.displayStatus || signal.finalAuthorityStatus || signal.executionTier || signal.status);
    const authorityDecision = upper(signal.authorityDecision || signal.decision);
    const trigger = String(signal.entrySignal || '').trim().toLowerCase();
    const entryTiming = String(signal.entryTiming || '').trim().toLowerCase();
    const quality = String(signal.chartEntryQuality || '').trim().toLowerCase();
    const actionable = signal.executionGatePassed === true || ['ALLOW', 'WAIT'].includes(authorityDecision);

    let score = (riskAdjustedScore * 0.52) + (executionConfidence * 18) + (rr * 5.5);
    if (actionable) {
      if (displayStatus === 'READY') score += 18;
      else if (displayStatus === 'PLAYABLE') score += 12;
      else if (displayStatus === 'PROBE') score += 6;
    } else if (authorityDecision === 'REJECT') {
      score -= 8;
    }

    if (trigger && trigger !== 'wait') score += 4;
    if (entryTiming && /confirm|retest|break|spring|lps/.test(entryTiming)) score += 2;
    if (quality === 'entry_good') score += 4;
    else if (quality === 'entry_late') score -= 6;
    else if (quality === 'wait_retest') score -= 2;
    return clamp(Math.round(score), 0, 100);
  }

  function getSmartExecutionProfile(btcContext, healthScore, structureLabel = '') {
    const health = Number(healthScore || 0); const weakTape = health > 0 && health < 5;
    if (btcContext === 'bull') return { readyRRFloor: 1.65, scalpRRFloor: 0.95, unlockRRFloor: 0.72, playableRRFloor: 0.78, probeRRFloor: 0.62, confFloor: 0.58 };
    return { readyRRFloor: weakTape ? 1.60 : 1.75, scalpRRFloor: weakTape ? 0.72 : 0.82, confFloor: 0.44 };
  }

  function deriveExecutionConfidence(features, levels, btcContext) {
    const structureLabel = String(features?.structure?.label || '').toLowerCase();
    const entrySignal = String(features?.entrySignalMeta?.label || '').toLowerCase();
    const chartEntryQuality = String(levels?.chartAware?.entryQuality || '').toLowerCase();
    const fakePumpLabel = String(features?.fake?.label || '').toLowerCase();
    const relVol = Number(features?.structure?.relVol15 || 0);
    const rr = Number(levels?.rrInfo?.rr || 0);
    const structureScore = Number(features?.structure?.score || 0);
    const entryScore = Number(features?.entryScore || 0);
    const confirmation1H = features?.confirmation1H || {};

    let confidence = 0.42;

    if (/breakout|trend-continuation|accumulation|phase-candidate|early-phase-d/.test(structureLabel)) confidence += 0.06;
    else if (/early-watch|unclear/.test(structureLabel)) confidence -= 0.04;

    if (features?.entrySignalMeta?.fullTriggerValid) confidence += 0.12;
    else if (features?.entrySignalMeta?.trigger15mValid) confidence += 0.07;
    else if (entrySignal && entrySignal !== 'wait') confidence += 0.04;

    if (chartEntryQuality === 'entry_good') confidence += 0.08;
    else if (chartEntryQuality === 'wait_retest') confidence -= 0.02;
    else if (chartEntryQuality === 'entry_late') confidence -= 0.07;

    if (fakePumpLabel === 'high') confidence -= 0.10;
    else if (fakePumpLabel === 'medium') confidence -= 0.04;

    if (rr >= 2.2) confidence += 0.05;
    else if (rr >= 1.6) confidence += 0.03;
    else if (rr < 1.0) confidence -= 0.05;

    if (relVol >= 1.5) confidence += 0.04;
    else if (relVol < 0.65) confidence -= 0.03;

    if (structureScore >= 8) confidence += 0.03;
    else if (structureScore <= 3) confidence -= 0.03;

    if (entryScore >= 6) confidence += 0.03;
    else if (entryScore <= 1) confidence -= 0.02;

    if (confirmation1H?.status === 'supportive') confidence += 0.04;
    else if (confirmation1H?.status === 'overextended_no_chase') confidence -= 0.03;
    else if (confirmation1H?.status === 'bearish_blocked') confidence -= 0.08;

    if (btcContext === 'bull') confidence += 0.02;
    else if (btcContext === 'bear') confidence -= 0.04;

    return Number(clamp(confidence, 0.38, 0.74).toFixed(2));
  }

  function classifyProposedStatus(coin, features, levels, btcContext, smartProfile) {
    const { structure, fake, entrySignalMeta } = features; const { rrInfo } = levels;
    const score = calculateSignalScore(features, levels, btcContext);
    const executionConfidence = deriveExecutionConfidence(features, levels, btcContext);
    let status = 'watch';
    const phaseWindow = structure.label.includes('phase');
    const readyPass = fake.label !== 'high' && score >= 50 && entrySignalMeta.fullTriggerValid && rrInfo.rr >= 1.2 && phaseWindow;
    
    if (readyPass && !features.confirmation1H?.blockReady) {
      status = 'ready';
    } else if (score >= 32 && rrInfo.rr >= 0.8) {
      status = 'playable';
    } else if (score >= 20) {
      status = 'probe';
    } else if (score >= 12) {
      status = 'watch';
    } else {
      status = 'reject';
    }

    return {
      proposedStatus: status,
      score,
      smartMoneyScore: 0.3,
      scalpConfidenceBase: executionConfidence,
    };
  }

  function calculateSignalScore(features, levels, btcContext) {
    let s = (features.ema15m.score + features.ema4h.score + features.structure.score + features.fib.score + levels.chartAware.bonus);
    return clamp(Math.round(s * 1.3), 0, 100);
  }

  function getStabilitySnapshot() {
    return ST.scanMeta?.stability || { recentBySymbol: {}, topSymbols: [], lastHealthScore: 0 };
  }

  function getSmartRRFloor(coin, status, btcContext, chartEntryQuality) {
    if (status === 'READY') return 1.5;
    if (status === 'SCALP_READY') return 1.0;
    return 0.8;
  }

  async function performScanLoop(candidates, btcContext, progressCb, klineCache = null) {
    const results = []; 
    const fetchFailedSymbols = [];
    const symbolTimings = [];

    for (let i = 0; i < candidates.length; i++) {
       const coin = candidates[i];
       const symbolStart = Date.now();
       try {
         const klines = await window.SCANNER_UNIVERSE.fetchMulti(coin);
          if (klineCache && klines) {
            [coin.symbol, coin.base, coin.baseAsset, klines.pair]
              .map(v => String(v || '').toUpperCase())
              .filter(Boolean)
              .forEach(key => { klineCache[key] = klines; });
          }
         const row = window.SCANNER_ANALYSIS.deepScanCandidate(coin, klines, btcContext);
         
         const duration = Date.now() - symbolStart;
         symbolTimings.push({ symbol: coin.symbol, duration });

         if (row?.error) {
           fetchFailedSymbols.push(coin.symbol);
         } else if (row) {
           results.push(row);
         }
       } catch (err) { 
         fetchFailedSymbols.push(coin.symbol); 
       }
       progressCb?.(`Đang scan ${i + 1}/${candidates.length}: ${coin.symbol}`, 35 + Math.round(((i + 1) / candidates.length) * 55));
       
       // Adaptive throttle to protect rate limits while maintaining budget
       const throttle = (results.length % 5 === 0) ? 150 : 80;
       await new Promise(r => setTimeout(r, throttle));
    }

    return { results, fetchFailedSymbols, symbolTimings };
  }

  function applyPostScanRefinement(results, btcContext, stabilityState) {
    const insight = buildInsight(results, stabilityState);
    const sorted = [...(Array.isArray(results) ? results : [])].sort((a, b) => {
      const bScore = Number(b?.riskAdjustedScore ?? b?.rawScannerScore ?? b?.score ?? 0);
      const aScore = Number(a?.riskAdjustedScore ?? a?.rawScannerScore ?? a?.score ?? 0);
      if (bScore !== aScore) return bScore - aScore;
      return Number(b?.rr || 0) - Number(a?.rr || 0);
    });
    // Legacy compatibility shortlist: scanner-side READY-only view.
    // Alerts and actionable UI should prefer deployableTop3 after final authority.
    const top3 = sorted.filter(c => c.status === 'READY').slice(0, 3);
    return { sorted, insight, top3, portfolio: {} };
  }

  function buildInsight(results, stabilityState) {
    return { marketHealth: 'healthy', marketHealthScore: 7, qualifiedCount: results.filter(c => c.status === 'READY').length, analyzedCount: results.length };
  }

  function isFinalDeployableCoin(coin) {
    if (!coin || typeof coin !== 'object') return false;
    const displayStatus = String(coin.displayStatus || coin.finalAuthorityStatus || coin.status || '').toUpperCase();
    const executionTier = String(coin.executionTier || coin.finalAuthorityStatus || '').toUpperCase();
    const authorityDecision = String(coin.authorityDecision || coin.decision || '').toUpperCase();
    const authorityTier = String(coin.authorityTier || '').toUpperCase();
    const gatePassed = coin.executionGatePassed === true;

    if (!['READY', 'PLAYABLE', 'PROBE'].includes(displayStatus)) return false;
    if (!['READY', 'PLAYABLE', 'PROBE'].includes(executionTier)) return false;
    if (!['ALLOW', 'WAIT'].includes(authorityDecision)) return false;
    if (authorityTier === 'REJECT') return false;
    if (!gatePassed) return false;
    return true;
  }

  function deriveDeployableTop3(coins) {
    return (coins || [])
      .filter(isFinalDeployableCoin)
      .sort((a, b) => {
        const bScore = Number(b?.rankScore ?? b?.executionQualityScore ?? b?.riskAdjustedScore ?? b?.score ?? 0);
        const aScore = Number(a?.rankScore ?? a?.executionQualityScore ?? a?.riskAdjustedScore ?? a?.score ?? 0);
        if (bScore !== aScore) return bScore - aScore;
        return Number(b?.rr || 0) - Number(a?.rr || 0);
      })
      .slice(0, 3);
  }

  function mergeAuthorityCoins(scannerCoins, executionRun) {
    const baseCoins = Array.isArray(scannerCoins) ? scannerCoins : [];
    const authorityRows = Array.isArray(executionRun?.results) ? executionRun.results : [];
    if (!authorityRows.length) return baseCoins;

    const deepClone = (value) => {
      if (value == null || typeof value !== 'object') return value;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_) {
        return value;
      }
    };

    const bySymbol = new Map();
    authorityRows.forEach(row => {
      const symbol = String(row?.symbol || row?.signal?.symbol || '').toUpperCase();
      if (!symbol) return;
      bySymbol.set(symbol, row);
    });

    return baseCoins.map(coin => {
      const symbol = String(coin?.symbol || '').toUpperCase();
      const authority = bySymbol.get(symbol);
      if (!authority) return coin;

      const authSignal = authority.signal && typeof authority.signal === 'object' ? authority.signal : {};
      const displayStatus = String(
        authority.displayStatus ||
        authSignal.displayStatus ||
        authority.finalAuthorityStatus ||
        authority.executionTier ||
        coin.status ||
        ''
      ).toUpperCase();

      const merged = {
        ...coin,
        authorityTier: authority.authorityTier || authSignal.authorityTier || coin.authorityTier || null,
        authorityDecision: authority.authorityDecision || authSignal.authorityDecision || coin.authorityDecision || null,
        authorityReason: authority.authorityReason || authSignal.authorityReason || authority.reason || coin.authorityReason || null,
        authorityBlockers: Array.isArray(authority.authorityBlockers)
          ? [...authority.authorityBlockers]
          : (Array.isArray(authSignal.authorityBlockers) ? [...authSignal.authorityBlockers] : (coin.authorityBlockers || [])),
        authoritySource: authority.authoritySource || authSignal.authoritySource || coin.authoritySource || null,
        authorityTrace: deepClone(authority.authorityTrace || authSignal.authorityTrace || coin.authorityTrace || null),
        displayStatus: displayStatus || coin.displayStatus || null,
        finalAuthorityStatus: authority.finalAuthorityStatus || authSignal.finalAuthorityStatus || displayStatus || coin.finalAuthorityStatus || null,
        executionTier: authority.executionTier || authSignal.executionTier || coin.executionTier,
        executionGatePassed: authority.pass === true,
        position: authority.position || coin.position || null,
        capitalPlan: authority.capitalPlan || coin.capitalPlan || null,
        signalState: authority.signalState || authSignal.signalState || coin.signalState || null,
        status: displayStatus || coin.status,
      };

      const rawScannerScore = Number(merged.rawScannerScore ?? merged.score ?? 0);
      const riskAdjustedScore = Number(merged.riskAdjustedScore ?? merged.scoreBreakdown?.riskAdjusted ?? rawScannerScore);
      const executionQualityScore = deriveExecutionQualityScore({
        ...merged,
        rawScannerScore,
        riskAdjustedScore,
      });

      return {
        ...merged,
        rawScannerScore,
        riskAdjustedScore,
        edgeScore: Number(merged.edgeScore ?? merged.scoreBreakdown?.edge ?? 0),
        executionQualityScore,
        rankScore: merged.executionGatePassed ? executionQualityScore : riskAdjustedScore,
        scoreSemantics: {
          scanner: 'rawScannerScore',
          analytics: 'riskAdjustedScore',
          ranking: 'rankScore',
          execution: 'executionQualityScore',
        },
        authTrace: null,
      };
    });
  }

  // Helper for quantOverlay
  function computeQuantStats() {
    return ST.scanMeta?.quant || { learningMode: 'trained', confidence: 0.7, edgeScore: 50 };
  }

  return { performScanLoop, applyPostScanRefinement, computeSignalLevels, getSmartExecutionProfile, classifyProposedStatus, quantOverlay, getStabilitySnapshot, getSmartRRFloor, deriveDeployableTop3, mergeAuthorityCoins, deriveExecutionQualityScore };
})();
