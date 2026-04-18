/* ══════════════════════════════════════════════════════════════════════════
   MARKET INSIGHT ENGINE — Chop / Fake Breakout / Low-Vol Trap Detector
   VERSION: v1.0.0 (SystemTrader v8790 — v9.3.1)
   ──────────────────────────────────────────────────────────────────────────
   Detects three structural market conditions that cause overtrading:

     1. Chop Zone      — market is oscillating with no directional conviction
     2. Fake Breakout  — breakout signals are structurally weak (trap probability)
     3. Low-Vol Trap   — low volatility in sideways = false breakout setup

   Called every scan cycle by execution-engine-v9.run().
   Output stored on session — read by gate to block PLAYABLE in bad regimes.

   Layer contract:
     - READ-ONLY from scanner signals (never sets executionTier or positionState)
     - Does NOT allocate capital or approve positions
     - Output flows into execution-engine via _marketInsight context object
   ══════════════════════════════════════════════════════════════════════════ */

window.MARKET_INSIGHT = (() => {
  'use strict';

  const VERSION = 'v1.0.0';

  /* ── Thresholds ─────────────────────────────────────────────────────── */

  const THRESHOLDS = Object.freeze({
    // Chop zone
    chop: {
      minAvgConfForClean:  0.62,   // avg executionConfidence below this → potential chop
      maxRRDispersion:     0.80,   // if max(RR) - min(RR) > this, signals disagree on value zone
      minSetupAgreement:   0.50,   // if < 50% of signals share the same setup type → chop
    },
    // Fake breakout
    fakeBreakout: {
      fakePumpHighFraction: 0.20,  // > 20% of signals flagged fakePumpRisk='high' → risk
      fakePumpMedFraction:  0.35,  // > 35% flagged 'medium' → elevated
      marginalScoreFloor:   25,    // signal score < this = marginal quality
      marginalFraction:     0.40,  // > 40% marginal → fake breakout probability rises
    },
    // Low-vol trap
    lowVol: {
      relVolFloor:          0.85,  // avg relVol15 < 0.85 in sideway → low-vol trap
      maxSignalsForTrap:    8,     // apply trap detection only when ≤ 8 candidates (thin market)
    },
  });

  /* ── Utilities ──────────────────────────────────────────────────────── */

  function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function avg(arr, fn) { if (!arr.length) return 0; return arr.reduce((s, x) => s + fn(x), 0) / arr.length; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function round2(v) { return Number(num(v).toFixed(2)); }

  /* ── Chop Zone Detection ────────────────────────────────────────────── */

  /**
   * Chop zone: market has no clear directional conviction.
   * Detected by:
   *   - Low average executionConfidence across signals
   *   - High RR dispersion (signals disagree on where value is)
   *   - Mixed setup types (phase C vs phase D in same batch)
   *
   * Returns chopZoneProbability (0–1).
   */
  function detectChopZone(signals) {
    if (!signals.length) return 0;
    const T = THRESHOLDS.chop;

    // 1. Avg confidence
    const avgConf = avg(signals, s => num(s.executionConfidence));
    const confPenalty = avgConf < T.minAvgConfForClean
      ? (T.minAvgConfForClean - avgConf) / T.minAvgConfForClean
      : 0;

    // 2. RR dispersion
    const rrs = signals.map(s => num(s.rr)).filter(r => r > 0);
    const rrRange = rrs.length >= 2 ? Math.max(...rrs) - Math.min(...rrs) : 0;
    const rrPenalty = rrRange > T.maxRRDispersion
      ? clamp01((rrRange - T.maxRRDispersion) / T.maxRRDispersion)
      : 0;

    // 3. Setup agreement
    const setups = signals.map(s => String(s.setup || 'unknown'));
    const setupFreq = {};
    for (const s of setups) setupFreq[s] = (setupFreq[s] || 0) + 1;
    const topSetupFrac = Math.max(...Object.values(setupFreq)) / setups.length;
    const setupPenalty = topSetupFrac < T.minSetupAgreement
      ? (T.minSetupAgreement - topSetupFrac) / T.minSetupAgreement
      : 0;

    const raw = (confPenalty * 0.45) + (rrPenalty * 0.30) + (setupPenalty * 0.25);
    return round2(clamp01(raw));
  }

  /* ── Fake Breakout Detection ────────────────────────────────────────── */

  /**
   * Fake breakout: signals appear structurally valid but are likely traps.
   * Detected by:
   *   - High fraction of signals with fakePumpRisk='high'|'medium'
   *   - High fraction of marginal-quality signals (low score)
   *
   * Returns fakeBreakoutProbability (0–1).
   */
  function detectFakeBreakout(signals) {
    if (!signals.length) return 0;
    const T = THRESHOLDS.fakeBreakout;
    const n = signals.length;

    const highFake = signals.filter(s => String(s.fakePumpRisk || '').toLowerCase() === 'high').length;
    const medFake  = signals.filter(s => String(s.fakePumpRisk || '').toLowerCase() === 'medium').length;
    const marginal = signals.filter(s => num(s.score) < T.marginalScoreFloor && num(s.score) > 0).length;

    const highPenalty = highFake / n >= T.fakePumpHighFraction
      ? clamp01((highFake / n - T.fakePumpHighFraction) / (1 - T.fakePumpHighFraction) + 0.40)
      : (highFake / n) * 1.5;

    const medPenalty = medFake / n >= T.fakePumpMedFraction ? 0.25 : (medFake / n) * 0.6;
    const marginalPenalty = marginal / n >= T.marginalFraction ? 0.30 : (marginal / n) * 0.5;

    const raw = clamp01(highPenalty + medPenalty + marginalPenalty);
    return round2(raw);
  }

  /* ── Low Volatility Trap Detection ─────────────────────────────────── */

  /**
   * Low-vol trap: in sideways markets, low relative volume = no real momentum.
   * Breakouts in this condition are typically false.
   * Only evaluated in 'sideway' regime.
   *
   * Returns { isLowVolTrap: boolean, avgRelVol15: number }.
   */
  function detectLowVolTrap(signals, btcContext) {
    if (btcContext !== 'sideway') return { isLowVolTrap: false, avgRelVol15: null };
    const T = THRESHOLDS.lowVol;

    const relVols = signals.map(s => num(s.relVol15 || s.relativeVolume15 || s.relVol, 1))
                           .filter(v => v > 0);
    if (!relVols.length) return { isLowVolTrap: false, avgRelVol15: null };

    const avgRelVol = avg(relVols, v => v);
    const isLowVolTrap = avgRelVol < T.relVolFloor && signals.length <= T.maxSignalsForTrap;

    return {
      isLowVolTrap,
      avgRelVol15: round2(avgRelVol),
    };
  }

  /* ── Main Evaluator ─────────────────────────────────────────────────── */

  /**
   * Run all three insight checks on the current signal batch.
   * Called by execution-engine-v9.run() each cycle.
   *
   * @param {Array}  signals     Scanner signal batch (CANDIDATE + WATCH)
   * @param {string} btcContext  'bull' | 'sideway' | 'bear'
   * @returns {Object} market insight record
   */
  function evaluate(signals, btcContext = 'sideway') {
    const safeSignals = Array.isArray(signals) ? signals : [];
    const ctx = String(btcContext || 'sideway').toLowerCase();

    // Only run insight on signals that made it past initial classification
    // (i.e. have some data — exclude completely empty objects)
    const withData = safeSignals.filter(s => s && (s.rr || s.score || s.executionConfidence));

    const chopZoneProbability    = detectChopZone(withData);
    const fakeBreakoutProbability = detectFakeBreakout(withData);
    const { isLowVolTrap, avgRelVol15 } = detectLowVolTrap(withData, ctx);

    // Composite regime quality (0 = toxic, 1 = clean)
    // Used by gate to decide block severity
    const regimeQuality = round2(
      clamp01(1 - (chopZoneProbability * 0.45) - (fakeBreakoutProbability * 0.35) - (isLowVolTrap ? 0.20 : 0))
    );

    // Human-readable warning label
    const warnings = [];
    if (chopZoneProbability >= 0.60)      warnings.push('CHOP_ZONE');
    if (fakeBreakoutProbability >= 0.55)  warnings.push('FAKE_BREAKOUT_RISK');
    if (isLowVolTrap)                     warnings.push('LOW_VOL_TRAP');

    const insight = {
      engineVersion:           VERSION,
      insightAt:               Date.now(),
      btcContext:              ctx,
      signalCount:             safeSignals.length,
      withDataCount:           withData.length,
      avgConf:                 round2(avg(withData, s => num(s.executionConfidence))),
      avgRR:                   round2(avg(withData, s => num(s.rr))),
      avgRelVol15,
      chopZoneProbability,
      fakeBreakoutProbability,
      isLowVolTrap,
      regimeQuality,
      isChop:         chopZoneProbability >= 0.60,
      isFakeBreak:    fakeBreakoutProbability >= 0.55,
      warnings,
      hasWarnings:    warnings.length > 0,
      // Derived flags for gate consumption
      blockPlayable: regimeQuality < 0.40 || (ctx === 'sideway' && warnings.length >= 2),
      caution:       regimeQuality < 0.65 && warnings.length > 0,
    };

    return insight;
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  return {
    VERSION,
    THRESHOLDS,
    // Main hook
    evaluate,
    // Individual detectors (exposed for testing)
    detectChopZone,
    detectFakeBreakout,
    detectLowVolTrap,
  };
})();
