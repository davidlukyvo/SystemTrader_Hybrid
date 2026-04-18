
/* ══════════════════════════════════════════════════════════
   TRUE CAPITAL ENGINE v8.7.7
   Real allocation · promotion queue · auto scale suggestions
   ══════════════════════════════════════════════════════════ */
window.CAPITAL_FLOW = (() => {
  const STATE = {
    lastSummary: {
      probeCapitalUsed: 0,
      playableCapitalUsed: 0,
      activeCapitalUsed: 0,
      reserveCapitalUsed: 0,
      capitalRegime: 'OBSERVE',
      promotedQueue: [],
      allocations: [],
      scaleQueue: [],
      builtAt: 0
    }
  };

  const LIMITS = {
    probe: 0.15,
    playable: 0.35,
    active: 0.55,
    reserve: 0.10
  };

  function n(v, d=0) {
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function upper(v) {
    return String(v || '').toUpperCase();
  }

  function lower(v) {
    return String(v || '').toLowerCase();
  }

  function normalizeSetup(v) {
    return lower(v).trim();
  }

  function getTier(c) {
    const displayStatus = upper(c?.displayStatus || c?.tradeState || '');
    if (displayStatus) return displayStatus;
    const execTier = upper(c?.executionTier || '');
    if (execTier) return execTier;
    const status = upper(c?.status || '');
    if (['READY','SCALP_READY'].includes(status)) return 'EXECUTION';
    return status;
  }

  function setupWeight(c) {
    const s = normalizeSetup(c?.setup || c?.structureTag || '');
    if (s.includes('spring + test')) return 1.0;
    if (s.includes('lps')) return 0.9;
    if (s.includes('early phase d')) return 0.8;
    if (s.includes('phase c')) return 0.65;
    if (s.includes('spring')) return 0.7;
    if (s.includes('breakout')) return 0.7;
    if (s.includes('early watch')) return 0.35;
    return 0.2;
  }

  function healthWeight(marketHealthScore) {
    const h = n(marketHealthScore, 5);
    if (h >= 8) return 1.0;
    if (h >= 7) return 0.85;
    if (h >= 5) return 0.65;
    return 0.35;
  }

  function rrWeight(rr) {
    const r = n(rr, 0);
    if (r >= 2) return 1.0;
    if (r >= 1) return 0.85;
    if (r >= 0.55) return 0.65;
    if (r >= 0.30) return 0.45;
    return 0.20;
  }

  function confidenceWeight(c) {
    return clamp(n(c?.executionConfidence, 0.3), 0.25, 1.0);
  }

  function smartMoneyWeight(c) {
    return clamp(0.35 + n(c?.smartMoneyScore, 0) * 0.65, 0.25, 1.0);
  }

  function allowStructureRiskBypass(c) {
    return lower(c?.chartEntryQuality) === 'structure_risk'
      && n(c?.executionConfidence, 0) >= 0.75
      && n(c?.smartMoneyScore, 0) >= 0.50
      && lower(c?.fakePumpRisk) === 'low';
  }

  function classifyRegime(used) {
    if (used.activeCapitalUsed > 0) return 'ACTIVE_DEPLOYED';
    if (used.playableCapitalUsed > 0) return 'PLAYABLE_ACTIVE';
    if (used.probeCapitalUsed > 0) return 'PROBE_ACTIVE';
    return 'OBSERVE';
  }

  function bucketForTier(tier) {
    if (tier === 'EXECUTION' || tier === 'READY' || tier === 'SCALP_READY' || tier === 'ACTIVE') return 'active';
    if (tier === 'PLAYABLE') return 'playable';
    if (tier === 'PROBE' || tier === 'PROBE_PENDING') return 'probe';
    return 'reserve';
  }

  function baseAllocByTier(tier) {
    if (tier === 'EXECUTION' || tier === 'READY' || tier === 'SCALP_READY' || tier === 'ACTIVE') return 0.12;
    if (tier === 'PLAYABLE') return 0.07;
    if (tier === 'PROBE' || tier === 'PROBE_PENDING') return 0.05;
    return 0.00;
  }

  function scaleInReady(c) {
    return ['EXECUTION','PLAYABLE','READY','SCALP_READY'].includes(getTier(c))
      && n(c?.executionConfidence, 0) >= 0.78
      && n(c?.smartMoneyScore, 0) >= 0.50
      && n(c?.rr, 0) >= 0.55
      && !['wait', 'watch', 'pre_trigger'].includes(lower(c?.entryTiming));
  }

  function promotionCandidate(c, marketHealthScore) {
    const t = getTier(c);
    if (!['PROBE', 'PROBE_PENDING', 'EARLY'].includes(t)) return false;
    if (n(marketHealthScore, 0) < 7) return false;
    if (n(c?.executionConfidence, 0) < 0.68) return false;
    if (n(c?.smartMoneyScore, 0) < 0.25) return false;
    if (n(c?.rr, 0) < 0.30) return false;
    if (c?.rejected && !allowStructureRiskBypass(c)) return false;
    return ['playable_probe','active','15m_active','reclaimbreak','reclaimBreak'].includes(String(c?.entryTiming));
  }

  function fromSnapshot(snapshot) {
    const cf = snapshot?.capitalFlow || null;
    if (!cf) return null;
    const probe = n(cf.probeCapitalUsed, 0);
    const playable = n(cf.playableCapitalUsed, 0);
    const active = n(cf.activeCapitalUsed, 0);
    if (probe <= 0 && playable <= 0 && active <= 0) return null;
    return {
      probeCapitalUsed: probe,
      playableCapitalUsed: playable,
      activeCapitalUsed: active,
      reserveCapitalUsed: n(cf.reserveCapitalUsed, 0),
      capitalRegime: cf.capitalRegime || classifyRegime({probeCapitalUsed:probe, playableCapitalUsed:playable, activeCapitalUsed:active}),
      promotedQueue: Array.isArray(cf.promotedQueue) ? cf.promotedQueue : [],
      allocations: Array.isArray(cf.allocations) ? cf.allocations : [],
      scaleQueue: Array.isArray(cf.scaleQueue) ? cf.scaleQueue : [],
      builtAt: snapshot?.builtAt || Date.now()
    };
  }

  function build(opts={}) {
    const coins = Array.isArray(opts.coins) ? opts.coins : [];
    const snapshot = opts.snapshot || null;
    const marketHealthScore = n(opts.marketHealthScore, snapshot?.marketHealthScore || window.ST?.scanMeta?.insight?.marketHealthScore || 5);
    const disableTrading = !!opts.disableTrading;

    const snap = fromSnapshot(snapshot);
    if (snap) {
      STATE.lastSummary = snap;
      return snap;
    }

    const used = {
      probeCapitalUsed: 0,
      playableCapitalUsed: 0,
      activeCapitalUsed: 0,
      reserveCapitalUsed: 0,
      promotedQueue: [],
      allocations: [],
      scaleQueue: [],
      builtAt: Date.now()
    };

    const ranked = [...coins]
      .filter(c => ['EXECUTION','PLAYABLE','PROBE','PROBE_PENDING','READY','SCALP_READY','ACTIVE','EARLY'].includes(getTier(c)))
      .sort((a,b) => n(b?.rankScore || b?.riskAdjustedScore || b?.score,0) - n(a?.rankScore || a?.riskAdjustedScore || a?.score,0));

    for (const c of ranked) {
      const tier = getTier(c);
      const bucket = bucketForTier(tier);
      let base = baseAllocByTier(tier);

      if (disableTrading && bucket === 'active') base = 0;
      if (disableTrading && bucket === 'playable') base *= 0.60; // keep reduced-size playable
      if (disableTrading && bucket === 'probe') base *= 0.85;

      if (allowStructureRiskBypass(c)) {
        base = Math.max(base, bucket === 'probe' ? 0.04 : 0.06);
      }

      const weight = setupWeight(c) * healthWeight(marketHealthScore) * rrWeight(c?.rr) * confidenceWeight(c) * smartMoneyWeight(c);
      let alloc = clamp(base * weight, 0, bucket === 'active' ? 0.18 : bucket === 'playable' ? 0.10 : 0.06);

      if (bucket === 'probe' && alloc <= 0 && (tier === 'PROBE' || promotionCandidate(c, marketHealthScore))) {
        alloc = 0.02;
      }

      if (bucket === 'probe') {
        const room = LIMITS.probe - used.probeCapitalUsed;
        alloc = clamp(alloc, 0, room);
        used.probeCapitalUsed += alloc;
      } else if (bucket === 'playable') {
        const room = LIMITS.playable - used.playableCapitalUsed;
        alloc = clamp(alloc, 0, room);
        used.playableCapitalUsed += alloc;
      } else if (bucket === 'active') {
        const room = LIMITS.active - used.activeCapitalUsed;
        alloc = clamp(alloc, 0, room);
        used.activeCapitalUsed += alloc;
      } else {
        used.reserveCapitalUsed = clamp(LIMITS.reserve, 0, LIMITS.reserve);
      }

      const riskPct = alloc > 0 ? Number((alloc * (bucket === 'active' ? 0.18 : bucket === 'playable' ? 0.10 : 0.06)).toFixed(4)) : 0;
      if (alloc > 0) {
        used.allocations.push({
          id: c.id,
          symbol: c.symbol,
          tier,
          bucket,
          allocationPct: Number(alloc.toFixed(4)),
          riskPct,
          scaleInReady: scaleInReady(c)
        });
      }

      if (promotionCandidate(c, marketHealthScore)) {
        used.promotedQueue.push({ symbol: c.symbol, from: tier, to: 'PLAYABLE' });
      }
      if (scaleInReady(c)) {
        used.scaleQueue.push({ symbol: c.symbol, tier });
      }
    }

    used.capitalRegime = classifyRegime(used);
    STATE.lastSummary = used;
    return used;
  }

  function summary() {
    return STATE.lastSummary || {};
  }

  function exportState() {
    return { summary: summary() };
  }

  function importState(payload) {
    if (payload && payload.summary && typeof payload.summary === 'object') {
      STATE.lastSummary = payload.summary;
    }
  }

  return {
    build,
    summary,
    exportState,
    importState,
    scaleInReady,
    allowStructureRiskBypass
  };
})();
