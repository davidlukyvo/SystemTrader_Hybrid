/* ══════════════════════════════════════════════════════════
   OUTCOME EVALUATOR — Checkpoint Snapshot Evaluation
   Evaluates signal performance at D1/D3/D7/D14/D30
   
   NOTE: This is a checkpoint/snapshot evaluation.
   It captures the price at the checkpoint moment,
   NOT a full price-path replay. A signal may have hit
   TP1 intra-day then pulled back — this evaluator
   only checks the closing snapshot at each interval.
   ══════════════════════════════════════════════════════════ */

window.OUTCOME_EVAL = (() => {
  const CHECK_DAYS = ['D1', 'D3', 'D7', 'D14', 'D30'];
  const DAY_MS = {
    D1: 1 * 24 * 60 * 60 * 1000,
    D3: 3 * 24 * 60 * 60 * 1000,
    D7: 7 * 24 * 60 * 60 * 1000,
    D14: 14 * 24 * 60 * 60 * 1000,
    D30: 30 * 24 * 60 * 60 * 1000,
  };
  const MAX_EVALS_PER_SESSION = 150;
  const PRICE_CACHE_TTL = 5 * 60 * 1000;

  const _priceCache = new Map();

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function roundR(v) {
    return Number((Number(v) || 0).toFixed(3));
  }

  function plannedTp1R(signal, entry, stop, tp1) {
    const explicit = Number(signal?.rr);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const risk = Math.max(1e-9, Math.abs(Number(entry || 0) - Number(stop || 0)));
    const computed = risk > 0 && Number(tp1 || 0) > Number(entry || 0) ? (Number(tp1) - Number(entry)) / risk : 0;
    return Number.isFinite(computed) && computed > 0 ? computed : 0;
  }

  function normalizePlannedTradeOutcome(signal, actualR, hitStop, hitTp1, entry, stop, tp1) {
    const capR = plannedTp1R(signal, entry, stop, tp1);
    let plannedTradeR;
    if (hitStop) plannedTradeR = -1;
    else if (hitTp1) plannedTradeR = capR;
    else plannedTradeR = capR > 0 ? clamp(actualR, -1, capR) : Math.max(actualR, -1);

    plannedTradeR = roundR(plannedTradeR);
    const rawCheckpointR = roundR(actualR);
    const plannedTradeCapApplied = plannedTradeR !== rawCheckpointR;
    const plannedTradeVerdict = plannedTradeR > 0 ? 'winner' : plannedTradeR < 0 ? 'loser' : 'flat';

    return {
      rawCheckpointR,
      plannedTradeR,
      plannedTradeVerdict,
      outcomeRMode: plannedTradeCapApplied ? 'planned_trade_capped' : 'raw_checkpoint_mtm',
      plannedTradeCapApplied,
    };
  }

  function outcomePlannedR(outcome) {
    const planned = Number(outcome?.plannedTradeR);
    if (Number.isFinite(planned)) return planned;
    return Number(outcome?.actualR || 0);
  }

  function outcomeRawCheckpointR(outcome) {
    const raw = Number(outcome?.rawCheckpointR);
    if (Number.isFinite(raw)) return raw;
    return Number(outcome?.actualR || 0);
  }

  function outcomePopulationLabel(population) {
    return window.ANALYTICS_ENGINE?.POPULATION_LABELS?.[population] || 'Execution-approved candidates';
  }

  function analyticsScoreFieldLabel() {
    return 'riskAdjustedScore';
  }

  function analyticsScoreValue(sig) {
    if (!sig || typeof sig !== 'object') return 0;
    const explicit = Number(sig.riskAdjustedScore);
    if (Number.isFinite(explicit)) return explicit;
    const breakdown = Number(sig.scoreBreakdown?.riskAdjusted);
    if (Number.isFinite(breakdown)) return breakdown;
    return Number(sig.rawScannerScore ?? sig.score ?? 0) || 0;
  }

  async function buildOutcomeSamples(population = 'execution') {
    const outcomes = await DB.getOutcomes({});
    const signals = await DB.getSignals({});
    const sigMap = new Map(signals.map(s => [s.id, s]));
    const setupLabel = (sig) => {
      if (typeof window.getStructuralSetupLabel === 'function') return window.getStructuralSetupLabel(sig);
      return String(sig?.setup || sig?.structureTag || 'Unknown');
    };
    const classify = (sig) => window.ANALYTICS_ENGINE?.getSignalTruth ? window.ANALYTICS_ENGINE.getSignalTruth(sig) : {
      isTechnicalCandidate: sig?.isTechnicalCandidate === true,
      isExecutionApproved: sig?.isExecutionApproved === true,
      isAlertEligible: sig?.isAlertEligible === true,
      isExecutionRejected: sig?.isExecutionRejected === true,
      isPortfolioBound: sig?.isPortfolioBound === true,
    };
    const useSignal = (sig) => window.ANALYTICS_ENGINE?.shouldUseSignalForPopulation
      ? window.ANALYTICS_ENGINE.shouldUseSignalForPopulation(sig, population)
      : sig?.isExecutionApproved === true;

    const samples = [];
    for (const o of outcomes) {
      const sig = sigMap.get(o.signalId);
      if (!sig || !useSignal(sig)) continue;
      samples.push({
        outcome: o,
        signal: sig,
        setup: setupLabel(sig),
        truth: classify(sig),
      });
    }

    return {
      population,
      populationLabel: outcomePopulationLabel(population),
      samples,
      outcomes,
      signals,
      sigMap,
    };
  }

  async function getAnalyticsTruthSummary() {
    const outcomes = await DB.getOutcomes({});
    const signals = await DB.getSignals({});
    const sigMap = new Map(signals.map(s => [s.id, s]));
    const classify = (sig) => window.ANALYTICS_ENGINE?.getSignalTruth ? window.ANALYTICS_ENGINE.getSignalTruth(sig) : {
      isTechnicalCandidate: sig?.isTechnicalCandidate === true,
      isExecutionApproved: sig?.isExecutionApproved === true,
      isAlertEligible: sig?.isAlertEligible === true,
      isExecutionRejected: sig?.isExecutionRejected === true,
      isPortfolioBound: sig?.isPortfolioBound === true,
    };
    const summary = {
      totalSignals: signals.length,
      totalOutcomes: outcomes.length,
      technicalSignals: 0,
      executionSignals: 0,
      alertSignals: 0,
      rejectedSignals: 0,
      portfolioBoundSignals: 0,
      technicalOutcomes: 0,
      executionOutcomes: 0,
      alertOutcomes: 0,
      rejectedOutcomes: 0,
      portfolioBoundOutcomes: 0,
    };

    for (const sig of signals) {
      const truth = classify(sig);
      if (truth.isTechnicalCandidate) summary.technicalSignals += 1;
      if (truth.isExecutionApproved) summary.executionSignals += 1;
      if (truth.isAlertEligible) summary.alertSignals += 1;
      if (truth.isExecutionRejected) summary.rejectedSignals += 1;
      if (truth.isPortfolioBound) summary.portfolioBoundSignals += 1;
    }

    for (const o of outcomes) {
      const sig = sigMap.get(o.signalId);
      if (!sig) continue;
      const truth = classify(sig);
      if (truth.isTechnicalCandidate) summary.technicalOutcomes += 1;
      if (truth.isExecutionApproved && !truth.isPortfolioBound) summary.executionOutcomes += 1;
      if (truth.isAlertEligible && !truth.isPortfolioBound) summary.alertOutcomes += 1;
      if (truth.isExecutionRejected && !truth.isPortfolioBound) summary.rejectedOutcomes += 1;
      if (truth.isPortfolioBound) summary.portfolioBoundOutcomes += 1;
    }

    return summary;
  }

  async function fetchCurrentPrice(symbol) {
    const pair = symbol.toUpperCase().replace(/USDT$/i, '') + 'USDT';
    const cached = _priceCache.get(pair);
    if (cached && (Date.now() - cached.ts) < PRICE_CACHE_TTL) return cached.price;

    try {
      if (window.NET_GUARD && typeof NET_GUARD.getCooldownLeftMs === 'function' && NET_GUARD.getCooldownLeftMs()) return null;
      if (window.NET_GUARD && typeof NET_GUARD.waitTurn === 'function') await NET_GUARD.waitTurn('outcome');

      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`);
      if (!res.ok) return null;
      const data = await res.json();
      const price = parseFloat(data.price);
      if (!Number.isFinite(price) || price <= 0) return null;

      _priceCache.set(pair, { price, ts: Date.now() });
      return price;
    } catch (err) {
      console.warn('[OUTCOME] Price fetch failed for', pair, err.message);
      return null;
    }
  }

  function evaluateOutcome(signal, currentPrice, checkDay) {
    const priceAtSignal = Number(signal.priceAtSignal || signal.entry || 0);
    if (!priceAtSignal || !currentPrice) return null;

    const pctChange = ((currentPrice - priceAtSignal) / priceAtSignal) * 100;
    const entry = Number(signal.entry || priceAtSignal);
    const stop = Number(signal.stop || 0);
    const tp1 = Number(signal.tp1 || 0);
    const tp2 = Number(signal.tp2 || 0);

    const risk = Math.max(1e-9, Math.abs(entry - stop));
    const actualR = stop > 0 ? (currentPrice - entry) / risk : pctChange / 100;

    const hitTp1 = tp1 > 0 && currentPrice >= tp1;
    const hitTp2 = tp2 > 0 && currentPrice >= tp2;
    const hitStop = stop > 0 && currentPrice <= stop;

    let verdict = 'flat';
    if (hitTp1) verdict = 'winner';
    else if (hitStop) verdict = 'loser';
    else if (pctChange > 3) verdict = 'winner';
    else if (pctChange < -3) verdict = 'loser';

    const planned = normalizePlannedTradeOutcome(signal, actualR, hitStop, hitTp1, entry, stop, tp1);

    return {
      id: `out-${signal.id}-${checkDay}`,
      signalId: signal.id,
      symbol: signal.symbol,
      checkDay,
      evaluatedAt: Date.now(),
      priceAtSignal,
      priceAtCheck: currentPrice,
      pctChange: Number(pctChange.toFixed(2)),
      hitTp1,
      hitTp2,
      hitStop,
      actualR: planned.rawCheckpointR,
      rawCheckpointR: planned.rawCheckpointR,
      plannedTradeR: planned.plannedTradeR,
      plannedTradeVerdict: planned.plannedTradeVerdict,
      outcomeRMode: planned.outcomeRMode,
      plannedTradeCapApplied: planned.plannedTradeCapApplied,
      verdict,
      evaluationType: 'checkpoint_snapshot',
    };
  }

  async function runEvaluation(progressCb, externalPriceMap = null) {
    if (!window.DB) {
      console.warn('[OUTCOME] DB not available');
      return { evaluated: 0, error: 'DB not ready' };
    }

    let totalEvaluated = 0;
    const results = [];

    for (const checkDay of CHECK_DAYS) {
      if (totalEvaluated >= MAX_EVALS_PER_SESSION) break;

      const unevaluated = await DB.getUnevaluatedSignals(checkDay);
      if (!unevaluated.length) continue;

      if (progressCb) progressCb(`Evaluating ${checkDay}: ${unevaluated.length} signals pending`, Math.round((CHECK_DAYS.indexOf(checkDay) / CHECK_DAYS.length) * 100));

      const bySymbol = new Map();
      for (const sig of unevaluated) {
        if (!bySymbol.has(sig.symbol)) bySymbol.set(sig.symbol, []);
        bySymbol.get(sig.symbol).push(sig);
      }

      for (const [symbol, signals] of bySymbol) {
        if (totalEvaluated >= MAX_EVALS_PER_SESSION) break;

        let price = externalPriceMap ? Number(externalPriceMap[symbol] || externalPriceMap[symbol + 'USDT']) : null;
        if (!price) price = await fetchCurrentPrice(symbol);
        if (!price) continue;

        for (const signal of signals) {
          if (totalEvaluated >= MAX_EVALS_PER_SESSION) break;

          const outcome = evaluateOutcome(signal, price, checkDay);
          if (!outcome) continue;

          await DB.addOutcome(outcome);
          
          // Mark signal so we don't re-eval this day
          const evaluated = Array.isArray(signal.outcomesEvaluated) ? signal.outcomesEvaluated : [];
          if (!evaluated.includes(checkDay)) {
            evaluated.push(checkDay);
            await DB.updateSignal(signal.id, { outcomesEvaluated: evaluated });
          }

          results.push(outcome);
          totalEvaluated++;
        }
      }
    }

    if (progressCb) progressCb('Done evaluating ' + totalEvaluated + ' outcomes', 100);
    console.log('[OUTCOME] Evaluated ' + totalEvaluated + ' checkpoint snapshots');
    return { evaluated: totalEvaluated, results };
  }

  /* ── Analytics Aggregation Helpers ────────────────────── */

  async function getSetupPerformance(population = 'execution') {
    const { samples, populationLabel } = await buildOutcomeSamples(population);
    const bySetup = new Map();
    for (const sample of samples) {
      const setup = sample.setup || 'Unknown';
      if (!bySetup.has(setup)) bySetup.set(setup, []);
      bySetup.get(setup).push(Object.assign({}, sample.outcome, { signal: sample.signal, truth: sample.truth }));
    }

    return [...bySetup.entries()].map(function(entry) {
      var setup = entry[0], outcomes = entry[1];
      var winners = outcomes.filter(function(o) { return o.verdict === 'winner'; });
      var losers = outcomes.filter(function(o) { return o.verdict === 'loser'; });
      var avgPct = outcomes.reduce(function(s, o) { return s + (o.pctChange || 0); }, 0) / Math.max(outcomes.length, 1);
      var avgRawCheckpointR = outcomes.reduce(function(s, o) { return s + outcomeRawCheckpointR(o); }, 0) / Math.max(outcomes.length, 1);
      var avgPlannedTradeR = outcomes.reduce(function(s, o) { return s + outcomePlannedR(o); }, 0) / Math.max(outcomes.length, 1);
      return {
        setup: setup,
        total: outcomes.length,
        winners: winners.length,
        losers: losers.length,
        winRate: outcomes.length ? Math.round((winners.length / outcomes.length) * 100) : 0,
        avgPctChange: Number(avgPct.toFixed(2)),
        avgR: Number(avgPlannedTradeR.toFixed(3)),
        avgPlannedTradeR: Number(avgPlannedTradeR.toFixed(3)),
        avgRawCheckpointR: Number(avgRawCheckpointR.toFixed(3)),
        avgRMode: 'planned_trade_capped',
        population: population,
        populationLabel: populationLabel,
      };
    }).sort(function(a, b) { return b.winRate - a.winRate || b.avgR - a.avgR; });
  }

  async function getCategoryPerformance(population = 'execution') {
    const { samples, populationLabel } = await buildOutcomeSamples(population);
    const byCategory = new Map();
    for (const sample of samples) {
      const sig = sample.signal;
      let category = sig ? sig.category : null;
      if (!category && sig?.symbol) {
        category = window.CATEGORY_ENGINE?.getCategory ? window.CATEGORY_ENGINE.getCategory(sig.symbol) : 'OTHER';
      }
      category = category || 'OTHER';
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(Object.assign({}, sample.outcome, { signal: sig, truth: sample.truth }));
    }

    return [...byCategory.entries()].map(function(entry) {
      var category = entry[0], _outcomes = entry[1];
      var winners = _outcomes.filter(function(o) { return o.verdict === 'winner'; });
      var losers = _outcomes.filter(function(o) { return o.verdict === 'loser'; });
      var avgPct = _outcomes.reduce(function(s, o) { return s + (o.pctChange || 0); }, 0) / Math.max(_outcomes.length, 1);
      var avgRawCheckpointR = _outcomes.reduce(function(s, o) { return s + outcomeRawCheckpointR(o); }, 0) / Math.max(_outcomes.length, 1);
      var avgPlannedTradeR = _outcomes.reduce(function(s, o) { return s + outcomePlannedR(o); }, 0) / Math.max(_outcomes.length, 1);
      return {
        category: category,
        total: _outcomes.length,
        winners: winners.length,
        losers: losers.length,
        winRate: _outcomes.length ? Math.round((winners.length / _outcomes.length) * 100) : 0,
        avgPctChange: Number(avgPct.toFixed(2)),
        avgR: Number(avgPlannedTradeR.toFixed(3)),
        avgPlannedTradeR: Number(avgPlannedTradeR.toFixed(3)),
        avgRawCheckpointR: Number(avgRawCheckpointR.toFixed(3)),
        avgRMode: 'planned_trade_capped',
        population: population,
        populationLabel: populationLabel,
      };
    }).sort(function(a, b) { return b.winRate - a.winRate || b.avgR - a.avgR; });
  }

  async function getRegimePerformance(population = 'execution') {
    const { samples, populationLabel } = await buildOutcomeSamples(population);
    const byRegime = new Map();
    for (const sample of samples) {
      const o = sample.outcome;
      const sig = sample.signal;
      const regime = sig ? (sig.btcContext || 'unknown') : 'unknown';
      if (!byRegime.has(regime)) byRegime.set(regime, []);
      byRegime.get(regime).push(o);
    }

    return [...byRegime.entries()].map(function(entry) {
      var regime = entry[0], outcomes = entry[1];
      var winners = outcomes.filter(function(o) { return o.verdict === 'winner'; });
      var losers = outcomes.filter(function(o) { return o.verdict === 'loser'; });
      var avgPct = outcomes.reduce(function(s, o) { return s + (o.pctChange || 0); }, 0) / Math.max(outcomes.length, 1);
      return {
        regime: regime,
        total: outcomes.length,
        winners: winners.length,
        losers: losers.length,
        winRate: outcomes.length ? Math.round((winners.length / outcomes.length) * 100) : 0,
        avgPctChange: Number(avgPct.toFixed(2)),
        population: population,
        populationLabel: populationLabel,
      };
    }).sort(function(a, b) { return b.winRate - a.winRate; });
  }

  async function getScoreBucketPerformance(population = 'execution') {
    const { samples, populationLabel } = await buildOutcomeSamples(population);
    const buckets = [
      { label: '80-100', min: 80, max: 100 },
      { label: '60-79', min: 60, max: 79 },
      { label: '40-59', min: 40, max: 59 },
      { label: '20-39', min: 20, max: 39 },
      { label: '0-19', min: 0, max: 19 },
    ];

    return buckets.map(function(bucket) {
      var relevant = samples.map(function(s) { return Object.assign({}, s.outcome, { signal: s.signal }); }).filter(function(o) {
        var sig = o.signal;
        var score = analyticsScoreValue(sig);
        return score >= bucket.min && score <= bucket.max;
      });
      var winners = relevant.filter(function(o) { return o.verdict === 'winner'; });
      var losers = relevant.filter(function(o) { return o.verdict === 'loser'; });
      var avgPct = relevant.reduce(function(s, o) { return s + (o.pctChange || 0); }, 0) / Math.max(relevant.length, 1);
      return {
        bucket: bucket.label,
        total: relevant.length,
        winners: winners.length,
        losers: losers.length,
        winRate: relevant.length ? Math.round((winners.length / relevant.length) * 100) : 0,
        avgPctChange: Number(avgPct.toFixed(2)),
        population: population,
        populationLabel: populationLabel,
        scoreField: analyticsScoreFieldLabel(),
      };
    });
  }

  async function getHoldingPeriodPerformance(population = 'execution') {
    const { samples, populationLabel } = await buildOutcomeSamples(population);
    const outcomes = samples.map(function(sample) { return sample.outcome; });

    return CHECK_DAYS.map(function(day) {
      var dayOutcomes = outcomes.filter(function(o) { return o.checkDay === day; });
      var winners = dayOutcomes.filter(function(o) { return o.verdict === 'winner'; });
      var losers = dayOutcomes.filter(function(o) { return o.verdict === 'loser'; });
      var avgPct = dayOutcomes.reduce(function(s, o) { return s + (o.pctChange || 0); }, 0) / Math.max(dayOutcomes.length, 1);
      var avgRawCheckpointR = dayOutcomes.reduce(function(s, o) { return s + outcomeRawCheckpointR(o); }, 0) / Math.max(dayOutcomes.length, 1);
      var avgPlannedTradeR = dayOutcomes.reduce(function(s, o) { return s + outcomePlannedR(o); }, 0) / Math.max(dayOutcomes.length, 1);
      return {
        period: day,
        total: dayOutcomes.length,
        winners: winners.length,
        losers: losers.length,
        winRate: dayOutcomes.length ? Math.round((winners.length / dayOutcomes.length) * 100) : 0,
        avgPctChange: Number(avgPct.toFixed(2)),
        avgR: Number(avgPlannedTradeR.toFixed(3)),
        avgPlannedTradeR: Number(avgPlannedTradeR.toFixed(3)),
        avgRawCheckpointR: Number(avgRawCheckpointR.toFixed(3)),
        avgRMode: 'planned_trade_capped',
        population: population,
        populationLabel: populationLabel,
      };
    });
  }

  function normalizeOutcomeMetric(outcome, key, fallbackKey = 'actualR') {
    const direct = Number(outcome?.[key]);
    if (Number.isFinite(direct)) return direct;
    const fallback = Number(outcome?.[fallbackKey]);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  function getOutcomeTier(signal = {}) {
    return String(signal.displayStatus || signal.finalAuthorityStatus || signal.executionTier || signal.status || 'WATCH').toUpperCase();
  }

  function getLearningPool(signal = {}) {
    const pool = String(signal.learningPool || '').toLowerCase();
    if (pool) return pool;
    const truth = window.ANALYTICS_ENGINE?.getSignalTruth?.(signal);
    return truth?.isExecutionApproved ? 'execution' : truth?.isTechnicalCandidate ? 'near_approved' : 'excluded';
  }

  function scoreBucket(value, mode = 'quality') {
    if (Array.isArray(value)) return value.length ? value : ['none'];
    if (value == null || value === '') return ['unknown'];
    if (typeof value === 'string') return [value || 'unknown'];
    const n = Number(value);
    if (!Number.isFinite(n)) return ['unknown'];
    if (mode === 'risk') {
      if (n >= 75) return ['high_risk_75_100'];
      if (n >= 50) return ['elevated_risk_50_74'];
      if (n >= 25) return ['moderate_risk_25_49'];
      return ['low_risk_0_24'];
    }
    if (n >= 80) return ['strong_80_100'];
    if (n >= 60) return ['good_60_79'];
    if (n >= 40) return ['mixed_40_59'];
    return ['weak_0_39'];
  }

  function sessionBucket(timestamp) {
    const hour = new Date(Number(timestamp || Date.now())).getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  function noteCategory(note = '') {
    const raw = String(note || '').toLowerCase();
    if (!raw) return 'unknown';
    if (raw.includes('ready authority')) return 'ready_authority_present';
    if (raw.includes('playable')) return raw.includes('trigger is still wait') ? 'playable_wait_trigger' : 'playable_authority_present';
    if (raw.includes('probe')) return 'probe_monitoring_grade';
    if (raw.includes('not actionable') || raw.includes('reject')) return 'not_actionable';
    return 'general_review_only';
  }

  function summarizeAttributionRows(map) {
    return Array.from(map.values())
      .map(row => {
        const total = Math.max(1, row.total);
        row.avgPlannedTradeR = Number((row.sumPlannedTradeR / total).toFixed(3));
        row.avgRawCheckpointR = Number((row.sumRawCheckpointR / total).toFixed(3));
        row.avgGapR = Number(((row.sumRawCheckpointR - row.sumPlannedTradeR) / total).toFixed(3));
        row.winRate = Number(((row.plannedWins / total) * 100).toFixed(1));
        row.sampleConfidence = sampleConfidence(row.total);
        row.sampleWarning = row.sampleConfidence.shouldWarn ? 'Do not tune from low sample size.' : '';
        delete row.sumPlannedTradeR;
        delete row.sumRawCheckpointR;
        return row;
      })
      .sort((a, b) => b.total - a.total || b.avgPlannedTradeR - a.avgPlannedTradeR);
  }

  function sampleConfidence(total) {
    const n = Number(total || 0);
    if (n < 10) return { level: 'very_low_confidence', label: 'Very low confidence', shouldWarn: true };
    if (n <= 30) return { level: 'low_confidence', label: 'Low confidence', shouldWarn: true };
    if (n <= 100) return { level: 'moderate_observation', label: 'Moderate observation', shouldWarn: false };
    return { level: 'stronger_observation', label: 'Stronger observation', shouldWarn: false };
  }

  function addAttribution(map, key, sample) {
    const label = String(key || 'unknown');
    if (!map.has(label)) {
      map.set(label, {
        key: label,
        total: 0,
        plannedWins: 0,
        plannedLosses: 0,
        rawWins: 0,
        rawLosses: 0,
        sumPlannedTradeR: 0,
        sumRawCheckpointR: 0,
        capApplied: 0,
      });
    }
    const row = map.get(label);
    row.total += 1;
    row.sumPlannedTradeR += sample.plannedTradeR;
    row.sumRawCheckpointR += sample.rawCheckpointR;
    if (sample.plannedTradeR > 0) row.plannedWins += 1;
    if (sample.plannedTradeR < 0) row.plannedLosses += 1;
    if (sample.rawCheckpointR > 0) row.rawWins += 1;
    if (sample.rawCheckpointR < 0) row.rawLosses += 1;
    if (sample.plannedTradeCapApplied) row.capApplied += 1;
  }

  async function getOutcomeAttributionReport(options = {}) {
    if (!window.DB) return { ok: false, reason: 'DB unavailable' };
    const outcomes = await DB.getOutcomes({});
    const signals = await DB.getSignals({});
    const sigMap = new Map((signals || []).map(sig => [sig.id, sig]));

    const groups = {
      byTier: new Map(),
      byLearningPool: new Map(),
      mbe: {
        priceZoneQuality: new Map(),
        volumeSupportScore: new Map(),
        volumeResistanceRisk: new Map(),
        pathToTPQuality: new Map(),
        failureModeCandidate: new Map(),
      },
      agentReview: {
        bullCaseCount: new Map(),
        bearCaseCount: new Map(),
        riskFlags: new Map(),
        finalOperatorNoteCategory: new Map(),
      },
      context: {
        btcContext: new Map(),
        regimeType: new Map(),
        scanHour: new Map(),
        session: new Map(),
      },
    };

    const samples = [];
    const gaps = {
      plannedWinRawWeak: [],
      plannedCappedRawRanFurther: [],
      stopHitRawRecovered: [],
    };
    const quality = {
      plannedTradeRCovered: 0,
      rawCheckpointRCovered: 0,
      agentReviewCovered: 0,
      mbeFullOhlcvCovered: 0,
      legacyOutcomes: 0,
    };

    for (const outcome of outcomes || []) {
      const signal = sigMap.get(outcome.signalId);
      if (!signal) continue;
      const plannedTradeR = normalizeOutcomeMetric(outcome, 'plannedTradeR');
      const rawCheckpointR = normalizeOutcomeMetric(outcome, 'rawCheckpointR');
      const hasPlannedTradeR = Number.isFinite(Number(outcome.plannedTradeR));
      const hasRawCheckpointR = Number.isFinite(Number(outcome.rawCheckpointR));
      if (hasPlannedTradeR) quality.plannedTradeRCovered += 1;
      if (hasRawCheckpointR) quality.rawCheckpointRCovered += 1;
      if (!hasPlannedTradeR || !hasRawCheckpointR) quality.legacyOutcomes += 1;
      if (signal.agentReview && typeof signal.agentReview === 'object') quality.agentReviewCovered += 1;
      if (
        signal.behaviorInputQuality === 'full_ohlcv' ||
        signal.agentReview?.behaviorEvidenceSummary?.inputQuality === 'full_ohlcv'
      ) quality.mbeFullOhlcvCovered += 1;
      const sample = {
        signal,
        outcome,
        symbol: signal.symbol || outcome.symbol || 'UNKNOWN',
        checkDay: outcome.checkDay || 'unknown',
        tier: getOutcomeTier(signal),
        learningPool: getLearningPool(signal),
        plannedTradeR,
        rawCheckpointR,
        plannedTradeCapApplied: outcome.plannedTradeCapApplied === true || plannedTradeR !== rawCheckpointR,
      };
      samples.push(sample);

      addAttribution(groups.byTier, sample.tier, sample);
      addAttribution(groups.byLearningPool, sample.learningPool, sample);

      for (const key of scoreBucket(signal.priceZoneQuality)) addAttribution(groups.mbe.priceZoneQuality, key, sample);
      for (const key of scoreBucket(signal.volumeSupportScore)) addAttribution(groups.mbe.volumeSupportScore, key, sample);
      for (const key of scoreBucket(signal.volumeResistanceRisk, 'risk')) addAttribution(groups.mbe.volumeResistanceRisk, key, sample);
      for (const key of scoreBucket(signal.pathToTPQuality)) addAttribution(groups.mbe.pathToTPQuality, key, sample);
      for (const key of scoreBucket(signal.failureModeCandidate)) addAttribution(groups.mbe.failureModeCandidate, key, sample);

      const review = signal.agentReview || {};
      const bullCount = Array.isArray(review.bullCase) ? review.bullCase.length : 0;
      const bearCount = Array.isArray(review.bearCase) ? review.bearCase.length : 0;
      const riskFlags = Array.isArray(review.behaviorEvidenceSummary?.riskFlags) ? review.behaviorEvidenceSummary.riskFlags : [];
      addAttribution(groups.agentReview.bullCaseCount, bullCount >= 4 ? 'bull_4_plus' : bullCount >= 2 ? 'bull_2_3' : bullCount === 1 ? 'bull_1' : 'bull_0', sample);
      addAttribution(groups.agentReview.bearCaseCount, bearCount >= 4 ? 'bear_4_plus' : bearCount >= 2 ? 'bear_2_3' : bearCount === 1 ? 'bear_1' : 'bear_0', sample);
      if (riskFlags.length) riskFlags.forEach(flag => addAttribution(groups.agentReview.riskFlags, flag, sample));
      else addAttribution(groups.agentReview.riskFlags, 'none', sample);
      addAttribution(groups.agentReview.finalOperatorNoteCategory, noteCategory(review.finalOperatorNote), sample);

      const ts = Number(signal.timestamp || signal.scannedAt || outcome.evaluatedAt || 0);
      const hour = Number.isFinite(ts) && ts > 0 ? new Date(ts).getHours() : 'unknown';
      addAttribution(groups.context.btcContext, signal.btcContext || 'unknown', sample);
      addAttribution(groups.context.regimeType, signal.regimeType || signal.regime || signal.authorityTrace?.macro?.regimeType || 'unknown', sample);
      addAttribution(groups.context.scanHour, hour === 'unknown' ? 'unknown' : String(hour).padStart(2, '0') + ':00', sample);
      addAttribution(groups.context.session, hour === 'unknown' ? 'unknown' : sessionBucket(ts), sample);

      const gapRow = {
        symbol: sample.symbol,
        checkDay: sample.checkDay,
        tier: sample.tier,
        learningPool: sample.learningPool,
        plannedTradeR: Number(plannedTradeR.toFixed(3)),
        rawCheckpointR: Number(rawCheckpointR.toFixed(3)),
        gapR: Number((rawCheckpointR - plannedTradeR).toFixed(3)),
      };
      if (plannedTradeR > 0 && rawCheckpointR <= 0) gaps.plannedWinRawWeak.push(gapRow);
      if (plannedTradeR > 0 && rawCheckpointR >= plannedTradeR + 1) gaps.plannedCappedRawRanFurther.push(gapRow);
      if ((outcome.hitStop === true || plannedTradeR <= -1) && rawCheckpointR > 0) gaps.stopHitRawRecovered.push(gapRow);
    }

    const topGap = rows => rows.sort((a, b) => Math.abs(b.gapR) - Math.abs(a.gapR)).slice(0, Number(options.limit || 12));
    const byTier = summarizeAttributionRows(groups.byTier);
    const byLearningPool = summarizeAttributionRows(groups.byLearningPool);
    const mbe = Object.fromEntries(Object.entries(groups.mbe).map(([k, v]) => [k, summarizeAttributionRows(v)]));
    const agentReview = Object.fromEntries(Object.entries(groups.agentReview).map(([k, v]) => [k, summarizeAttributionRows(v)]));
    const context = Object.fromEntries(Object.entries(groups.context).map(([k, v]) => [k, summarizeAttributionRows(v)]));
    const matchedTotal = Math.max(1, samples.length);
    const rowBest = rows => (rows || []).filter(r => r.key !== 'unknown' && r.key !== 'none').sort((a, b) => b.avgPlannedTradeR - a.avgPlannedTradeR)[0] || null;
    const rowWeak = rows => (rows || []).filter(r => r.key !== 'unknown' && r.key !== 'none').sort((a, b) => a.avgPlannedTradeR - b.avgPlannedTradeR)[0] || null;
    const failureModeRows = (mbe.failureModeCandidate || []).filter(r => r.key !== 'unknown' && r.key !== 'none');
    const strongestMbe = ['priceZoneQuality', 'volumeSupportScore', 'volumeResistanceRisk', 'pathToTPQuality', 'failureModeCandidate']
      .map(key => ({ group: key, row: rowBest(mbe[key]) }))
      .filter(item => item.row)
      .sort((a, b) => b.row.avgPlannedTradeR - a.row.avgPlannedTradeR)[0] || null;
    const weakestMbe = ['priceZoneQuality', 'volumeSupportScore', 'volumeResistanceRisk', 'pathToTPQuality', 'failureModeCandidate']
      .map(key => ({ group: key, row: rowWeak(mbe[key]) }))
      .filter(item => item.row)
      .sort((a, b) => a.row.avgPlannedTradeR - b.row.avgPlannedTradeR)[0] || null;
    const mostCommonFailureMode = failureModeRows.sort((a, b) => b.total - a.total)[0] || null;
    const dataQuality = {
      plannedTradeRCoverage: { count: quality.plannedTradeRCovered, pct: Number(((quality.plannedTradeRCovered / matchedTotal) * 100).toFixed(1)) },
      rawCheckpointRCoverage: { count: quality.rawCheckpointRCovered, pct: Number(((quality.rawCheckpointRCovered / matchedTotal) * 100).toFixed(1)) },
      agentReviewCoverage: { count: quality.agentReviewCovered, pct: Number(((quality.agentReviewCovered / matchedTotal) * 100).toFixed(1)) },
      mbeFullOhlcvCoverage: { count: quality.mbeFullOhlcvCovered, pct: Number(((quality.mbeFullOhlcvCovered / matchedTotal) * 100).toFixed(1)) },
      legacyOutcomeCount: quality.legacyOutcomes,
    };
    const topInsights = {
      scope: 'Analytics only, no automatic tuning.',
      tierPlannedTradeR: byTier.map(r => ({ key: r.key, total: r.total, avgPlannedTradeR: r.avgPlannedTradeR, sampleConfidence: r.sampleConfidence })),
      learningPoolPlannedTradeR: byLearningPool.map(r => ({ key: r.key, total: r.total, avgPlannedTradeR: r.avgPlannedTradeR, sampleConfidence: r.sampleConfidence })),
      strongestMbeBucket: strongestMbe ? { group: strongestMbe.group, key: strongestMbe.row.key, total: strongestMbe.row.total, avgPlannedTradeR: strongestMbe.row.avgPlannedTradeR, sampleConfidence: strongestMbe.row.sampleConfidence } : null,
      weakestMbeBucket: weakestMbe ? { group: weakestMbe.group, key: weakestMbe.row.key, total: weakestMbe.row.total, avgPlannedTradeR: weakestMbe.row.avgPlannedTradeR, sampleConfidence: weakestMbe.row.sampleConfidence } : null,
      mostCommonFailureMode: mostCommonFailureMode ? { key: mostCommonFailureMode.key, total: mostCommonFailureMode.total, avgPlannedTradeR: mostCommonFailureMode.avgPlannedTradeR, sampleConfidence: mostCommonFailureMode.sampleConfidence } : null,
      gapCases: {
        plannedWinRawWeak: gaps.plannedWinRawWeak.length,
        plannedCappedRawRanFurther: gaps.plannedCappedRawRanFurther.length,
        stopHitRawRecovered: gaps.stopHitRawRecovered.length,
      },
    };

    return {
      ok: true,
      reportType: 'read_only_outcome_attribution',
      metricSemantics: {
        primary: 'plannedTradeR = planned trade performance',
        secondary: 'rawCheckpointR = raw checkpoint follow-through',
        legacy: 'actualR remains raw checkpoint mark-to-market',
      },
      totalOutcomes: outcomes.length,
      matchedSamples: samples.length,
      sampleConfidence: sampleConfidence(samples.length),
      dataQuality,
      topInsights,
      byTier,
      byLearningPool,
      mbe,
      agentReview,
      context,
      rawVsPlannedGaps: {
        plannedWinRawWeak: topGap(gaps.plannedWinRawWeak),
        plannedCappedRawRanFurther: topGap(gaps.plannedCappedRawRanFurther),
        stopHitRawRecovered: topGap(gaps.stopHitRawRecovered),
      },
    };
  }


  /* 🏛️ Hardening: Manual override for specific signal checkpoints */
  async function triggerSingleEvaluation(signalId) {
    if (!signalId || !window.DB) return { success: false, error: 'Missing reqs' };
    try {
      const signal = typeof DB.getSignalById === 'function'
        ? await DB.getSignalById(signalId)
        : await DB.getSignal(signalId);
      if (!signal) throw new Error('Signal not found');
      
      console.log(`[OUTCOME] Manual evaluation triggered for ${signal.symbol}`);
      const price = await fetchCurrentPrice(signal.symbol);
      if (!price) throw new Error('Price fetch failed');

      let evals = 0;
      for (const day of CHECK_DAYS) {
        // Evaluate all checkpoints up to current age
        const ageMs = Date.now() - Number(signal.timestamp);
        if (ageMs > DAY_MS[day]) {
          const outcome = evaluateOutcome(signal, price, day);
          if (outcome) {
            await DB.addOutcome(outcome);
            const evalList = Array.isArray(signal.outcomesEvaluated) ? signal.outcomesEvaluated : [];
            if (!evalList.includes(day)) evalList.push(day);
            await DB.updateSignal(signal.id, { outcomesEvaluated: evalList });
            evals++;
          }
        }
      }
      return { success: true, evaluated: evals };
    } catch (err) {
      console.error('[OUTCOME] Single eval fail:', err);
      return { success: false, error: err.message };
    }
  }

  return {
    runEvaluation: runEvaluation,
    getCategoryPerformance: getCategoryPerformance,
    getSetupPerformance: getSetupPerformance,
    getRegimePerformance: getRegimePerformance,
    getScoreBucketPerformance: getScoreBucketPerformance,
    getHoldingPeriodPerformance: getHoldingPeriodPerformance,
    getOutcomeAttributionReport: getOutcomeAttributionReport,
    getAnalyticsTruthSummary: getAnalyticsTruthSummary,
    getAnalyticsScoreFieldLabel: analyticsScoreFieldLabel,
    getAnalyticsScoreValue: analyticsScoreValue,
    normalizePlannedTradeOutcome: normalizePlannedTradeOutcome,
    triggerSingleEvaluation: triggerSingleEvaluation,
    CHECK_DAYS: CHECK_DAYS,
    MAX_EVALS_PER_SESSION: MAX_EVALS_PER_SESSION,
  };
})();
