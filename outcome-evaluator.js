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
  const MAX_EVALS_PER_SESSION = 10;
  const PRICE_CACHE_TTL = 5 * 60 * 1000;

  const _priceCache = new Map();

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
      actualR: Number(actualR.toFixed(3)),
      verdict,
      evaluationType: 'checkpoint_snapshot',
    };
  }

  async function runEvaluation(progressCb) {
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

        const price = await fetchCurrentPrice(symbol);
        if (!price) continue;

        for (const signal of signals) {
          if (totalEvaluated >= MAX_EVALS_PER_SESSION) break;

          const outcome = evaluateOutcome(signal, price, checkDay);
          if (!outcome) continue;

          await DB.addOutcome(outcome);
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

  async function getSetupPerformance() {
    const outcomes = await DB.getOutcomes({});
    const signals = await DB.getSignals({});
    const sigMap = new Map(signals.map(s => [s.id, s]));

    const bySetup = new Map();
    for (const o of outcomes) {
      const sig = sigMap.get(o.signalId);
      const setup = sig ? (sig.setup || 'Unknown') : 'Unknown';
      if (!bySetup.has(setup)) bySetup.set(setup, []);
      bySetup.get(setup).push(Object.assign({}, o, { signal: sig }));
    }

    return [...bySetup.entries()].map(function(entry) {
      var setup = entry[0], outcomes = entry[1];
      var winners = outcomes.filter(function(o) { return o.verdict === 'winner'; });
      var losers = outcomes.filter(function(o) { return o.verdict === 'loser'; });
      var avgPct = outcomes.reduce(function(s, o) { return s + (o.pctChange || 0); }, 0) / Math.max(outcomes.length, 1);
      var avgR = outcomes.reduce(function(s, o) { return s + (o.actualR || 0); }, 0) / Math.max(outcomes.length, 1);
      return {
        setup: setup,
        total: outcomes.length,
        winners: winners.length,
        losers: losers.length,
        winRate: outcomes.length ? Math.round((winners.length / outcomes.length) * 100) : 0,
        avgPctChange: Number(avgPct.toFixed(2)),
        avgR: Number(avgR.toFixed(3)),
      };
    }).sort(function(a, b) { return b.winRate - a.winRate || b.avgR - a.avgR; });
  }

  async function getRegimePerformance() {
    const outcomes = await DB.getOutcomes({});
    const signals = await DB.getSignals({});
    const sigMap = new Map(signals.map(s => [s.id, s]));

    const byRegime = new Map();
    for (const o of outcomes) {
      const sig = sigMap.get(o.signalId);
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
      };
    }).sort(function(a, b) { return b.winRate - a.winRate; });
  }

  async function getScoreBucketPerformance() {
    const outcomes = await DB.getOutcomes({});
    const signals = await DB.getSignals({});
    const sigMap = new Map(signals.map(s => [s.id, s]));

    const buckets = [
      { label: '80-100', min: 80, max: 100 },
      { label: '60-79', min: 60, max: 79 },
      { label: '40-59', min: 40, max: 59 },
      { label: '20-39', min: 20, max: 39 },
      { label: '0-19', min: 0, max: 19 },
    ];

    return buckets.map(function(bucket) {
      var relevant = outcomes.filter(function(o) {
        var sig = sigMap.get(o.signalId);
        var score = sig ? (sig.riskAdjustedScore || sig.score || 0) : 0;
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
      };
    });
  }

  async function getHoldingPeriodPerformance() {
    const outcomes = await DB.getOutcomes({});

    return CHECK_DAYS.map(function(day) {
      var dayOutcomes = outcomes.filter(function(o) { return o.checkDay === day; });
      var winners = dayOutcomes.filter(function(o) { return o.verdict === 'winner'; });
      var losers = dayOutcomes.filter(function(o) { return o.verdict === 'loser'; });
      var avgPct = dayOutcomes.reduce(function(s, o) { return s + (o.pctChange || 0); }, 0) / Math.max(dayOutcomes.length, 1);
      var avgR = dayOutcomes.reduce(function(s, o) { return s + (o.actualR || 0); }, 0) / Math.max(dayOutcomes.length, 1);
      return {
        period: day,
        total: dayOutcomes.length,
        winners: winners.length,
        losers: losers.length,
        winRate: dayOutcomes.length ? Math.round((winners.length / dayOutcomes.length) * 100) : 0,
        avgPctChange: Number(avgPct.toFixed(2)),
        avgR: Number(avgR.toFixed(3)),
      };
    });
  }

  return {
    runEvaluation: runEvaluation,
    getSetupPerformance: getSetupPerformance,
    getRegimePerformance: getRegimePerformance,
    getScoreBucketPerformance: getScoreBucketPerformance,
    getHoldingPeriodPerformance: getHoldingPeriodPerformance,
    CHECK_DAYS: CHECK_DAYS,
    MAX_EVALS_PER_SESSION: MAX_EVALS_PER_SESSION,
  };
})();
