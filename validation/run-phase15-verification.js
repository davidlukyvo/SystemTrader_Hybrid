const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');

function makeDocument() {
  const elements = new Map();
  return {
    __elements: elements,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { id, style: {}, innerHTML: '' });
      return elements.get(id);
    },
    createElement() {
      return {
        style: {},
        setAttribute() {},
        appendChild() {},
        click() {},
        remove() {},
        className: '',
        innerHTML: '',
        textContent: '',
      };
    },
    body: { appendChild() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function loadScript(context, relPath) {
  const absPath = path.join(rootDir, relPath);
  const source = fs.readFileSync(absPath, 'utf8');
  vm.runInContext(source, context, { filename: absPath });
}

function assert(condition, code, message, details = null) {
  if (!condition) {
    const err = new Error(message);
    err.code = code;
    err.details = details;
    throw err;
  }
}

function candles(count = 30, start = 1) {
  return Array.from({ length: count }, (_, i) => {
    const close = start + i * 0.002;
    return {
      open: close * 0.998,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 1000 + i * 25,
    };
  });
}

function symbols(rows) {
  return rows.map(row => row.symbol).join(',');
}

function makeContext() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    Promise,
    JSON,
    String,
    Number,
    Boolean,
    RegExp,
    Array,
    Object,
    Map,
    Set,
    URL,
    URLSearchParams,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: { userAgent: 'node-phase15-verification' },
    document: makeDocument(),
    fmtPrice(value) {
      const n = Number(value || 0);
      return Number.isFinite(n) ? n.toFixed(n >= 1 ? 4 : 6).replace(/0+$/, '').replace(/\.$/, '') : '0';
    },
    getExecutionDisplayStatus(row) {
      return String(row?.displayStatus || row?.finalAuthorityStatus || row?.status || 'WATCH').toUpperCase();
    },
    getStructuralSetupLabel(row) {
      return String(row?.setup || row?.structureTag || 'unknown');
    },
    getEntryTriggerLabel(row) {
      return String(row?.entrySignal || row?.entryTiming || 'wait');
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.ST = {
    strategic: { riskMultiplier: 1, rainbow: { label: 'neutral' } },
  };
  return vm.createContext(sandbox);
}

function baseSignal(overrides = {}) {
  return {
    id: `${overrides.symbol || 'POL'}-phase15`,
    symbol: overrides.symbol || 'POL',
    name: overrides.symbol || 'POL',
    category: overrides.category || 'L1',
    price: 0.0953,
    entry: 0.0952,
    stop: 0.0929,
    tp1: 0.1028,
    tp2: 0.1104,
    tp3: 0.1218,
    rr: 3.31,
    relVol: 1.4,
    vsaTag: 'weak',
    fib: 'above-0.5',
    fakePumpRisk: 'low',
    setup: 'trend-continuation',
    structureTag: 'trend-continuation',
    entrySignal: 'wait',
    entryTiming: 'wait',
    chartEntryQuality: 'wait_retest',
    score: 42,
    riskAdjustedScore: 41,
    executionQualityScore: 59,
    rankScore: 59,
    finalAuthorityStatus: 'PLAYABLE',
    displayStatus: 'PLAYABLE',
    status: 'PLAYABLE',
    authorityTier: 'PLAYABLE',
    authorityDecision: 'ALLOW',
    authorityReason: 'adaptive_unlock:probe',
    executionGatePassed: true,
    executionActionable: true,
    executionTier: 'PLAYABLE',
    executionConfidence: 0.6,
    authorityTrace: {
      triggerMatched: false,
      rejectionsByTier: {
        READY: ['score_42_lt_50'],
        PLAYABLE: [],
        PROBE: [],
      },
    },
    capitalPlan: { allowed: true, guardReasons: [] },
    scoreSemantics: {
      scanner: 'rawScannerScore',
      analytics: 'riskAdjustedScore',
      ranking: 'rankScore',
      execution: 'executionQualityScore',
    },
    ...overrides,
  };
}

async function main() {
  const context = makeContext();
  [
    'clean-universe.js',
    'market-behavior-engine.js',
    'agent-review-engine.js',
    'scanner-refinement.js',
    'alert-engine.js',
    path.join('pages', 'scan-history.js'),
  ].forEach(file => loadScript(context, file));

  const rawSignals = [
    baseSignal({ symbol: 'POL', rankScore: 59, rr: 3.31 }),
    baseSignal({ symbol: 'SEI', rankScore: 45, rr: 2.4, category: 'L1' }),
    baseSignal({
      symbol: 'APT',
      finalAuthorityStatus: 'WATCH',
      displayStatus: 'WATCH',
      status: 'WATCH',
      authorityTier: 'REJECT',
      authorityDecision: 'REJECT',
      authorityReason: 'dedupsymbol_in_batch_or_portfolio',
      executionGatePassed: false,
      executionActionable: false,
      executionTier: 'OBSERVE',
      executionConfidence: 0.58,
      rankScore: 30,
    }),
  ];

  const klinePayload = { m15: candles(30, 0.095), h4: candles(30, 0.094), d1: candles(10, 0.09) };
  const deployableBefore = context.SCANNER_REFINEMENT.deriveDeployableTop3(rawSignals);
  const alertBefore = {
    eligible: context.AlertEngine.shouldAlert(rawSignals[0], {}),
    message: context.AlertEngine.messageFor(rawSignals[0], {}, { btcContext: 'sideway' }),
  };

  const withBehavior = rawSignals.map(signal => context.MARKET_BEHAVIOR_ENGINE.enrich(signal, klinePayload, 'sideway'));
  const withReview = withBehavior.map(signal => context.AGENT_REVIEW_ENGINE.enrich(signal, 'sideway'));
  const deployableAfter = context.SCANNER_REFINEMENT.deriveDeployableTop3(withReview);
  const alertAfter = {
    eligible: context.AlertEngine.shouldAlert(withReview[0], {}),
    message: context.AlertEngine.messageFor(withReview[0], {}, { btcContext: 'sideway' }),
  };
  const partialAllowed = context.MARKET_BEHAVIOR_ENGINE.enrich(baseSignal({ symbol: 'NO_KLINES' }), null, 'sideway');

  context.Telegram = {
    getConfig() { return { enabled: true }; },
    isConfigured() { return true; },
    getAntiSpamState() { return { lastSentTime: 0, lastSignature: '', lastRegime: '' }; },
    hasSent() { return false; },
    async updateAntiSpamState(state) { context.__TELEGRAM_ANTI_SPAM_STATE__ = state; },
    async send(message) { context.__TELEGRAM_SENT_MESSAGE__ = message; return { ok: true }; },
  };
  const telegramResult = await context.AlertEngine.processSignals(withReview, { btcContext: 'sideway', regimeType: 'ACCUMULATION' });
  const telegramTraceText = JSON.stringify({
    trace: context.__LAST_ALERT_TRACE_ENGINE__ || null,
    result: telegramResult,
    message: context.__TELEGRAM_SENT_MESSAGE__ || '',
  });
  const telegramTraceHasAgentReview = /agentReview/i.test(telegramTraceText);

  const exported = {
    scans: [{ id: 'scan-phase15', deployableTop3: deployableBefore }],
    signals: withReview,
  };

  const checks = [];
  const check = (name, fn) => {
    fn();
    checks.push({ name, ok: true });
  };

  check('behaviorInputQuality is flexible and full_ohlcv appears when candles are available', () => {
    const qualities = withReview.map(signal => signal.behaviorInputQuality);
    assert(qualities.some(q => q === 'full_ohlcv'), 'mbe_not_full_ohlcv', 'Expected full_ohlcv when kline data is available', qualities);
    assert(partialAllowed.behaviorInputQuality === 'partial', 'mbe_partial_not_allowed', 'Missing candles may still produce partial behaviorInputQuality', partialAllowed.behaviorInputQuality);
    assert(!qualities.every(q => q === 'partial'), 'mbe_all_partial', 'Fresh OHLCV payload should not produce 100% partial', qualities);
  });

  check('agentReview exists on fresh exported signals', () => {
    assert(exported.signals.every(signal => signal.agentReview && typeof signal.agentReview === 'object'), 'missing_agent_review', 'agentReview missing from exported signals');
  });

  check('agentReview.decisionImpact is always none', () => {
    assert(exported.signals.every(signal => signal.agentReview.decisionImpact === 'none'), 'decision_impact_changed', 'decisionImpact must remain none');
  });

  check('agentReview never uses LLM or external calls', () => {
    assert(exported.signals.every(signal => signal.agentReview.llmUsed === false && signal.agentReview.externalCalls === false), 'llm_or_external_call_flag', 'Phase 1 review must be deterministic/no external calls');
  });

  check('deployableTop3 membership/order is unchanged after MBE and Agentic Review', () => {
    assert(symbols(deployableBefore) === symbols(deployableAfter), 'deployable_top3_changed', 'deployableTop3 changed after observe-only enrichment', { before: symbols(deployableBefore), after: symbols(deployableAfter) });
  });

  check('Telegram eligibility and content are unchanged by Agentic Review', () => {
    assert(alertBefore.eligible === alertAfter.eligible, 'telegram_eligibility_changed', 'Alert eligibility changed after agentReview');
    assert(alertBefore.message === alertAfter.message, 'telegram_content_changed', 'Alert message content changed after agentReview');
  });

  check('telegramTraceHasAgentReview is false', () => {
    assert(telegramTraceHasAgentReview === false, 'telegram_trace_has_agent_review', 'Telegram trace/result/message must not include agentReview');
  });

  check('USD1 and stablecoin symbols are excluded from alert eligibility', () => {
    const stable = baseSignal({ symbol: 'USD1', name: 'USD1', base: 'USD1', baseAsset: 'USD1' });
    assert(context.CLEAN_UNIVERSE.shouldExclude(stable) === true, 'stable_not_excluded', 'USD1 should be hard-excluded');
    assert(context.AlertEngine.shouldAlert(stable, {}) === false, 'stable_alert_eligible', 'USD1 should not be Telegram alert eligible');
  });

  check('old scans/signals still render without behavior or agentReview fields', () => {
    context.window.__SCAN_HISTORY_FRESHNESS__ = {};
    context.renderScanSignalDetailContent([
      {
        id: 'old-signal-1',
        scanId: 'old-scan',
        symbol: 'OLD',
        status: 'WATCH',
        setup: 'legacy',
        rr: 1.2,
        executionConfidence: 0.3,
        entry: 1,
        entryTiming: 'wait',
      },
    ]);
    const html = context.document.getElementById('scanSignalDetail').innerHTML;
    assert(/Signals from scan/.test(html) && /OLD/.test(html), 'old_scan_render_failed', 'Legacy signal row failed to render');
  });

  console.log(JSON.stringify({
    phase: '1.5',
    ok: true,
    checks,
    summary: {
      behaviorInputQuality: withReview.map(signal => ({ symbol: signal.symbol, quality: signal.behaviorInputQuality })),
      deployableTop3Before: deployableBefore.map(signal => signal.symbol),
      deployableTop3After: deployableAfter.map(signal => signal.symbol),
      telegramEligible: alertAfter.eligible,
      telegramTraceHasAgentReview,
      partialBehaviorInputQualityAllowed: partialAllowed.behaviorInputQuality,
      stablecoinExcluded: context.CLEAN_UNIVERSE.shouldExclude({ symbol: 'USD1', base: 'USD1' }),
      legacyRenderBytes: context.document.getElementById('scanSignalDetail').innerHTML.length,
    },
  }, null, 2));
}

main().catch(err => {
  console.log(JSON.stringify({
    phase: '1.5',
    ok: false,
    code: err.code || 'phase15_verification_failed',
    error: err.message,
    details: err.details || null,
  }, null, 2));
  process.exit(1);
});
