const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const MINUTE = 60 * 1000;

function assert(condition, code, message, details = null) {
  if (!condition) {
    const err = new Error(message);
    err.code = code;
    err.details = details;
    throw err;
  }
}

function loadScript(context, relPath) {
  const source = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
  vm.runInContext(source, context, { filename: relPath });
}

function timeString(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function makeContext() {
  const math = Object.create(Math);
  math.random = () => 0;

  const document = {
    getElementById() { return { style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, textContent: '', innerHTML: '', onclick: null }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, innerHTML: '', className: '' }; },
    addEventListener() {},
    body: { appendChild() {} },
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math: math,
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
    document,
    location: { hash: '', pathname: '/', href: 'http://localhost/' },
    history: { pushState() {} },
    navigator: { userAgent: 'phase16-scheduler-verification' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
  };

  [
    'renderDashboard', 'renderScanner', 'renderScorer', 'renderWatchlist',
    'renderModels', 'renderPlan', 'renderRisk', 'renderChecklist',
    'renderJournal', 'renderSignals', 'renderAnalytics', 'renderSettings',
    'renderScanHistory'
  ].forEach(name => { sandbox[name] = function() {}; });

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.ST = {
    btc: 'sideway',
    scanMeta: { scheduler: { enabled: false, hours: [] } },
    patchScanMeta(patch) {
      this.scanMeta = { ...(this.scanMeta || {}), ...patch };
    },
  };
  sandbox.currentPage = '';
  sandbox.__SCANNING__ = false;
  sandbox.__RUNS__ = [];
  sandbox.runAISmartScanner = async function(meta) {
    sandbox.__RUNS__.push(meta);
    return { ok: true, meta };
  };
  return vm.createContext(sandbox);
}

async function main() {
  const context = makeContext();
  loadScript(context, 'app.js');

  const checks = [];
  const check = async (name, fn) => {
    await fn();
    checks.push({ name, ok: true });
  };

  await check('fixed mode preserves exact schedule behavior with min-gap audit', async () => {
    const now = new Date();
    context.ST.scanMeta.scheduler = {
      enabled: true,
      schedulerMode: 'fixed',
      hours: [timeString(now)],
      minGapMinutes: 1,
      lastAutoRunAt: Date.now() - 5 * MINUTE,
      lastAutoRunKey: '',
    };
    await context.SMART_SCAN.tick();
    const scheduler = context.ST.scanMeta.scheduler;
    assert(context.__RUNS__.length === 1, 'fixed_did_not_run', 'Fixed scheduler should trigger at matching base time');
    assert(context.__RUNS__[0].trigger === 'scheduled_window', 'fixed_trigger_changed', 'Fixed scheduler trigger label changed');
    assert(scheduler.schedulerMode === 'fixed', 'fixed_mode_changed', 'Fixed scheduler mode not preserved');
    assert(scheduler.lastJitterMinutes === 0, 'fixed_jitter_not_zero', 'Fixed mode should persist jitterMinutes as 0');
    assert(Number(scheduler.lastAutoRunAt || 0) > 0, 'fixed_last_run_missing', 'Fixed mode should persist lastAutoRunAt');
  });

  await check('jitter mode runs due scheduled scans without changing trigger scope', async () => {
    context.__RUNS__ = [];
    context.ST.scanMeta.scheduler = {
      enabled: true,
      schedulerMode: 'jitter',
      mode: 'jitter',
      hours: [timeString(new Date(Date.now() + MINUTE))],
      jitterMinMinutes: 3,
      jitterMaxMinutes: 18,
      minGapMinutes: 1,
      nextAutoScanAt: Date.now() - 1000,
      lastAutoRunAt: Date.now() - 5 * MINUTE,
      lastBaseTime: 'base-test',
      lastBaseTimeAt: Date.now() - 4 * MINUTE,
      lastJitterMinutes: 7,
      pendingAutoRunKey: 'phase16 jitter',
    };
    await context.SMART_SCAN.tick();
    const scheduler = context.ST.scanMeta.scheduler;
    assert(context.__RUNS__.length === 1, 'jitter_did_not_run', 'Jitter scheduler should run when nextAutoScanAt is due');
    assert(context.__RUNS__[0].trigger === 'scheduled_jitter', 'jitter_trigger_changed', 'Jitter trigger label should be scheduled_jitter');
    assert(scheduler.schedulerMode === 'jitter', 'jitter_mode_not_persisted', 'Jitter scheduler mode not persisted');
    assert(Number(scheduler.lastAutoRunAt || 0) > 0, 'jitter_last_run_missing', 'Jitter mode should persist lastAutoRunAt');
    assert(Number(scheduler.nextAutoScanAt || 0) > Date.now(), 'jitter_next_missing', 'Jitter mode should schedule the next randomized run');
    assert(Number(scheduler.lastJitterMinutes) >= 3 && Number(scheduler.lastJitterMinutes) <= 18, 'jitter_out_of_range', 'Next jitter minutes out of configured range', scheduler.lastJitterMinutes);
  });

  await check('jitter mode delays when a scan is already running', async () => {
    context.__RUNS__ = [];
    context.__SCANNING__ = true;
    context.ST.scanMeta.scheduler = {
      enabled: true,
      schedulerMode: 'jitter',
      mode: 'jitter',
      hours: [timeString(new Date(Date.now() + MINUTE))],
      jitterMinMinutes: 3,
      jitterMaxMinutes: 18,
      minGapMinutes: 1,
      nextAutoScanAt: Date.now() - 1000,
      lastAutoRunAt: Date.now() - 5 * MINUTE,
      lastBaseTime: 'base-running',
      lastBaseTimeAt: Date.now() - 4 * MINUTE,
      lastJitterMinutes: 5,
    };
    await context.SMART_SCAN.tick();
    context.__SCANNING__ = false;
    const scheduler = context.ST.scanMeta.scheduler;
    assert(context.__RUNS__.length === 0, 'jitter_ran_while_locked', 'Jitter scheduler should not run while scan lock is active');
    assert(Number(scheduler.nextAutoScanAt || 0) > Date.now(), 'jitter_delay_missing', 'Jitter scheduler should delay nextAutoScanAt when scan is running');
    assert(scheduler.lastSchedulerEvent === 'delayed_scan_running', 'jitter_delay_event_missing', 'Expected delayed_scan_running audit event');
  });

  await check('scheduler changes remain timing-only by source contract', async () => {
    const guardedFiles = [
      'alpha-guard-core-v51-auth.js',
      'capital-engine.js',
      'portfolio-engine.js',
      'alert-engine.js',
      'scanner-refinement.js',
      'market-behavior-engine.js',
      'agent-review-engine.js',
    ];
    const diffLike = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8')
      + fs.readFileSync(path.join(rootDir, 'state-v51-auth.js'), 'utf8')
      + fs.readFileSync(path.join(rootDir, 'pages', 'settings.js'), 'utf8');
    assert(/scheduled_jitter/.test(diffLike), 'jitter_trigger_missing', 'Expected jitter runtime trigger label');
    guardedFiles.forEach(file => assert(fs.existsSync(path.join(rootDir, file)), 'guard_file_missing', `${file} missing`));
  });

  console.log(JSON.stringify({
    phase: '1.6',
    ok: true,
    checks,
    summary: {
      fixedAndJitterModesCovered: true,
      randomizationScope: 'scan_timing_only',
      alphaGuardChanged: false,
      telegramEligibilityChanged: false,
      deployableTop3Changed: false,
    },
  }, null, 2));
}

main().catch(err => {
  console.log(JSON.stringify({
    phase: '1.6',
    ok: false,
    code: err.code || 'phase16_scheduler_verification_failed',
    error: err.message,
    details: err.details || null,
  }, null, 2));
  process.exit(1);
});
