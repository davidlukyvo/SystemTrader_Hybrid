/* ── AGENTIC REVIEW ENGINE v1.0 — OBSERVE ONLY ─────────────────────────────
   Deterministic explainability layer inspired by multi-role review workflows.
   Phase 1 does NOT call external LLMs and does NOT affect any decision path.
   CONTRACT:
   - decisionImpact is always "none"
   - no Alpha Guard / capital / portfolio / Telegram mutation
   - output is a structured audit memo attached to each persisted signal
────────────────────────────────────────────────────────────────────────── */

window.AGENT_REVIEW_ENGINE = (() => {
  const VERSION = 'v1.0-observe-only';
  const DECISION_IMPACT = 'none';

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function pct01(value) {
    return `${Math.round(num(value) * 100)}%`;
  }

  function upper(value, fallback = '') {
    return String(value || fallback || '').toUpperCase();
  }

  function lower(value, fallback = '') {
    return String(value || fallback || '').toLowerCase();
  }

  function getDisplayStatus(signal) {
    return upper(signal?.finalAuthorityStatus || signal?.displayStatus || signal?.status || 'WATCH');
  }

  function getAuthorityDecision(signal) {
    return upper(signal?.authorityDecision || signal?.decision || 'UNKNOWN');
  }

  function getSetup(signal) {
    return String(signal?.setup || signal?.structureTag || 'unknown');
  }

  function getTrigger(signal) {
    return String(signal?.entrySignal || signal?.entryTiming || 'wait');
  }

  function formatAuthorityReason(reason) {
    const raw = String(reason || 'n/a').trim();
    const compact = raw.replace(/\s+/g, '');
    if (/^dedup:?symbol_in_batch_or_portfolio$/i.test(compact) || /^dedupsymbol_in_batch_or_portfolio$/i.test(compact)) {
      return 'Already in batch or portfolio';
    }
    if (/^dedup:?symbol_already_in_portfolio$/i.test(compact) || /^dedupsymbol_already_in_portfolio$/i.test(compact)) {
      return 'Already in portfolio';
    }
    if (/^capital_guard:/i.test(raw)) return raw.replace(/^capital_guard:/i, 'Capital guard: ');
    if (/^pre_gate_blocked:/i.test(raw)) return raw.replace(/^pre_gate_blocked:/i, 'Pre-gate blocked: ');
    if (/^all_tiers_rejected$/i.test(raw)) return 'All tiers rejected';
    return raw || 'n/a';
  }

  function hasObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function tierSummary(trace) {
    const byTier = hasObject(trace?.rejectionsByTier) ? trace.rejectionsByTier : {};
    const summary = {};
    ['READY', 'PLAYABLE', 'PROBE'].forEach(tier => {
      const reasons = Array.isArray(byTier[tier]) ? byTier[tier] : [];
      summary[tier] = {
        rejected: reasons.length > 0,
        count: reasons.length,
        reasons: reasons.slice(0, 5)
      };
    });
    return summary;
  }

  function flagList(evidence, positive) {
    if (!hasObject(evidence)) return [];
    const positives = [
      ['absorptionEvidence', 'absorption evidence'],
      ['reclaimEvidence', 'reclaim evidence'],
      ['breakoutAcceptance', 'breakout acceptance'],
      ['failedBreakdownEvidence', 'failed breakdown evidence'],
      ['sellingExhaustion', 'selling exhaustion'],
      ['volumeExpansion', 'volume expansion']
    ];
    const risks = [
      ['lateEntryRisk', 'late entry risk'],
      ['stopTooTightRisk', 'stop too tight risk'],
      ['noFollowThroughRisk', 'no follow-through risk']
    ];
    return (positive ? positives : risks)
      .filter(([key]) => evidence[key] === true)
      .map(([, label]) => label);
  }

  function addIf(list, condition, text) {
    if (condition) list.push(text);
  }

  function buildTechnicalSummary(signal, status, decision) {
    const trace = signal?.authorityTrace || signal?.authTrace || null;
    return {
      status,
      authorityDecision: decision,
      authorityReason: formatAuthorityReason(signal?.authorityReason || signal?.reason),
      setup: getSetup(signal),
      trigger: getTrigger(signal),
      rr: Number(num(signal?.rr).toFixed(2)),
      confidence: pct01(signal?.executionConfidence ?? signal?.confScore),
      scoreSemantics: signal?.scoreSemantics || null,
      score: {
        rawScannerScore: num(signal?.rawScannerScore ?? signal?.score),
        riskAdjustedScore: num(signal?.riskAdjustedScore),
        executionQualityScore: num(signal?.executionQualityScore ?? signal?.rankScore),
        edgeScore: num(signal?.edgeScore)
      },
      levels: {
        entry: num(signal?.entry || signal?.price),
        stop: num(signal?.stop),
        tp1: num(signal?.tp1),
        tp2: num(signal?.tp2),
        tp3: num(signal?.tp3)
      },
      rejectionsByTier: tierSummary(trace)
    };
  }

  function buildBehaviorSummary(signal) {
    const evidence = signal?.behaviorEvidence || null;
    return {
      inputQuality: signal?.behaviorInputQuality || 'n/a',
      engineVersion: signal?.behaviorEngineVersion || 'n/a',
      positiveFlags: flagList(evidence, true),
      riskFlags: flagList(evidence, false),
      scores: {
        priceZoneQuality: signal?.priceZoneQuality ?? null,
        volumeSupportScore: signal?.volumeSupportScore ?? null,
        volumeResistanceRisk: signal?.volumeResistanceRisk ?? null,
        pathToTPQuality: signal?.pathToTPQuality ?? null
      },
      failureModeCandidate: Array.isArray(signal?.failureModeCandidate)
        ? signal.failureModeCandidate.slice(0, 5)
        : []
    };
  }

  function buildBullCase(signal, status, decision, behaviorSummary) {
    const bull = [];
    const rr = num(signal?.rr);
    const conf = num(signal?.executionConfidence ?? signal?.confScore);
    const capitalAllowed = signal?.capitalPlan?.allowed === true;
    const actionable = signal?.executionGatePassed === true || ['ALLOW', 'WAIT'].includes(decision);

    addIf(bull, actionable && ['READY', 'PLAYABLE', 'PROBE'].includes(status), `Authority marks this as ${status} / ${decision}.`);
    addIf(bull, rr >= 2, `RR is favorable at ${rr.toFixed(2)}x.`);
    addIf(bull, conf >= 0.58, `Execution confidence is alert-grade at ${pct01(conf)}.`);
    addIf(bull, lower(signal?.chartEntryQuality) === 'entry_good', 'Chart entry quality is marked entry_good.');
    addIf(bull, capitalAllowed, 'Capital plan allows this candidate under current portfolio constraints.');
    addIf(bull, behaviorSummary.positiveFlags.length > 0, `Behavior evidence positives: ${behaviorSummary.positiveFlags.join(', ')}.`);
    addIf(bull, num(signal?.volumeSupportScore) >= 50, `Volume support score is constructive at ${signal.volumeSupportScore}/100.`);
    addIf(bull, num(signal?.pathToTPQuality) >= 60, `Path-to-TP quality is relatively clean at ${signal.pathToTPQuality}/100.`);

    return bull.length ? bull : ['No strong bull-case evidence beyond baseline scanner data.'];
  }

  function buildBearCase(signal, status, decision, behaviorSummary) {
    const bear = [];
    const rr = num(signal?.rr);
    const conf = num(signal?.executionConfidence ?? signal?.confScore);
    const score = num(signal?.riskAdjustedScore ?? signal?.score);
    const trigger = lower(getTrigger(signal));
    const capitalPlan = signal?.capitalPlan || {};

    addIf(bear, decision === 'REJECT', `Authority decision is REJECT with reason: ${formatAuthorityReason(signal?.authorityReason || signal?.reason)}.`);
    addIf(bear, trigger === 'wait', 'Entry trigger is still wait; no trigger confirmation is present.');
    addIf(bear, rr < 1.2, `RR is thin at ${rr.toFixed(2)}x.`);
    addIf(bear, conf < 0.58, `Execution confidence is below alert-grade at ${pct01(conf)}.`);
    addIf(bear, score < 24, `Risk-adjusted score is weak at ${score}.`);
    addIf(bear, capitalPlan.allowed === false, `Capital plan blocks or cools down this candidate: ${(capitalPlan.guardReasons || []).join(', ') || 'capital policy'}.`);
    addIf(bear, behaviorSummary.riskFlags.length > 0, `Behavior risk flags: ${behaviorSummary.riskFlags.join(', ')}.`);
    addIf(bear, behaviorSummary.failureModeCandidate.length > 0, `Failure candidates: ${behaviorSummary.failureModeCandidate.join(', ')}.`);
    addIf(bear, num(signal?.volumeResistanceRisk) >= 70, `TP path has elevated resistance risk at ${signal.volumeResistanceRisk}/100.`);
    addIf(bear, ['SIDEWAY', 'CHOP', 'DISTRIBUTION', 'FAKE_PUMP'].includes(upper(signal?.regime || signal?.regimeType || signal?.btcContext)), `Regime context requires caution: ${signal?.regime || signal?.regimeType || signal?.btcContext}.`);

    return bear.length ? bear : ['No major bear-case blockers were detected in the available fields.'];
  }

  function buildRiskReview(signal, status, decision) {
    const trigger = lower(getTrigger(signal));
    const conf = num(signal?.executionConfidence ?? signal?.confScore);
    const stopDistancePct = signal?.position?.stopDistancePct ?? signal?.capitalPlan?.stopDistancePct ?? null;
    const riskNote = stopDistancePct ? ` Stop distance is approximately ${(num(stopDistancePct) * 100).toFixed(2)}%.` : '';

    return {
      aggressive: ['READY', 'PLAYABLE', 'PROBE'].includes(status) && ['ALLOW', 'WAIT'].includes(decision)
        ? `Review-only: aggressive operator may monitor the planned zone, but should still require chart confirmation.${riskNote}`
        : 'Review-only: aggressive posture is not supported because authority is not actionable.',
      neutral: trigger === 'wait'
        ? 'Review-only: neutral posture waits for trigger confirmation before considering any manual action.'
        : 'Review-only: neutral posture checks whether trigger quality remains valid near the planned entry.',
      conservative: conf < 0.58 || decision === 'REJECT'
        ? 'Review-only: conservative posture stands down until confidence/authority improves.'
        : 'Review-only: conservative posture waits for stronger confirmation or cleaner behavior evidence.'
    };
  }

  function buildFinalOperatorNote(signal, status, decision) {
    const trigger = lower(getTrigger(signal));
    if (decision === 'REJECT') return 'Alpha Guard is not actionable; keep this as audit context only.';
    if (status === 'READY') return 'READY authority is present; this review is explanatory only and does not replace manual chart and risk confirmation before execution.';
    if (status === 'PLAYABLE' && trigger === 'wait') return 'PLAYABLE / ALLOW authority is present, but trigger is still wait; manually confirm chart structure, entry zone, stop risk, and portfolio context before execution.';
    if (status === 'PLAYABLE') return 'PLAYABLE / ALLOW authority is present; manually confirm chart structure, entry zone, stop risk, and portfolio context before execution.';
    if (status === 'PROBE') return 'PROBE authority is monitoring-grade; treat as small-size observation context, not automatic execution.';
    return 'Review-only memo generated from existing runtime data; no decision authority is granted.';
  }

  function buildSourceIntegrity(signal) {
    return {
      authorityTracePresent: hasObject(signal?.authorityTrace || signal?.authTrace),
      capitalPlanPresent: hasObject(signal?.capitalPlan),
      behaviorEvidencePresent: hasObject(signal?.behaviorEvidence),
      scoreSemanticsPresent: hasObject(signal?.scoreSemantics),
      levelsPresent: num(signal?.entry || signal?.price) > 0 && num(signal?.stop) > 0 && num(signal?.tp1) > 0
    };
  }

  function buildReview(signal, btcContext) {
    const status = getDisplayStatus(signal);
    const decision = getAuthorityDecision(signal);
    const behaviorEvidenceSummary = buildBehaviorSummary(signal);
    return {
      version: VERSION,
      decisionImpact: DECISION_IMPACT,
      llmUsed: false,
      externalCalls: false,
      computedAt: Date.now(),
      context: {
        btcContext: signal?.btcContext || btcContext || 'unknown',
        regime: signal?.regime || signal?.regimeType || signal?.authorityTrace?.macro?.regimeType || 'unknown'
      },
      technicalSummary: buildTechnicalSummary(signal, status, decision),
      behaviorEvidenceSummary,
      bullCase: buildBullCase(signal, status, decision, behaviorEvidenceSummary),
      bearCase: buildBearCase(signal, status, decision, behaviorEvidenceSummary),
      riskReview: buildRiskReview(signal, status, decision),
      finalOperatorNote: buildFinalOperatorNote(signal, status, decision),
      sourceIntegrity: buildSourceIntegrity(signal)
    };
  }

  function enrich(signal, btcContext) {
    try {
      if (!signal || typeof signal !== 'object') return signal;
      return {
        ...signal,
        agentReview: buildReview(signal, btcContext)
      };
    } catch (err) {
      console.warn('[AgentReview] Enrich failed for', signal?.symbol || 'unknown', err?.message || err);
      return signal;
    }
  }

  return {
    VERSION,
    enrich
  };
})();
