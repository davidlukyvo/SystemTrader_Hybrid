/* ══════════════════════════════════════════════════════════════════════════
   ANALYTICS ENGINE v1.0 — Intelligence Layer
   ──────────────────────────────────────────────────────────────────────────
   Aggregates 14-day trailing outcomes to detect edge decay and systemic shifts.
   Provides rolling stats for the Feedback Engine and Heatmap UI.
   ══════════════════════════════════════════════════════════════════════════ */

window.ANALYTICS_ENGINE = (() => {
  'use strict';

  const ROLLING_WINDOW_DAYS = 14;
  const ROLLING_WINDOW_MS = ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const ACTIONABLE_STATUSES = new Set(['READY', 'PLAYABLE', 'PROBE']);
  const POPULATIONS = Object.freeze({
    technical: 'technical',
    execution: 'execution',
    alert: 'alert',
    rejected: 'rejected',
  });
  const POPULATION_LABELS = Object.freeze({
    technical: 'Technical candidates',
    execution: 'Execution-approved candidates',
    alert: 'Alert-eligible candidates',
    rejected: 'Rejected candidates',
  });

  // Cache stats so we don't recalculate on every tick
  let _rollingStatsCache = {};
  let _lastCalcTime = {};
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 mins

  function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function upper(v) { return String(v || '').toUpperCase(); }

  function isBlockedReason(reason) {
    return /^dedup:/i.test(reason)
      || /^capital_guard:/i.test(reason)
      || /^pre_gate_blocked:/i.test(reason)
      || /^all_tiers_rejected$/i.test(reason)
      || /^no_execution_result$/i.test(reason);
  }

  function getSignalTruth(signal) {
    const displayStatus = upper(signal?.displayStatus || signal?.finalAuthorityStatus || signal?.status);
    const finalAuthorityStatus = upper(signal?.finalAuthorityStatus || signal?.displayStatus || signal?.status);
    const authorityDecision = upper(signal?.authorityDecision || signal?.decision);
    const executionTier = upper(signal?.executionTier || signal?.finalAuthorityStatus || signal?.displayStatus || signal?.status);
    const authorityReason = String(signal?.authorityReason || signal?.reason || '').trim();
    const explicitTechnical = signal?.isTechnicalCandidate === true;
    const explicitExecutionApproved = signal?.isExecutionApproved === true;
    const explicitAlertEligible = signal?.isAlertEligible === true;
    const explicitExecutionRejected = signal?.isExecutionRejected === true;
    const explicitPortfolioBound = signal?.isPortfolioBound === true;
    const technicalCandidate = explicitTechnical || ACTIONABLE_STATUSES.has(finalAuthorityStatus);
    const executionApproved = explicitExecutionApproved || (
      ['ALLOW', 'WAIT'].includes(authorityDecision)
      && signal?.executionGatePassed === true
      && signal?.executionActionable === true
      && ACTIONABLE_STATUSES.has(displayStatus)
      && executionTier !== 'OBSERVE'
      && !isBlockedReason(authorityReason)
    );
    const alertEligible = explicitAlertEligible || (executionApproved && executionTier !== 'OBSERVE' && !isBlockedReason(authorityReason));
    const portfolioBound = explicitPortfolioBound
      || String(signal?.authoritySource || signal?.source || '').toLowerCase() === 'portfolio_binding'
      || /^position_bound:/i.test(authorityReason);
    const executionRejected = explicitExecutionRejected || (authorityDecision === 'REJECT') || (!executionApproved && (technicalCandidate || !!authorityReason));

    return {
      displayStatus,
      finalAuthorityStatus,
      authorityDecision,
      authorityReason,
      executionTier,
      isTechnicalCandidate: technicalCandidate,
      isExecutionApproved: executionApproved,
      isAlertEligible: alertEligible,
      isExecutionRejected: executionRejected,
      isPortfolioBound: portfolioBound,
    };
  }

  function shouldUseSignalForPopulation(signal, population = POPULATIONS.execution) {
    const truth = getSignalTruth(signal);
    if (truth.isPortfolioBound) return false;
    if (population === POPULATIONS.technical) return truth.isTechnicalCandidate;
    if (population === POPULATIONS.alert) return truth.isAlertEligible;
    if (population === POPULATIONS.rejected) return truth.isExecutionRejected;
    return truth.isExecutionApproved;
  }

  /**
   * Main computation: Generates 14-day rolling stats for Sector (Category) & Setup
   */
  async function computeRollingStats(force = false, population = POPULATIONS.execution) {
    if (!force && _rollingStatsCache[population] && (Date.now() - (_lastCalcTime[population] || 0)) < CACHE_TTL_MS) {
      return _rollingStatsCache[population];
    }

    if (!window.DB) return { categories: {}, setups: {}, lastTradeMap: {} };

    // We only care about signals evaluated as outcomes recently or opened recently.
    const now = Date.now();
    const cutoff = now - ROLLING_WINDOW_MS;

    try {
      const outcomes = await DB.getOutcomes({});
      const signals = await DB.getSignals({});
      const sigMap = new Map(signals.map(s => [s.id, s]));
      const setupLabel = (sig) => {
        if (typeof window.getStructuralSetupLabel === 'function') return window.getStructuralSetupLabel(sig);
        return String(sig?.setup || sig?.structureTag || 'Unknown');
      };

      // Get outcomes evaluated within the window
      // Or outcomes mapping to signals opened within the window
      const recentOutcomes = outcomes.filter(o => {
        const sig = sigMap.get(o.signalId);
        const sigTs = sig ? _num(sig.timestamp || sig.scannedAt || 0) : 0;
        if (!sig || !shouldUseSignalForPopulation(sig, population)) return false;
        return (o.evaluatedAt >= cutoff) || (sigTs >= cutoff);
      });

      const catStats = {};
      const setupStats = {};
      const symbolStats = {};
      const sourceStats = {};
      const hourStats = {};
      const lastTradeMap = { category: {}, setup: {}, symbol: {} };

      for (const o of recentOutcomes) {
        const sig = sigMap.get(o.signalId);
        if (!sig) continue;

        let category = sig.category || 'OTHER';
        if (category === 'OTHER' && window.CATEGORY_ENGINE?.getCategory) {
          category = window.CATEGORY_ENGINE.getCategory(sig.symbol) || 'OTHER';
        }
        const setup = setupLabel(sig);
        const verdict = String(o.verdict || '').toLowerCase();
        
        // Track last trade timestamp for Unfreeze logic
        const sigTs = _num(sig.timestamp || sig.scannedAt || 0);
        lastTradeMap.category[category] = Math.max(lastTradeMap.category[category] || 0, sigTs);
        lastTradeMap.setup[setup] = Math.max(lastTradeMap.setup[setup] || 0, sigTs);
        lastTradeMap.symbol[sig.symbol] = Math.max(lastTradeMap.symbol[sig.symbol] || 0, sigTs);

        const source = String(sig.scanSource || sig.scanTrigger || 'manual').toLowerCase();
        const hour = new Date(sigTs).getHours();

        if (verdict === 'flat' || verdict === 'pending') continue; // only count realized edge

        const isWin = verdict === 'winner';
        const isLoss = verdict === 'loser';
        
        if (!isWin && !isLoss) continue;

        // Aggregate Category
        if (!catStats[category]) catStats[category] = { wins: 0, losses: 0, total: 0, sumR: 0, sumPct: 0 };
        catStats[category].total++;
        if (isWin) catStats[category].wins++;
        if (isLoss) catStats[category].losses++;
        catStats[category].sumR += _num(o.actualR);
        catStats[category].sumPct += _num(o.pctChange);

        // Aggregate Setup
        if (!setupStats[setup]) setupStats[setup] = { wins: 0, losses: 0, total: 0, sumR: 0, sumPct: 0 };
        setupStats[setup].total++;
        if (isWin) setupStats[setup].wins++;
        if (isLoss) setupStats[setup].losses++;
        setupStats[setup].sumR += _num(o.actualR);
        setupStats[setup].sumPct += _num(o.pctChange);

        // Aggregate Symbol
        const sym = sig.symbol;
        if (!symbolStats[sym]) symbolStats[sym] = { wins: 0, losses: 0, total: 0, sumR: 0, sumPct: 0 };
        symbolStats[sym].total++;
        if (isWin) symbolStats[sym].wins++;
        if (isLoss) symbolStats[sym].losses++;
        symbolStats[sym].sumR += _num(o.actualR);

        // Aggregate Source
        if (!sourceStats[source]) sourceStats[source] = { wins: 0, losses: 0, total: 0, sumR: 0, sumPct: 0 };
        sourceStats[source].total++;
        if (isWin) sourceStats[source].wins++;
        if (isLoss) sourceStats[source].losses++;
        sourceStats[source].sumR += _num(o.actualR);

        // Aggregate Hour
        if (!hourStats[hour]) hourStats[hour] = { wins: 0, losses: 0, total: 0, sumR: 0, sumPct: 0 };
        hourStats[hour].total++;
        if (isWin) hourStats[hour].wins++;
        if (isLoss) hourStats[hour].losses++;
        hourStats[hour].sumR += _num(o.actualR);
      }

      // Compute final percentages
      const finalize = (statsObj) => {
        const res = {};
        for (const [key, st] of Object.entries(statsObj)) {
          if (st.total === 0) continue;
          res[key] = {
            total: st.total,
            wins: st.wins,
            losses: st.losses,
            winRate: Number((st.wins / st.total * 100).toFixed(1)),
            avgR: Number((st.sumR / st.total).toFixed(3)),
            avgPct: Number((st.sumPct / st.total).toFixed(2))
          };
        }
        return res;
      };

      _rollingStatsCache[population] = {
        categories: finalize(catStats),
        setups: finalize(setupStats),
        symbols: finalize(symbolStats),
        sources: finalize(sourceStats),
        hours: finalize(hourStats),
        lastTradeMap: lastTradeMap,
        population,
        populationLabel: POPULATION_LABELS[population] || POPULATION_LABELS.execution,
        updatedAt: now
      };
      _lastCalcTime[population] = now;

      return _rollingStatsCache[population];
    } catch (err) {
      console.error('[ANALYTICS-ENGINE] Rolling stats computation failed:', err);
      return { categories: {}, setups: {}, lastTradeMap: {} };
    }
  }

  function getCachedStats(population = POPULATIONS.execution) {
    return _rollingStatsCache[population] || { categories: {}, setups: {}, lastTradeMap: {}, population };
  }

  return {
    computeRollingStats,
    getCachedStats,
    getSignalTruth,
    shouldUseSignalForPopulation,
    POPULATIONS,
    POPULATION_LABELS,
    ROLLING_WINDOW_DAYS
  };
})();
