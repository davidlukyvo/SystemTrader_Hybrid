window.REGIME_ENGINE = (() => {
  'use strict';

  const VERSION = 'v9.8.1';
  const n = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const avg = (arr, fn) => arr.length ? arr.reduce((s, x) => s + fn(x), 0) / arr.length : 0;

  function summarize(signals = []) {
    const safe = (Array.isArray(signals) ? signals : []).filter(Boolean);
    const rrAvg = avg(safe, s => n(s.rr));
    const confAvg = avg(safe, s => n(s.executionConfidence));
    const scoreAvg = avg(safe, s => n(s.riskAdjustedScore || s.finalScore || s.score));
    const relVolAvg = avg(safe, s => n(s.relVol15, 1));
    const breakoutLike = safe.filter(s => {
      const t = String(s.entryTiming || s.signalEntryTiming || '').toLowerCase();
      const trig = String(s.entrySignal || '').toLowerCase();
      return /breakout|retest|reclaim/.test(t) || /reclaim|surge|springconfirm/.test(trig);
    }).length;
    const phaseCLike = safe.filter(s => /phase c|candidate|accumulation|spring/i.test(String(s.setup || ''))).length;
    const phaseDLike = safe.filter(s => /phase d|early phase d|trend|continuation|markup/i.test(String(s.setup || ''))).length;
    const fakeHigh = safe.filter(s => String(s.fakePumpRisk || '').toLowerCase() === 'high').length;
    const fakeMed = safe.filter(s => String(s.fakePumpRisk || '').toLowerCase() === 'medium').length;
    return {
      count: safe.length,
      rrAvg: Number(rrAvg.toFixed(2)),
      confAvg: Number(confAvg.toFixed(2)),
      scoreAvg: Number(scoreAvg.toFixed(1)),
      relVolAvg: Number(relVolAvg.toFixed(2)),
      breakoutFrac: safe.length ? breakoutLike / safe.length : 0,
      phaseCFrac: safe.length ? phaseCLike / safe.length : 0,
      phaseDFrac: safe.length ? phaseDLike / safe.length : 0,
      fakeHighFrac: safe.length ? fakeHigh / safe.length : 0,
      fakeMedFrac: safe.length ? fakeMed / safe.length : 0,
    };
  }

  function mapCapitalRegime(type, btcContext) {
    const t = String(type || '').toUpperCase();
    if (t === 'BREAKOUT' || t === 'TRENDING') return 'bull';
    if (t === 'FAKE_PUMP' || t === 'DISTRIBUTION' || String(btcContext || '').toLowerCase() === 'bear') return 'bear';
    return 'sideway';
  }

  function evaluate(signals = [], btcContext = 'sideway', marketInsight = null) {
    const ctx = String(btcContext || 'sideway').toLowerCase();
    const s = summarize(signals);
    const chopProb = n(marketInsight?.chopZoneProbability);
    const fakeProb = n(marketInsight?.fakeBreakoutProbability);
    const lowVolTrap = !!marketInsight?.isLowVolTrap;

    let type = 'CHOP';
    let confidence = 0.55;
    let breakoutProbability = 0;
    let allowProbe = false;
    let allowReady = false;
    let blockTrading = false;
    let reason = 'Market remains rotational and low-conviction.';

    if (fakeProb >= 0.6 || s.fakeHighFrac >= 0.18) {
      type = 'FAKE_PUMP';
      confidence = Math.max(fakeProb, 0.72);
      blockTrading = true;
      reason = 'Breakout quality is trap-prone; fake-pump risk elevated.';
    } else if (lowVolTrap || chopProb >= 0.62 || (ctx === 'sideway' && s.relVolAvg < 0.9 && s.confAvg < 0.65)) {
      type = 'CHOP';
      confidence = Math.max(0.58, chopProb);
      allowProbe = s.count > 0 && (s.rrAvg >= 1.1 || s.confAvg >= 0.56);
      allowReady = false;
      blockTrading = false;
      reason = allowProbe
        ? 'Tight range / low-vol conditions: probe-only regime, wait for expansion before READY size.'
        : 'Chop / low-vol conditions: observation mode, keep risk tiny until expansion appears.';
    } else if (s.breakoutFrac >= 0.4 && s.rrAvg >= 1.8 && s.confAvg >= 0.68 && s.relVolAvg >= 1.05) {
      type = 'BREAKOUT';
      confidence = clamp01(0.45 + (s.breakoutFrac * 0.35) + Math.min(0.20, (s.relVolAvg - 1) * 0.25));
      breakoutProbability = clamp01(0.40 + s.breakoutFrac * 0.35 + Math.min(0.20, (s.rrAvg - 1.8) * 0.08));
      allowProbe = true;
      allowReady = s.confAvg >= 0.72 && s.rrAvg >= 2.0;
      reason = 'Volatility expansion + breakout structure detected.';
    } else if (ctx === 'bull' && s.phaseDFrac >= 0.35 && s.confAvg >= 0.66) {
      type = 'TRENDING';
      confidence = clamp01(0.50 + s.phaseDFrac * 0.30 + Math.min(0.15, (s.confAvg - 0.66) * 0.6));
      breakoutProbability = clamp01(0.30 + s.phaseDFrac * 0.20);
      allowProbe = true;
      allowReady = s.rrAvg >= 1.8;
      reason = 'Trend continuation structure is present across the scan.';
    } else if (s.phaseCFrac >= 0.35 && s.relVolAvg <= 1.1 && s.confAvg >= 0.60) {
      type = 'ACCUMULATION';
      confidence = clamp01(0.48 + s.phaseCFrac * 0.30 + Math.min(0.12, s.confAvg * 0.10));
      breakoutProbability = clamp01(0.22 + s.phaseCFrac * 0.25 + Math.max(0, (1.05 - s.relVolAvg) * 0.10));
      allowProbe = true;
      allowReady = false;
      reason = 'Compression / base-building regime: probes allowed, full deployment waits for confirmation.';
    } else if (ctx === 'bear') {
      type = 'DISTRIBUTION';
      confidence = 0.68;
      blockTrading = true;
      reason = 'Bearish distribution regime: capital preservation first.';
    }

    const capitalRegime = mapCapitalRegime(type, ctx);
    return {
      version: VERSION,
      detectedAt: Date.now(),
      btcContext: ctx,
      type,
      label: type.replace(/_/g, ' '),
      confidence: Number(confidence.toFixed(2)),
      breakoutProbability: Number(breakoutProbability.toFixed(2)),
      allowProbe,
      allowReady,
      blockTrading,
      capitalRegime,
      reason,
      stats: s,
    };
  }

  return { VERSION, evaluate, summarize, mapCapitalRegime };
})();
