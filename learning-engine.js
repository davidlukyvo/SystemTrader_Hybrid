/* ══════════════════════════════════════════════════════════
   LEARNING ENGINE v8.5
   Build read-only learning dataset from persisted signals
   ══════════════════════════════════════════════════════════ */
window.LEARNING_ENGINE = (() => {
  function normalizeSetup(name) {
    if (typeof normalizeSetupName === 'function') return normalizeSetupName(name);
    return String(name || 'unknown').trim().toLowerCase() || 'unknown';
  }

  function normalizeClassification(signal) {
    const cls = String(signal?.classification || signal?.signalType || '').trim().toLowerCase();
    if (cls) return cls;
    const status = String(signal?.status || '').toUpperCase();
    if (['READY', 'SCALP_READY', 'PLAYABLE'].includes(status)) return 'playable';
    if (status === 'PROBE') return 'probe';
    if (status === 'EARLY') return 'near_miss';
    if (status === 'AVOID') return 'reject';
    if (status === 'FETCH_FAIL') return 'fetch_fail';
    return 'watch';
  }

  function buildDataset(signals = []) {
    const rows = Array.isArray(signals) ? signals.filter(Boolean) : [];
    const byClassification = new Map();
    const bySetup = new Map();
    let learningEligibleCount = 0;

    for (const s of rows) {
      const classification = normalizeClassification(s);
      const learningEligible = s.learningEligible !== false;
      if (learningEligible) learningEligibleCount++;
      byClassification.set(classification, (byClassification.get(classification) || 0) + 1);

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
      setupCoverage: Array.from(bySetup.values()).sort((a, b) => b.learningEligible - a.learningEligible || b.total - a.total),
    };

    console.log('[LEARNING] samples updated', {
      totalSignals: dataset.totalSignals,
      learningEligibleSignals: dataset.learningEligibleSignals,
      classes: dataset.byClassification,
    });
    return dataset;
  }

  return { buildDataset };
})();
