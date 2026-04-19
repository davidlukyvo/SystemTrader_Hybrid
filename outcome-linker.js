/* ══════════════════════════════════════════════════════════
   OUTCOME LINKER v8.5
   Link persisted signals to checkpoint outcomes
   ══════════════════════════════════════════════════════════ */
window.OUTCOME_LINKER = (() => {
  const CHECKPOINTS = ['D1', 'D3', 'D7', 'D14', 'D30'];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function authorityStatus(signal) {
    return String(
      signal?.displayStatus ||
      signal?.finalAuthorityStatus ||
      signal?.executionTier ||
      signal?.status ||
      'WATCH'
    ).toUpperCase();
  }
  function authorityDecision(signal) {
    return String(signal?.authorityDecision || signal?.decision || '').toUpperCase();
  }
  function authorityReason(signal) {
    return String(signal?.authorityReason || signal?.reason || '').toLowerCase().trim();
  }
  function isBlockedLearningReason(reason) {
    if (!reason) return false;
    return reason === 'all_tiers_rejected'
      || reason === 'no_execution_result'
      || reason.startsWith('dedup:')
      || reason.startsWith('capital_guard:')
      || reason.startsWith('pre_gate_blocked:');
  }
  function isLearningEligibleSignal(signal) {
    if (!signal) return false;
    if (signal.learningEligible === false) return false;
    if (String(signal.learningPool || '').toLowerCase() === 'execution' || String(signal.learningPool || '').toLowerCase() === 'near_approved') return true;
    if (window.DB?.getLearningEligibilityProfile) return window.DB.getLearningEligibilityProfile(signal).learningEligible === true;
    const status = authorityStatus(signal);
    const decision = authorityDecision(signal);
    const executionTier = String(signal?.executionTier || '').toUpperCase();
    const reason = authorityReason(signal);
    return decision !== 'REJECT'
      && signal.executionGatePassed === true
      && signal.executionActionable === true
      && ['READY', 'PLAYABLE', 'PROBE'].includes(status)
      && executionTier !== 'OBSERVE'
      && !isBlockedLearningReason(reason);
  }
  function normalizeSetup(name) {
    if (typeof normalizeSetupName === 'function') return normalizeSetupName(name);
    return String(name || 'unknown').trim().toLowerCase() || 'unknown';
  }

  function outcomeScore(outcome, expectedRR) {
    if (!outcome) return 0;
    const actualR = Number(outcome.actualR || 0);
    const verdictBoost = outcome.verdict === 'winner' ? 0.35 : outcome.verdict === 'loser' ? -0.35 : 0;
    const rrDelta = actualR - Number(expectedRR || 0);
    const normalized = clamp((actualR * 0.45) + verdictBoost + (rrDelta * 0.15), -2, 2);
    return Number((normalized / 2).toFixed(3)); // -1..1
  }

  function decayWeight(ageMs, halfLifeDays) {
    const halfLifeMs = Math.max(1, halfLifeDays) * 24 * 60 * 60 * 1000;
    return Math.exp(-Math.LN2 * (Math.max(0, ageMs) / halfLifeMs));
  }

  function linkSignalsToOutcomes(signals = [], outcomes = [], opts = {}) {
    const now = Date.now();
    const halfLifeDays = Number(opts.halfLifeDays || 21);
    const minSamples = Number(opts.minSamples || 6);
    const signalMap = new Map((signals || []).map(s => [s.id, s]));
    const linkedRows = [];
    const bySetup = new Map();

    for (const o of (outcomes || [])) {
      const signal = signalMap.get(o.signalId);
      if (!signal) continue;
      if (!isLearningEligibleSignal(signal)) continue;
      const setup = normalizeSetup(signal.setup || 'unknown');
      const expectedRR = Number(signal.rr || 0);
      const actualRR = Number(o.actualR || 0);
      const score = outcomeScore(o, expectedRR);
      const weight = decayWeight(now - Number(o.evaluatedAt || now), halfLifeDays);
      const row = {
        signalId: signal.id,
        setup,
        horizon: o.checkDay || 'UNK',
        expectedRR: Number(expectedRR.toFixed(3)),
        actualRR: Number(actualRR.toFixed(3)),
        rrDelta: Number((actualRR - expectedRR).toFixed(3)),
        outcomeScore: score,
        verdict: o.verdict || 'flat',
        evaluatedAt: Number(o.evaluatedAt || 0),
        weight: Number(weight.toFixed(5)),
      };
      linkedRows.push(row);

      if (!bySetup.has(setup)) {
        bySetup.set(setup, {
          setup,
          linkedRows: 0,
          weightedSamples: 0,
          weightedWins: 0,
          weightedLosses: 0,
          weightedScore: 0,
          weightedActualR: 0,
          weightedExpectedR: 0,
          horizons: Object.fromEntries(CHECKPOINTS.map(h => [h, 0])),
        });
      }
      const b = bySetup.get(setup);
      b.linkedRows += 1;
      b.weightedSamples += weight;
      if (row.verdict === 'winner') b.weightedWins += weight;
      if (row.verdict === 'loser') b.weightedLosses += weight;
      b.weightedScore += row.outcomeScore * weight;
      b.weightedActualR += row.actualRR * weight;
      b.weightedExpectedR += row.expectedRR * weight;
      if (b.horizons[row.horizon] !== undefined) b.horizons[row.horizon] += 1;
    }

    const setupPerformance = Array.from(bySetup.values()).map(b => {
      const ws = Math.max(1e-9, b.weightedSamples);
      const wr = b.weightedWins / ws;
      const avgR = b.weightedActualR / ws;
      const expR = b.weightedExpectedR / ws;
      const score = b.weightedScore / ws;
      const pf = b.weightedLosses > 0 ? (b.weightedWins / b.weightedLosses) : (b.weightedWins > 0 ? 2.0 : 0.7);
      return {
        setup: b.setup,
        samples: b.linkedRows,
        decayWeightedSamples: Number(b.weightedSamples.toFixed(2)),
        winRate: Math.round(wr * 100),
        avgR: Number(avgR.toFixed(3)),
        expectedR: Number(expR.toFixed(3)),
        rrDrift: Number((avgR - expR).toFixed(3)),
        outcomeScore: Number(score.toFixed(3)),
        profitFactor: Number(clamp(pf, 0.5, 3.5).toFixed(2)),
        adaptiveConfidence: Number(clamp(0.25 + Math.min(1, b.weightedSamples / minSamples) * 0.75, 0.25, 0.98).toFixed(2)),
        minSampleQualified: b.weightedSamples >= minSamples,
        horizons: b.horizons,
      };
    }).sort((a, b) => (b.decayWeightedSamples - a.decayWeightedSamples) || (b.outcomeScore - a.outcomeScore));

    return {
      schemaVersion: 'v8.5-signal-outcome-link',
      generatedAt: now,
      halfLifeDays,
      minSamples,
      checkpoints: CHECKPOINTS,
      linkedRows,
      setupPerformance,
    };
  }

  return { CHECKPOINTS, linkSignalsToOutcomes };
})();
