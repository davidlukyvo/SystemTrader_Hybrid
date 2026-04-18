
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

  function getScheduler() {
    const cfg = ST.scanMeta?.scheduler || {};
    const defaults = ['06:00', '07:00', '08:00', '09:00', '10:30', '17:00', '21:00', '23:00', '00:00'];
    return { 
      enabled: !!cfg.enabled, 
      hours: Array.isArray(cfg.hours) && cfg.hours.length ? cfg.hours : defaults
    };
  }

  function setConfig(newCfg) {
    ST.patchScanMeta({ scheduler: Object.assign({}, ST.scanMeta?.scheduler || {}, newCfg) });
    console.log('[SMART_SCAN] Config updated:', newCfg);
    if (ST.scanMeta?.scheduler?.enabled) start(); 
  }

  function nextRunLabel(now = new Date()) {
    const { enabled, hours } = getScheduler();
    if (!enabled) return 'OFF';

    const nowMin = now.getHours() * 60 + now.getMinutes();
    const sorted = [...hours].sort((a, b) => {
      const [ah, am] = a.split(':').map(Number);
      const [bh, bm] = b.split(':').map(Number);
      return (ah * 60 + am) - (bh * 60 + bm);
    });

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
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
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

    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hour}:${min}`;
    
    const isMatch = cfg.hours.includes(currentTimeStr);

    if (!isMatch) return;

    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${currentTimeStr}`;
    const lastKey = ST.scanMeta?.scheduler?.lastAutoRunKey || '';
    if (lastKey === key) return;

    console.log(`[SMART_SCAN] ${currentTimeStr} · 🎯 SCHEDULE MATCH! Triggering scan...`);
    const result = await trigger('auto', 'scheduled_window');
    if (!result?.skipped) {
      ST.patchScanMeta({ 
        scheduler: Object.assign({}, ST.scanMeta?.scheduler || {}, {
          lastAutoRunAt: Date.now(),
          lastAutoRunKey: key
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
