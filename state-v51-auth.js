/* \u2500\u2500 Global State \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
const CACHE_VERSION = 'stv610adl1';
const ST_VERSION = 'v10.6.9.56-ModerateTelegram';
const DEFAULT_BOOT_TOTAL_EQUITY = 10000;

function safeParseJSON(raw, fallback) {
  try {
    if (raw == null || raw === '') return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function sanitizeWatchlist(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { best: [], watch: [], avoid: [] };
  return {
    best: Array.isArray(value.best) ? value.best : [],
    watch: Array.isArray(value.watch) ? value.watch : [],
    avoid: Array.isArray(value.avoid) ? value.avoid : []
  };
}


function sanitizeSchedulerHours(value) {
  const defaults = ['06:00', '07:00', '08:00', '09:00', '10:30', '12:00', '16:00', '17:00', '21:00', '23:00', '00:00'];
  if (!Array.isArray(value)) return defaults;
  const times = [...new Set(value.map(v => {
    let s = String(v).trim();
    if (!s) return null;
    if (s === '24:00' || s === '24') return '00:00';
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      let [h, m] = s.split(':').map(Number);
      if (h >= 24) h = h % 24;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    let n = parseInt(s);
    if (!isNaN(n) && n >= 0 && n <= 23) return `${String(n).padStart(2, '0')}:00`;
    return null;
  }).filter(v => v !== null))].sort((a, b) => {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return (ah * 60 + am) - (bh * 60 + bm);
  });
  return times.length ? times : defaults;
}

function sanitizeJournal(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.rows)) return value.rows;
  }
  return [];
}

function sanitizeScanMeta(value) {
  const base = { lastScan: null, lastScanId: '', lastScanTs: 0, source: '', coins: [], top3: [], technicalTop3: [], deployableTop3: [], authoritativeTop3: [], authoritativeTop3Legacy: false, cache: {}, regime: {}, insight: {}, scheduler: { enabled: false, hours: ['06:00', '07:00', '08:00', '09:00', '10:30', '14:30', '17:00', '21:00', '23:00', '00:00'], lastAutoRunAt: 0, lastAutoRunHourKey: '' }, lastScanSource: '', lastScanTrigger: '' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  return {
    ...base,
    ...value,
    lastScan: Number(value.lastScan || value.lastScanTs || 0) || null,
    lastScanId: String(value.lastScanId || ''),
    lastScanTs: Number(value.lastScanTs || value.lastScan || 0),
    coins: Array.isArray(value.coins) ? value.coins : [],
    top3: Array.isArray(value.top3) ? value.top3 : [],
    technicalTop3: Array.isArray(value.technicalTop3) ? value.technicalTop3 : [],
    deployableTop3: Array.isArray(value.deployableTop3) ? value.deployableTop3 : [],
    authoritativeTop3: Array.isArray(value.authoritativeTop3)
      ? value.authoritativeTop3
      : (Array.isArray(value.deployableTop3) ? value.deployableTop3 : []),
    authoritativeTop3Legacy: value.authoritativeTop3Legacy !== false,
    cache: value.cache && typeof value.cache === 'object' && !Array.isArray(value.cache) ? value.cache : {},
    regime: value.regime && typeof value.regime === 'object' && !Array.isArray(value.regime) ? value.regime : {},
    insight: value.insight && typeof value.insight === 'object' && !Array.isArray(value.insight) ? value.insight : {},
    scheduler: value.scheduler && typeof value.scheduler === 'object' && !Array.isArray(value.scheduler) ? { enabled: !!value.scheduler.enabled, hours: sanitizeSchedulerHours(value.scheduler.hours), lastAutoRunAt: Number(value.scheduler.lastAutoRunAt || 0), lastAutoRunHourKey: String(value.scheduler.lastAutoRunHourKey || '') } : { enabled: false, hours: ['06:00', '07:00', '08:00', '09:00', '10:30', '14:30', '17:00', '21:00', '23:00', '00:00'], lastAutoRunAt: 0, lastAutoRunHourKey: '' },
    lastScanSource: String(value.lastScanSource || ''),
    lastScanTrigger: String(value.lastScanTrigger || '')
  };
}

window.ST = {
  btc: 'sideway', // 'bull' | 'sideway' | 'bear'
  _initialized: false,
  account: { totalEquity: 0 },

  coins: [],
  strategic: null, // v10.6.9 Strategic Hub (Rainbow + Sentiment + Dom)
  watchlist: { best: [], watch: [], avoid: [] },
  journal: [],
  scanMeta: { lastScan: null, source: '', top3: [], technicalTop3: [], deployableTop3: [], cache: {}, regime: {}, insight: {}, scheduler: { enabled: false, hours: ['06:00', '07:00', '08:00', '09:00', '10:30', '14:30', '17:00', '21:00', '23:00', '00:00'], lastAutoRunAt: 0, lastAutoRunHourKey: '' }, lastScanSource: '', lastScanTrigger: '' },

  /* v10.6.9.26: Hardening Configuration — non-rigid, configurable gates */
  config: {
    expectancy: {
      minCautionSamples: 3,
      minHardPenaltySamples: 8,
      penaltyMultiplier: 0.85,
      windowDays: 14
    },
    execution: {
      READY_SCORE: 50,
      READY_CONF: 0.70,
      PROBE_CONF: 0.58
    }
  },

  _listeners: {},

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  },

  emit(event, data) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => cb(data));
    }
  },

  /* \u2500\u2500 Async init from IndexedDB \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  async init() {
    if (this._initialized) return;
    try {
      await DB.open();
      await DB.migrateFromLocalStorage();

      // Load session state from settings
      const savedState = await DB.getSetting('sessionState');
      if (savedState) {
        const localFallbackEquity = Number(localStorage.getItem('st_total_equity') || 0);
        const resolvedEquity = Number(
          savedState.totalEquity ||
          savedState.account?.totalEquity ||
          this.account?.totalEquity ||
          localFallbackEquity ||
          DEFAULT_BOOT_TOTAL_EQUITY
        );
        this.sessionState = savedState;
        this.btc = ['bull', 'sideway', 'bear'].includes(savedState.btc) ? savedState.btc : 'sideway';
        this.coins = Array.isArray(savedState.coins) ? savedState.coins : [];
        this.watchlist = sanitizeWatchlist(savedState.watchlist);
        this.scanMeta = sanitizeScanMeta(savedState.scanMeta);
        this.btcPrice = Number(savedState.btcPrice || 0);
        this.valuation = savedState.valuation || null;
        this.account = {
          ...(this.account || {}),
          ...(savedState.account && typeof savedState.account === 'object' ? savedState.account : {}),
          totalEquity: resolvedEquity,
        };
        this.sessionState = {
          ...savedState,
          totalEquity: resolvedEquity,
          account: {
            ...(savedState.account && typeof savedState.account === 'object' ? savedState.account : {}),
            totalEquity: resolvedEquity,
          },
        };
        if (!Array.isArray(this.scanMeta.coins) || !this.scanMeta.coins.length) this.scanMeta.coins = this.coins;
        if (savedState.capitalFlowState && window.CAPITAL_FLOW?.importState) {
          try { window.CAPITAL_FLOW.importState(savedState.capitalFlowState); } catch (_) { }
        }
        if (resolvedEquity > 0 && (Number(savedState.totalEquity || savedState.account?.totalEquity || 0) <= 0)) {
          try { await DB.setSetting('sessionState', this.sessionState); } catch (_) { }
        }
      }

      // Load journal from trades store
      const trades = await DB.getTrades({});
      if (trades.length) {
        this.journal = sanitizeJournal(trades);
      }

      this._initialized = true;
      console.log('[ST] Initialized from IndexedDB \u2014 coins:', this.coins.length, 'journal:', this.journal.length);
    } catch (err) {
      console.warn('[ST] IndexedDB init failed, falling back to localStorage:', err);
      this._fallbackLoad();
      this._initialized = true;
    }
  },

  _fallbackLoad() {
    try {
      this.sessionState = {
        btc: safeParseJSON(localStorage.getItem('st_btc'), 'sideway'),
        coins: safeParseJSON(localStorage.getItem('st_coins'), []),
        watchlist: safeParseJSON(localStorage.getItem('st_watchlist'), { best: [], watch: [], avoid: [] }),
        journal: safeParseJSON(localStorage.getItem('st_journal'), []),
        scanMeta: safeParseJSON(localStorage.getItem('st_scan_meta'), { lastScan: null, source: '', top3: [], cache: {}, regime: {}, insight: {} }),
        totalEquity: Number(localStorage.getItem('st_total_equity') || DEFAULT_BOOT_TOTAL_EQUITY),
        account: { totalEquity: Number(localStorage.getItem('st_total_equity') || DEFAULT_BOOT_TOTAL_EQUITY) },
      };
      this.account = { ...(this.account || {}), totalEquity: Number(this.sessionState.totalEquity || 0) };
      this.coins = safeParseJSON(localStorage.getItem('st_coins'), []);
      this.watchlist = sanitizeWatchlist(safeParseJSON(localStorage.getItem('st_watchlist'), { best: [], watch: [], avoid: [] }));
      this.journal = sanitizeJournal(safeParseJSON(localStorage.getItem('st_journal'), []));
      this.scanMeta = sanitizeScanMeta(safeParseJSON(localStorage.getItem('st_scan_meta'), { lastScan: null, source: '', top3: [], cache: {}, regime: {}, insight: {} }));
      const _cf = safeParseJSON(localStorage.getItem('st_capital_flow'), null);
      if (_cf && window.CAPITAL_FLOW?.importState) {
        try { window.CAPITAL_FLOW.importState(_cf); } catch (_) { }
      }
    } catch { /* empty fallback */ }
  },

  exportData() {
    return {
      version: CACHE_VERSION,
      exportedAt: Date.now(),
      btc: this.btc,
      totalEquity: Number(this.sessionState?.totalEquity || this.account?.totalEquity || 0),
      account: { ...(this.account || {}), totalEquity: Number(this.sessionState?.totalEquity || this.account?.totalEquity || 0) },
      coins: this.coins,
      watchlist: this.watchlist,
      journal: this.journal,
      scanMeta: this.scanMeta,
      capitalFlowState: window.CAPITAL_FLOW?.exportState ? window.CAPITAL_FLOW.exportState() : null,
    };
  },

  importData(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Backup kh\u00F4ng h\u1EE3p l\u1EC7');
    this.sessionState = payload;
    this.btc = ['bull', 'sideway', 'bear'].includes(payload.btc) ? payload.btc : 'sideway';
    this.coins = Array.isArray(payload.coins) ? payload.coins : [];
    this.watchlist = sanitizeWatchlist(payload.watchlist);
    this.journal = sanitizeJournal(payload.journal);
    this.scanMeta = sanitizeScanMeta(payload.scanMeta);
    this.account = {
      ...(this.account || {}),
      ...(payload.account && typeof payload.account === 'object' ? payload.account : {}),
      totalEquity: Number(payload.totalEquity || payload.account?.totalEquity || 0),
    };
    if (!Array.isArray(this.scanMeta.coins) || !this.scanMeta.coins.length) this.scanMeta.coins = this.coins;
    if (payload.capitalFlowState && window.CAPITAL_FLOW?.importState) {
      try { window.CAPITAL_FLOW.importState(payload.capitalFlowState); } catch (_) { }
    }
    this.save();
    this.setBtc(this.btc);
  },

  /* \u2500\u2500 Async non-blocking save \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  save() {
    this._saveToIDB();
  },

  async _saveToIDB() {
    try {
      const payload = {
        btc: this.btc,
        btcPrice: this.btcPrice,
        valuation: this.valuation,
        totalEquity: Number(this.sessionState?.totalEquity || this.account?.totalEquity || 0),
        account: { ...(this.account || {}), totalEquity: Number(this.sessionState?.totalEquity || this.account?.totalEquity || 0) },
        coins: this.coins,
        watchlist: this.watchlist,
        scanMeta: this.scanMeta,
        capitalFlowState: window.CAPITAL_FLOW?.exportState ? window.CAPITAL_FLOW.exportState() : null,
        savedAt: Date.now(),
      };
      this.sessionState = payload;
      await DB.setSetting('sessionState', payload);
      // Sync journal entries to trades store
      if (Array.isArray(this.journal) && this.journal.length) {
        const existing = await DB.getTrades({});
        const existingIds = new Set(existing.map(t => t.id));
        const newTrades = this.journal.filter(j => !existingIds.has(j.id));
        for (const t of newTrades) {
          await DB.addTrade(t);
        }
      }
    } catch (err) {
      console.warn('[ST] IndexedDB save failed, falling back to localStorage:', err);
      this._fallbackSave();
    }
  },

  _fallbackSave() {
    try {
      localStorage.setItem('st_coins', JSON.stringify(this.coins));
      localStorage.setItem('st_watchlist', JSON.stringify(this.watchlist));
      localStorage.setItem('st_journal', JSON.stringify(this.journal));
      localStorage.setItem('st_scan_meta', JSON.stringify(this.scanMeta));
      localStorage.setItem('st_total_equity', String(Number(this.sessionState?.totalEquity || this.account?.totalEquity || 0)));
      if (window.CAPITAL_FLOW?.exportState) localStorage.setItem('st_capital_flow', JSON.stringify(window.CAPITAL_FLOW.exportState()));
    } catch { /* quota exceeded, ignore */ }
  },

  getUnifiedCoins() {
    const sessionCoins = Array.isArray(this.sessionState?.coins) ? this.sessionState.coins.filter(Boolean) : [];
    const runtimeCoins = Array.isArray(this.coins) ? this.coins.filter(Boolean) : [];
    const runtimeTs = Number(this.scanMeta?.lastScan || 0);
    const sessionTs = Number(this.sessionState?.savedAt || 0);
    if (runtimeCoins.length && runtimeTs >= sessionTs) return runtimeCoins;
    if (sessionCoins.length) return sessionCoins;
    return runtimeCoins;
  },

  getUnifiedScanMeta() {
    return sanitizeScanMeta({ ...(this.sessionState?.scanMeta || {}), ...(this.scanMeta || {}) });
  },

  setBtc(state) {
    this.btc = state;
    this.emit('btc_change', state);
    const dot = document.querySelector('#btcBadgeSidebar .btc-dot');
    const text = document.getElementById('btcBadgeText');
    const warn = document.querySelectorAll('.btc-warning');
    if (dot) {
      dot.className = 'btc-dot';
      if (state === 'bull') {
        dot.classList.add('bull');
        text.textContent = 'BTC: Bullish \u25B2';
        warn.forEach(w => w.classList.remove('show'));
      } else if (state === 'bear') {
        dot.classList.add('bear');
        text.textContent = 'BTC: Breakdown \u25BC';
        warn.forEach(w => w.classList.add('show'));
      } else {
        text.textContent = 'BTC: Sideway \u25C8';
        warn.forEach(w => w.classList.remove('show'));
      }
    }
    this.save();
  },

  async setBtcPrice(price) {
    this.btcPrice = Number(price);
    if (window.STRATEGIC_ENGINE) {
      this.strategic = await window.STRATEGIC_ENGINE.syncAll(this.btcPrice);
    }
    this.save();
    if (typeof renderDashboard === 'function' && currentPage === 'dashboard') renderDashboard();
  },

  setTotalEquity(totalEquity) {
    const next = Math.max(0, Number(totalEquity || 0));
    this.account = { ...(this.account || {}), totalEquity: next };
    this.sessionState = {
      ...(this.sessionState || {}),
      totalEquity: next,
      account: { ...((this.sessionState && this.sessionState.account) || {}), totalEquity: next },
    };
    this.save();
    this.emit('equity_change', next);
  },

  /* ── Phase 1 Hardening: Centralized Setters ── */
  setCoins(nextCoins) {
    if (!Array.isArray(nextCoins)) return;
    this.coins = nextCoins;
    this.sessionState = {
      ...(this.sessionState || {}),
      coins: nextCoins,
    };
    this.scanMeta = {
      ...(this.scanMeta || {}),
      coins: nextCoins,
    };
    this.save();
  },

  patchScanMeta(patch) {
    if (!patch || typeof patch !== 'object') return;
    const nextPatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(nextPatch, 'deployableTop3') && !Object.prototype.hasOwnProperty.call(nextPatch, 'authoritativeTop3')) {
      nextPatch.authoritativeTop3 = nextPatch.deployableTop3;
      nextPatch.authoritativeTop3Legacy = true;
    }
    if (Object.prototype.hasOwnProperty.call(nextPatch, 'lastScan') && !Object.prototype.hasOwnProperty.call(nextPatch, 'lastScanTs')) {
      nextPatch.lastScanTs = nextPatch.lastScan;
    } else if (Object.prototype.hasOwnProperty.call(nextPatch, 'lastScanTs') && !Object.prototype.hasOwnProperty.call(nextPatch, 'lastScan')) {
      nextPatch.lastScan = nextPatch.lastScanTs;
    }
    this.scanMeta = Object.assign({}, this.scanMeta || {}, nextPatch);
    this.save();
  },

  patchPortfolioMeta(patch) {
    if (!this.scanMeta) this.scanMeta = {};
    if (!this.scanMeta.portfolio) this.scanMeta.portfolio = {};
    this.scanMeta.portfolio = Object.assign({}, this.scanMeta.portfolio, patch);
    this.save();
  },

  patchRegimeMeta(patch) {
    if (!this.scanMeta) this.scanMeta = {};
    this.scanMeta.regime = Object.assign({}, this.scanMeta.regime || {}, patch);
    this.save();
  },

  setStrategic(nextStrategic) {
    this.strategic = nextStrategic;
    this.save();
  },

  validateAuthorityContract(coin) {
    if (!coin || !coin.symbol) return { ok: false, reason: 'missing_symbol' };
    const status = getExecutionDisplayStatus(coin);
    const isActionable = ['READY', 'PLAYABLE', 'PROBE'].includes(status);
    
    if (isActionable) {
      const decision = String(coin.authorityDecision || coin.decision || '').toUpperCase();
      if (!decision || decision === 'REJECT') {
        return { ok: false, reason: 'actionable_but_rejected_or_missing_decision', symbol: coin.symbol };
      }
      if (!coin.authorityTrace && !coin.authTrace) {
        return { ok: false, reason: 'actionable_but_missing_trace', symbol: coin.symbol };
      }
    }
    
    if (coin.rejected && (!coin.rejectReasons || !coin.rejectReasons.length)) {
      return { ok: false, reason: 'rejected_but_no_reasons', symbol: coin.symbol };
    }
    
    return { ok: true };
  }
};

/* \u2500\u2500 Unified execution gate \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
window.EXEC_GATE = (() => {
  function normalizeSetup(value) {
    return String(value || '').trim().toLowerCase();
  }
  function hasHardReject(coin) {
    if (!coin) return true;
    if (coin.rejected || coin.status === 'AVOID') return true;
    if (coin.fakePumpRisk === 'high') return true;
    if (coin.chartEntryQuality === 'structure_risk') return true;
    const entry = Number(coin.entry || coin.price || 0);
    const stop = Number(coin.stop || 0);
    if (Number.isFinite(entry) && entry > 0) {
      const stopInvalid = !Number.isFinite(stop) || stop <= 0 || stop >= entry || Math.abs(entry - stop) < entry * 0.003;
      if (stopInvalid) return true;
    }
    const reasons = Array.isArray(coin.rejectReasons) ? coin.rejectReasons : [];
    return reasons.some(r => /fake_pump_high|invalid_stop|blowoff|structure_risk|chart_structure_risk/i.test(String(r || '')));
  }
  function hasPlayableSetup(coin) {
    const key = normalizeSetup(coin?.setup || coin?.structureTag);
    if (!key) return false;
    if (key.includes('unknown') || key.includes('no setup')) return false;
    return true;
  }
  function isExecutable(coin, context = {}) {
    const {
      minRR = 1.2,
      minConfidence = 0.5,
      requirePlayable = true,
    } = context || {};
    if (!coin) return { ok: false, reason: 'missing_coin' };
    if (hasHardReject(coin)) return { ok: false, reason: 'hard_reject' };
    if (!hasPlayableSetup(coin)) return { ok: false, reason: 'invalid_setup' };
    const setupKey = normalizeSetup(coin?.setup || coin?.structureTag || coin?.phase);
    const phaseAware = setupKey.includes('phase c') || setupKey.includes('phase-candidate') || setupKey.includes('early phase d') || setupKey === 'c';
    const status = String(coin.status || '').toUpperCase();
    const playableStatus = ['READY', 'SCALP_READY', 'PLAYABLE'];
    const executableStatus = ['READY', 'SCALP_READY', 'PLAYABLE', 'PROBE', 'EARLY'];
    const effectiveMinRR = phaseAware ? Math.min(minRR, 0.30) : minRR;
    const effectiveMinConfidence = phaseAware ? Math.min(minConfidence, 0.46) : minConfidence;
    if (requirePlayable && !playableStatus.includes(status)) {
      const probePlayable = status === 'PROBE'
        && Number(coin.executionConfidence || 0) >= Math.max(0.50, effectiveMinConfidence)
        && Number(coin.rr || 0) >= Math.max(0.25, effectiveMinRR);
      const earlyPlayable = phaseAware
        && status === 'EARLY'
        && Number(coin.executionConfidence || 0) >= Math.max(0.58, effectiveMinConfidence)
        && Number(coin.rr || 0) >= Math.max(0.28, effectiveMinRR);
      if (!(probePlayable || earlyPlayable)) {
        return { ok: false, reason: 'status_not_playable' };
      }
    }
    if (!requirePlayable && !executableStatus.includes(status)) return { ok: false, reason: 'status_not_executable' };
    const rr = Number(coin.rr || 0);
    if (!Number.isFinite(rr) || rr < effectiveMinRR) return { ok: false, reason: 'rr_too_low' };
    const conf = Number(coin.executionConfidence || 0);
    if (!Number.isFinite(conf) || conf < effectiveMinConfidence) return { ok: false, reason: 'confidence_too_low' };
    return { ok: true, reason: 'pass' };
  }
  return { isExecutable, hasHardReject };
})();

/* \u2500\u2500 Utility helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
const $ = id => document.getElementById(id);
const el = (tag, cls, inner) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (inner !== undefined) e.innerHTML = inner;
  return e;
};

async function downloadBackup() {
  try {
    const idbData = await DB.exportAll();
    idbData.legacyState = ST.exportData();
    const blob = new Blob([JSON.stringify(idbData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `system-trader-v8-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  } catch (err) {
    const blob = new Blob([JSON.stringify(ST.exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `system-trader-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
}

function triggerImportBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.version === 'ST_V8_IDB') {
        const count = await DB.importAll(data);
        if (data.legacyState) {
          ST.importData(data.legacyState);
        }
        alert(`\u2705 Imported ${count} records (v8 format)`);
      } else {
        ST.importData(data);
      }
      syncWatchlistFromCoins();
      ST.save();
      alert('\u2705 \u0110\u00E3 import backup th\u00E0nh c\u00F4ng');
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderScanner === 'function') renderScanner();
    } catch (e) {
      alert('\u274C Import backup th\u1EA5t b\u1EA3i: ' + e.message);
    }
  };
  input.click();
}

function formatCap(n) {
  if (n == null || isNaN(Number(n))) return '\u2013';
  const val = Number(n);
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(1) + 'M';
  return '$' + val.toLocaleString();
}

function narrativeBadge(tag) {
  const colors = {
    AI: 'badge-cyan', DePIN: 'badge-purple', Gaming: 'badge-yellow',
    RWA: 'badge-green', Infra: 'badge-gray', 'Cross-chain': 'badge-gray',
    Privacy: 'badge-purple', 'Data Layer': 'badge-cyan'
  };
  return `<span class="badge ${colors[tag] || 'badge-gray'}">${tag}</span>`;
}

function gradeInfo(score) {
  if (score >= 85) return { grade: 'A', cls: 'grade-A', desc: 'C\u00F3 th\u1EC3 v\u00E0o l\u1EC7nh', badge: 'badge-green' };
  if (score >= 75) return { grade: 'B+', cls: 'grade-Bplus', desc: 'Setup ti\u1EC3m n\u0103ng', badge: 'badge-cyan' };
  if (score >= 65) return { grade: '\uD83D\uDCCC Watch', cls: 'grade-watch', desc: 'Watchlist only \u2014 ch\u01B0a v\u00E0o', badge: 'badge-yellow' };
  return { grade: '\u2717 Skip', cls: 'grade-skip', desc: 'B\u1ECF qua', badge: 'badge-red' };
}

function fmtPrice(n) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return '\u2013';
  n = Number(n);
  if (n < 0.0001) return '$' + n.toFixed(8);
  if (n < 0.01) return '$' + n.toFixed(6);
  if (n < 0.1) return '$' + n.toFixed(5);
  if (n < 1) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}

function formatTimestamp(ts) {
  if (!ts) return 'Ch\u01B0a scan';
  try { return new Date(ts).toLocaleString('vi-VN'); } catch { return String(ts); }
}

function scoreBreakdownRows(bd = {}) {
  const labels = {
    structure: 'Structure', volume: 'Volume', fib: 'Fib', ema: 'EMA', resistance: 'Resistance', btc: 'BTC', cleanliness: 'Cleanliness'
  };
  return Object.entries(labels).map(([k, label]) => {
    const v = Number(bd[k] || 0);
    return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px"><span class="text-muted">${label}</span><span class="font-mono fw-700">${v}</span></div>`;
  }).join('');
}

const CANONICAL_STRUCTURAL_SETUPS = Object.freeze([
  'accumulation',
  'phase-candidate',
  'early-phase-d',
  'breakout',
  'trend-continuation',
  'unclear',
  'early-watch',
]);

const STRUCTURAL_SETUP_ALIAS_MAP = Object.freeze({
  'phase c candidate': 'phase-candidate',
  'phase-candidate': 'phase-candidate',
  'phase c': 'phase-candidate',
  'early phase d': 'early-phase-d',
  'early-phase-d': 'early-phase-d',
  'trend continuation': 'trend-continuation',
  'trend-continuation': 'trend-continuation',
  'early watch': 'early-watch',
  'early-watch': 'early-watch',
  'breakout retest': 'breakout',
  'breakout_retest': 'breakout',
  're-accumulation': 'accumulation',
});

const STRUCTURAL_SETUP_VOCAB = new Set(CANONICAL_STRUCTURAL_SETUPS);

const TRIGGER_LIKE_SETUP_LABELS = new Set([
  'reclaimbreak',
  'minispring',
  'lps15m',
  'lps4h',
  'springconfirm',
  'volumesurge',
  'absorbtest',
  'sweepreverse',
  'breakoutretest15m',
  'probe_detection',
  'setup_ready',
  'scalp_trigger',
  'trigger_active',
  'wait',
]);

function normalizeSetupToken(value) {
  return String(value || '').trim().toLowerCase().replace(/_/g, '-');
}

function toCanonicalStructuralSetupToken(value) {
  const token = normalizeSetupToken(value);
  if (!token) return '';
  if (STRUCTURAL_SETUP_VOCAB.has(token)) return token;
  return STRUCTURAL_SETUP_ALIAS_MAP[token] || token;
}

function isTriggerLikeSetupLabel(value) {
  const token = normalizeSetupToken(value);
  return !!token && (
    TRIGGER_LIKE_SETUP_LABELS.has(token)
    || /trigger|reclaimbreak|minispring|breakoutretest15m|probe_detection|setup_ready|scalp_trigger/.test(token)
  );
}

function normalizeStructuralSetupValue(value, fallback = '') {
  const raw = String(value || '').trim();
  const fallbackRaw = String(fallback || '').trim();
  const token = toCanonicalStructuralSetupToken(raw);
  const fallbackToken = toCanonicalStructuralSetupToken(fallbackRaw);

  if (STRUCTURAL_SETUP_VOCAB.has(token)) return token;
  if (STRUCTURAL_SETUP_VOCAB.has(fallbackToken)) return fallbackToken;
  if (token && !isTriggerLikeSetupLabel(token)) return token;
  if (fallbackToken && !isTriggerLikeSetupLabel(fallbackToken)) return fallbackToken;
  return 'Unknown';
}

function getCanonicalStructuralSetups() {
  return [...CANONICAL_STRUCTURAL_SETUPS];
}

function isCanonicalStructuralSetup(value) {
  return STRUCTURAL_SETUP_VOCAB.has(toCanonicalStructuralSetupToken(value));
}

function getStructuralSetupLabel(coinOrSetup, maybeFallback = '') {
  if (coinOrSetup && typeof coinOrSetup === 'object') {
    return normalizeStructuralSetupValue(coinOrSetup.setup, coinOrSetup.structureTag);
  }
  return normalizeStructuralSetupValue(coinOrSetup, maybeFallback);
}

function getEntryTriggerLabel(coin) {
  if (!coin || typeof coin !== 'object') return 'wait';
  return String(
    coin.entrySignal ||
    coin.entryTiming ||
    (isTriggerLikeSetupLabel(coin.setup) ? coin.setup : '') ||
    'wait'
  ).trim();
}

window.SETUP_TAXONOMY = Object.freeze({
  canonicalStructuralSetups: getCanonicalStructuralSetups(),
  triggerLikeSetupLabels: [...TRIGGER_LIKE_SETUP_LABELS],
});

function isExecutionUnlockReadyState(coin) {
  if (!coin || typeof coin !== 'object') return false;
  if (coin.rejected || coin.status === 'AVOID') return false;
  const rr = Number(coin?.rr || 0);
  const score = Number(coin?.riskAdjustedScore || coin?.finalScore || coin?.score || 0);
  const conf = Number(coin?.executionConfidence || 0);
  const quality = String(coin?.chartEntryQuality || '').toLowerCase();
  const timing = String(coin?.entryTiming || coin?.signalEntryTiming || '').toLowerCase();
  const setup = String(getStructuralSetupLabel(coin) || '').toLowerCase();
  const fakePump = String(coin?.fakePumpRisk || '').toLowerCase();
  const baseStatus = String(coin?.status || coin?.proposedStatus || '').toUpperCase();
  const setupOk = /phase|breakout|trend|spring|retest|reclaim|continuation|accumulation/.test(setup);
  const timingBad = /entry_late|late|probe_detection/.test(timing);
  const qualityBad = /entry_late|structure_risk/.test(quality);
  const strongIntent = ['READY', 'SCALP_READY', 'PLAYABLE'].includes(baseStatus) || /scalp_trigger|confirm|retest|trigger|reclaim/.test(timing);
  return !!(setupOk && strongIntent && fakePump !== 'high' && !timingBad && !qualityBad && rr >= 3.0 && conf >= 0.72 && score >= 36);
}

function getExecutionDisplayStatus(coin) {
  if (!coin) return 'WATCH';
  if (coin.rejected || coin.status === 'AVOID' || String(coin.executionClass || '').toLowerCase() === 'avoid') return 'AVOID';

  // v10.6.9.51: Absolute Authority Chain
  // 1. UI Truth (Macro-adjusted / Hardened by Engine)
  const display = String(coin.displayStatus || '').toUpperCase().trim();
  if (display && !['UNDEFINED', 'NULL', 'UNKNOWN', ''].includes(display)) return display;

  // 2. Engine Truth (Technical Tier vs Execution Decision)
  const authDecision = String(coin.authorityDecision || coin.decision || '').toUpperCase();
  const authTier = String(coin.finalAuthorityStatus || '').toUpperCase().trim();
  
  // v10.6.9.56 Task 5: REJECT must resolve into a clean blocked action truth.
  if (authDecision.includes('REJECT')) return deriveBlockedActionStatus(coin);

  if (authTier && !['UNDEFINED', 'NULL', 'UNKNOWN', ''].includes(authTier)) return authTier;

  // 3. Fallback Legacy / Metadata
  const status = String(coin.status || coin.proposedStatus || '').toUpperCase().trim();
  if (status && !['UNDEFINED', 'NULL', 'UNKNOWN', ''].includes(status)) {
    if (['READY', 'EXECUTION', 'ACTIVE', 'READY_STRONG'].includes(status)) return 'READY';
    if (status === 'PLAYABLE' || status === 'SCALP_READY') return 'PLAYABLE';
    if (status === 'PROBE') return 'PROBE';
    return status;
  }

  // v10.6.9.51: Absolute Contract — No heuristic fallbacks allowed below this line.
  return 'WATCH';
}

function deriveBlockedActionStatus(coin) {
  const source = String(coin?.authoritySource || '').toLowerCase();
  const reason = String(coin?.authorityReason || coin?.reason || '').toLowerCase();
  const blockers = Array.isArray(coin?.authorityBlockers) ? coin.authorityBlockers.join(' ').toLowerCase() : '';
  const search = `${source} ${reason} ${blockers}`.trim();
  if (!search) return 'WATCH';

  if (
    search.includes('portfolio_binding') ||
    search.includes('position_bound:') ||
    search.includes('dedup:') ||
    search.includes('cooldown_active_') ||
    search.includes('daily_trade_limit_') ||
    search.includes('pre_gate_blocked:watch') ||
    search.includes('all_tiers_rejected') ||
    search.includes('probe') ||
    search.includes('watch')
  ) return 'WATCH';

  if (
    search.includes('fake_pump') ||
    search.includes('invalid_stop') ||
    search.includes('structure_risk') ||
    search.includes('gate') ||
    search.includes('risk') ||
    search.includes('capital_guard') ||
    search.includes('sizing') ||
    search.includes('bubble')
  ) return 'AVOID';

  return 'WATCH';
}

function summarizeActionReason(coin) {
  const reason = String(coin?.authorityReason || coin?.reason || '').trim();
  const blockers = Array.isArray(coin?.authorityBlockers) ? coin.authorityBlockers : [];
  const primary = String(blockers[0] || reason || '').trim();
  const search = primary.toLowerCase();
  if (!primary) return 'No clear authority reason';
  if (/^dedup:/.test(search) || search.includes('portfolio_binding') || search.includes('position_bound:')) return 'Already tracked in portfolio';
  if (search.includes('cooldown_active_')) return 'Cooldown still active';
  if (search.includes('daily_trade_limit_')) return 'Daily trade limit reached';
  if (search.includes('capital_guard')) return 'Blocked by capital guard';
  if (search.includes('pre_gate_blocked:watch')) return 'Interesting, but not cleared for action yet';
  if (search.includes('all_tiers_rejected')) return 'Failed execution-grade thresholds';
  if (search.includes('fake_pump')) return 'Fake-pump risk too high';
  if (search.includes('invalid_stop')) return 'Invalid stop distance';
  return primary.replace(/^pre_gate_blocked:/i, '').replace(/^capital_guard:/i, '').replace(/^dedup:/i, '');
}

function isMaintainedSignalState(coin) {
  const source = String(coin?.authoritySource || '').toLowerCase();
  const reason = String(coin?.authorityReason || coin?.reason || '').toLowerCase();
  const state = String(coin?.positionState || '').toUpperCase();
  return source === 'portfolio_binding'
    || reason.startsWith('position_bound:')
    || reason.startsWith('dedup:')
    || ['ARMED', 'PENDING', 'ACTIVE', 'PARTIAL_EXIT'].includes(state);
}

function shouldExposeTradeLevels(coin, opts = {}) {
  if (!coin || typeof coin !== 'object') return false;
  const status = getExecutionDisplayStatus(coin);
  const decision = String(coin.authorityDecision || coin.decision || '').toUpperCase();
  const actionable = coin.executionActionable === true
    || coin.executionGatePassed === true
    || (['ALLOW', 'WAIT'].includes(decision) && ['READY', 'PLAYABLE'].includes(status));
  const entry = Number(coin.entry || coin.price || 0);
  const stop = Number(coin.stop || 0);
  const tp1 = Number(coin.tp1 || 0);
  if (!['READY', 'PLAYABLE'].includes(status)) return false;
  if (decision === 'REJECT') return false;
  if (!actionable) return false;
  if (isMaintainedSignalState(coin)) return false;
  if (!(entry > 0 && stop > 0 && stop < entry && tp1 > 0)) return false;
  return true;
}

function isActionableStatus(status) {
  return ['READY', 'PLAYABLE', 'PROBE'].includes(String(status || '').toUpperCase());
}

function isTradableCoin(coin) {
  if (!coin || typeof coin !== 'object') return false;
  const setup = String(getStructuralSetupLabel(coin) || '').toLowerCase();
  if (!setup || setup.includes('no setup')) return false;
  const displayStatus = getExecutionDisplayStatus(coin);
  if (!isActionableStatus(displayStatus)) return false;
  const portfolioPos = Array.isArray(ST?.scanMeta?.portfolio?.positions)
    ? ST.scanMeta.portfolio.positions.find(p => String(p?.symbol || '').toUpperCase() === String(coin?.symbol || '').toUpperCase())
    : null;
  if (coin.executionGatePassed === false && !portfolioPos && !['ACTIVE', 'READY', 'SCALP_READY', 'PLAYABLE', 'PROBE'].includes(String(coin.status || '').toUpperCase())) return false;
  if (String(coin.executionClass || '').toLowerCase() === 'watch' && !portfolioPos && displayStatus !== 'EARLY') return false;
  return true;
}

function coinTier(coin) {
  if (!coin) return 'avoid';
  const displayStatus = getExecutionDisplayStatus(coin);
  if (displayStatus === 'READY') return 'best';
  if (displayStatus === 'PLAYABLE' || displayStatus === 'PROBE' || displayStatus === 'EARLY' || displayStatus === 'WATCH') return 'watch';
  return 'avoid';
}

function syncWatchlistFromCoins() {
  const next = { best: [], watch: [], avoid: [] };
  [...ST.coins]
    .filter(c => c && c.symbol)
    .filter(c => !(window.CLEAN_UNIVERSE?.shouldExclude?.(c)))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .forEach(c => {
      const tier = coinTier(c);
      const displayStatus = getExecutionDisplayStatus(c);
      const note = c.rejected
        ? ((c.rejectReasons && c.rejectReasons[0]) || (c.warnings && c.warnings[0]) || 'Rejected by system')
        : `${displayStatus || c.status || gradeInfo(c.score || 0).grade} \u00B7 ${getStructuralSetupLabel(c)} \u00B7 Entry ${(c.scoreBreakdown?.entry || 0)}/8`;
      next[tier].push({ symbol: c.symbol, note, addedAt: Date.now() });
    });
  ST.watchlist = next;
}

function getCoinBySymbol(sym) {
  return ST.coins.find(c => String(c.symbol).toUpperCase() === String(sym).toUpperCase());
}

function journalRMultiple(j) {
  if (!j || j.result === 'open') return null;
  const entry = Number(j.entry || 0);
  const stop = Number(j.stop || 0);
  const tp = Number(j.tp || 0);
  const risk = Math.max(1e-9, Math.abs(entry - stop));
  if (j.result === 'loss') return -1;
  if (j.result === 'be') return 0;
  if (j.result === 'win') {
    if (entry > 0 && tp > 0 && risk > 0) return Math.max(0.3, (tp - entry) / risk);
    return 1.8;
  }
  return null;
}

const LEARNING_BASELINES = {
  'spring': { prior: 8, expectancyR: 1.05, winRate: 0.58, profitFactor: 1.34, edgeMultiplier: 1.18 },
  'spring + test': { prior: 8, expectancyR: 1.28, winRate: 0.62, profitFactor: 1.48, edgeMultiplier: 1.34 },
  'lps': { prior: 8, expectancyR: 1.18, winRate: 0.60, profitFactor: 1.40, edgeMultiplier: 1.26 },
  'early phase d': { prior: 10, expectancyR: 0.45, winRate: 0.40, profitFactor: 0.95, edgeMultiplier: 0.85 },
  'phase c candidate': { prior: 7, expectancyR: 0.34, winRate: 0.44, profitFactor: 0.92, edgeMultiplier: 0.84 },
  'early watch': { prior: 6, expectancyR: 0.18, winRate: 0.39, profitFactor: 0.82, edgeMultiplier: 0.72 },
  'breakout retest': { prior: 7, expectancyR: 0.82, winRate: 0.53, profitFactor: 1.14, edgeMultiplier: 1.06 },
  'trend-continuation': { prior: 10, expectancyR: 0.55, winRate: 0.42, profitFactor: 0.90, edgeMultiplier: 0.88 },
  'accumulation': { prior: 7, expectancyR: 0.42, winRate: 0.46, profitFactor: 0.96, edgeMultiplier: 0.88 },
  'unclear': { prior: 12, expectancyR: 0.08, winRate: 0.30, profitFactor: 0.70, edgeMultiplier: 0.60 },
  'no setup': { prior: 6, expectancyR: 0.08, winRate: 0.33, profitFactor: 0.72, edgeMultiplier: 0.62 },
  'unknown': { prior: 6, expectancyR: 0.24, winRate: 0.40, profitFactor: 0.86, edgeMultiplier: 0.74 }
};

function quantBand(v) {
  if (v >= 1.50) return { label: 'Killer', cls: 'badge-green' };
  if (v >= 1.28) return { label: 'Strong', cls: 'badge-cyan' };
  if (v >= 0.98) return { label: 'Neutral', cls: 'badge-yellow' };
  if (v >= 0.78) return { label: 'Weak', cls: 'badge-red' };
  return { label: 'Trash', cls: 'badge-red' };
}

function normalizeSetupName(name) {
  const structural = getStructuralSetupLabel(name);
  const s = String(structural || name || '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('spring') && s.includes('test')) return 'spring + test';
  if (s.includes('spring')) return 'spring';
  if (s.includes('early phase d')) return 'early phase d';
  if (s.includes('phase c')) return 'phase c candidate';
  if (s.includes('lps')) return 'lps';
  if (s.includes('trend-continuation') || s.includes('trend continuation')) return 'trend-continuation';
  if (s.includes('accumulation')) return 'accumulation';
  if (s.includes('breakout')) return 'breakout retest';
  if (s.includes('unclear')) return 'unclear';
  if (s.includes('early watch')) return 'early watch';
  if (s.includes('no setup')) return 'no setup';
  return s;
}

function priorForSetup(setupName) {
  const key = normalizeSetupName(setupName);
  return LEARNING_BASELINES[key] || LEARNING_BASELINES.unknown;
}

function blendLearning(prior, observed, n) {
  const total = Math.max(0, prior.prior || 0) + Math.max(0, n || 0);
  if (!total) return prior;
  const wr = (((prior.winRate || 0) * (prior.prior || 0)) + ((observed.winRate || 0) * (n || 0))) / total;
  const expectancyR = (((prior.expectancyR || 0) * (prior.prior || 0)) + ((observed.expectancyR || 0) * (n || 0))) / total;
  const profitFactor = (((prior.profitFactor || 0) * (prior.prior || 0)) + ((observed.profitFactor || 0) * (n || 0))) / total;
  let edgeMultiplier = 0.54 + expectancyR * 0.30 + wr * 0.56 + Math.max(-0.14, Math.min(0.40, (profitFactor - 1) * 0.34));
  edgeMultiplier = Math.max(0.60, Math.min(1.60, edgeMultiplier));
  const confidenceRaw = Math.min(1, (n || 0) / ((prior.prior || 0) + 8));
  const confidence = Math.max(0.30, confidenceRaw);
  const quality = Math.max(0.50, Math.min(1.9, 0.66 + expectancyR * 0.24 + wr * 0.26 + confidence * 0.16 + Math.max(-0.08, Math.min(0.16, (profitFactor - 1) * 0.18))));
  const edgeCore = (expectancyR * Math.max(0.72, profitFactor) * (0.60 + confidence * 0.40));
  const edgeScore = Math.max(10, Math.min(100, Math.round(edgeCore * 42 + (edgeMultiplier - 1) * 18)));
  return {
    expectancyR: Number(expectancyR.toFixed(2)),
    avgR: Number(expectancyR.toFixed(2)),
    winRate: wr,
    wr: Math.round(wr * 100),
    profitFactor: Number(profitFactor.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    quality: Number(quality.toFixed(2)),
    edgeMultiplier: Number(edgeMultiplier.toFixed(2)),
    band: quantBand(edgeMultiplier),
    edgeScore
  };
}

function getOutcomeLearningRows() {
  const rows = ST.scanMeta?.proEdge?.learningBySetup || ST.scanMeta?.proEdge?.learningTop || [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map(r => ({
      setup: normalizeSetupName(r?.setup || 'unknown'),
      samples: Number(r?.samples || 0),
      winRatePct: Number(r?.winRate || 0),
      avgR: Number(r?.avgR || 0),
      edgeBoost: Number(r?.edgeBoost || 1),
    }))
    .filter(r => r.samples > 0);
}

function blendSetupWithOutcomeLearning(base, outcomeLearning) {
  if (!base || !outcomeLearning) return base;
  const sampleWeight = Math.max(0, Math.min(0.45, outcomeLearning.samples / 80));
  if (sampleWeight <= 0) return base;
  const wrDb = Math.max(0, Math.min(100, outcomeLearning.winRatePct));
  const wr = Math.round((base.wr * (1 - sampleWeight)) + (wrDb * sampleWeight));
  const expectancyR = Number(((base.expectancyR * (1 - sampleWeight)) + (outcomeLearning.avgR * sampleWeight)).toFixed(2));
  const edgeMultDb = Number.isFinite(outcomeLearning.edgeBoost) && outcomeLearning.edgeBoost > 0 ? outcomeLearning.edgeBoost : 1;
  const edgeMultiplier = Number(Math.max(0.60, Math.min(1.70, ((base.edgeMultiplier * (1 - sampleWeight)) + (edgeMultDb * sampleWeight)))).toFixed(2));
  const confidence = Number(Math.max(0.30, Math.min(0.98, base.confidence + Math.min(0.12, outcomeLearning.samples / 120))).toFixed(2));
  const quality = Number(Math.max(0.50, Math.min(1.95, base.quality + ((edgeMultiplier - base.edgeMultiplier) * 0.18) + (sampleWeight * 0.08))).toFixed(2));
  const profitFactor = Number(Math.max(0.50, Math.min(3.50, (base.profitFactor || 1) + ((expectancyR - base.expectancyR) * 0.25))).toFixed(2));
  const edgeScore = Math.max(10, Math.min(100, Math.round(((expectancyR * Math.max(0.72, profitFactor) * (0.60 + confidence * 0.40)) * 42) + (edgeMultiplier - 1) * 18)));
  return {
    ...base,
    wr,
    winRate: Number((wr / 100).toFixed(2)),
    expectancyR,
    avgR: expectancyR,
    edgeMultiplier,
    confidence,
    quality,
    profitFactor,
    edgeScore,
    band: quantBand(edgeMultiplier),
    outcomeSamples: outcomeLearning.samples,
  };
}

function computeQuantStats() {
  try {
    const allRows = Array.isArray(ST.journal) ? ST.journal : [];
    const closed = allRows.filter(j => j.result && j.result !== 'open');
    const rVals = closed.map(journalRMultiple).filter(v => Number.isFinite(v));
    const wins = closed.filter(j => j.result === 'win').length;
    const losses = closed.filter(j => j.result === 'loss').length;
    const be = closed.filter(j => j.result === 'be').length;
    const observed = {
      winRate: closed.length ? wins / closed.length : 0,
      expectancyR: rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : 0,
      profitFactor: (() => {
        const grossWin = rVals.filter(v => v > 0).reduce((a, b) => a + b, 0);
        const grossLoss = Math.abs(rVals.filter(v => v < 0).reduce((a, b) => a + b, 0));
        return grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? grossWin : 0);
      })()
    };
    const globalPrior = { prior: 10, expectancyR: 0.58, winRate: 0.50, profitFactor: 1.08 };
    const globalBlend = blendLearning(globalPrior, observed, closed.length);
    const setupBuckets = new Map();
    for (const row of allRows) {
      const key = normalizeSetupName(row.setup || row.pattern || row.tag || 'unknown');
      if (!setupBuckets.has(key)) setupBuckets.set(key, []);
      setupBuckets.get(key).push(row);
    }
    const setupNames = new Set([...Object.keys(LEARNING_BASELINES), ...Array.from(setupBuckets.keys())]);
    const setupStatsRaw = [...setupNames].map((setup) => {
      const rows = setupBuckets.get(setup) || [];
      const closedRows = rows.filter(j => j.result && j.result !== 'open');
      const vals = closedRows.map(journalRMultiple).filter(v => Number.isFinite(v));
      const w = closedRows.filter(j => j.result === 'win').length;
      const l = closedRows.filter(j => j.result === 'loss').length;
      const observedSetup = {
        winRate: closedRows.length ? w / closedRows.length : 0,
        expectancyR: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
        profitFactor: (() => {
          const grossWin = vals.filter(v => v > 0).reduce((a, b) => a + b, 0);
          const grossLoss = Math.abs(vals.filter(v => v < 0).reduce((a, b) => a + b, 0));
          return grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? grossWin : 0);
        })()
      };
      const prior = priorForSetup(setup);
      const blend = blendLearning(prior, observedSetup, closedRows.length);
      return {
        setup,
        total: rows.length,
        closed: closedRows.length,
        wins: w,
        losses: l,
        be: closedRows.filter(j => j.result === 'be').length,
        wr: blend.wr,
        winRate: Number(blend.winRate.toFixed(2)),
        expectancyR: blend.expectancyR,
        avgR: blend.avgR,
        profitFactor: blend.profitFactor,
        confidence: blend.confidence,
        quality: blend.quality,
        edgeMultiplier: blend.edgeMultiplier,
        band: blend.band,
        bootstrap: closedRows.length < (prior.prior || 0)
      };
    });
    const outcomeLearningRows = getOutcomeLearningRows();
    const outcomeMap = new Map(outcomeLearningRows.map(r => [normalizeSetupName(r.setup), r]));
    const setupStats = setupStatsRaw
      .map(s => blendSetupWithOutcomeLearning(s, outcomeMap.get(normalizeSetupName(s.setup))))
      .sort((a, b) => (b.edgeMultiplier - a.edgeMultiplier) || (b.expectancyR - a.expectancyR));
    const totalOutcomeSamples = outcomeLearningRows.reduce((sum, r) => sum + Number(r.samples || 0), 0);
    const weightedExpectancy = setupStats.reduce((sum, s) => sum + (Number(s.expectancyR || 0) * Math.max(1, Number(s.closed || 0) + Number(s.outcomeSamples || 0))), 0);
    const weightedWins = setupStats.reduce((sum, s) => sum + (Number(s.wr || 0) * Math.max(1, Number(s.closed || 0) + Number(s.outcomeSamples || 0))), 0);
    const weightedDen = setupStats.reduce((sum, s) => sum + Math.max(1, Number(s.closed || 0) + Number(s.outcomeSamples || 0)), 0);
    const blendedGlobalExpectancy = weightedDen > 0 ? (weightedExpectancy / weightedDen) : globalBlend.expectancyR;
    const blendedGlobalWr = weightedDen > 0 ? (weightedWins / weightedDen) : globalBlend.wr;
    return {
      totalClosed: closed.length,
      wins,
      losses,
      be,
      winRate: Math.round(blendedGlobalWr),
      expectancyR: Number(blendedGlobalExpectancy.toFixed(2)),
      avgR: Number(blendedGlobalExpectancy.toFixed(2)),
      profitFactor: globalBlend.profitFactor,
      confidence: globalBlend.confidence,
      quality: globalBlend.quality,
      edgeScore: globalBlend.edgeScore,
      learningMode: closed.length >= 12 ? 'trained' : (closed.length >= 4 || totalOutcomeSamples >= 6) ? 'adaptive' : 'bootstrap',
      learningActive: closed.length > 0 || totalOutcomeSamples > 0,
      outcomeLearningSamples: totalOutcomeSamples,
      setupStats
    };
  } catch (err) {
    console.warn('[STATE] computeQuantStats failed:', err);
    return {
      totalClosed: (ST.journal || []).length,
      wins: 0, losses: 0, be: 0,
      observed: { winRate: 0, expectancyR: 0, profitFactor: 1 },
      setupStats: [],
      globalExpectancy: 0.24,
      globalWr: 40,
      learningMode: 'bootstrap',
      confidence: 0.30
    };
  }
}

function getSetupQuantProfile(setupName, btcContext = 'sideway') {
  const quant = computeQuantStats();
  const key = normalizeSetupName(setupName);
  let profile = quant.setupStats.find(s => normalizeSetupName(s.setup) === key);
  if (!profile) {
    const prior = priorForSetup(key);
    const bootstrap = blendLearning(prior, prior, 0);
    profile = { setup: key, total: 0, closed: 0, wins: 0, losses: 0, be: 0, ...bootstrap, bootstrap: true };
  }
  const regimeBoost =
    btcContext === 'bull' ? (key.includes('phase d') || key.includes('lps') ? 0.06 : 0.02) :
      btcContext === 'sideway' ? (key.includes('phase c') || key.includes('spring') ? 0.04 : -0.01) :
        -0.08;
  const bootstrapWeight = quant.learningMode === 'bootstrap' ? 0.35 : quant.learningMode === 'adaptive' ? 0.6 : 1;
  const rawAdjustedEdge = Number((profile.edgeMultiplier + regimeBoost).toFixed(2));
  const adjustedEdge = Math.max(0.70, Math.min(1.45, Number((1 + ((rawAdjustedEdge - 1) * bootstrapWeight)).toFixed(2))));
  const confFloor = Math.max(0.30, Number(profile.confidence || 0));
  const edgeScore = Math.max(10, Math.min(100, Math.round(((profile.expectancyR || 0) * Math.max(0.72, profile.profitFactor || 0.8) * (0.60 + confFloor * 0.40)) * 42 + (adjustedEdge - 1) * 18)));
  return {
    ...profile,
    regimeBoost: Number(regimeBoost.toFixed(2)),
    edgeMultiplier: adjustedEdge,
    edgeScore,
    band: quantBand(adjustedEdge)
  };
}

function getTopSetups(limit = 4) {
  const top3 = (Array.isArray(ST.scanMeta?.deployableTop3) && ST.scanMeta.deployableTop3.length
    ? ST.scanMeta.deployableTop3
    : (Array.isArray(ST.scanMeta?.top3) ? ST.scanMeta.top3 : []))
    .filter(c => c && !window.EXEC_GATE?.hasHardReject?.(c) && getExecutionDisplayStatus(c) !== 'AVOID');
  if (top3.length) return top3.slice(0, limit);
  const portfolioPos = Array.isArray(ST.scanMeta?.portfolio?.positions) ? ST.scanMeta.portfolio.positions : [];
  if (portfolioPos.length) {
    const hydrated = portfolioPos.map(p => {
      const base = [...(Array.isArray(ST.coins) ? ST.coins : []), ...(Array.isArray(ST.scanMeta?.coins) ? ST.scanMeta.coins : [])]
        .find(c => String(c?.symbol || '').toUpperCase() === String(p?.symbol || '').toUpperCase()) || {};
      return {
        ...base,
        ...p,
        status: p.tier || base.status || 'WATCH',
        finalAuthorityStatus: p.tier || base.finalAuthorityStatus || 'WATCH',
        executionActionable: isActionableStatus(p.tier || base.status),
      };
    }).filter(c => isTradableCoin(c));
    if (hydrated.length) return hydrated.slice(0, limit);
  }
  const scoreSetup = c => {
    const status = getExecutionDisplayStatus(c);
    if (status === 'AVOID' || window.EXEC_GATE?.hasHardReject?.(c)) return -1000;
    const conf = Number(c.executionConfidence || 0);
    const rr = Number(c.rr || 0);
    const latePenalty = (c.entryTiming === 'entry_late' || c.chartEntryQuality === 'entry_late') ? 18 : 0;
    const entryBonus = c.chartEntryQuality === 'entry_good' ? 8 : (c.chartEntryQuality === 'wait_retest' ? 2 : 0);
    const statusBoost = status === 'READY' ? 50 : status === 'PLAYABLE' ? 25 : status === 'PROBE' ? 10 : 0;
    const baseScore = (c.rankScore || c.riskAdjustedScore || c.score || 0);
    return baseScore + (conf * 30) + (rr * 10) + entryBonus - latePenalty + statusBoost;
  };
  const allCoins = ST.getUnifiedCoins();
  const actionable = allCoins
    .filter(c => isTradableCoin(c))
    .sort((a, b) => scoreSetup(b) - scoreSetup(a));
  return actionable.slice(0, limit);
}

function getNearMisses(limit = 5) {
  return [...ST.coins]
    .filter(c => !['READY', 'SCALP_READY', 'PLAYABLE', 'PROBE'].includes(c.status) && ((c.riskAdjustedScore || c.score || 0) >= 30))
    .sort((a, b) => ((b.riskAdjustedScore || b.score || 0) - (a.riskAdjustedScore || a.score || 0)))
    .slice(0, limit);
}

const NET_GUARD = {
  storageKey: `st_net_guard:${CACHE_VERSION}`,
  minGapMs: 6500,
  cooldownUntil: 0,
  lastRequestAt: 0,
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      this.cooldownUntil = Number(raw.cooldownUntil) || 0;
      this.lastRequestAt = Number(raw.lastRequestAt) || 0;
    } catch {
      this.cooldownUntil = 0;
      this.lastRequestAt = 0;
    }
  },
  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        cooldownUntil: this.cooldownUntil || 0,
        lastRequestAt: this.lastRequestAt || 0,
      }));
    } catch { }
  },
  syncFromStorage() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      this.cooldownUntil = Math.max(this.cooldownUntil || 0, Number(raw.cooldownUntil) || 0);
      this.lastRequestAt = Math.max(this.lastRequestAt || 0, Number(raw.lastRequestAt) || 0);
    } catch { }
  },
  async waitTurn(key = 'net') {
    this.syncFromStorage();
    const now = Date.now();
    if (this.cooldownUntil > now) await new Promise(r => setTimeout(r, this.cooldownUntil - now));
    const gap = Math.max(0, this.minGapMs - (Date.now() - this.lastRequestAt));
    if (gap > 0) await new Promise(r => setTimeout(r, gap));
    this.lastRequestAt = Date.now();
    this.save();
    return key;
  },
  setCooldown(ms = 60_000) {
    this.syncFromStorage();
    const until = Date.now() + Math.max(8_000, Number(ms) || 60_000);
    this.cooldownUntil = Math.max(this.cooldownUntil || 0, until);
    this.save();
    return this.cooldownUntil;
  },
  bumpPenalty(ms = 15_000) {
    this.syncFromStorage();
    this.cooldownUntil = Math.max(this.cooldownUntil || 0, Date.now() + ms);
    this.save();
    return this.cooldownUntil;
  },
  reset() {
    this.cooldownUntil = 0;
    this.lastRequestAt = 0;
    try { localStorage.removeItem(this.storageKey); } catch { }
  },
  getCooldownLeftMs() {
    this.syncFromStorage();
    return Math.max(0, (this.cooldownUntil || 0) - Date.now());
  },
  formatLeft() {
    const left = this.getCooldownLeftMs();
    if (!left) return '0s';
    const sec = Math.ceil(left / 1000);
    return sec >= 60 ? `${Math.ceil(sec / 60)}m` : `${sec}s`;
  }
};
NET_GUARD.load();
window.NET_GUARD = NET_GUARD;
window.addEventListener('storage', (e) => {
  if (e.key === NET_GUARD.storageKey) NET_GUARD.syncFromStorage();
});

const CACHE = {
  storageKey: `st_runtime_cache:${CACHE_VERSION}`,
  load() {
    try { return JSON.parse(localStorage.getItem(this.storageKey) || '{}'); }
    catch { return {}; }
  },
  save(data) {
    localStorage.setItem(this.storageKey, JSON.stringify(data || {}));
  },
  get(key, ttlMs) {
    const store = this.load();
    const item = store[key];
    if (!item) return null;
    if (Number.isFinite(ttlMs) && Date.now() - item.ts > ttlMs) {
      delete store[key];
      this.save(store);
      return null;
    }
    return item.value;
  },
  set(key, value) {
    const store = this.load();
    store[key] = { ts: Date.now(), value };
    this._trim(store);
    this.save(store);
    return value;
  },
  delPrefix(prefix) {
    const store = this.load();
    Object.keys(store).forEach(k => { if (k.startsWith(prefix)) delete store[k]; });
    this.save(store);
  },
  clearAll() {
    localStorage.removeItem(this.storageKey);
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('st_runtime_cache:') && k !== this.storageKey) localStorage.removeItem(k);
    });
  },
  clearMemory() {
    window.__binanceExchangeInfo = null;
    window.__binanceSymbolIndex = null;
    window.__lastHybridResult = null;
    window.__forceFreshNextScan = true;
  },
  resetEverything() {
    this.clearAll();
    this.clearMemory();
    window.NET_GUARD?.reset?.();
  },
  _trim(store) {
    const keys = Object.keys(store);
    if (keys.length <= 80) return;
    keys.sort((a, b) => (store[a].ts || 0) - (store[b].ts || 0));
    for (const k of keys.slice(0, keys.length - 80)) delete store[k];
  }
};

window.STRUCTURE_RISK_BYPASS = function (coin) {
  const conf = Number(coin?.executionConfidence || 0);
  const sm = Number(coin?.smartMoneyScore || 0);
  const fake = String(coin?.fakePumpRisk || '').toLowerCase();
  const chartQ = String(coin?.chartEntryQuality || '');
  return chartQ === 'structure_risk' && conf >= 0.75 && sm >= 0.50 && fake === 'low';
};
