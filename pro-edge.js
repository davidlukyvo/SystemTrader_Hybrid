/* ══════════════════════════════════════════════════════════
   PRO EDGE ENGINE v8.7
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
  function normStatus(v) { return String(v || '').toUpperCase(); }
  function isQualifiedStatus(v) { return ['READY','SCALP_READY','PLAYABLE'].includes(normStatus(v)); }
  function isProbeStatus(v) { return ['PROBE','PROBE_PENDING'].includes(normStatus(v)); }
  function actionableCoin(c) {
    const s = normStatus(c?.authorityTier || c?.finalAuthorityStatus || c?.executionTier || c?.status);
    return c && ['READY','SCALP_READY','PLAYABLE','PROBE','PROBE_PENDING','EARLY'].includes(s);
  }

  function passesAuthorityGate(c, minRR = 0, minConfidence = 0) {
    const tier = normStatus(c?.authorityTier || c?.finalAuthorityStatus || c?.executionTier || c?.status);
    const decision = normStatus(c?.authorityDecision || (c?.executionActionable ? 'ALLOW' : ''));
    const rr = coinRR(c);
    const conf = Number(c?.executionConfidence || 0);
    if (decision === 'REJECT') return false;
    if (['READY','SCALP_READY','PLAYABLE'].includes(tier) && rr >= minRR && conf >= minConfidence) return true;
    if (tier === 'PROBE' && rr >= minRR && conf >= minConfidence) return true;
    if (c?.executionGatePassed && rr >= minRR && conf >= minConfidence) return true;
    return hasPlayableSetup(c) && rr >= minRR && conf >= minConfidence;
  }
  function coinRR(c) {
    return Number(c?.rr || 0);
  }
  function hasPlayableSetup(c) {
    const key = normalizeSetupSafe(c?.setup || c?.structureTag);
    if (!c || !actionableCoin(c)) return false;
    if (['unknown', 'no setup'].includes(key)) return false;
    if (key.includes('early watch')) return coinRR(c) >= 0.55 && Number(c?.executionConfidence || 0) >= 0.50;
    if (key.includes('phase c candidate')) {
      const sideway = String(ST?.btc || ST?.scanMeta?.btcContext || '').toLowerCase() === 'sideway';
      return coinRR(c) >= (sideway ? 0.22 : 0.55) && Number(c?.executionConfidence || 0) >= (sideway ? 0.50 : 0.55);
    }
    return (
      key.includes('spring + test') ||
      key.includes('spring') ||
      key.includes('lps') ||
      key.includes('breakout retest') ||
      key.includes('breakout') ||
      key.includes('early phase d')
    ) && coinRR(c) >= 1.05 && Number(c?.executionConfidence || 0) >= 0.5;
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
    const signalLearning = window.LEARNING_ENGINE?.buildDataset
      ? window.LEARNING_ENGINE.buildDataset(signals)
      : null;
    const linked = window.OUTCOME_LINKER?.linkSignalsToOutcomes
      ? window.OUTCOME_LINKER.linkSignalsToOutcomes(signals, outcomes, {
          halfLifeDays: LEARNING_CFG.halfLifeDays,
          minSamples: LEARNING_CFG.minSetupSamples,
        })
      : null;
    if (linked && Array.isArray(linked.setupPerformance)) {
      return {
        schemaVersion: linked.schemaVersion || 'v8.5-signal-outcome-link',
        generatedAt: linked.generatedAt || Date.now(),
        halfLifeDays: linked.halfLifeDays || LEARNING_CFG.halfLifeDays,
        minSetupSamples: linked.minSamples || LEARNING_CFG.minSetupSamples,
        totalSignals: signalLearning?.totalSignals ?? (signals || []).length,
        totalOutcomes: (outcomes || []).length,
        eligibleOutcomes: linked.linkedRows ? linked.linkedRows.length : 0,
        signalDataset: signalLearning || undefined,
        setups: linked.setupPerformance.map(s => ({
          setup: s.setup,
          samples: s.samples,
          decayWeightedSamples: s.decayWeightedSamples,
          winRate: s.winRate,
          avgR: s.avgR,
          expectedR: s.expectedR,
          rrDrift: s.rrDrift,
          outcomeScore: s.outcomeScore,
          profitFactor: s.profitFactor,
          adaptiveConfidence: s.adaptiveConfidence,
          minSampleQualified: s.minSampleQualified,
          edgeBoost: Number(clamp(0.84 + (s.winRate / 100) * 0.44 + clamp(Number(s.avgR || 0) * 0.10, -0.12, 0.18), 0.75, 1.25).toFixed(3)),
          horizons: s.horizons,
        })),
      };
    }
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
    if (window.EDGE_ADAPTER?.adaptSetupStats) {
      return window.EDGE_ADAPTER.adaptSetupStats(baseStats || [], dbLearning || [], {
        impactCap: 0.35,
        minSamples: LEARNING_CFG.minSetupSamples,
      });
    }
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
    const closed = Number(s.learnedSamples || s.samples || s.closed || 0);
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
      const samples = Number(s?.learnedSamples || s?.samples || s?.closed || 0);
      const minSetupSamples = Number(window.LEARNING_CFG?.minSetupSamples || 6);
      if (Number(s?.edgeMultiplier || 0) < 0.9 && samples >= minSetupSamples) return false;
      return true;
    });
    if (!filtered.length) return null;
    return filtered.map(s => ({ ...s, proScore: scoreSetupCandidate(s, btc) }))
      .sort((a, b) => b.proScore - a.proScore || Number(b.edgeMultiplier || 0) - Number(a.edgeMultiplier || 0))[0] || null;
  }

  function getRRFloorForCoin(coin, mode = 'ENABLED') {
    if (window.LIVE_SCANNER?.getSmartRRFloor) return window.LIVE_SCANNER.getSmartRRFloor(coin, coin?.status || 'PLAYABLE', coin?.btcContext || window.ST?.btc || 'sideway', coin?.chartEntryQuality || 'neutral');
    const setup = String(coin?.setup || coin?.structureTag || '').toLowerCase();
    const early = setup.includes('phase c') || setup.includes('early');
    return mode === 'REDUCED' ? (early ? 0.60 : 0.95) : (early ? 0.72 : 0.95);
  }

  function chooseSuggestedCoin(coins, bestSetup, mode) {
    const tradable = (coins || []).filter(actionableCoin);
    if (!tradable.length) return null;
    const confFloor = mode === 'REDUCED' ? 0.46 : 0.48;
    const softPlayable = tradable.filter(c => {
      const status = normStatus(c?.status || c?.executionTier || '');
      if (['READY','SCALP_READY','PLAYABLE'].includes(status)) return true;
      if (status === 'PROBE' && Number(c?.executionConfidence || 0) >= Math.max(0.50, confFloor)) return true;
      if (c?.executionGatePassed) return true;
      const setupTxt = String(c?.setup || c?.structureTag || '').toLowerCase();
      const relaxedRR = /phase c|phase-candidate|early/i.test(setupTxt)
        ? Math.max(0.22, getRRFloorForCoin(c, mode) - 0.35)
        : getRRFloorForCoin(c, mode);
      const gate = { ok: passesAuthorityGate(c, relaxedRR, /phase c|early/i.test(setupTxt) ? Math.min(confFloor, 0.46) : confFloor) };

      const probeCapitalCandidate = mode === 'REDUCED'
        && /phase c|early/i.test(setupTxt)
        && Number(c?.executionConfidence || 0) >= 0.72
        && Number(c?.rr || 0) >= 0.30
        && String(c?.fakePumpRisk || c?.fake || '').toLowerCase() !== 'high';

      return !!gate.ok || probeCapitalCandidate;
    });
    if (!softPlayable.length) return null;
    const bestKey = bestSetup ? normalizeSetupSafe(bestSetup.setup) : '';
    const preferred = softPlayable.filter(c => normalizeSetupSafe(c.setup || c.structureTag) === bestKey || (bestKey.includes('spring') && /phase c candidate|early phase d|lps/.test(normalizeSetupSafe(c.setup || c.structureTag))));
    const fallback = preferred.length ? preferred : softPlayable;
    return fallback.sort((a, b) => rankPlayableCoin(b) - rankPlayableCoin(a))[0] || null;
  }

  function deriveTradeGate({ btc, marketHealthScore, qualifiedCount, actionableCount, playableCount, probeCount, bestSetup, outcomeStats }) {
    const weakSetup = !bestSetup || Number(bestSetup.edgeMultiplier || 0) < 0.95 || Number(bestSetup.expectancyR || 0) < 0.25;
    const weakOutcomes = outcomeStats.total >= 6 && (outcomeStats.winRate < 40 || outcomeStats.avgR < -0.1);
    const mixedOutcomes = outcomeStats.total >= 4 && (outcomeStats.winRate < 50 || outcomeStats.avgR < 0.1);
    const healthyMarket = marketHealthScore >= 7 && btc !== 'bear';
    const softTradables = Number(playableCount || 0) + Number(probeCount || 0);
    const hasAnyAction = (softTradables > 0 || qualifiedCount > 0 || actionableCount > 0);

    if (btc === 'bear' && marketHealthScore < 4) {
      return { mode: 'DISABLED', disabled: true, level: 'hard_off', reason: 'BTC bear + market health yếu' };
    }
    if (!hasAnyAction) {
      return { mode: 'DISABLED', disabled: true, level: 'hard_off', reason: 'Không có actionable setup đạt RR/conf tối thiểu' };
    }

    if (btc === 'sideway' && healthyMarket && softTradables > 0) {
      return { mode: 'SOFT', disabled: false, level: 'adaptive_unlock', reason: 'Adaptive unlock: sideway vẫn cho phép PLAYABLE / PROBE size nhỏ' };
    }
    if (healthyMarket && hasAnyAction && playableCount === 0) {
      return { mode: 'REDUCED', disabled: false, level: 'probe_capital', reason: 'Probe capital deployment: reduced-size allowed khi market khỏe' };
    }
    if (weakSetup && healthyMarket && hasAnyAction) {
      return { mode: 'REDUCED', disabled: false, level: 'probe_capital', reason: 'Edge chưa đủ full-size nhưng cho phép probe capital' };
    }
    if (weakSetup && qualifiedCount === 0 && actionableCount === 0 && softTradables === 0) {
      return { mode: 'DISABLED', disabled: true, level: 'hard_off', reason: 'Edge hiện tại chưa đủ mạnh để unlock trade' };
    }
    if (playableCount === 0 && (qualifiedCount > 0 || actionableCount > 0 || probeCount > 0)) {
      return { mode: 'REDUCED', disabled: false, level: 'soft_unlock', reason: 'Data recovered: chỉ watch / probe reduced-size' };
    }
    if (playableCount > 0 && marketHealthScore >= 6 && btc !== 'bear') {
      return { mode: qualifiedCount > 0 ? 'ENABLED' : 'REDUCED', disabled: false, level: qualifiedCount > 0 ? 'full_on' : 'soft_on', reason: qualifiedCount > 0 ? 'Meta sync: actionable setup đã unlock theo phase-aware execution' : 'Soft tradable setups found: reduced-size execution allowed' };
    }
    if (weakOutcomes && !healthyMarket && softTradables === 0) {
      return { mode: 'DISABLED', disabled: true, level: 'hard_off', reason: 'Recent edge degrade: outcome yếu, tạm tắt trade' };
    }
    if (marketHealthScore < 5 || mixedOutcomes || btc === 'bear') {
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
    if (gate.mode === 'REDUCED') mult -= 0.12;
    if (gate.level === 'probe_capital') mult = Math.max(mult, 0.35);
    return Number(clamp(mult, 0.25, 1.35).toFixed(2));
  }

  async function buildSnapshot() {
    const quant = computeQuantStats();
    const insight = ST.scanMeta?.insight || {};
    const cache = ST.scanMeta?.cache || {};
    const btc = ST.btc || 'sideway';
    const coins = (typeof ST.getUnifiedCoins === 'function' ? ST.getUnifiedCoins() : (Array.isArray(ST.sessionState?.coins) && ST.sessionState.coins.length ? ST.sessionState.coins : (Array.isArray(ST.coins) ? ST.coins : [])));
    const marketHealthScore = Number(insight.marketHealthScore || ST.scanMeta?.stability?.lastHealthScore || 0);
    const actionable = coins.filter(actionableCoin);
    const hardQualified = actionable.filter(c => isQualifiedStatus(c?.status || c?.executionTier));
    const probeLike = actionable.filter(c => isProbeStatus(c?.status || c?.executionTier));
    const qualifiedCount = Math.max(Number(insight.qualifiedCount || 0), hardQualified.length + probeLike.length);
    const actionableCount = Math.max(Number(cache.candidateCount || 0) ? actionable.length : actionable.length, actionable.length);
    const playable = actionable.filter(c => {
      const status = normStatus(c?.status || c?.executionTier || '');
      if (['READY','SCALP_READY','PLAYABLE'].includes(status)) return true;
      const relaxedRR = /phase c candidate|early watch|early phase d/i.test(String(c?.setup || c?.structureTag || ''))
        ? Math.max(0.22, getRRFloorForCoin(c) - 0.30)
        : getRRFloorForCoin(c);
      const relaxedPlayable = ['PLAYABLE','PROBE','EARLY'].includes(status);
      const gate = { ok: passesAuthorityGate(c, relaxedRR, /phase c|early/i.test(String(c?.setup || c?.structureTag || '')) ? 0.48 : 0.5) };
      return !!gate.ok;
    });
    const playableCount = Math.max(playable.length, hardQualified.length);
    const outcomeLearningDataset = await buildOutcomeLearningDataset();
    const dbSetupLearning = outcomeLearningDataset.setups || [];
    const mergedSetups = mergeSetupLearning(quant.setupStats || [], dbSetupLearning);
    const bestSetup = chooseBestSetup(mergedSetups, btc);
    const outcomeStats = await getRecentOutcomeStats(20);
    let latestScan = null;
    let latestScanSignals = [];
    if (window.DB?.getScans && window.DB?.getSignals) {
      try {
        const scans = await DB.getScans({ limit: 1 });
        latestScan = Array.isArray(scans) && scans.length ? scans[0] : null;
        const allSignals = await DB.getSignals({ limit: 200 });
        latestScanSignals = latestScan ? (Array.isArray(allSignals) ? allSignals.filter(s => String(s?.scanId || '') === String(latestScan.id || '')) : []) : [];
      } catch (_) {}
    }
    const latestPlayableCount = latestScanSignals.filter(s => ['PLAYABLE'].includes(normStatus(s?.status))).length;
    const latestProbeCount = latestScanSignals.filter(s => ['PROBE','PROBE_PENDING'].includes(normStatus(s?.status))).length;
    const latestReadyCount = latestScanSignals.filter(s => ['READY','SCALP_READY'].includes(normStatus(s?.status))).length;
    const execRuntimeSummary = window.EXECUTION_SYNC?.summarizeForDisplay ? window.EXECUTION_SYNC.summarizeForDisplay(coins) : null;
    const runtimeActionable = Number(execRuntimeSummary?.bucketTotal || 0);
    const runtimePlayableCount = Number(execRuntimeSummary?.counts?.playable || 0);
    const runtimeProbeCount = Number(execRuntimeSummary?.counts?.probe || 0);
    const effectiveActionableCount = Math.max(actionableCount, runtimeActionable, latestReadyCount);
    const effectivePlayableCount = Math.max(playableCount, runtimePlayableCount, latestPlayableCount);
    const effectiveProbeCount = Math.max(probeLike.length, runtimeProbeCount, latestProbeCount);
    const gate = deriveTradeGate({
      btc,
      marketHealthScore,
      qualifiedCount,
      actionableCount: effectiveActionableCount,
      playableCount: effectivePlayableCount,
      probeCount: effectiveProbeCount,
      bestSetup,
      outcomeStats
    });
    const normalizedCoins = Array.isArray(execRuntimeSummary?.coins) && execRuntimeSummary.coins.length ? execRuntimeSummary.coins : coins;
    const capitalFlow = window.CAPITAL_FLOW?.build
      ? window.CAPITAL_FLOW.build({
          coins: normalizedCoins,
          snapshot: null,
          marketHealthScore,
          disableTrading: gate.disabled && effectivePlayableCount === 0 && effectiveActionableCount === 0 && effectiveProbeCount === 0
        })
      : { probeCapitalUsed:0, playableCapitalUsed:0, activeCapitalUsed:0, reserveCapitalUsed:0, capitalRegime:'OBSERVE', promotedQueue:[], allocations:[], scaleQueue:[] };

    const runtimeBest = execRuntimeSummary?.bestCoin || null;
    const suggestedCoin = runtimeBest || chooseSuggestedCoin(normalizedCoins || ST.coins || [], bestSetup, gate.mode);
    if (runtimeActionable > 0) { gate.disabled = false; gate.mode = runtimeBest?.executionClass === 'active' ? 'ENABLED' : runtimeBest?.executionClass === 'playable' ? 'REDUCED' : 'PROBE'; gate.reason = `Execution authority active · ${runtimeBest?.symbol || runtimeActionable + ' actionable'} runtime setup`; }
    const dynamicRiskMultiplier = deriveRiskMultiplier({ gate, bestSetup, btc, marketHealthScore, outcomeStats });
    const allocationHintPct = Number(((capitalFlow.probeCapitalUsed || 0) + (capitalFlow.playableCapitalUsed || 0) + (capitalFlow.activeCapitalUsed || 0)).toFixed(2));
    const scoreFloor = gate.mode === 'ENABLED' ? 52 : ['REDUCED','SOFT','PROBE'].includes(gate.mode) ? (btc === 'sideway' ? 12 : 18) : (effectiveActionableCount > 0 ? 28 : 72);
    const bestSetupName = (!bestSetup?.setup || ['unknown', 'no setup'].includes(normalizeSetupSafe(bestSetup?.setup))) ? (runtimeBest?.setup || runtimeBest?.structureTag || 'unknown') : bestSetup.setup;
    const matchingTradables = actionable.filter(c => {
      const key = normalizeSetupSafe(c.setup || c.structureTag);
      if (key === normalizeSetupSafe(bestSetupName)) return true;
      if (normalizeSetupSafe(bestSetupName).includes('spring') && /phase c candidate|early phase d|lps/.test(key)) return true;
      return false;
    });
    const recommendation = gate.disabled
      ? 'NO TRADE'
      : suggestedCoin
        ? `${suggestedCoin.symbol} · ${suggestedCoin.status} · ${suggestedCoin.entryTiming || 'wait'}`
        : gate.mode === 'REDUCED'
          ? (btc === 'sideway' ? 'Probe focus / reduced-size only' : 'Discovery / reduced-size only')
          : 'Wait for qualifying signal';

    return {
      builtAt: Date.now(),
      btc,
      marketHealthScore,
      qualifiedCount,
      actionableCount: effectiveActionableCount,
      playableCount: effectivePlayableCount,
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
      executionAuthority: runtimeActionable > 0,
      matchingTradables: Math.max(matchingTradables.length, effectivePlayableCount + effectiveProbeCount + effectiveActionableCount),
      probeCapitalEnabled: (capitalFlow.capitalRegime === 'PROBE_ACTIVE') || gate.level === 'probe_capital' || ['REDUCED','SOFT','PROBE'].includes(gate.mode) || (marketHealthScore >= 7 && (effectiveActionableCount > 0 || effectivePlayableCount > 0 || effectiveProbeCount > 0)),
      probeCapitalPct: Number(capitalFlow.probeCapitalUsed || 0).toFixed ? Number((capitalFlow.probeCapitalUsed || 0).toFixed(2)) : Number(capitalFlow.probeCapitalUsed || 0),
      probeCapitalUsed: Number(capitalFlow.probeCapitalUsed || 0).toFixed ? Number((capitalFlow.probeCapitalUsed || 0).toFixed(2)) : Number(capitalFlow.probeCapitalUsed || 0),
      playableCapitalUsed: Number(capitalFlow.playableCapitalUsed || 0).toFixed ? Number((capitalFlow.playableCapitalUsed || 0).toFixed(2)) : Number(capitalFlow.playableCapitalUsed || 0),
      activeCapitalUsed: Number(capitalFlow.activeCapitalUsed || 0).toFixed ? Number((capitalFlow.activeCapitalUsed || 0).toFixed(2)) : Number(capitalFlow.activeCapitalUsed || 0),
      capitalRegime: capitalFlow.capitalRegime || 'OBSERVE',
      promotionQueue: Array.isArray(capitalFlow.promotedQueue) ? capitalFlow.promotedQueue : [],
      allocations: Array.isArray(capitalFlow.allocations) ? capitalFlow.allocations : [],
      scaleQueue: Array.isArray(capitalFlow.scaleQueue) ? capitalFlow.scaleQueue : [],
      reserveCapitalUsed: Number(capitalFlow.reserveCapitalUsed || 0),
      hardBlock: gate.disabled ? !(marketHealthScore >= 7 && (qualifiedCount > 0 || effectiveActionableCount > 0 || effectivePlayableCount > 0 || effectiveProbeCount > 0)) : !(suggestedCoin || effectivePlayableCount > 0 || effectiveActionableCount > 0 || effectiveProbeCount > 0),
      learningSamples: dbSetupLearning.reduce((s, x) => s + Number(x.samples || 0), 0),
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
    ST.scanMeta.cache.riskMultiplier = (snap.disableTrading && !snap.probeCapitalEnabled && Number(snap.playableCount || 0) === 0 && Number(snap.actionableCount || 0) === 0)
      ? '0x'
      : `${snap.dynamicRiskMultiplier}x`;
    ST.scanMeta.portfolio = ST.scanMeta.portfolio || {};
    ST.scanMeta.portfolio.active = Array.isArray(snap.allocations) ? snap.allocations.filter(a => ['active','playable','probe'].includes(String(a.bucket||'').toLowerCase()) && Number(a.allocationPct||0) > 0).length : 0;
    ST.scanMeta.cache.portfolioActive = ST.scanMeta.portfolio.active;
    ST.scanMeta.cache.portfolioRiskUsed = `${(((snap.probeCapitalUsed||0)+(snap.playableCapitalUsed||0)+(snap.activeCapitalUsed||0))*100).toFixed(2)}% / 55.00%`;
    ST.scanMeta.regime = ST.scanMeta.regime || {};
    ST.scanMeta.regime.noTrade = !!snap.disableTrading && !(Number(snap.marketHealthScore || 0) >= 7 && (Number(snap.actionableCount || 0) > 0 || Number(snap.playableCount || 0) > 0 || Number(snap.matchingTradables || 0) > 0));
    ST.scanMeta.regime.reason = ST.scanMeta.regime.noTrade ? `PRO EDGE OFF — ${snap.gateReason}` : '';
    ST.scanMeta.insight = ST.scanMeta.insight || {};
    if (window.EXECUTION_SYNC?.syncRuntime) { try { window.EXECUTION_SYNC.syncRuntime(window.ST); } catch (_) {} }
    ST.scanMeta.insight.qualifiedCount = Math.max(Number(ST.scanMeta.insight.qualifiedCount || 0), Number(snap.qualifiedCount || 0));
    ST.scanMeta.cache.qualifiedCount = Number(snap.qualifiedCount || 0);
    ST.scanMeta.cache.playableCount = Number(snap.playableCount || 0);
    ST.scanMeta.cache.actionableCount = Number(snap.actionableCount || 0);
    ST.save();
    if (window.DB?.setSetting) {
      try { await DB.setSetting('proEdgeSnapshot', snap); } catch (_) {}
    }
    return snap;
  }

  function gateAllocationText(snap) {
    if (!snap) return '0%';
    const pct = Number(snap.allocationHintPct || 0);
    if (snap.disableTrading && !snap.probeCapitalEnabled && Number(snap.playableCount || 0) === 0 && Number(snap.matchingTradables || 0) === 0 && pct <= 0) return '0%';
    return `${(pct * 100).toFixed(0)}%`;
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
