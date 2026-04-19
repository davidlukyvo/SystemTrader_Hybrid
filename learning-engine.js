/* ══════════════════════════════════════════════════════════
   LEARNING ENGINE v8.5
   Build read-only learning dataset from persisted signals
   ══════════════════════════════════════════════════════════ */
window.LEARNING_ENGINE = (() => {
  function normalizeSetup(name) {
    if (typeof normalizeSetupName === 'function') return normalizeSetupName(name);
    return String(name || 'unknown').trim().toLowerCase() || 'unknown';
  }

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

  function normalizeClassification(signal) {
    if (signal?.learningClassification) return String(signal.learningClassification).toLowerCase();
    const status = authorityStatus(signal);
    const decision = authorityDecision(signal);
    
    // v10.6.9.56: Standardized lowercase semantics
    if (isLearningEligibleSignal(signal)) {
      if (status === 'READY') return 'ready';
      if (status === 'PROBE') return 'probe';
      return 'playable';
    }
    
    if (decision === 'REJECT' || status === 'REJECT' || status === 'AVOID') return 'reject';
    if (status === 'FETCH_FAIL') return 'fetch_fail';
    if (status === 'EARLY' || status === 'NEAR_MISS') return 'watch';
    if (status === 'WATCH') return 'watch';
    
    return String(status).toLowerCase() || 'watch';
  }

  function buildDataset(signals = []) {
    const rows = Array.isArray(signals) ? signals.filter(Boolean) : [];
    const byClassification = new Map();
    const byLearningPool = new Map();
    const bySetup = new Map();
    let learningEligibleCount = 0;

    for (const s of rows) {
      const classification = normalizeClassification(s);
      const learningEligible = isLearningEligibleSignal(s);
      const learningPool = String(s.learningPool || (learningEligible ? 'execution' : 'excluded')).toLowerCase();
      if (learningEligible) learningEligibleCount++;
      byClassification.set(classification, (byClassification.get(classification) || 0) + 1);
      byLearningPool.set(learningPool, (byLearningPool.get(learningPool) || 0) + 1);

      const setup = normalizeSetup(s.setup || s.structureTag || 'unknown');
      if (!bySetup.has(setup)) {
        bySetup.set(setup, {
          setup,
          total: 0,
          learningEligible: 0,
          classifications: {},
        });
      }
      const bucket = bySetup.get(setup);
      bucket.total += 1;
      if (learningEligible) bucket.learningEligible += 1;
      bucket.classifications[classification] = (bucket.classifications[classification] || 0) + 1;
    }

    const dataset = {
      schemaVersion: 'v8.5-learning-signals',
      generatedAt: Date.now(),
      totalSignals: rows.length,
      learningEligibleSignals: learningEligibleCount,
      byClassification: Object.fromEntries(byClassification.entries()),
      byLearningPool: Object.fromEntries(byLearningPool.entries()),
      setupCoverage: Array.from(bySetup.values()).sort((a, b) => b.learningEligible - a.learningEligible || b.total - a.total),
    };

    console.log('[LEARNING] Historical dataset snapshot rebuilt (all-time persisted samples, not current scan)', {
      totalSignals: dataset.totalSignals,
      learningEligibleSignals: dataset.learningEligibleSignals,
      classes: dataset.byClassification,
    });
    return dataset;
  }

  return { buildDataset, getClassification: normalizeClassification };
})();
