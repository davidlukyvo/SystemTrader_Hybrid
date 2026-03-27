/* ══════════════════════════════════════════════════════════
   PRO EDGE ENGINE v8.2
   Best setup detection · dynamic risk multiplier · trade gate
   ══════════════════════════════════════════════════════════ */
window.PRO_EDGE = (() => {
  const LEARNING_CFG = {
    halfLifeDays: 21,
    minSetupSamples: 6,
    priorWinRate: 0.50,
    priorAvgR: 0.08,
  };
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pct(v) { return Math.round(Number(v || 0) * 100); }
  function actionableCoin(c) {
    return c && ['READY','SCALP_READY','PLAYABLE','PROBE','EARLY'].includes(c.status);
  }
  function coinRR(c) {
    return Number(c?.rr || 0);
  }
  function hasPlayableSetup(c) {
    const key = normalizeSetupSafe(c?.setup || c?.structureTag);
    if (!c || !actionableCoin(c)) return false;
    if (['unknown', 'no setup', 'early watch'].includes(key)) return false;
    if (key.includes('phase c candidate')) return coinRR(c) >= 1.2 && Number(c?.executionConfidence || 0) >= 0.5;
    return (
      key.includes('spring + test') ||
      key.includes('spring') ||
      key.includes('lps') ||
      key.includes('breakout retest') ||
      key.includes('breakout') ||
      key.includes('early phase d')
    ) && coinRR(c) >= 1.2 && Number(c?.executionConfidence || 0) >= 0.5;
  }
  function rankPlayableCoin(c) {
    const key = normalizeSetupSafe(c?.setup || c?.structureTag);
    let setupBonus = 0;
    if (key.includes('spring + test')) setupBonus = 30;
    else if (key.includes('lps')) setupBonus = 24;
    else if (key.includes('breakout retest')) setupBonus = 20;
    else if (key.includes('early phase d')) setupBonus = 16;
    else if (key.includes('spring')) setupBonus = 14;
    else if (key.includes('phase c candidate')) setupBonus = 8;
    return setupBonus
      + Number(c?.rankScore || c?.edgeScore || c?.riskAdjustedScore || c?.score || 0)
      + Number(c?.executionConfidence || 0) * 18
      + coinRR(c) * 8
      + (c?.status === 'READY' ? 8 : c?.status === 'SCALP_READY' ? 5 : c?.status === 'PLAYABLE' ? 2 : 0);
  }
  function normalizeSetupSafe(name) {
    if (typeof normalizeSetupName === 'function') return normalizeSetupName(name);
    return String(name || 'unknown').trim().toLowerCase() || 'unknown';
  }
  async function getRecentOutcomeStats(limit = 20) {
    if (!window.DB) return { total: 0, winRate: 0, avgR: 0, verdict: 'bootstrap' };
    const all = await DB.getOutcomes({});
    const rows = (all || []).slice(0, limit);
    if (!rows.length) return { total: 0, winRate: 0, avgR: 0, verdict: 'bootstrap' };
    const winners = rows.filter(r => r.verdict === 'winner').length;
    const avgR = rows.reduce((s, r) => s + Number(r.actualR || 0), 0) / Math.max(1, rows.length);
    return {
      total: rows.length,
      winRate: Math.round((winners / rows.length) * 100),
      avgR: Number(avgR.toFixed(2)),
      verdict: winners / rows.length >= 0.55 && avgR > 0.35 ? 'strong' : winners / rows.length >= 0.45 && avgR >= 0 ? 'mixed' : 'weak'
    };
  }

  async function getDBSetupLearning() {
    if (!window.DB) return [];
    const dataset = await buildOutcomeLearningDataset();
    return dataset.setups;
  }

  function decayWeight(ageMs, halfLifeDays = LEARNING_CFG.halfLifeDays) {
    const halfLifeMs = Math.max(1, halfLifeDays) * 24 * 60 * 60 * 1000;
    return Math.exp(-Math.LN2 * (Math.max(0, ageMs) / halfLifeMs));
  }

  async function buildOutcomeLearningDataset() {
    if (!window.DB) {
      return {
        schemaVersion: 'v8.5-outcome-learning',
        generatedAt: Date.now(),
        halfLifeDays: LEARNING_CFG.halfLifeDays,
        minSetupSamples: LEARNING_CFG.minSetupSamples,
        totalSignals: 0,
        totalOutcomes: 0,
        eligibleOutcomes: 0,
        setups: []
      };
    }
    const [signals, outcomes] = await Promise.all([DB.getSignals({}), DB.getOutcomes({})]);
    const signalMap = new Map((signals || []).map(s => [s.id, s]));
    const grouped = new Map();
    let eligibleOutcomes = 0;
    const now = Date.now();
    for (const outcome of (outcomes || [])) {
      const sig = signalMap.get(outcome.signalId);
      if (!sig) continue;
      if (sig.learningEligible === false) continue;
      const setup = normalizeSetupSafe(sig.setup || 'unknown');
      if (!grouped.has(setup)) grouped.set(setup, []);
      grouped.get(setup).push({ outcome, sig, weight: decayWeight(now - Number(outcome.evaluatedAt || now)) });
      eligibleOutcomes++;
    }
    const setups = Array.from(grouped.entries()).map(([setup, rows]) => {
      const weightedSamples = rows.reduce((s, r) => s + Number(r.weight || 0), 0);
      const weightedWins = rows.reduce((s, r) => s + ((r.outcome.verdict === 'winner') ? Number(r.weight || 0) : 0), 0);
      const weightedR = rows.reduce((s, r) => s + (Number(r.outcome.actualR || 0) * Number(r.weight || 0)), 0);
      const observedWinRate = weightedSamples > 0 ? (weightedWins / weightedSamples) : 0;
      const observedAvgR = weightedSamples > 0 ? (weightedR / weightedSamples) : 0;

      const confidenceWeight = clamp(weightedSamples / Math.max(1, LEARNING_CFG.minSetupSamples), 0, 1);
      const shrunkenWinRate = (LEARNING_CFG.priorWinRate * (1 - confidenceWeight)) + (observedWinRate * confidenceWeight);
      const shrunkenAvgR = (LEARNING_CFG.priorAvgR * (1 - confidenceWeight)) + (observedAvgR * confidenceWeight);
      const edgeBoostRaw = 0.84 + (shrunkenWinRate * 0.44) + clamp(shrunkenAvgR * 0.10, -0.12, 0.18);
      const edgeBoost = clamp(edgeBoostRaw, 0.75, 1.25);
      const minSampleQualified = weightedSamples >= LEARNING_CFG.minSetupSamples;
      return {
        setup,
        samples: rows.length,
        decayWeightedSamples: Number(weightedSamples.toFixed(2)),
        winRate: Math.round(shrunkenWinRate * 100),
        avgR: Number(shrunkenAvgR.toFixed(3)),
        edgeBoost: Number(edgeBoost.toFixed(3)),
        adaptiveConfidence: Number(clamp(0.25 + confidenceWeight * 0.75, 0.25, 0.98).toFixed(2)),
        minSampleQualified,
      };
    }).sort((a, b) => (b.decayWeightedSamples - a.decayWeightedSamples) || (b.edgeBoost - a.edgeBoost));

    return {
      schemaVersion: 'v8.5-outcome-learning',
      generatedAt: Date.now(),
      halfLifeDays: LEARNING_CFG.halfLifeDays,
      minSetupSamples: LEARNING_CFG.minSetupSamples,
      totalSignals: (signals || []).length,
      totalOutcomes: (outcomes || []).length,
      eligibleOutcomes,
      setups,
    };
  }

  function mergeSetupLearning(baseStats, dbLearning) {
    const dbMap = new Map((dbLearning || []).map(x => [normalizeSetupSafe(x.setup), x]));
    return (baseStats || []).map(s => {
      const key = normalizeSetupSafe(s.setup);
      const learned = dbMap.get(key);
      if (!learned) return { ...s, learnedSamples: 0, learnedBoost: 1 };
      const sampleWeight = clamp(Number(learned.decayWeightedSamples || learned.samples || 0) / 32, 0, 0.55);
      const confidenceScale = clamp(Number(learned.adaptiveConfidence || 0.25), 0.25, 0.98);
      const blendedEdge = Number((Number(s.edgeMultiplier || 1) * (1 - sampleWeight) + (Number(s.edgeMultiplier || 1) * learned.edgeBoost * sampleWeight)).toFixed(2));
      const blendedExp = Number((Number(s.expectancyR || 0) * (1 - sampleWeight) + Number(learned.avgR || 0) * sampleWeight).toFixed(2));
      const blendedWr = Math.round((Number(s.wr || 0) * (1 - sampleWeight)) + (Number(learned.winRate || 0) * sampleWeight));
      return {
        ...s,
        edgeMultiplier: blendedEdge,
        expectancyR: blendedExp,
        wr: blendedWr,
        learnedSamples: learned.samples,
        learnedDecaySamples: learned.decayWeightedSamples,
        learnedConfidence: confidenceScale,
        learnedMinSampleQualified: !!learned.minSampleQualified,
        learnedBoost: learned.edgeBoost,
        learnedAvgR: learned.avgR,
      };
    });
  }

  function scoreSetupCandidate(s, btc) {
    if (!s) return -999;
    const edge = Number(s.edgeMultiplier || 0);
    const exp = Number(s.expectancyR || 0);
    const pf = Number(s.profitFactor || 0);
    const conf = Number(s.confidence || 0);
    const closed = Number(s.closed || 0);
    const key = normalizeSetupSafe(s.setup);
    let regimeFit = 0;
    if (btc === 'bull') regimeFit = (key.includes('phase d') || key.includes('lps') || key.includes('breakout')) ? 0.12 : (key.includes('spring') ? 0.04 : -0.03);
    else if (btc === 'sideway') regimeFit = (key.includes('spring') || key.includes('phase c')) ? 0.10 : (key.includes('early phase d') ? 0.03 : -0.02);
    else regimeFit = (key.includes('spring') || key.includes('phase c')) ? 0.03 : -0.14;
    const sampleBonus = Math.min(0.12, closed * 0.01);
    return edge * 0.95 + exp * 0.30 + Math.max(0.70, pf) * 0.12 + conf * 0.10 + regimeFit + sampleBonus;
  }

  function chooseBestSetup(setups, btc) {
    const filtered = (setups || []).filter(s => {
      const key = normalizeSetupSafe(s.setup);
      if (['unknown', 'no setup', 'early watch'].includes(key)) return false;
      if (Number(s?.expectancyR || 0) < 0.18) return false;
      if (Number(s?.edgeMultiplier || 0) < 0.9) return false;
      return true;
    });
    if (!filtered.length) return null;
    return filtered.map(s => ({ ...s, proScore: scoreSetupCandidate(s, btc) }))
      .sort((a, b) => b.proScore - a.proScore || Number(b.edgeMultiplier || 0) - Number(a.edgeMultiplier || 0))[0] || null;
  }

  function chooseSuggestedCoin(coins, bestSetup, mode) {
    const tradable = (coins || []).filter(actionableCoin);
    if (!tradable.length) return null;
    const rrFloor = mode === 'REDUCED' ? 1.3 : 1.2;
    const confFloor = mode === 'REDUCED' ? 0.55 : 0.5;
    const playable = tradable.filter(c => {
      const gate = window.EXEC_GATE?.isExecutable
        ? window.EXEC_GATE.isExecutable(c, { requirePlayable: true, minRR: rrFloor, minConfidence: confFloor })
        : { ok: hasPlayableSetup(c) && coinRR(c) >= rrFloor && Number(c?.executionConfidence || 0) >= confFloor };
      return !!gate.ok;
    });
    if (!playable.length) return null;
    const bestKey = bestSetup ? normalizeSetupSafe(bestSetup.setup) : '';
    const preferred = playable.filter(c => normalizeSetupSafe(c.setup || c.structureTag) === bestKey);
    const fallback = preferred.length ? preferred : playable;
    return fallback.sort((a, b) => rankPlayableCoin(b) - rankPlayableCoin(a))[0] || null;
  }

  function deriveTradeGate({ btc, marketHealthScore, qualifiedCount, actionableCount, playableCount, bestSetup, outcomeStats }) {
    const weakSetup = !bestSetup || Number(bestSetup.edgeMultiplier || 0) < 0.95 || Number(bestSetup.expectancyR || 0) < 0.25;
    const weakOutcomes = outcomeStats.total >= 6 && (outcomeStats.winRate < 40 || outcomeStats.avgR < -0.1);
    const mixedOutcomes = outcomeStats.total >= 4 && (outcomeStats.winRate < 50 || outcomeStats.avgR < 0.1);
    if (btc === 'bear' && marketHealthScore < 4) {
      return { mode: 'DISABLED', disabled: true, level: 'hard_off', reason: 'BTC bear + market health yếu' };
    }
    if (playableCount === 0 && qualifiedCount === 0) {
      return { mode: 'DISABLED', disabled: true, level: 'hard_off', reason: 'Không có playable setup đạt RR/conf tối thiểu' };
    }
    if (weakSetup && qualifiedCount === 0) {
      return { mode: 'DISABLED', disabled: true, level: 'hard_off', reason: 'Edge hiện tại chưa đủ mạnh để unlock trade' };
    }
    if (weakOutcomes) {
      return { mode: 'DISABLED', disabled: true, level: 'hard_off', reason: 'Recent edge degrade: outcome yếu, tạm tắt trade' };
    }
    if (marketHealthScore < 5 || qualifiedCount === 0 || mixedOutcomes || btc === 'bear') {
      return { mode: 'REDUCED', disabled: false, level: 'soft_on', reason: 'Chỉ nên reduced-size / watch-confirm' };
    }
    return { mode: 'ENABLED', disabled: false, level: 'full_on', reason: 'Edge phù hợp, có thể trade theo size chuẩn hệ thống' };
  }

  function deriveRiskMultiplier({ gate, bestSetup, btc, marketHealthScore, outcomeStats }) {
    if (gate.disabled) return 0;
    let mult = Number(bestSetup?.edgeMultiplier || 0.90);
    mult += btc === 'bull' ? 0.06 : btc === 'sideway' ? 0 : -0.18;
    mult += marketHealthScore >= 6 ? 0.08 : marketHealthScore >= 4 ? 0 : -0.14;
    if (outcomeStats.total >= 4) mult += outcomeStats.verdict === 'strong' ? 0.08 : outcomeStats.verdict === 'mixed' ? -0.02 : -0.14;
    if (gate.mode === 'REDUCED') mult -= 0.18;
    return Number(clamp(mult, 0.25, 1.35).toFixed(2));
  }

  async function buildSnapshot() {
    const quant = computeQuantStats();
    const insight = ST.scanMeta?.insight || {};
    const btc = ST.btc || 'sideway';
    const marketHealthScore = Number(insight.marketHealthScore || 0);
    const qualifiedCount = Number(insight.qualifiedCount || 0);
    const actionable = (ST.coins || []).filter(actionableCoin);
    const playable = actionable.filter(c => {
      const gate = window.EXEC_GATE?.isExecutable
        ? window.EXEC_GATE.isExecutable(c, { requirePlayable: true, minRR: 1.2, minConfidence: 0.5 })
        : { ok: hasPlayableSetup(c) };
      return !!gate.ok;
    });
    const outcomeLearningDataset = await buildOutcomeLearningDataset();
    const dbSetupLearning = outcomeLearningDataset.setups || [];
    const mergedSetups = mergeSetupLearning(quant.setupStats || [], dbSetupLearning);
    const bestSetup = chooseBestSetup(mergedSetups, btc);
    const outcomeStats = await getRecentOutcomeStats(20);
    const gate = deriveTradeGate({
      btc,
      marketHealthScore,
      qualifiedCount,
      actionableCount: actionable.length,
      playableCount: playable.length,
      bestSetup,
      outcomeStats
    });
    const suggestedCoin = chooseSuggestedCoin(ST.coins || [], bestSetup, gate.mode);
    const dynamicRiskMultiplier = deriveRiskMultiplier({ gate, bestSetup, btc, marketHealthScore, outcomeStats });
    const allocationHintPct = gate.disabled ? 0 : Number(clamp(dynamicRiskMultiplier * 0.65, 0.20, 1.00).toFixed(2));
    const scoreFloor = gate.mode === 'ENABLED' ? 60 : gate.mode === 'REDUCED' ? 72 : 999;
    const bestSetupName = bestSetup?.setup || 'unknown';
    const matchingTradables = actionable.filter(c => normalizeSetupSafe(c.setup || c.structureTag) === normalizeSetupSafe(bestSetupName));
    const recommendation = gate.disabled
      ? 'NO TRADE'
      : suggestedCoin
        ? `${suggestedCoin.symbol} · ${suggestedCoin.status} · ${suggestedCoin.entryTiming || 'wait'}`
        : gate.mode === 'REDUCED'
          ? 'Watch / reduced-size only'
          : 'Wait for qualifying signal';

    return {
      builtAt: Date.now(),
      btc,
      marketHealthScore,
      qualifiedCount,
      actionableCount: actionable.length,
      playableCount: playable.length,
      gateMode: gate.mode,
      disableTrading: gate.disabled,
      gateReason: gate.reason,
      dynamicRiskMultiplier,
      allocationHintPct,
      scoreFloor,
      bestSetup: bestSetupName,
      bestSetupEdge: Number(bestSetup?.edgeMultiplier || 0).toFixed(2),
      bestSetupExpectancyR: Number(bestSetup?.expectancyR || 0).toFixed(2),
      bestSetupWinRate: Number(bestSetup?.wr || 0),
      bestSetupConfidence: pct(bestSetup?.confidence || 0),
      outcomeWinRate: Number(outcomeStats.winRate || 0),
      outcomeAvgR: Number(outcomeStats.avgR || 0),
      outcomeSamples: Number(outcomeStats.total || 0),
      outcomeVerdict: outcomeStats.verdict,
      suggestedCoinId: suggestedCoin?.id || null,
      suggestedSymbol: suggestedCoin?.symbol || null,
      suggestedStatus: suggestedCoin?.status || null,
      suggestedSetup: suggestedCoin?.setup || suggestedCoin?.structureTag || null,
      suggestedEntry: Number(suggestedCoin?.entry || suggestedCoin?.price || 0) || null,
      suggestedReason: recommendation,
      matchingTradables: matchingTradables.length,
      hardBlock: gate.disabled || !suggestedCoin,
      learningSamples: dbSetupLearning.reduce((s, x) => s + Number(x.samples || 0), 0),
      learningDataset: {
        schemaVersion: outcomeLearningDataset.schemaVersion,
        generatedAt: outcomeLearningDataset.generatedAt,
        halfLifeDays: outcomeLearningDataset.halfLifeDays,
        minSetupSamples: outcomeLearningDataset.minSetupSamples,
        totalSignals: outcomeLearningDataset.totalSignals,
        totalOutcomes: outcomeLearningDataset.totalOutcomes,
        eligibleOutcomes: outcomeLearningDataset.eligibleOutcomes,
      },
      learningBySetup: dbSetupLearning,
      learningTop: dbSetupLearning.slice(0, 5),
    };
  }

  async function rebuildAfterScan() {
    const snap = await buildSnapshot();
    ST.scanMeta = ST.scanMeta || {};
    ST.scanMeta.proEdge = snap;
    ST.scanMeta.cache = ST.scanMeta.cache || {};
    ST.scanMeta.cache.allocationHint = gateAllocationText(snap);
    ST.scanMeta.cache.riskMultiplier = snap.disableTrading ? '0x' : `${snap.dynamicRiskMultiplier}x`;
    ST.scanMeta.regime = ST.scanMeta.regime || {};
    if (snap.disableTrading) {
      ST.scanMeta.regime.noTrade = true;
      ST.scanMeta.regime.reason = `PRO EDGE OFF — ${snap.gateReason}`;
    }
    ST.save();
    if (window.DB?.setSetting) {
      try { await DB.setSetting('proEdgeSnapshot', snap); } catch (_) {}
    }
    return snap;
  }

  function gateAllocationText(snap) {
    if (!snap) return '0%';
    if (snap.disableTrading) return '0%';
    return `${(Number(snap.allocationHintPct || 0) * 100).toFixed(0)}%`;
  }

  async function getSnapshot() {
    if (ST.scanMeta?.proEdge) return ST.scanMeta.proEdge;
    if (window.DB?.getSetting) {
      const saved = await DB.getSetting('proEdgeSnapshot');
      if (saved) return saved;
    }
    return buildSnapshot();
  }

  function getSuggestedCoin() {
    const snap = ST.scanMeta?.proEdge;
    if (!snap?.suggestedCoinId) return null;
    return (ST.coins || []).find(c => String(c.id) === String(snap.suggestedCoinId)) || null;
  }

  return {
    buildSnapshot,
    rebuildAfterScan,
    getSnapshot,
    getSuggestedCoin,
    gateAllocationText,
  };
})();
