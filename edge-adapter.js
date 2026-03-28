/* ══════════════════════════════════════════════════════════
   EDGE ADAPTER v8.5
   Read-only adaptation from learned setup performance
   ══════════════════════════════════════════════════════════ */
window.EDGE_ADAPTER = (() => {
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function normalizeSetup(name) {
    if (typeof normalizeSetupName === 'function') return normalizeSetupName(name);
    return String(name || 'unknown').trim().toLowerCase() || 'unknown';
  }

  function adaptSetupStats(baseStats = [], learnedStats = [], opts = {}) {
    const impactCap = clamp(Number(opts.impactCap ?? 0.35), 0, 0.40);
    const minSamples = Math.max(1, Number(opts.minSamples ?? 6));
    const map = new Map((learnedStats || []).map(s => [normalizeSetup(s.setup), s]));

    const adapted = (baseStats || []).map(base => {
      const learned = map.get(normalizeSetup(base.setup));
      if (!learned || Number(learned.decayWeightedSamples || learned.samples || 0) < minSamples) {
        return { ...base, learnedSamples: learned?.samples || 0, learningImpact: 0 };
      }
      const sampleScale = clamp(Number(learned.decayWeightedSamples || learned.samples || 0) / (minSamples * 4), 0, 1);
      const confidence = clamp(Number(learned.adaptiveConfidence || 0.25), 0.25, 0.98);
      const impact = clamp(impactCap * sampleScale * confidence, 0, impactCap);
      const learnedEdge = clamp(Number(learned.edgeBoost || 1), 0.75, 1.25);
      const learnedExp = Number(learned.avgR || 0);
      const learnedWr = Number(learned.winRate || 0);
      const learnedPf = Number(learned.profitFactor || base.profitFactor || 1);
      const out = {
        ...base,
        edgeMultiplier: Number(((Number(base.edgeMultiplier || 1) * (1 - impact)) + (Number(base.edgeMultiplier || 1) * learnedEdge * impact)).toFixed(2)),
        expectancyR: Number(((Number(base.expectancyR || 0) * (1 - impact)) + (learnedExp * impact)).toFixed(2)),
        wr: Math.round((Number(base.wr || 0) * (1 - impact)) + (learnedWr * impact)),
        profitFactor: Number(((Number(base.profitFactor || 1) * (1 - impact)) + (learnedPf * impact)).toFixed(2)),
        learnedSamples: Number(learned.samples || 0),
        learnedDecaySamples: Number(learned.decayWeightedSamples || learned.samples || 0),
        learnedConfidence: confidence,
        learningImpact: Number(impact.toFixed(3)),
        learnedOutcomeScore: Number(learned.outcomeScore || 0),
        learnedExpectedR: Number(learned.expectedR || 0),
      };
      return out;
    });

    console.log('[LEARNING] edge adjusted', {
      setups: adapted.length,
      adaptedSetups: adapted.filter(x => Number(x.learningImpact || 0) > 0).length,
      maxImpact: impactCap,
    });
    return adapted;
  }

  return { adaptSetupStats };
})();
