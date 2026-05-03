
/* ── MAIN APP ROUTER & BOOTLOADER v10.6.9 — RAINBOW HARDENING ──────────── */

const PAGES = {
  dashboard:      { render: renderDashboard },
  scanner:        { render: renderScanner  },
  scorer:         { render: renderScorer   },
  watchlist:      { render: renderWatchlist},
  models:         { render: renderModels   },
  plan:           { render: renderPlan     },
  risk:           { render: renderRisk     },
  checklist:      { render: renderChecklist},
  journal:        { render: renderJournal  },
  signals:        { render: renderSignals  },
  analytics:      { render: renderAnalytics },
  settings:       { render: renderSettings },
  'scan-history': { render: renderScanHistory },
};

let currentPage = '';
window.SCANNER_FILTER_TIER = null;

/**
 * SYSTEM BOOT — Sequential initialization pipeline (Hardening P2)
 */
window.SYSTEM_BOOT = (() => {
  'use strict';

  async function run() {
    console.log('[BOOT] Initializing SystemTrader v10.6.9.56-ModerateTelegram [Command Center Hardening]...');
    
    // 1. Core State & Storage
    try {
      await ST.init();
      console.log('[BOOT] IndexedDB state loaded.');
    } catch (err) {
      console.warn('[BOOT] State init failed, using defaults:', err);
    }

    // 1.1 One-time strict learning backfill for historical dirty signals
    try {
      const learningRepairMigrated = await DB.getSetting('strictLearningRepair_v1069').catch(() => null);
      if (!learningRepairMigrated && window.DB?.repairHistoricalSignalsLearning) {
        const repaired = await window.DB.repairHistoricalSignalsLearning();
        window.__LAST_LEARNING_REPAIR__ = repaired; // Expose for observability
        await DB.setSetting('strictLearningRepair_v1069', {
          timestamp: Date.now(),
          scanned: Number(repaired?.scanned || 0),
          repaired: Number(repaired?.repaired || 0),
        });
        console.log('[BOOT] Historical learning repair completed:', repaired);
      }
    } catch (err) {
      console.warn('[BOOT] Historical learning repair skipped:', err);
    }

    // 2. One-time semantic history migration (v9.6.1)
    try {
      const semanticMigrated = await DB.getSetting('semanticHistoryMigration_v961').catch(() => null);
      if (!semanticMigrated && window.DB?.rebuildSemanticHistory) {
        const migrated = await window.DB.rebuildSemanticHistory();
        console.log('[BOOT] Semantic history rebuilt:', migrated);
      }
    } catch (err) {
      console.warn('[BOOT] Semantic history migration skipped:', err);
    }

    // 3. Engine Sync & Snapshots
    try {
      if (window.EXECUTION_SYNC?.syncRuntime) window.EXECUTION_SYNC.syncRuntime(window.ST);
      if (window.PRO_EDGE?.buildSnapshot && !ST.scanMeta?.proEdge) {
        const proEdge = await window.PRO_EDGE.buildSnapshot();
        ST.patchScanMeta({ proEdge });
      }
      // v10.6.9: Initialize Strategic metrics if price exists
      if (window.STRATEGIC_ENGINE && ST.btcPrice > 0 && ST.setBtcPrice) {
        ST.setBtcPrice(ST.btcPrice);
      }
      console.log('[BOOT] Engine snapshots synchronized.');
    } catch (err) {
      console.warn('[BOOT] Engine sync failed:', err);
    }

    // 4. UI Global Listeners
    setupGlobalListeners();

    // 5. External Integrations
    if (window.Telegram?.init) {
      await window.Telegram.init().catch(e => console.warn('[BOOT] Telegram failed:', e));
    }
    if (window.SMART_SCAN?.start) window.SMART_SCAN.start();

    // 6. Initial Routing
    const hash = location.hash.replace('#','') || 'dashboard';
    navigate(PAGES[hash] ? hash : 'dashboard');

    // 7. Post-Boot background tasks (De-prioritized)
    scheduleBackgroundTasks();

    console.log('[BOOT] System Ready.');
  }

  function setupGlobalListeners() {
    // Mobile dot sync
    if (window.ST) {
      ST.on('btc_change', (val) => {
        const dot = document.getElementById('btcDotMobile');
        if (dot) dot.className = 'btc-dot ' + val;
      });
    }

    // Nav clicks
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        navigate(item.dataset.page);
      });
    });

    // Mobile UX: Click outside sidebar
    document.addEventListener('mousedown', (e) => {
      const sb = document.getElementById('sidebar');
      const toggle = document.querySelector('.mobile-toggle');
      if (sb?.classList.contains('open') && !sb.contains(e.target) && !toggle?.contains(e.target)) {
        sb.classList.remove('open');
      }
    });

    // BTC badge click
    const btcBadge = $('btcBadgeSidebar');
    if (btcBadge) {
      btcBadge.addEventListener('click', () => {
        const states = ['bull','sideway','bear'];
        const next   = states[(states.indexOf(ST.btc) + 1) % 3];
        ST.setBtc(next);
        if (PAGES[currentPage]) PAGES[currentPage].render();
      });
    }
  }

  function scheduleBackgroundTasks() {
    // Outcome evaluation (delayed)
    setTimeout(async () => {
      if (window.OUTCOME_EVAL) {
        const result = await OUTCOME_EVAL.runEvaluation().catch(e => ({ evaluated: 0 }));
        if (result.evaluated > 0 && window.PRO_EDGE?.rebuildAfterScan) {
          await window.PRO_EDGE.rebuildAfterScan().catch(() => {});
        }
      }
    }, 5000);

    // Data retention cleanup (delayed)
    setTimeout(async () => {
      if (window.DB) {
        const lastCleanup = await DB.getSetting('lastCleanup').catch(() => null);
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (!lastCleanup?.timestamp || (Date.now() - lastCleanup.timestamp) > oneDayMs) {
          await DB.cleanupOldData().catch(() => {});
        }
      }
    }, 12000);

    // Sync checks
    syncWatchlistFromCoins();
    
    // v10.6.9: Initial Rainbow check
    if (ST.btcPrice === 0 && window.BINANCE?.klines) {
       window.BINANCE.klines('BTCUSDT', '1h', 1).then(rows => {
         if (Array.isArray(rows) && rows.length) {
           const last = Number(rows[rows.length - 1][4]);
           if (last > 0) ST.setBtcPrice(last);
         }
       }).catch(() => {});
    }

    ST.save();
    ST.setBtc(ST.btc);
  }

  return { run };
})();

function syncRuntimeState() {
  const coins = ST.coins || [];
  const metaCoins = ST.scanMeta?.coins || [];
  
  if (!coins.length && metaCoins.length) ST.setCoins(metaCoins);
  else if (coins.length && !metaCoins.length) ST.patchScanMeta({ coins });

  try {
    if (window.EXECUTION_SYNC?.syncRuntime) {
      window.EXECUTION_SYNC.syncRuntime(window.ST, ST.coins || [], { runtimeSeconds: ST.scanMeta?.cache?.runtimeSeconds });
    }
  } catch (err) {
    console.warn('[SYNC] EXECUTION_SYNC failed:', err);
  }
}

function navigate(page) {
  if (!PAGES[page]) page = 'dashboard';
  document.getElementById('sidebar')?.classList.remove('open');

  if (currentPage === page) return;
  currentPage = page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = $(`page-${page}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  history.replaceState(null, '', '#' + page);

  try { 
    syncRuntimeState(); 
    const p = PAGES[page].render();
    if (p && typeof p.catch === 'function') {
      p.catch(err => {
        console.error(`[ROUTER] Render failed:`, err);
        target.innerHTML = `<div class="p-40 text-center"><div class="text-red mb-12">⚠️ Render Error</div><div class="text-sm text-muted">${err.message}</div></div>`;
      });
    }
  } catch(err) {
    console.error(`[ROUTER] Navigation error:`, err);
    if (target) target.innerHTML = `<div class="p-40 text-center"><div class="text-red mb-12">⚠️ Sync Error</div><div class="text-sm text-muted">${err.message}</div></div>`;
  }
}

/**
 * v10.6.9 Hardening: Symbol selection and highlight
 */
window.selectCoin = function(symbol) {
  if (!symbol) return;
  console.log(`[CORE] Selecting coin: ${symbol}`);
  window.SCANNED_SYMBOL = String(symbol).toUpperCase();
  
  // If we are already on scanner, trigger a re-render to show the highlight
  if (currentPage === 'scanner' && typeof renderScanner === 'function') {
    renderScanner();
    // Optional: auto-scroll to the selected coin
    setTimeout(() => {
      const el = document.querySelector(`.coin-card[data-symbol="${window.SCANNED_SYMBOL}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
};

window.filterScannerByTier = function(tier) {
  console.log(`[CORE] Filtering scanner by tier: ${tier}`);
  window.SCANNER_FILTER_TIER = tier;
  navigate('scanner');
};


window.SMART_SCAN = (() => {
  let running = false;
  let timer = null;
  const DEFAULT_HOURS = ['06:00', '07:00', '08:00', '09:00', '10:30', '17:00', '21:00', '23:00', '00:00'];
  const MINUTE = 60 * 1000;

  function normalizeScheduler(raw = {}) {
    const hours = Array.isArray(raw.hours) && raw.hours.length ? raw.hours : DEFAULT_HOURS;
    const schedulerMode = String(raw.schedulerMode || raw.mode || 'fixed').toLowerCase() === 'jitter' ? 'jitter' : 'fixed';
    let jitterMinMinutes = Math.max(0, Math.round(Number(raw.jitterMinMinutes ?? 3)));
    let jitterMaxMinutes = Math.max(0, Math.round(Number(raw.jitterMaxMinutes ?? 18)));
    if (jitterMaxMinutes < jitterMinMinutes) [jitterMinMinutes, jitterMaxMinutes] = [jitterMaxMinutes, jitterMinMinutes];
    const minGapMinutes = Math.max(1, Math.round(Number(raw.minGapMinutes ?? 20)));
    return {
      ...raw,
      enabled: !!raw.enabled,
      hours,
      schedulerMode,
      mode: schedulerMode,
      jitterMinMinutes,
      jitterMaxMinutes,
      minGapMinutes,
      nextAutoScanAt: Number(raw.nextAutoScanAt || 0),
      lastAutoRunAt: Number(raw.lastAutoRunAt || 0),
      lastAutoRunKey: String(raw.lastAutoRunKey || raw.lastAutoRunHourKey || ''),
      lastAutoRunHourKey: String(raw.lastAutoRunHourKey || raw.lastAutoRunKey || ''),
      lastBaseTime: String(raw.lastBaseTime || ''),
      lastBaseTimeAt: Number(raw.lastBaseTimeAt || 0),
      lastJitterMinutes: raw.lastJitterMinutes == null ? null : Number(raw.lastJitterMinutes),
      lastScheduledRunAt: Number(raw.lastScheduledRunAt || 0),
      lastActualRunAt: Number(raw.lastActualRunAt || raw.lastAutoRunAt || 0),
    };
  }

  function getScheduler() {
    return normalizeScheduler(ST.scanMeta?.scheduler || {});
  }

  function setConfig(newCfg) {
    const merged = normalizeScheduler(Object.assign({}, ST.scanMeta?.scheduler || {}, newCfg));
    if (newCfg && (Object.prototype.hasOwnProperty.call(newCfg, 'hours') || Object.prototype.hasOwnProperty.call(newCfg, 'schedulerMode') || Object.prototype.hasOwnProperty.call(newCfg, 'mode') || Object.prototype.hasOwnProperty.call(newCfg, 'jitterMinMinutes') || Object.prototype.hasOwnProperty.call(newCfg, 'jitterMaxMinutes'))) {
      merged.nextAutoScanAt = 0;
      merged.lastBaseTime = '';
      merged.lastBaseTimeAt = 0;
      merged.lastJitterMinutes = null;
      merged.lastScheduledRunAt = 0;
    }
    ST.patchScanMeta({ scheduler: merged });
    console.log('[SMART_SCAN] Config updated:', merged);
    if (merged.enabled) start();
  }

  function parseTimeMinutes(tStr) {
    const [hh, mm] = String(tStr || '00:00').split(':').map(Number);
    return (Number(hh) || 0) * 60 + (Number(mm) || 0);
  }

  function sortedHours(hours) {
    return [...hours].sort((a, b) => parseTimeMinutes(a) - parseTimeMinutes(b));
  }

  function dayKey(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function keyFor(baseDate, baseTime) {
    return `${dayKey(baseDate)} ${baseTime}`;
  }

  function dateForTime(anchor, timeStr, addDays = 0) {
    const [hh, mm] = String(timeStr).split(':').map(Number);
    const d = new Date(anchor);
    d.setDate(d.getDate() + addDays);
    d.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
    return d;
  }

  function findNextBase(now, cfg) {
    const sorted = sortedHours(cfg.hours);
    for (const timeStr of sorted) {
      const baseDate = dateForTime(now, timeStr, 0);
      if (baseDate.getTime() > now.getTime()) return { baseDate, baseTime: timeStr, key: keyFor(baseDate, timeStr) };
    }
    const baseTime = sorted[0];
    const baseDate = dateForTime(now, baseTime, 1);
    return { baseDate, baseTime, key: keyFor(baseDate, baseTime) };
  }

  function randomJitterMinutes(cfg) {
    const min = Number(cfg.jitterMinMinutes || 0);
    const max = Number(cfg.jitterMaxMinutes || min);
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function persistSchedulerAudit(patch) {
    ST.patchScanMeta({ scheduler: normalizeScheduler(Object.assign({}, ST.scanMeta?.scheduler || {}, patch)) });
  }

  function scheduleNextJitter(now = new Date()) {
    const cfg = getScheduler();
    if (!cfg.enabled || cfg.schedulerMode !== 'jitter') return null;
    const nextBase = findNextBase(now, cfg);
    const jitterMinutes = randomJitterMinutes(cfg);
    const nextAutoScanAt = nextBase.baseDate.getTime() + jitterMinutes * MINUTE;
    persistSchedulerAudit({
      nextAutoScanAt,
      lastBaseTime: nextBase.baseTime,
      lastBaseTimeAt: nextBase.baseDate.getTime(),
      lastScheduledRunAt: nextAutoScanAt,
      lastJitterMinutes: jitterMinutes,
      pendingAutoRunKey: nextBase.key,
      lastSchedulerEvent: 'jitter_scheduled'
    });
    console.log('[SMART_SCAN] jitter scheduled', {
      baseTime: nextBase.baseDate.toISOString(),
      jitterMinutes,
      nextAutoScanAt: new Date(nextAutoScanAt).toISOString(),
      mode: 'jitter'
    });
    return nextAutoScanAt;
  }

  function nextRunLabel(now = new Date()) {
    const cfg = getScheduler();
    const { enabled, hours } = cfg;
    if (!enabled) return 'OFF';
    if (cfg.schedulerMode === 'jitter' && cfg.nextAutoScanAt) {
      const d = new Date(cfg.nextAutoScanAt);
      const base = cfg.lastBaseTimeAt ? new Date(cfg.lastBaseTimeAt) : null;
      const jitter = cfg.lastJitterMinutes == null ? '?' : cfg.lastJitterMinutes;
      return `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · jitter +${jitter}m${base ? ' from ' + base.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`;
    }

    const nowMin = now.getHours() * 60 + now.getMinutes();
    const sorted = sortedHours(hours);

    for (const tStr of sorted) {
      const [hh, mm] = tStr.split(':').map(Number);
      const tMin = hh * 60 + mm;
      if (tMin > nowMin) return tStr;
    }
    
    return sorted[0] + ' (Tomorrow)';
  }

  function lastRunLabel() {
    const ts = ST.scanMeta?.scheduler?.lastAutoRunAt;
    if (!ts) return 'None';
    const d = new Date(ts);
    const cfg = getScheduler();
    const jitter = cfg.lastJitterMinutes == null ? '' : ` · jitter +${cfg.lastJitterMinutes}m`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')' + jitter;
  }

  async function trigger(source = 'manual', trigger = source) {
    if (running || window.__SCANNING__) return { skipped: true, reason: 'scan_lock' };
    if (typeof window.runAISmartScanner !== 'function') return { skipped: true, reason: 'scanner_unavailable' };
    
    // v10.6.9.22 Hardening: Clear tier filter on new scan
    window.SCANNER_FILTER_TIER = null;
    
    running = true;
    try { return await window.runAISmartScanner({ source, trigger, bypassCooldown: source === 'auto' }); }
    finally { running = false; }
  }

  async function tick() {
    const now = new Date();
    const cfg = getScheduler();
    if (!cfg.enabled) return;
    if (cfg.schedulerMode === 'jitter') {
      let nextAt = Number(cfg.nextAutoScanAt || 0);
      if (!nextAt || nextAt < Date.now() - 24 * 60 * MINUTE) {
        nextAt = scheduleNextJitter(now);
        if (!nextAt) return;
      }
      if (Date.now() < nextAt) return;

      const minGapMs = Number(cfg.minGapMinutes || 20) * MINUTE;
      const lastRunAt = Number(cfg.lastAutoRunAt || 0);
      if (lastRunAt && Date.now() - lastRunAt < minGapMs) {
        const delayedAt = lastRunAt + minGapMs;
        persistSchedulerAudit({
          nextAutoScanAt: delayedAt,
          lastScheduledRunAt: delayedAt,
          lastSchedulerEvent: 'delayed_min_gap'
        });
        console.log('[SMART_SCAN] jitter delayed for min gap', {
          baseTime: cfg.lastBaseTimeAt ? new Date(cfg.lastBaseTimeAt).toISOString() : cfg.lastBaseTime,
          jitterMinutes: cfg.lastJitterMinutes,
          nextAutoScanAt: new Date(delayedAt).toISOString(),
          lastAutoRunAt: new Date(lastRunAt).toISOString()
        });
        return;
      }

      if (running || window.__SCANNING__) {
        const delayedAt = Date.now() + MINUTE;
        persistSchedulerAudit({
          nextAutoScanAt: delayedAt,
          lastScheduledRunAt: delayedAt,
          lastSchedulerEvent: 'delayed_scan_running'
        });
        console.log('[SMART_SCAN] jitter delayed because scan is already running', {
          baseTime: cfg.lastBaseTimeAt ? new Date(cfg.lastBaseTimeAt).toISOString() : cfg.lastBaseTime,
          jitterMinutes: cfg.lastJitterMinutes,
          nextAutoScanAt: new Date(delayedAt).toISOString()
        });
        return;
      }

      console.log('[SMART_SCAN] jitter run due', {
        baseTime: cfg.lastBaseTimeAt ? new Date(cfg.lastBaseTimeAt).toISOString() : cfg.lastBaseTime,
        jitterMinutes: cfg.lastJitterMinutes,
        scheduledRunAt: new Date(nextAt).toISOString(),
        actualRunAt: now.toISOString()
      });
      const result = await trigger('auto', 'scheduled_jitter');
      if (!result?.skipped) {
        const actualRunAt = Date.now();
        persistSchedulerAudit({
          lastAutoRunAt: actualRunAt,
          lastActualRunAt: actualRunAt,
          lastAutoRunKey: cfg.pendingAutoRunKey || `${dayKey(now)} jitter`,
          lastAutoRunHourKey: cfg.pendingAutoRunKey || `${dayKey(now)} jitter`,
          nextAutoScanAt: 0,
          lastSchedulerEvent: 'jitter_ran'
        });
        scheduleNextJitter(new Date(actualRunAt + MINUTE));
        if (currentPage && PAGES[currentPage]) {
          try { PAGES[currentPage].render(); } catch(e){}
        }
      }
      return;
    }

    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hour}:${min}`;
    
    const isMatch = cfg.hours.includes(currentTimeStr);

    if (!isMatch) return;

    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${currentTimeStr}`;
    const lastKey = ST.scanMeta?.scheduler?.lastAutoRunKey || ST.scanMeta?.scheduler?.lastAutoRunHourKey || '';
    if (lastKey === key) return;
    const minGapMs = Number(cfg.minGapMinutes || 20) * MINUTE;
    const lastRunAt = Number(cfg.lastAutoRunAt || 0);
    if (lastRunAt && Date.now() - lastRunAt < minGapMs) {
      console.log('[SMART_SCAN] fixed schedule skipped by min gap', {
        baseTime: currentTimeStr,
        actualRunAt: now.toISOString(),
        lastAutoRunAt: new Date(lastRunAt).toISOString(),
        minGapMinutes: cfg.minGapMinutes
      });
      return;
    }
    if (running || window.__SCANNING__) {
      console.log('[SMART_SCAN] fixed schedule skipped because scan is already running', {
        baseTime: currentTimeStr,
        actualRunAt: now.toISOString()
      });
      return;
    }

    console.log('[SMART_SCAN] fixed schedule run due', {
      baseTime: currentTimeStr,
      jitterMinutes: 0,
      actualRunAt: now.toISOString()
    });
    const result = await trigger('auto', 'scheduled_window');
    if (!result?.skipped) {
      ST.patchScanMeta({ 
        scheduler: Object.assign({}, ST.scanMeta?.scheduler || {}, {
          lastAutoRunAt: Date.now(),
          lastActualRunAt: Date.now(),
          lastAutoRunKey: key,
          lastAutoRunHourKey: key,
          lastBaseTime: currentTimeStr,
          lastBaseTimeAt: now.getTime(),
          lastJitterMinutes: 0,
          lastScheduledRunAt: now.getTime(),
          nextAutoScanAt: 0,
          lastSchedulerEvent: 'fixed_ran'
        })
      });
      if (currentPage && PAGES[currentPage]) {
        try { PAGES[currentPage].render(); } catch(e){}
      }
    }
  }

  function start() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => { tick().catch(() => { }); }, 30000); // Check every 30s for precision
  }

  return { start, tick, trigger, setConfig, isRunning: () => running || !!window.__SCANNING__, getScheduler, nextRunLabel, lastRunLabel };
})();

window.showToast = (msg, type = 'success') => {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${{success:'✅',warning:'⚠️',error:'❌',critical:'🚨'}[type]||'🔔'} ${msg}`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-closing'); setTimeout(() => toast.remove(), 300); }, type === 'critical' ? 10000 : 3000);
};

window.showConfirm = (title, msg) => new Promise((resolve) => {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) return resolve(false);
  $('modalTitle').textContent = title;
  $('modalMsg').textContent = msg;
  overlay.classList.add('show');
  const cleanUp = (val) => { overlay.classList.remove('show'); $('modalConfirmBtn').onclick = null; $('modalCancelBtn').onclick = null; resolve(val); };
  $('modalConfirmBtn').onclick = () => cleanUp(true);
  $('modalCancelBtn').onclick = () => cleanUp(false);
});

window.toggleSidebar = () => document.getElementById('sidebar')?.classList.toggle('open');

window.addEventListener('DOMContentLoaded', () => SYSTEM_BOOT.run());
