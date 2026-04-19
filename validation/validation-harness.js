(function(root, factory) {
  const api = factory(root);
  root.VALIDATION_HARNESS = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';

  function assert(condition, code, message, details) {
    if (!condition) {
      const err = new Error(message);
      err.code = code;
      err.details = details || null;
      throw err;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeFixtures(options = {}) {
    const badFixture = !!options.withBadFixture;

    const displayDowngraded = {
      id: 'fx-display-downgraded',
      symbol: 'DOWN',
      setup: 'trend-continuation',
      structureTag: 'trend-continuation',
      entrySignal: 'miniSpring',
      entryTiming: 'miniSpring',
      status: 'PLAYABLE',
      finalAuthorityStatus: 'PLAYABLE',
      displayStatus: 'WATCH',
      authorityDecision: 'REJECT',
      authorityReason: 'pre_gate_blocked:WATCH',
      authorityTrace: { rejectionsByTier: { PLAYABLE: ['pre_gate:watch'] } },
      authorityBlockers: ['pre_gate_blocked:WATCH'],
      executionTier: 'OBSERVE',
      executionGatePassed: false,
      executionActionable: false,
      executionConfidence: 0.50,
      rr: 3.2,
      score: 44,
      rawScannerScore: 44,
      riskAdjustedScore: 40,
      executionQualityScore: 27,
      rankScore: 40,
      isTechnicalCandidate: true,
      isExecutionApproved: false,
      isExecutionRejected: true,
      isAlertEligible: false,
      isPortfolioBound: false,
    };

    const setupSeparated = {
      id: 'fx-setup-separated',
      symbol: 'SEP',
      setup: badFixture ? 'breakoutRetest15m' : 'breakout',
      structureTag: badFixture ? '' : 'breakout',
      entrySignal: 'breakoutRetest15m',
      entryTiming: 'breakoutRetest15m',
      displayStatus: 'WATCH',
      finalAuthorityStatus: 'WATCH',
      authorityDecision: 'REJECT',
      authorityReason: 'pre_gate_blocked:WATCH',
      authorityTrace: { rejectionsByTier: { PROBE: ['pre_gate:watch'] } },
      status: 'WATCH',
      executionTier: 'OBSERVE',
      executionGatePassed: false,
      executionActionable: false,
      score: 18,
      rawScannerScore: 18,
      riskAdjustedScore: 18,
      executionQualityScore: 10,
      rankScore: 18,
    };

    const rejectedTechnical = {
      id: 'fx-rejected-technical',
      symbol: 'REJT',
      setup: 'breakout',
      structureTag: 'breakout',
      entrySignal: 'wait',
      entryTiming: 'wait',
      status: 'WATCH',
      finalAuthorityStatus: 'PLAYABLE',
      displayStatus: badFixture ? 'PLAYABLE' : 'WATCH',
      authorityDecision: 'REJECT',
      authorityReason: 'all_tiers_rejected',
      authorityTrace: { rejectionsByTier: { READY: ['score_42_lt_50'] } },
      authorityBlockers: ['all_tiers_rejected'],
      executionTier: 'OBSERVE',
      executionGatePassed: false,
      executionActionable: false,
      executionConfidence: 0.50,
      rr: 4.8,
      entry: 1.11,
      stop: 1.05,
      tp1: 1.28,
      score: 42,
      rawScannerScore: 42,
      riskAdjustedScore: 39,
      executionQualityScore: 24,
      rankScore: 39,
      isTechnicalCandidate: true,
      isExecutionApproved: false,
      isExecutionRejected: true,
      isAlertEligible: false,
      isPortfolioBound: false,
    };

    const actionableApproved = {
      id: 'fx-actionable-approved',
      symbol: 'LIVE',
      setup: 'trend-continuation',
      structureTag: 'trend-continuation',
      entrySignal: 'miniSpring',
      entryTiming: 'miniSpring',
      status: 'PLAYABLE',
      finalAuthorityStatus: 'PLAYABLE',
      displayStatus: 'PLAYABLE',
      authorityDecision: 'ALLOW',
      authorityReason: 'adaptive_unlock:probe',
      authorityTrace: { triggerMatched: true, rejectionsByTier: { READY: ['rr_1.8_lt_2.2'] } },
      authorityBlockers: ['adaptive_unlock:probe'],
      executionTier: 'PLAYABLE',
      executionGatePassed: true,
      executionActionable: true,
      executionConfidence: 0.64,
      rr: 1.9,
      entry: 10,
      stop: 9.2,
      tp1: 11.6,
      score: 36,
      rawScannerScore: 36,
      riskAdjustedScore: 35,
      executionQualityScore: 57,
      rankScore: 57,
      isTechnicalCandidate: true,
      isExecutionApproved: true,
      isExecutionRejected: false,
      isAlertEligible: true,
      isPortfolioBound: false,
    };

    const nearApproved = {
      id: 'fx-near-approved',
      symbol: 'NAPP',
      setup: 'early-watch',
      structureTag: 'early-watch',
      entrySignal: 'wait',
      entryTiming: 'wait',
      status: 'WATCH',
      finalAuthorityStatus: 'WATCH',
      displayStatus: 'WATCH',
      authorityDecision: 'REJECT',
      authorityReason: 'capital_guard:cooldown_active_90m|loss_streak_guard_2',
      authorityBlockers: ['cooldown_active_90m', 'loss_streak_guard_2', 'capital_guard:cooldown_active_90m|loss_streak_guard_2'],
      authorityTrace: { capital: { guardReasons: ['cooldown_active_90m', 'loss_streak_guard_2'] } },
      signalState: 'CANDIDATE',
      executionTier: 'OBSERVE',
      executionGatePassed: false,
      executionActionable: false,
      executionConfidence: 0.55,
      rr: 2.1,
      score: 28,
      rawScannerScore: 28,
      riskAdjustedScore: 26,
      executionQualityScore: 22,
      rankScore: 26,
      isTechnicalCandidate: true,
      isExecutionApproved: false,
      isExecutionRejected: true,
      isAlertEligible: false,
      isPortfolioBound: false,
    };

    const positionBound = {
      id: 'fx-position-bound',
      symbol: 'HELD',
      setup: 'breakout',
      structureTag: 'breakout',
      entrySignal: 'reclaimBreak',
      entryTiming: 'reclaimBreak',
      status: 'WATCH',
      finalAuthorityStatus: 'WATCH',
      displayStatus: 'WATCH',
      authorityDecision: 'REJECT',
      authorityReason: 'dedup:symbol_in_batch_or_portfolio',
      authoritySource: 'portfolio_binding',
      authorityTrace: { rejectionsByTier: { PLAYABLE: ['dedup:symbol_already_in_portfolio'] } },
      authorityBlockers: ['dedup:symbol_in_batch_or_portfolio'],
      executionTier: 'OBSERVE',
      executionGatePassed: false,
      executionActionable: false,
      executionConfidence: 0.50,
      rr: 5,
      entry: 2,
      stop: 1.9,
      tp1: 2.3,
      positionState: 'PENDING',
      score: 41,
      rawScannerScore: 41,
      riskAdjustedScore: 39,
      executionQualityScore: 21,
      rankScore: 39,
      isTechnicalCandidate: true,
      isExecutionApproved: false,
      isExecutionRejected: true,
      isAlertEligible: false,
      isPortfolioBound: true,
    };

    return {
      displayDowngraded,
      setupSeparated,
      rejectedTechnical,
      actionableApproved,
      nearApproved,
      positionBound,
    };
  }

  async function withMockedDb(fixtures, fn) {
    const original = root.DB;
    const signals = [
      clone(fixtures.rejectedTechnical),
      clone(fixtures.actionableApproved),
      clone(fixtures.nearApproved),
      clone(fixtures.positionBound),
    ];
    const outcomes = [
      { id: 'out-reject-D1', signalId: fixtures.rejectedTechnical.id, verdict: 'winner', pctChange: 8, actualR: 1.2, checkDay: 'D1', evaluatedAt: Date.now() },
      { id: 'out-approve-D1', signalId: fixtures.actionableApproved.id, verdict: 'winner', pctChange: 5, actualR: 1.0, checkDay: 'D1', evaluatedAt: Date.now() },
      { id: 'out-near-D1', signalId: fixtures.nearApproved.id, verdict: 'winner', pctChange: 4, actualR: 0.8, checkDay: 'D1', evaluatedAt: Date.now() },
      { id: 'out-bound-D1', signalId: fixtures.positionBound.id, verdict: 'winner', pctChange: 6, actualR: 1.1, checkDay: 'D1', evaluatedAt: Date.now() },
    ];

    root.DB = Object.assign({}, original || {}, {
      getSignals: async () => signals.map(clone),
      getOutcomes: async () => outcomes.map(clone),
    });

    try {
      return await fn();
    } finally {
      root.DB = original;
    }
  }

  async function runRegressionSuite(options = {}) {
    const fixtures = makeFixtures(options);
    const checks = [];

    assert(typeof root.getExecutionDisplayStatus === 'function', 'missing_display_helper', 'getExecutionDisplayStatus is unavailable');
    assert(typeof root.getStructuralSetupLabel === 'function', 'missing_setup_helper', 'getStructuralSetupLabel is unavailable');
    assert(typeof root.getEntryTriggerLabel === 'function', 'missing_trigger_helper', 'getEntryTriggerLabel is unavailable');
    assert(typeof root.ST?.validateAuthorityContract === 'function', 'missing_authority_validator', 'ST.validateAuthorityContract is unavailable');
    assert(typeof root.ANALYTICS_ENGINE?.getSignalTruth === 'function', 'missing_analytics_truth', 'ANALYTICS_ENGINE.getSignalTruth is unavailable');
    assert(typeof root.OUTCOME_EVAL?.getScoreBucketPerformance === 'function', 'missing_outcome_eval', 'OUTCOME_EVAL.getScoreBucketPerformance is unavailable');
    assert(typeof root.AlertEngine?.messageFor === 'function', 'missing_alert_builder', 'AlertEngine.messageFor is unavailable');
    assert(typeof root.DB?.normalizeSignalRecord === 'function', 'missing_db_normalizer', 'DB.normalizeSignalRecord is unavailable');
    assert(typeof root.getCanonicalStructuralSetups === 'function', 'missing_setup_taxonomy', 'Canonical setup taxonomy helper is unavailable');
    assert(typeof root.CAPITAL_ENGINE?.computePlan === 'function', 'missing_capital_engine', 'CAPITAL_ENGINE.computePlan is unavailable');
    assert(typeof root.EXECUTION_ENGINE_V9?.getAdaptiveSoftTier === 'function', 'missing_soft_probe_helper', 'EXECUTION_ENGINE_V9.getAdaptiveSoftTier is unavailable');

    const downgradedStatus = root.getExecutionDisplayStatus(fixtures.displayDowngraded);
    assert(downgradedStatus === 'WATCH', 'display_truth_leak', 'Display truth leak re-promoted a downgraded signal', { actual: downgradedStatus });
    assert(fixtures.displayDowngraded.finalAuthorityStatus === 'PLAYABLE', 'technical_truth_lost', 'Technical tier should remain preserved as secondary truth');
    const authorityCheck = root.ST.validateAuthorityContract(fixtures.displayDowngraded);
    assert(authorityCheck.ok === true, 'authority_contract_regression', 'Authority contract validation failed for downgraded fixture', authorityCheck);
    checks.push({ scenario: 'display_downgrade_protection', passed: true });

    const structuralSetup = root.getStructuralSetupLabel(fixtures.setupSeparated);
    const triggerLabel = root.getEntryTriggerLabel(fixtures.setupSeparated);
    assert(structuralSetup === 'breakout', 'setup_pollution_regression', 'Trigger-like setup polluted the structural setup field', { structuralSetup, triggerLabel });
    assert(triggerLabel === 'breakoutRetest15m', 'trigger_separation_regression', 'Trigger label was not preserved separately', { structuralSetup, triggerLabel });
    assert(root.getCanonicalStructuralSetups().includes('early-watch'), 'taxonomy_alignment_regression', 'Canonical setup vocabulary lost early-watch');
    checks.push({ scenario: 'setup_trigger_separation', passed: true });

    const normalizedRejected = root.DB.normalizeSignalRecord(fixtures.rejectedTechnical);
    const rejectedTruth = root.ANALYTICS_ENGINE.getSignalTruth(normalizedRejected);
    assert(rejectedTruth.isTechnicalCandidate === true, 'technical_truth_missing', 'Rejected technical candidate lost technical truth', rejectedTruth);
    assert(rejectedTruth.isExecutionApproved === false, 'execution_truth_leak', 'Rejected technical candidate leaked into execution-approved truth', rejectedTruth);
    assert(root.ANALYTICS_ENGINE.shouldUseSignalForPopulation(normalizedRejected, 'execution') === false, 'analytics_population_leak', 'Rejected technical candidate leaked into execution analytics population');
    checks.push({ scenario: 'rejected_technical_candidate', passed: true });

    const normalizedApproved = root.DB.normalizeSignalRecord(fixtures.actionableApproved);
    const approvedTruth = root.ANALYTICS_ENGINE.getSignalTruth(normalizedApproved);
    assert(approvedTruth.isExecutionApproved === true, 'approved_execution_missing', 'Approved signal lost execution truth', approvedTruth);
    assert(normalizedApproved.isAlertEligible === true, 'alert_eligibility_missing', 'Approved signal lost alert eligibility', normalizedApproved);
    assert(root.shouldExposeTradeLevels(normalizedApproved) === true, 'trade_block_hidden_regression', 'Approved actionable signal should expose trade levels');
    checks.push({ scenario: 'actionable_approved_signal', passed: true });

    const normalizedNearApproved = root.DB.normalizeSignalRecord(fixtures.nearApproved);
    assert(normalizedNearApproved.learningEligible === true, 'near_approved_learning_regression', 'Near-approved capital-guard signal should remain in the clean learning population audit', normalizedNearApproved);
    assert(String(normalizedNearApproved.learningPool) === 'near_approved', 'near_approved_pool_regression', 'Near-approved signal did not land in the near-approved learning pool', normalizedNearApproved);
    checks.push({ scenario: 'near_approved_learning_pool', passed: true });

    const maintainedStatus = root.getExecutionDisplayStatus(fixtures.positionBound);
    assert(maintainedStatus === 'WATCH', 'position_bound_display_leak', 'Position-bound signal should remain blocked in action truth', { maintainedStatus });
    assert(root.isMaintainedSignalState(fixtures.positionBound) === true, 'position_bound_not_detected', 'Maintained state was not detected');
    assert(root.shouldExposeTradeLevels(fixtures.positionBound) === false, 'position_bound_trade_block_leak', 'Position-bound signal must not expose trade levels');
    checks.push({ scenario: 'position_bound_contract', passed: true });

    const rejectedMessage = root.AlertEngine.messageFor(fixtures.rejectedTechnical, {}, { btcContext: 'sideway' });
    assert(rejectedMessage.includes('WATCH'), 'alert_headline_regression', 'Rejected technical signal alert headline must follow action truth', { rejectedMessage });
    assert(!rejectedMessage.includes('Technical Tier: <b>WATCH</b>'), 'alert_secondary_context_noise', 'Technical tier secondary context should stay secondary');
    assert(!rejectedMessage.includes('🎯 Entry:'), 'alert_trade_block_leak', 'Rejected technical signal should not expose trade levels', { rejectedMessage });
    checks.push({ scenario: 'alert_wording_truth', passed: true });

    const probeCtx = {
      btcContext: 'sideway',
      regimeType: 'CHOP',
      openPositions: [],
      recentClosedPositions: [
        { positionState: 'CLOSED_LOSS', openedAt: Date.now() - (5 * 60 * 60 * 1000), closedAt: Date.now() - (4 * 60 * 60 * 1000), outcomeR: -1.0 },
        { positionState: 'CLOSED_LOSS', openedAt: Date.now() - (3 * 60 * 60 * 1000), closedAt: Date.now() - (2 * 60 * 60 * 1000), outcomeR: -0.8 },
      ],
      totalEquity: 10000,
    };
    const probeSignal = {
      symbol: 'RELAX',
      rr: 1.05,
      score: 18,
      executionConfidence: 0.50,
      fakePumpRisk: 'low',
      entryTiming: 'probe_detection',
    };
    const relaxedPlan = root.CAPITAL_ENGINE.computePlan(probeSignal, 'PROBE', probeCtx, 0.005, 0.0);
    assert(relaxedPlan.moderateSidewayChopProbeLossStreakRelax === true, 'capital_relax_missing', 'Expected the narrow sideway/chop PROBE relax flag to activate', relaxedPlan);
    assert(!relaxedPlan.guardReasons.includes('loss_streak_guard_2'), 'capital_relax_not_applied', 'loss_streak_guard_2 should be removed for the narrow sideway/chop PROBE relax path', relaxedPlan);
    assert(relaxedPlan.allowed === true, 'capital_relax_still_blocked', 'Clean sideway/chop PROBE candidate should not stay blocked only by loss_streak_guard_2', relaxedPlan);
    checks.push({ scenario: 'sideway_probe_loss_streak_relax', passed: true });

    const exposurePlan = root.CAPITAL_ENGINE.computePlan(probeSignal, 'PROBE', probeCtx, 0.005, 0.049);
    assert(exposurePlan.allowed === false, 'capital_first_regression', 'Exposure cap must still block even when the loss-streak relax path is active', exposurePlan);
    assert(exposurePlan.guardReasons.includes('exposure_cap_5pct'), 'capital_exposure_guard_missing', 'Exposure cap should remain enforced after the narrow relax', exposurePlan);
    checks.push({ scenario: 'capital_first_preserved', passed: true });

    const softProbeCtx = {
      btcContext: 'sideway',
      regimeType: 'CHOP',
      regimeEngine: { allowProbe: true },
      proEdgeSnap: { gateMode: 'PROBE', probeCapitalEnabled: true },
    };
    const borderlineSoftProbe = {
      symbol: 'BRDG',
      setup: 'breakout',
      rr: 0.96,
      score: 18,
      executionConfidence: 0.50,
      fakePumpRisk: 'low',
      chartEntryQuality: 'neutral',
      entry: 1.0,
      stop: 0.95,
      price: 1.0,
    };
    const weakSoftProbe = {
      symbol: 'WEAK',
      setup: 'breakout',
      rr: 0.91,
      score: 17,
      executionConfidence: 0.50,
      fakePumpRisk: 'low',
      chartEntryQuality: 'neutral',
      entry: 1.0,
      stop: 0.95,
      price: 1.0,
    };
    assert(root.EXECUTION_ENGINE_V9.getAdaptiveSoftTier(borderlineSoftProbe, softProbeCtx) === 'PROBE', 'soft_probe_bridge_missing', 'Borderline sideway/chop candidate should reach the tiny soft PROBE bridge', borderlineSoftProbe);
    assert(root.EXECUTION_ENGINE_V9.getAdaptiveSoftTier(weakSoftProbe, softProbeCtx) == null, 'soft_probe_bridge_too_loose', 'Clearly weaker sideway/chop candidate should remain outside the soft PROBE bridge', weakSoftProbe);
    checks.push({ scenario: 'soft_probe_bridge', passed: true });

    const scoreConfBridge = {
      symbol: 'SCBR',
      setup: 'trend-continuation',
      rr: 1.12,
      score: 17,
      executionConfidence: 0.50,
      fakePumpRisk: 'low',
      chartEntryQuality: 'neutral',
      entry: 1.0,
      stop: 0.95,
      price: 1.0,
    };
    const unclearBridge = {
      ...scoreConfBridge,
      symbol: 'UNCL',
      setup: 'unclear',
    };
    const weakScoreBridge = {
      ...scoreConfBridge,
      symbol: 'LOWS',
      score: 16,
    };
    assert(root.EXECUTION_ENGINE_V9.getAdaptiveSoftTier(scoreConfBridge, softProbeCtx) === 'PROBE', 'soft_probe_score_conf_bridge_missing', 'Semantically clean sideway/chop candidate should reach the narrow score/conf PROBE bridge', scoreConfBridge);
    assert(root.EXECUTION_ENGINE_V9.getAdaptiveSoftTier(unclearBridge, softProbeCtx) == null, 'soft_probe_score_conf_structure_leak', 'Unclear structure should stay outside the narrow score/conf PROBE bridge', unclearBridge);
    assert(root.EXECUTION_ENGINE_V9.getAdaptiveSoftTier(weakScoreBridge, softProbeCtx) == null, 'soft_probe_score_conf_too_loose', 'Lower-score sideway/chop candidate should remain outside the narrow score/conf PROBE bridge', weakScoreBridge);
    checks.push({ scenario: 'soft_probe_score_conf_bridge', passed: true });

    await withMockedDb(fixtures, async function() {
      const buckets = await root.OUTCOME_EVAL.getScoreBucketPerformance('execution');
      const bucketTotal = buckets.reduce((sum, bucket) => sum + Number(bucket.total || 0), 0);
      assert(bucketTotal === 1, 'analytics_mixed_truth_regression', 'Execution score buckets learned from mixed truth', { bucketTotal, buckets });
      assert(buckets.every(bucket => bucket.scoreField === 'riskAdjustedScore'), 'analytics_score_field_regression', 'Score bucket analytics drifted away from riskAdjustedScore', { buckets });
    });
    checks.push({ scenario: 'analytics_truth_contract', passed: true });

    return {
      ok: true,
      checked: checks.length,
      checks,
      fixtures: Object.keys(fixtures),
    };
  }

  return {
    makeFixtures,
    runRegressionSuite,
  };
});
