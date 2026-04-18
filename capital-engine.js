/* ══════════════════════════════════════════════════════════════════════════
   CAPITAL ENGINE v9.7 — Edge Layer
   Dynamic risk budgeting, position tiering, and anti-overtrade guards.
   This layer never assigns execution tiers; it only sizes and vetoes
   already-authorized signals from EXECUTION_ENGINE_V9.
   ══════════════════════════════════════════════════════════════════════════ */

window.CAPITAL_ENGINE = (() => {
  'use strict';

  const VERSION = 'v9.8.0';
  const REGIME_PROFILES = Object.freeze({
    bull:    { riskMultiplier: 1.35, cooldownMs: 2 * 60 * 60 * 1000, maxTradesPerDay: 3, hardExposureCapPct: 0.08 },
    sideway: { riskMultiplier: 0.80, cooldownMs: 90 * 60 * 1000, maxTradesPerDay: 3, hardExposureCapPct: 0.05 },
    bear:    { riskMultiplier: 0.55, cooldownMs: 8 * 60 * 60 * 1000, maxTradesPerDay: 1, hardExposureCapPct: 0.03 },
  });

  const TIMING_MULTIPLIERS = Object.freeze({
    breakout_retest: 1.25,
    breakoutRetest15m: 1.20,
    breakout_retest_15m: 1.20,
    reclaim_break: 1.15,
    reclaimBreak: 1.15,
    breakout: 1.10,
    scalp_trigger: 0.85,
    probe_detection: 0.55,
    wait: 0.40,
    unknown: 1.00,
  });

  const TIER_BUCKETS = Object.freeze({
    READY:    { bucket: 'FULL',   allocCapMultiplier: 1.00 },
    PLAYABLE: { bucket: 'MEDIUM', allocCapMultiplier: 0.75 },
    PROBE:    { bucket: 'SMALL',  allocCapMultiplier: 0.50 },
    OBSERVE:  { bucket: 'ZERO',   allocCapMultiplier: 0.00 },
  });

  const n = (v, d = 0) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const now = () => Date.now();
  const VIRTUAL_PAPER_EQUITY = 10000;

  function startOfDay(ts = Date.now()) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function normalizeRegime(btcContext = 'sideway', regimeType = '') {
    const explicit = String(regimeType || '').toUpperCase();
    if (explicit === 'BREAKOUT' || explicit === 'TRENDING') return 'bull';
    if (explicit === 'FAKE_PUMP' || explicit === 'DISTRIBUTION') return 'bear';
    const k = String(btcContext || 'sideway').toLowerCase();
    return REGIME_PROFILES[k] ? k : 'sideway';
  }

  function getProfile(btcContext = 'sideway', regimeType = '') {
    return REGIME_PROFILES[normalizeRegime(btcContext, regimeType)];
  }

  function confidenceMultiplier(signal = {}) {
    const conf = n(signal.executionConfidence, 0);
    const score = n(signal.score, 0);
    if (conf >= 0.80 || score >= 80) return 1.35;
    if (conf >= 0.72 || score >= 60) return 1.00;
    return 0.70;
  }

  function rrMultiplier(signal = {}) {
    const rr = n(signal.rr, 0);
    if (rr >= 3.0) return 1.20;
    if (rr >= 2.0) return 1.00;
    if (rr >= 1.5) return 0.80;
    return 0.60;
  }

  function timingMultiplier(signal = {}) {
    const raw = String(signal.entryTiming || signal.signalEntryTiming || 'unknown');
    return TIMING_MULTIPLIERS[raw] || TIMING_MULTIPLIERS[String(raw).toLowerCase()] || 1.00;
  }

  function qualityMultiplier(signal = {}) {
    const q = String(signal.chartEntryQuality || '').toLowerCase();
    if (q === 'structure_risk') return 0.40;
    if (q === 'late' || q === 'late_entry') return 0.80;
    if (q === 'good' || q === 'strong') return 1.05;
    return 1.00;
  }

  function computeTradeStats(portfolioContext = {}) {
    const currentTs = now();
    const cutoff = startOfDay(currentTs);
    const openPositions = Array.isArray(portfolioContext.openPositions) ? portfolioContext.openPositions : [];
    const recentClosed = Array.isArray(portfolioContext.recentClosedPositions) ? portfolioContext.recentClosedPositions : [];
    const allPositions = [...openPositions, ...recentClosed].filter(Boolean);
    const openedToday = allPositions.filter(p => n(p.openedAt, 0) >= cutoff).length;
    const lastOpenedAt = allPositions.reduce((m, p) => Math.max(m, n(p.openedAt, 0)), 0);
    const orderedClosed = [...recentClosed].sort((a, b) => n(b.closedAt, 0) - n(a.closedAt, 0));
    let consecutiveLosses = 0;
    for (const p of orderedClosed) {
      const state = String(p.positionState || '');
      const outcomeR = n(p.outcomeR, NaN);
      const isLoss = state === 'CLOSED_LOSS' || state === 'TIMED_OUT_EXIT' || (!Number.isNaN(outcomeR) && outcomeR <= 0);
      if (isLoss) consecutiveLosses += 1;
      else break;
    }
    return { openedToday, lastOpenedAt, consecutiveLosses };
  }

  function computePlan(signal = {}, tier = 'OBSERVE', portfolioContext = {}, floorRiskPct = 0, portfolioBeforeRisk = 0) {
    const regimeType = portfolioContext.regimeType || signal.regimeType || '';
    const regime = normalizeRegime(portfolioContext.btcContext || signal.btcContext || 'sideway', regimeType);
    const profile = getProfile(regime, regimeType);
    const tierCfg = TIER_BUCKETS[String(tier || 'OBSERVE').toUpperCase()] || TIER_BUCKETS.OBSERVE;
    const tierKey = String(tier || 'OBSERVE').toUpperCase();
    const openPositions = Array.isArray(portfolioContext.openPositions) ? portfolioContext.openPositions : [];
    const moderateBullChopCooldownRelax = (
      regime === 'bull' &&
      String(regimeType || '').toUpperCase() === 'CHOP' &&
      ['PLAYABLE', 'PROBE'].includes(tierKey) &&
      openPositions.length < 3
    );
    const moderateSidewayChopGuardRelax = (
      regime === 'sideway' &&
      String(regimeType || '').toUpperCase() === 'CHOP' &&
      ['PLAYABLE', 'PROBE'].includes(tierKey) &&
      openPositions.length < 2
    );

    const multipliers = {
      regime: profile.riskMultiplier,
      confidence: confidenceMultiplier(signal),
      rr: rrMultiplier(signal),
      timing: timingMultiplier(signal),
      quality: qualityMultiplier(signal),
    };

    const rawRiskPct = n(floorRiskPct, 0) * multipliers.regime * multipliers.confidence * multipliers.rr * multipliers.timing * multipliers.quality;
    const adjustedRiskPct = clamp(rawRiskPct, 0.0025, Math.max(0.0025, profile.hardExposureCapPct * 0.6));
    const allocCapMultiplier = clamp(tierCfg.allocCapMultiplier * multipliers.timing, 0.25, 1.25);
    const sizeBucket = tierCfg.bucket;
    const stats = computeTradeStats(portfolioContext);
    const guardReasons = [];
    const elapsedSinceLastOpenMs = stats.lastOpenedAt ? Math.max(0, now() - stats.lastOpenedAt) : 0;
    const cooldownRemainingMs = stats.lastOpenedAt ? Math.max(0, profile.cooldownMs - elapsedSinceLastOpenMs) : 0;

    if (stats.openedToday >= profile.maxTradesPerDay) guardReasons.push(`daily_trade_limit_${profile.maxTradesPerDay}`);
    if (stats.lastOpenedAt && elapsedSinceLastOpenMs < profile.cooldownMs) {
      guardReasons.push(`cooldown_active_${Math.max(1, Math.round(cooldownRemainingMs / 60000))}m`);
    }
    if (stats.consecutiveLosses >= 2) guardReasons.push('loss_streak_guard_2');
    const projectedRiskPct = portfolioBeforeRisk + adjustedRiskPct;
    if (projectedRiskPct > profile.hardExposureCapPct) {
      guardReasons.push(`exposure_cap_${Math.round(profile.hardExposureCapPct * 100)}pct`);
    }

    const explicitEquity = Number(signal?.totalEquity || portfolioContext?.totalEquity || 0);
    const sessionEquity = Number(window.ST?.sessionState?.totalEquity || 0);
    const accountEquity = Number(window.ST?.account?.totalEquity || 0);
    const totalEquity = explicitEquity > 0
      ? explicitEquity
      : (sessionEquity > 0
        ? sessionEquity
        : (accountEquity > 0 ? accountEquity : VIRTUAL_PAPER_EQUITY));
    const usingVirtualEquity = !(explicitEquity > 0) && !(sessionEquity > 0) && !(accountEquity > 0);
    if (usingVirtualEquity) {
      console.warn(`[CAPITAL_ENGINE] Missing totalEquity context; using virtual paper equity ${VIRTUAL_PAPER_EQUITY}`);
    }

    if (moderateBullChopCooldownRelax) {
      for (let i = guardReasons.length - 1; i >= 0; i--) {
        if (String(guardReasons[i] || '').startsWith('cooldown_active_')) guardReasons.splice(i, 1);
      }
    }
    if (moderateSidewayChopGuardRelax) {
      for (let i = guardReasons.length - 1; i >= 0; i--) {
        const reason = String(guardReasons[i] || '');
        if (reason.startsWith('cooldown_active_') || reason.startsWith('daily_trade_limit_')) {
          guardReasons.splice(i, 1);
        }
      }
    }

    return {
      version: VERSION,
      regime,
      totalEquity,
      usingVirtualEquity,
      sizeBucket,
      adjustedRiskPct: Number(adjustedRiskPct.toFixed(4)),
      floorRiskPct: Number(n(floorRiskPct, 0).toFixed(4)),
      allocCapMultiplier: Number(allocCapMultiplier.toFixed(2)),
      timingBias: Number(multipliers.timing.toFixed(2)),
      confidenceBias: Number(multipliers.confidence.toFixed(2)),
      rrBias: Number(multipliers.rr.toFixed(2)),
      qualityBias: Number(multipliers.quality.toFixed(2)),
      profile,
      tradeStats: stats,
      portfolioBeforeRiskPct: Number(n(portfolioBeforeRisk, 0).toFixed(4)),
      projectedRiskPct: Number(projectedRiskPct.toFixed(4)),
      cooldownRemainingMs,
      cooldownRemainingMinutes: Math.max(0, Math.round(cooldownRemainingMs / 60000)),
      strategicRiskMultiplier: Number(profile.riskMultiplier.toFixed(2)),
      hardExposureCapPct: Number(profile.hardExposureCapPct.toFixed(4)),
      moderateBullChopCooldownRelax,
      moderateSidewayChopGuardRelax,
      allowed: guardReasons.length === 0,
      guardReasons,
    };
  }

  return {
    VERSION,
    REGIME_PROFILES,
    TIER_BUCKETS,
    getProfile,
    computeTradeStats,
    computePlan,
  };
})();
