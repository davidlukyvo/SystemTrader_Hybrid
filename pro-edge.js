/* ══════════════════════════════════════════════════════════
   PRO EDGE ENGINE v8.2
   Best setup detection · dynamic risk multiplier · trade gate
   ══════════════════════════════════════════════════════════ */
window.PRO_EDGE = (() => {
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
    const [signals, outcomes] = await Promise.all([DB.getSignals({}), DB.getOutcomes({})]);
    const signalMap = new Map((signals || []).map(s => [s.id, s]));
    const grouped = new Map();
    for (const outcome of (outcomes || [])) {
      const sig = signalMap.get(outcome.signalId);
      if (!sig) continue;
      const setup = normalizeSetupSafe(sig.setup || 'unknown');
      if (!grouped.has(setup)) grouped.set(setup, []);
      grouped.get(setup).push({ outcome, sig });
    }
    return Array.from(grouped.entries()).map(([setup, rows]) => {
      const wins = rows.filter(r => r.outcome.verdict === 'winner').length;
      const avgR = rows.reduce((s, r) => s + Number(r.outcome.actualR || 0), 0) / Math.max(1, rows.length);
      const winRate = rows.length ? wins / rows.length : 0;
      const edgeBoost = clamp(0.85 + (winRate * 0.4) + Math.max(-0.10, Math.min(0.20, avgR * 0.08)), 0.75, 1.25);
      return {
        setup,
        samples: rows.length,
        winRate: Math.round(winRate * 100),
        avgR: Number(avgR.toFixed(2)),
        edgeBoost: Number(edgeBoost.toFixed(2))
      };
    }).sort((a, b) => b.samples - a.samples);
  }

  function mergeSetupLearning(baseStats, dbLearning) {
    const dbMap = new Map((dbLearning || []).map(x => [normalizeSetupSafe(x.setup), x]));
    return (baseStats || []).map(s => {
      const key = normalizeSetupSafe(s.setup);
      const learned = dbMap.get(key);
      if (!learned) return { ...s, learnedSamples: 0, learnedBoost: 1 };
      const blendedEdge = Number((Number(s.edgeMultiplier || 1) * learned.edgeBoost).toFixed(2));
      const blendedExp = Number((Number(s.expectancyR || 0) + (learned.avgR * Math.min(0.35, learned.samples / 40))).toFixed(2));
      const blendedWr = Math.round((Number(s.wr || 0) * 0.65) + (Number(learned.winRate || 0) * 0.35));
      return {
        ...s,
        edgeMultiplier: blendedEdge,
        expectancyR: blendedExp,
        wr: blendedWr,
        learnedSamples: learned.samples,
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
    const playable = tradable.filter(hasPlayableSetup);
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
    const playable = actionable.filter(hasPlayableSetup);
    const dbSetupLearning = await getDBSetupLearning();
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
