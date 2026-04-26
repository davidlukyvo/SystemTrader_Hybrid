/* ══════════════════════════════════════════════════════════
   MARKET BEHAVIOR EVIDENCE ENGINE v1.0-ohlcv-approx
   Phase 1 — Observe Only

   PURPOSE:
     Quantify measurable market behavior around entry/stop/TP zones
     using existing OHLCV-derived data. Enriches signals for future
     analytics. Does NOT influence trade decisions.

   AUTHORITY CONTRACT (INVARIANT):
     - Does NOT change displayStatus, finalAuthorityStatus, authorityDecision
     - Does NOT change deployableTop3, executionBreakdown, executionGatePassed
     - Does NOT change capital, portfolio, or Telegram alert eligibility
     - Is NOT a replacement for Alpha Guard

   VOLUME APPROXIMATION:
     Phase 1 has no real order book or volume profile data.
     All volume-zone metrics are approximations derived from OHLCV.
     behaviorEngineVersion = 'v1.0-ohlcv-approx'
     behaviorInputQuality reflects data availability per signal.

   LOAD ORDER:
     Must load AFTER alpha-guard-core-v51-auth.js,
     BEFORE scanner-persistence.js.
   ══════════════════════════════════════════════════════════ */

window.MARKET_BEHAVIOR_ENGINE = (() => {
  'use strict';

  const VERSION = 'v1.0-ohlcv-approx';

  // ── Tiny internal helpers ─────────────────────────────────
  const safeNum  = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const clamp    = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const upper    = (v) => String(v || '').toUpperCase().trim();
  const lower    = (v) => String(v || '').toLowerCase().trim();
  const avg      = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // ── Assess data quality available for this signal ────────
  function assessInputQuality(signal, klines) {
    const hasCandles = klines && (
      (Array.isArray(klines.m15) && klines.m15.length >= 20) ||
      (Array.isArray(klines.h4)  && klines.h4.length  >= 20) ||
      (Array.isArray(klines.d1)  && klines.d1.length  >= 7)
    );
    const hasDerivedFields = (
      safeNum(signal.relVol)    > 0 ||
      safeNum(signal.rr)        > 0 ||
      lower(signal.vsaTag)      !== '' ||
      lower(signal.entrySignal) !== '' ||
      lower(signal.chartEntryQuality) !== ''
    );

    if (hasCandles && hasDerivedFields) return 'full_ohlcv';
    if (hasDerivedFields) return 'partial';
    return 'derived_only';
  }

  // ── Compute 9 behavior evidence booleans ─────────────────
  function computeBehaviorEvidence(signal, klines, approximationNotes) {
    const vsaTag           = lower(signal.vsaTag || '');
    const entrySignal      = lower(signal.entrySignal || signal.entryTiming || '');
    const chartEntryQuality = lower(signal.chartEntryQuality || '');
    const setup            = lower(signal.setup || signal.structureTag || '');
    const relVol           = safeNum(signal.relVol, 0);
    const fakePumpRisk     = lower(signal.fakePumpRisk || '');
    const rr               = safeNum(signal.rr, 0);
    const entry            = safeNum(signal.entry, 0);
    const stop             = safeNum(signal.stop, 0);
    const momentumPhase    = lower(signal.momentumPhase || '');
    const btcContext       = lower(String(signal._btcContext || ''));

    // Candle helpers (optional — only if raw m15 present)
    const m15 = (klines && Array.isArray(klines.m15) && klines.m15.length >= 5)
      ? klines.m15 : null;

    // 1. absorptionEvidence
    // VSA absorption tag OR high-vol bullish close near entry on last m15 candle
    let absorptionEvidence = vsaTag === 'absorption';
    if (!absorptionEvidence && m15) {
      const last = m15[m15.length - 1];
      const avgVol = avg(m15.slice(-20).map(c => c.volume || 0));
      const isBullish = last.close > last.open;
      const volSpike  = avgVol > 0 && (last.volume || 0) > avgVol * 1.4;
      absorptionEvidence = isBullish && volSpike;
      if (!m15) approximationNotes.push('absorptionEvidence: derived from vsaTag only');
    }

    // 2. reclaimEvidence
    // entrySignal is reclaim/LPS or similar re-entry above broken level
    const reclaimEvidence = /reclaimbreak|lps15m|lps4h|breakoutretest/i.test(entrySignal);

    // 3. breakoutAcceptance
    // setup=breakout + relVol ≥ 1.4 + not fakePump
    const breakoutAcceptance = (
      /breakout/.test(setup) &&
      relVol >= 1.4 &&
      fakePumpRisk !== 'high'
    );

    // 4. failedBreakdownEvidence
    // spring / miniSpring + absorptionEvidence → price swept below but recovered
    const failedBreakdownEvidence = (
      /spring|minispring/.test(entrySignal) &&
      absorptionEvidence
    );

    // 5. sellingExhaustion
    // From m15: small spread + declining volume near stop zone
    // Approximation from derived: vsaTag or chart quality hints
    let sellingExhaustion = false;
    if (m15 && m15.length >= 5) {
      const recent = m15.slice(-5);
      const spreads = recent.map(c => Math.abs(c.high - c.low));
      const vols    = recent.map(c => c.volume || 0);
      const avgSpread = avg(spreads.slice(0, -2));
      const lastSpread = spreads[spreads.length - 1];
      const avgVolRecent = avg(vols.slice(0, -2));
      const lastVol = vols[vols.length - 1];
      sellingExhaustion = (lastSpread < avgSpread * 0.7) && (lastVol < avgVolRecent * 0.75);
    } else {
      // Derived approximation: VSA weak label near stop zone
      sellingExhaustion = vsaTag === 'neutral' && relVol < 0.8 && rr >= 1.5;
      approximationNotes.push('sellingExhaustion: approximated from vsaTag + relVol (no m15 candles)');
    }

    // 6. volumeExpansion
    // relVol spike (≥1.5) on recent candles — bullish context
    let volumeExpansion = relVol >= 1.5;
    if (m15) {
      const last = m15[m15.length - 1];
      const avgVol = avg(m15.slice(-20).map(c => c.volume || 0));
      volumeExpansion = avgVol > 0 && (last.volume || 0) >= avgVol * 1.5;
    } else {
      approximationNotes.push('volumeExpansion: approximated from relVol field (no m15 candles)');
    }

    // 7. lateEntryRisk
    // chartEntryQuality signals late entry, OR momentum shows overextended
    const lateEntryRisk = (
      chartEntryQuality === 'entry_late' ||
      /overextend|late|chase/.test(momentumPhase)
    );

    // 8. stopTooTightRisk
    // Stop < 0.8 ATR below entry. ATR approximated from rrInfo.risk if available.
    // rrInfo.risk = (entry - stop) in price units; ATR is typically ~1-2% of entry for alts
    let stopTooTightRisk = false;
    if (entry > 0 && stop > 0 && stop < entry) {
      const stopDist = entry - stop;
      const stopPct  = stopDist / entry;
      // Heuristic: stop < 0.7% of price is very tight for alt coins (4H timeframe)
      stopTooTightRisk = stopPct < 0.007;
      if (klines == null || !m15) {
        approximationNotes.push('stopTooTightRisk: approximated from stop/entry ratio (no ATR candles)');
      }
    }

    // 9. noFollowThroughRisk
    // Breakout setup but volume not confirming (relVol < 1.0) or weak VSA
    const noFollowThroughRisk = (
      /breakout/.test(setup) &&
      (relVol < 1.0 || vsaTag === 'weak')
    );

    return {
      absorptionEvidence,
      reclaimEvidence,
      breakoutAcceptance,
      failedBreakdownEvidence,
      sellingExhaustion,
      volumeExpansion,
      lateEntryRisk,
      stopTooTightRisk,
      noFollowThroughRisk,
    };
  }

  // ── priceZoneQuality 0–100 ────────────────────────────────
  function computePriceZoneQuality(signal, approximationNotes) {
    approximationNotes.push('priceZoneQuality: derived from chartEntryQuality + fib zone + rr ratio');

    const chartEntryQuality = lower(signal.chartEntryQuality || '');
    const fib               = lower(signal.fib || '');
    const rr                = safeNum(signal.rr, 0);
    const entry             = safeNum(signal.entry, 0);
    const stop              = safeNum(signal.stop, 0);
    const tp1               = safeNum(signal.tp1, 0);

    let score = 50; // neutral baseline

    // Entry quality bonus/penalty
    if (chartEntryQuality === 'entry_good')       score += 25;
    else if (chartEntryQuality === 'wait_retest') score += 5;
    else if (chartEntryQuality === 'entry_late')  score -= 20;
    else if (chartEntryQuality === 'neutral')      score += 0;

    // Fib zone bonus
    if (fib === '0.5-0.618')     score += 15;
    else if (fib === 'above-0.5') score += 5;
    else if (fib === 'below-0.618') score -= 5;

    // RR quality
    if (rr >= 2.5)       score += 12;
    else if (rr >= 2.0)  score += 8;
    else if (rr >= 1.5)  score += 4;
    else if (rr < 1.0)   score -= 10;

    // Stop validity
    if (entry > 0 && stop > 0 && stop < entry) {
      const stopPct = (entry - stop) / entry;
      if (stopPct < 0.005) score -= 15; // too tight
      else if (stopPct > 0.12) score -= 8; // too wide
    } else if (entry > 0 && (stop <= 0 || stop >= entry)) {
      score -= 20; // invalid stop
    }

    // TP1 reachability
    if (entry > 0 && tp1 > entry) {
      const roomPct = (tp1 - entry) / entry;
      if (roomPct >= 0.06) score += 5;
      else if (roomPct < 0.02) score -= 10;
    }

    return clamp(Math.round(score), 0, 100);
  }

  // ── volumeSupportScore 0–100 ──────────────────────────────
  function computeVolumeSupportScore(signal, klines, approximationNotes) {
    approximationNotes.push('volumeSupportScore: OHLCV approximation — no real volume profile available');

    const relVol  = safeNum(signal.relVol, 0);
    const vsaTag  = lower(signal.vsaTag || '');
    const m15     = (klines && Array.isArray(klines.m15) && klines.m15.length >= 10) ? klines.m15 : null;

    let score = 40; // neutral

    // relVol is the primary proxy for volume support
    if (relVol >= 2.0)       score += 30;
    else if (relVol >= 1.5)  score += 20;
    else if (relVol >= 1.2)  score += 10;
    else if (relVol >= 1.0)  score += 0;
    else if (relVol < 0.7)   score -= 15;
    else                     score -= 5;

    // VSA label
    if (vsaTag === 'absorption')     score += 20;
    else if (vsaTag === 'neutral')   score += 0;
    else if (vsaTag === 'weak')      score -= 15;
    else if (vsaTag === 'degraded')  score -= 20;

    // If we have candles, check recent candles near entry for volume cluster
    if (m15) {
      const entry = safeNum(signal.entry, 0);
      if (entry > 0) {
        const zone = entry * 0.025; // ±2.5% of entry
        const nearEntry = m15.filter(c => Math.abs(c.close - entry) <= zone);
        const nearVolAvg = nearEntry.length > 0 ? avg(nearEntry.map(c => c.volume || 0)) : 0;
        const totalVolAvg = avg(m15.slice(-20).map(c => c.volume || 0));
        if (totalVolAvg > 0) {
          const ratio = nearVolAvg / totalVolAvg;
          if (ratio >= 1.5)      score += 10;
          else if (ratio >= 1.2) score += 5;
          else if (ratio < 0.7)  score -= 8;
        }
      }
    }

    return clamp(Math.round(score), 0, 100);
  }

  // ── volumeResistanceRisk 0–100 ────────────────────────────
  function computeVolumeResistanceRisk(signal, klines, approximationNotes) {
    approximationNotes.push('volumeResistanceRisk: OHLCV approximation — no real volume profile; derived from H4 high cluster density between entry and TP1');

    const entry = safeNum(signal.entry, 0);
    const tp1   = safeNum(signal.tp1, 0);
    const h4    = (klines && Array.isArray(klines.h4) && klines.h4.length >= 10) ? klines.h4 : null;

    if (entry <= 0 || tp1 <= entry) return 50; // unknown

    let risk = 30; // low baseline

    // Count H4 highs between entry and TP1 — each is a potential resistance
    if (h4) {
      const highs = h4.slice(-48).map(c => c.high).filter(h => h > entry && h < tp1);
      const cluster = highs.length;
      if (cluster >= 6)      risk += 40;
      else if (cluster >= 4) risk += 25;
      else if (cluster >= 2) risk += 12;
      else if (cluster === 0) risk -= 10;
    } else {
      // Derived approximation: roomToTp1 proxy
      const roomPct = (tp1 - entry) / entry;
      // Tighter TP1 often means less room = likely more local resistance
      if (roomPct < 0.04)      risk += 20;
      else if (roomPct < 0.08) risk += 10;
      else if (roomPct >= 0.15) risk -= 10;
      approximationNotes.push('volumeResistanceRisk: no H4 candles, derived from tp1/entry ratio only');
    }

    // fakePumpRisk = high → likely resistance ahead at pump highs
    if (lower(signal.fakePumpRisk || '') === 'high') risk += 20;

    return clamp(Math.round(risk), 0, 100);
  }

  // ── pathToTPQuality 0–100 ─────────────────────────────────
  function computePathToTPQuality(signal, volumeResistanceRisk, approximationNotes) {
    approximationNotes.push('pathToTPQuality: derived from rr + chartEntryQuality + setup label + volumeResistanceRisk');

    const rr                = safeNum(signal.rr, 0);
    const chartEntryQuality = lower(signal.chartEntryQuality || '');
    const setup             = lower(signal.setup || signal.structureTag || '');
    const momentum          = lower(signal.momentumPhase || '');

    let score = 50;

    // RR is a proxy for path quality — higher RR often means cleaner TP1
    if (rr >= 3.0)       score += 20;
    else if (rr >= 2.5)  score += 14;
    else if (rr >= 2.0)  score += 8;
    else if (rr >= 1.5)  score += 3;
    else if (rr < 1.0)   score -= 12;

    // Entry quality
    if (chartEntryQuality === 'entry_good')       score += 10;
    else if (chartEntryQuality === 'entry_late')  score -= 10;
    else if (chartEntryQuality === 'wait_retest') score -= 3;

    // Setup label — trend-continuation and breakout have better TP path in theory
    if (/trend-continuation|breakout/.test(setup))         score += 8;
    else if (/accumulation|early-phase-d/.test(setup))     score += 5;
    else if (/unclear|early-watch/.test(setup))            score -= 8;

    // Subtract resistance risk
    score -= Math.round(volumeResistanceRisk * 0.25);

    // Momentum
    if (/bull|strong|expansion/.test(momentum))  score += 5;
    else if (/bear|weak|chop/.test(momentum))    score -= 8;

    return clamp(Math.round(score), 0, 100);
  }

  // ── failureModeCandidate ──────────────────────────────────
  function computeFailureModes(signal, behaviorEvidence) {
    const modes = [];
    const btcContext = lower(String(signal._btcContext || ''));
    const fakePumpRisk = lower(signal.fakePumpRisk || '');
    const rr = safeNum(signal.rr, 0);
    const relVol = safeNum(signal.relVol, 0);

    if (behaviorEvidence.lateEntryRisk)        modes.push('entryTooLate');
    if (behaviorEvidence.stopTooTightRisk)     modes.push('stopTooTight');
    if (behaviorEvidence.noFollowThroughRisk)  modes.push('noFollowThrough');
    if (fakePumpRisk === 'high')               modes.push('fakeBreakoutRisk');

    // volumeWallRejected — high resistance risk on TP path
    if (signal._volumeResistanceRisk >= 65)    modes.push('volumeWallRejected');

    // liquidityTrap — breakout with very low volume
    if (/breakout/.test(lower(signal.setup || '')) && relVol < 0.8) {
      modes.push('liquidityTrap');
    }

    // btcRegimeRisk — bear or sideway when signal is trend-continuation
    if ((btcContext === 'bear' || btcContext === 'sideway') &&
        /trend-continuation|breakout/.test(lower(signal.setup || ''))) {
      modes.push('btcRegimeRisk');
    }

    if (modes.length === 0) modes.push('unknown');
    return modes;
  }

  // ── Main enrich function ──────────────────────────────────
  /**
   * enrich(signal, klines, btcContext)
   *
   * Pure function — does not mutate global state, does not call external APIs.
   * Returns a new object with behavior fields added.
   * On any error, returns the original signal unchanged (fail-safe).
   *
   * AUTHORITY CONTRACT:
   *   This function MUST NOT be called before deployableTop3 is derived.
   *   It must never modify: displayStatus, finalAuthorityStatus, authorityDecision,
   *   executionGatePassed, executionBreakdown, or any authority field.
   */
  function enrich(signal, klines, btcContext) {
    if (!signal || typeof signal !== 'object') return signal;

    try {
      const approximationNotes = [];

      // Attach btcContext as a private working field (used by failureMode only)
      const working = { ...signal, _btcContext: btcContext };

      // Assess data quality
      const behaviorInputQuality = assessInputQuality(signal, klines);

      // Compute components
      const behaviorEvidence      = computeBehaviorEvidence(working, klines, approximationNotes);
      const priceZoneQuality      = computePriceZoneQuality(working, approximationNotes);
      const volumeSupportScore    = computeVolumeSupportScore(working, klines, approximationNotes);
      const volumeResistanceRisk  = computeVolumeResistanceRisk(working, klines, approximationNotes);

      // pathToTPQuality needs volumeResistanceRisk
      working._volumeResistanceRisk = volumeResistanceRisk;
      const pathToTPQuality         = computePathToTPQuality(working, volumeResistanceRisk, approximationNotes);

      // failureModes needs volumeResistanceRisk
      const failureModeCandidate  = computeFailureModes(working, behaviorEvidence);

      // Return enriched signal — spread original first, then add behavior fields
      // CRITICAL: do NOT override any authority fields
      const enriched = {
        ...signal, // original fields preserved (including all authority fields)
        // ── Behavior Evidence Fields (new) ──
        behaviorEvidence,
        priceZoneQuality,
        volumeSupportScore,
        volumeResistanceRisk,
        pathToTPQuality,
        failureModeCandidate,
        behaviorInputQuality,
        behaviorApproximationNotes: approximationNotes,
        behaviorEngineVersion: VERSION,
        behaviorComputedAt: Date.now(),
      };

      // Safety assertion: verify no authority field was overridden
      const authorityFieldsOk = (
        enriched.displayStatus       === signal.displayStatus &&
        enriched.finalAuthorityStatus === signal.finalAuthorityStatus &&
        enriched.authorityDecision    === signal.authorityDecision &&
        enriched.executionGatePassed  === signal.executionGatePassed
      );
      if (!authorityFieldsOk) {
        console.error('[MBE] AUTHORITY FIELD MUTATION DETECTED — returning original signal', signal.symbol);
        return signal;
      }

      return enriched;

    } catch (err) {
      console.warn('[MBE] enrich() failed for', signal?.symbol, '—', err?.message, '— returning original signal');
      return signal; // fail-safe
    }
  }

  return {
    enrich,
    VERSION,
  };

})();
