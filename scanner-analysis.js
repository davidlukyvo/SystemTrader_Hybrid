/* ══════════════════════════════════════════════════════════
   SCANNER MODULE: TECHNICAL ANALYSIS
   Handles technical indicators, VSA, Fib zones, and feature extraction.
   ══════════════════════════════════════════════════════════ */

window.SCANNER_ANALYSIS = (() => {
  'use strict';

  // --- Core Utility Helpers (Bounded) ---
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const safeNum = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const getCloses = (candles) => candles.map(c => c.close);
  const getVolumes = (candles) => candles.map(c => c.volumeQuote || c.volume || 0);

  function emaSeries(values, period) {
    const out = new Array(values.length).fill(null);
    if (!values || values.length < period) return out;
    const k = 2 / (period + 1);
    let prev = avg(values.slice(0, period));
    out[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function calcRelVol(candles, shortLen = 5, baseLen = 20) {
    const vols = getVolumes(candles);
    if (vols.length < baseLen) return 0;
    const shortAvg = avg(vols.slice(-shortLen));
    const baseAvg = avg(vols.slice(-baseLen));
    return baseAvg > 0 ? shortAvg / baseAvg : 0;
  }

  function calcCompression(candles, shortLen = 12, baseLen = 48) {
    if (candles.length < baseLen) return 0;
    const short = candles.slice(-shortLen);
    const base  = candles.slice(-baseLen);
    const shortLow = Math.min(...short.map(c => c.low));
    const shortHigh = Math.max(...short.map(c => c.high));
    const baseLow = Math.min(...base.map(c => c.low));
    const baseHigh = Math.max(...base.map(c => c.high));
    const shortRange = (shortHigh - shortLow) / Math.max(shortLow, 1e-9);
    const baseRange  = (baseHigh - baseLow) / Math.max(baseLow, 1e-9);
    return baseRange > 0 ? 1 - shortRange / baseRange : 0;
  }

  function calcFibZone(candles, lookback = 60) {
    const arr = candles.slice(-lookback);
    const hi = Math.max(...arr.map(c => c.high));
    const lo = Math.min(...arr.map(c => c.low));
    const last = arr[arr.length - 1]?.close || 0;
    const range = hi - lo;
    if (range <= 0) return { zone: 'unknown', fib05: 0, fib0618: 0, hi, lo, last };
    const fib05 = hi - range * 0.5;
    const fib0618 = hi - range * 0.618;
    let zone = 'outside';
    if (last <= fib05 && last >= fib0618) zone = '0.5-0.618';
    else if (last > fib05) zone = 'above-0.5';
    else if (last < fib0618) zone = 'below-0.618';
    return { zone, fib05, fib0618, hi, lo, last };
  }

  function calcATR(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length < 2) return 0;
    const start = Math.max(1, candles.length - (period + 1));
    const trs = [];
    for (let i = start; i < candles.length; i += 1) {
      const cur = candles[i] || {};
      const prev = candles[i - 1] || cur;
      const high = safeNum(cur.high);
      const low = safeNum(cur.low);
      const prevClose = safeNum(prev.close, safeNum(cur.close));
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trs.push(tr);
    }
    return avg(trs.filter(v => Number.isFinite(v) && v > 0));
  }

  function scoreEMA(candles) {
    const closes = getCloses(candles);
    const e20 = emaSeries(closes, 20);
    const e50 = emaSeries(closes, 50);
    const e200 = emaSeries(closes, 200);
    const c = closes[closes.length - 1];
    const a = e20[e20.length - 1];
    const b = e50[e50.length - 1];
    const d = e200[e200.length - 1];
    let score = 0;
    if (a && c > a) score += 2;
    if (b && c > b) score += 3;
    if (b && d && b > d) score += 3;
    if (a && b && a > b) score += 2;
    const distE20Pct = a ? Math.abs(c - a) / Math.max(Math.abs(a), 1e-9) : 0;
    const prevA = e20[e20.length - 2] || a || 0;
    const ema20Slope = prevA ? (a - prevA) / Math.max(Math.abs(prevA), 1e-9) : 0;
    if (distE20Pct >= 0.01 && distE20Pct <= 0.04) score += 2;
    else if (distE20Pct > 0.04 && distE20Pct <= 0.06) score += 0;
    else if (distE20Pct > 0.06 && distE20Pct <= 0.08) score -= 4;
    else if (distE20Pct > 0.08 && distE20Pct <= 0.12) score -= 8;
    else if (distE20Pct > 0.12) score -= 12;
    if (ema20Slope > 0.003) score += 1;
    else if (ema20Slope < 0) score -= 1;
    let state = 'weak';
    const overextended = distE20Pct > 0.05;
    if (overextended) state = score >= 4 ? 'overextended' : 'weak';
    else if (score >= 8) state = 'bull';
    else if (score >= 4) state = 'improving';
    return { score, state, distE20Pct, ema20Slope, overextended };
  }

  function scoreStructure(m15, h4, d1, ema4h = null) {
    let score = 0; let label = 'unclear';
    const compression = calcCompression(h4, 12, 48);
    const relVol15 = calcRelVol(m15, 5, 20);
    const h4Last = h4[h4.length - 1] || {};
    const h4Prev = h4[h4.length - 2] || {};
    const d1Close = d1[d1.length - 1]?.close || 0;
    const d1Prev = d1[d1.length - 5]?.close || d1Close;
    if (compression >= 0.45) score += 3;
    if (relVol15 >= 1.4) score += 3;
    if (h4Last.close > h4Prev.high) score += 2;
    if (d1Close >= d1Prev * 0.95 && d1Close > 0) score += 2;
    const baseScore = score;
    const emaSlope = ema4h?.ema20Slope || 0;
    const emaDist = ema4h?.distE20Pct || 0;
    const emaContext = ema4h?.state || 'weak';
    const breakConfirmed = (h4Last.close > h4Prev.high) && (h4Last.close > 0);
    if (relVol15 >= 1.5 && breakConfirmed && emaSlope > 0) label = 'breakout';
    else if (compression >= 0.6 && relVol15 < 1.15 && emaDist < 0.02) label = 'accumulation';
    else if (emaContext === 'bull' && emaSlope > 0.001 && emaDist < 0.03) label = 'trend-continuation';
    else if (baseScore >= 8) label = 'early-phase-d';
    else if (baseScore >= 5) label = 'phase-candidate';
    else if (baseScore >= 3) label = 'early-watch';
    if (compression >= 0.55 && relVol15 >= 1.15) score += 1;
    return { score, label, compression, relVol15 };
  }

  function scoreVSA(m15) {
    if (m15?.degraded || m15?.syntheticGenerated) return { score: 0, label: 'degraded', reason: 'vsa_bypassed_synthetic_m15' };
    let score = 0; let label = 'neutral';
    const a = m15[m15.length - 1]; const b = m15[m15.length - 2];
    const avgVol = avg(m15.slice(-20).map(x => x.volume));
    const spreadA = a.high - a.low; const spreadB = b.high - b.low;
    if (a.volume > avgVol * 1.5 && a.close > (a.high + a.low) / 2) score += 4;
    if (b.low < a.low && b.close >= (b.high + b.low) / 2) score += 2;
    if (spreadA < spreadB && a.volume >= avgVol) score += 2;
    if (score >= 6) label = 'absorption'; else if (score <= 1) label = 'weak';
    return { score, label };
  }

  function scoreFakePumpRisk(m15) {
    let risk = 0;
    const relVol = calcRelVol(m15, 3, 20);
    const last15 = m15[m15.length - 1]; const prev15 = m15[m15.length - 4];
    const pctMove = prev15?.close > 0 ? ((last15.close - prev15.close) / prev15.close) * 100 : 0;
    const wickTop = last15.high > last15.low ? (last15.high - last15.close) / (last15.high - last15.low + 1e-9) : 0;
    const spread = last15.low > 0 ? ((last15.high - last15.low) / last15.low) * 100 : 0;
    if (pctMove > 12) risk += 4;
    if (relVol > 3.2) risk += 3;
    if (wickTop > 0.45) risk += 2;
    if (relVol > 3 && spread > 9 && wickTop > 0.35) risk += 3;
    const window = m15.slice(-4); const moves = [];
    for (let i = 1; i < window.length; i++) {
      const prev = window[i-1]; const cur = window[i];
      const move = prev?.close > 0 ? ((cur.close - prev.close) / prev.close) * 100 : 0;
      moves.push(move);
      const curRel = avg(m15.slice(Math.max(0, m15.length - 20 - (window.length-i)), m15.length - (window.length-i)).map(x => x.volume || 0));
      if (move > 8 && curRel > 0 && (cur.volume || 0) > curRel * 2.5) risk += 3;
    }
    const cumulativeMove = moves.reduce((a,b)=>a+b,0);
    if (cumulativeMove > 15) risk += 4;
    let label = 'low';
    if (risk >= 8) label = 'high'; else if (risk >= 4) label = 'medium';
    return { risk, label, cumulativeMove };
  }

  function scoreFib(h4) {
    const fib = calcFibZone(h4, 60);
    let score = 0;
    if (fib.zone === '0.5-0.618') score = 8; else if (fib.zone === 'above-0.5') score = 5; else if (fib.zone === 'below-0.618') score = 2;
    return { score, ...fib };
  }

  function scoreEntryQuality(m15) {
    const last = m15[m15.length - 1]; const prev = m15[m15.length - 2]; const prev2 = m15[m15.length - 3];
    if (!last || !prev || !prev2) return 0;
    let score = 0;
    const avgVol20 = avg(m15.slice(-20).map(x => x.volume));
    const body = Math.abs(last.close - last.open); const range = Math.max(last.high - last.low, 1e-9);
    const pctMove = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
    const volSpike = avgVol20 > 0 && last.volume > avgVol20 * 1.3;
    const isBreakout = last.close > prev.high; const isSpring = last.low < prev.low && last.close > prev.close;
    const hasTest = prev.low <= prev2.low * 1.01 && prev.close >= prev.open;
    const isLPS = last.low > prev.low && last.close > last.open && last.close >= prev.close;
    if (isBreakout) score += 3;
    if (volSpike) score += 3;
    if (body / range > 0.6) score += 2;
    if (last.close > prev.low && last.close < prev.high && last.close > last.open && avgVol20 > 0 && last.volume >= avgVol20) score += 2;
    if (isSpring && hasTest) score += 2;
    if (isLPS) score += 2;
    if (pctMove > 8) score -= 3;
    return Math.max(0, score);
  }

  function score1HConfirmation(h1Candles) {
    if (!Array.isArray(h1Candles) || h1Candles.length < 25) return { blockReady: false, isOverextended: false, status: 'neutral' };
    const closes = h1Candles.map(x => x.close); const e20s = emaSeries(closes, 20);
    const lastClose = closes[closes.length - 1]; const e20 = e20s[e20s.length - 1];
    const prevE20 = e20s[e20s.length - 2] || e20;
    const slope = (e20 - prevE20) / Math.max(1e-9, prevE20);
    const distE20Pct = (lastClose - e20) / Math.max(1e-9, e20);
    const blockReady = lastClose < e20 && slope < -0.0002;
    const isOverextended = distE20Pct > 0.035;
    let status = 'neutral';
    if (blockReady) status = 'bearish_blocked';
    else if (isOverextended) status = 'overextended_no_chase';
    else if (lastClose > e20 && slope > 0.0005) status = 'supportive';
    return { blockReady, isOverextended, status, slope, distE20Pct };
  }

  function inferInstitutionalEntrySignal(m15) {
    const last = m15[m15.length - 1]; const prev = m15[m15.length - 2]; const prev2 = m15[m15.length - 3];
    if (!last || !prev || !prev2) return { label:'wait', triggerLabel:'wait', timingLabel:'wait', trigger15mValid:false, fullTriggerValid:false };
    const avgVol20 = avg(m15.slice(-20).map(x => x.volume));
    const volOK = avgVol20 > 0 && last.volume >= avgVol20 * 1.1;
    const reclaimBreak = last.close > prev.high && volOK;
    const miniSpring = last.low < prev.low && last.close > prev.close && (volOK || last.close > last.open);
    const breakoutRetest15m = !!(m15[m15.length-4] && prev.close > m15[m15.length-3].high && last.low >= prev.low * 0.995 && last.close > last.open);
    const lps15m = last.low >= prev.low && last.close > last.open && last.close >= prev.close && volOK;
    const trigger15mValid = reclaimBreak || miniSpring || breakoutRetest15m || lps15m;
    const fullTriggerValid = trigger15mValid && volOK && (reclaimBreak || breakoutRetest15m || lps15m || (miniSpring && prev.low <= prev2.low * 1.01));
    let label = 'wait';
    if (reclaimBreak) label = 'reclaimBreak';
    else if (breakoutRetest15m) label = 'breakoutRetest15m';
    else if (lps15m) label = 'lps15m';
    else if (miniSpring) label = 'miniSpring';
    return {
      label,
      triggerLabel: label,
      timingLabel: label,
      trigger15mValid,
      fullTriggerValid,
      reclaimBreak,
      miniSpring,
      breakoutRetest15m,
      lps15m,
      volOK
    };
  }

  function computeSignalFeatures(coin, klines, btcContext, inject = {}) {
    const { m15, h1, h4, d1 } = klines;
    const ema4h = scoreEMA(h4 || []);
    const ema15m = scoreEMA(m15 || []);
    const features = {
      ema4h,
      ema15m,
      confirmation1H: score1HConfirmation(h1 || []),
      structure: scoreStructure(m15 || [], h4 || [], d1 || [], ema4h),
      vsa: scoreVSA(m15 || []),
      fib: scoreFib(h4 || []),
      fake: scoreFakePumpRisk(m15 || []),
      entryScore: scoreEntryQuality(m15 || []),
      entrySignalMeta: inferInstitutionalEntrySignal(m15 || [])
    };
    // Momentum Telemetry Integration (Injected)
    try {
      const momentumEngine = inject.momentum || window.NATIVE_MOMENTUM;
      if (momentumEngine?.evaluate) {
        const momentum = momentumEngine.evaluate({ ...coin, btcChangePct: btcContext?.btcChangePct || 0 }, klines);
        if (momentum) {
          features.momentumScore = momentum.momentumScore; features.momentumPhase = momentum.momentumPhase; features.momentumDetected = momentum.momentumDetected; features.momentumReason = momentum.momentumReason;
          features.momentumWarnings = momentum.momentumWarnings; features.momentumBlockers = momentum.momentumBlockers; features.momentumMetrics = momentum.metrics; features.lateTrapHit = !!momentum.late_trap_hit;
        }
      }
    } catch (err) { console.warn('[SCANNER_ANALYSIS] Momentum engine failed', err); }
    return features;
  }

  function isExecutionUnlockReady(coin = {}) {
    const rr = Number(coin?.rr || 0); const score = Number(coin?.riskAdjustedScore || coin?.finalScore || coin?.score || 0);
    const conf = Number(coin?.executionConfidence || 0); const quality = String(coin?.chartEntryQuality || '').toLowerCase();
    const timing = String(coin?.entryTiming || '').toLowerCase(); const setup = String(coin?.setup || '').toLowerCase();
    const setupOk = /phase|breakout|trend|spring|retest|reclaim|continuation|accumulation/.test(setup);
    const strongIntent = ['READY','SCALP_READY','PLAYABLE', 'PROBE'].includes(String(coin?.status || '').toUpperCase()) || /scalp_trigger|confirm|retest|trigger|reclaim|setup_ready/.test(timing);
    if (!setupOk || !strongIntent || coin.fakePumpRisk === 'high' || /invalid_structure|data_corrupt/.test(quality)) return false;
    if (rr >= 3.0 && conf >= 0.70 && score >= 36 && !/entry_late|late/.test(timing) && !/entry_late|structure_risk|wait_retest/.test(quality)) return true;
    return rr >= 4.0 && conf >= 0.68 && score >= 26 && !/fake_pump_high/.test(String(coin?.warnings || '').toLowerCase()) && (/entry_late|late/.test(timing) || /entry_late|structure_risk|wait_retest/.test(quality));
  }

  /**
   * [WORKER_READY] Bounded analysis function.
   * Internal window dependencies (REFINEMENT, CATEGORY) must be injected.
   */
  function deepScanCandidate(coin, klines, btcContext, inject = {}) {
    const { m15, h4, d1 } = klines;
    const Refinement = inject.refinement || window.SCANNER_REFINEMENT;
    const Category = inject.category || window.CATEGORY_ENGINE;
    
    if (!m15?.length || !h4?.length || !d1?.length) return { error: 'missing_klines' };
    
    const features = computeSignalFeatures(coin, klines, btcContext, inject);
    const levels = Refinement.computeSignalLevels(coin, klines, features, btcContext);
    const smartProfile = Refinement.getSmartExecutionProfile(btcContext, window.ST?.scanMeta?.insight?.marketHealthScore, features.structure.label);
    const { proposedStatus, score, smartMoneyScore, scalpConfidenceBase } = Refinement.classifyProposedStatus(coin, features, levels, btcContext, smartProfile);
    
    const cleanliness = clamp(Math.round(10 - (features.fake.risk * 0.8) - (features.ema15m.distE20Pct * 40) + (features.structure.compression * 3)), 1, 10);
    let finalStatus = proposedStatus; const hardRejectReasons = []; const softWarnings = [];
    
    if (features.fake.label === 'high') hardRejectReasons.push('fake_pump_high');
    if (levels.rrInfo.invalidStop) hardRejectReasons.push('invalid_stop');
    if (levels.rrInfo.rr < 1.0) { finalStatus = 'reject'; softWarnings.push('hard_gate_rr_lt_1'); }
    if (features.structure.label === 'unclear') finalStatus = 'near_miss';
    
    const quantMeta = Refinement.quantOverlay(coin, score, levels.rr, btcContext, features.structure.label);
    const rawScannerScore = score;
    const riskAdjustedScore = Number(quantMeta.riskAdjustedScore || rawScannerScore);
    const edgeScore = Number(quantMeta.edgeScore || 0);
    
    const structuralSetup = typeof window.normalizeStructuralSetupValue === 'function'
      ? window.normalizeStructuralSetupValue(features.structure.label, 'unclear')
      : features.structure.label;

    return {
      id: `${coin.base}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      symbol: coin.base, name: coin.name || coin.base, price: coin.lastPrice, volume24h: Number(coin.volume24h ?? 0),
      entry: levels.entry, stop: levels.stop, tp1: levels.tp1, tp2: levels.tp2, tp3: levels.tp3,
      momentumScore: features.momentumScore || 0, momentumPhase: features.momentumPhase || 'NONE', momentumDetected: !!features.momentumDetected,
      rr: levels.rrInfo.rr, rrInfo: levels.rrInfo, status: finalStatus, proposedStatus,
      score: rawScannerScore, finalScore: rawScannerScore, rawScannerScore, riskAdjustedScore, edgeScore,
      executionQualityScore: riskAdjustedScore, rankScore: riskAdjustedScore,
      setup: structuralSetup, structureTag: structuralSetup, relVol: features.structure.relVol15, vsaTag: features.vsa.label,
      fib: features.fib.zone, fakePumpRisk: features.fake.label, executionTier: String(finalStatus).toUpperCase(), smartMoneyScore, executionConfidence: Number(scalpConfidenceBase.toFixed(2)),
      rejected: finalStatus === 'reject' || finalStatus === 'AVOID', rejectReasons: hardRejectReasons, warnings: softWarnings,
      entrySignal: features.entrySignalMeta.triggerLabel || features.entrySignalMeta.label,
      entryTiming: features.entrySignalMeta.timingLabel || features.entrySignalMeta.label,
      chartEntryQuality: levels.chartAware.entryQuality, category: Category?.getCategory ? Category.getCategory(coin.base) : 'OTHER',
      scoreBreakdown: { structure: features.structure.score, volume: features.ema15m.score, fib: features.fib.score, ema: features.ema4h.score, resistance: levels.chartAware.bonus, btc: btcContext === 'bear' ? 1 : 5, cleanliness, entry: features.entryScore, quant: quantMeta.edgeScore, riskAdjusted: quantMeta.riskAdjustedScore, edge: quantMeta.edgeScore },
      scoreSemantics: { scanner: 'rawScannerScore', analytics: 'riskAdjustedScore', ranking: 'rankScore', execution: 'executionQualityScore' }
    };
  }

  return { computeSignalFeatures, deepScanCandidate, isExecutionUnlockReady, calcATR, safeNum };
})();
